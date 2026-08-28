// POST /api/portal/join — self-serve signup for OUTSIDE students (public).
//
// The second door into the portal (the first is the admin-issued activation
// link → /api/portal/activate). Anyone holding /join?ref=<inviter account id>
// — or nobody's link at all — creates an UNLINKED account:
//   airtable_student_id = ''  (column is NOT NULL; '' is the stranger marker
//                              lib/portal-passes.isTuitionAccount understands)
//   invited_by          = the ref when it names a real portal account, else null
//   level               = their chosen level (drives the practice pickers via
//                         qbLevelsFor — same field tuition accounts carry)
//
// Auth-user creation MIRRORS the activate route: email_confirm true, so the
// client can signInWithPassword immediately after — no confirmation email
// round-trip. The stranger then lands on /app, where the layout's paywall gate
// bounces them to /app/pass until a S$29/30-day pass is granted
// (lib/portal-passes + the Stripe webhook).
//
// PDPA: consent must be EXACTLY true; the consent_record marks the source
// 'self-serve invite' + the ref (lib/portal-join.buildSelfServeConsentRecord).
//
// Rate limiting (light, per the build spec): a per-IP sliding window
// (best-effort — module memory survives only within a warm serverless
// instance) plus a global stranger-signups-per-hour cap that DOES survive cold
// starts because it counts rows already in portal_accounts.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { sendTelegram } from '@/lib/telegram';
import { grantPass, TRIAL_PASS_DAYS, qualifiesToGrantTrials } from '@/lib/portal-passes';
import {
  buildSelfServeConsentRecord,
  rateLimitStep,
  selfServeSignupTelegramText,
  trialReference,
  validateInviteRef,
  validateJoinSignup,
} from '@/lib/portal-join';

export const runtime = 'nodejs';

// Per-IP: 4 signup attempts per 15 minutes. Best-effort (warm instances only).
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX = 4;
const ipHits = new Map<string, number[]>();

// Global backstop: max stranger accounts created in the trailing hour. One
// head count per signup POST — nowhere near the hot path.
const HOURLY_SIGNUP_CAP = 20;

export async function POST(req: NextRequest) {
  // ── Rate limits ────────────────────────────────────────────────────────────
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const step = rateLimitStep(ipHits.get(ip) ?? [], Date.now(), { windowMs: IP_WINDOW_MS, max: IP_MAX });
  ipHits.set(ip, step.hits);
  if (ipHits.size > 5000) ipHits.clear(); // bound the map; worst case the window resets
  if (!step.allowed) {
    return NextResponse.json({ error: 'Too many attempts — try again in a few minutes.' }, { status: 429 });
  }

  // ── Validate the fields (pure, tested in portal-join.test.ts) ─────────────
  // `?? {}` also catches a literal JSON `null` body, which json() parses fine.
  const body = (await req.json().catch(() => ({}))) ?? {};
  const v = validateJoinSignup(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const supabase = createServiceClient();

  // Global hourly cap — counts stranger rows (airtable_student_id = '') so it
  // holds through cold starts. Fail-open on a count error: a Supabase blip
  // must not close signups (the per-IP window still stands).
  try {
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabase
      .from('portal_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('airtable_student_id', '')
      .gte('created_at', hourAgo);
    if ((count ?? 0) >= HOURLY_SIGNUP_CAP) {
      return NextResponse.json(
        { error: 'Signups are busy right now — please try again in an hour.' },
        { status: 429 },
      );
    }
  } catch { /* fail-open */ }

  // ── Resolve the inviter (a bad ref unattributes, never blocks) ────────────
  // Sec 3–5 declare their maths (Adrian, 2026-08-29): whitelist to the exact
  // Airtable subject vocabulary qbLevelsFor filters by; anything else → null.
  const rawSubjects = (body as { subjects?: unknown }).subjects;
  const subjects = Array.isArray(rawSubjects)
    ? rawSubjects.filter((x): x is string => x === 'E Math' || x === 'A Math').slice(0, 2)
    : [];
  const ref = validateInviteRef((body as { ref?: unknown }).ref);
  let inviter: { id: string; display_name: string | null; airtable_student_id: string | null; deactivated_at: string | null } | null = null;
  let inviterQualifies = false;
  if (ref) {
    const { data } = await supabase
      .from('portal_accounts')
      .select('id, display_name, airtable_student_id, deactivated_at')
      .eq('id', ref)
      .maybeSingle<{ id: string; display_name: string | null; airtable_student_id: string | null; deactivated_at: string | null }>();
    inviter = data ?? null;
    // Trial-farming guard (Adrian, 2026-08-29): only a tuition student or a
    // PAID pass holder may mint trials — a trial-only account's link still
    // attributes the signup but grants no trial, so A→B→C chains die.
    if (inviter) {
      try {
        const { data: passRows } = await supabase
          .from('portal_passes')
          .select('expires_at, source')
          .eq('account_id', inviter.id)
          .gt('expires_at', new Date().toISOString());
        inviterQualifies = qualifiesToGrantTrials(inviter, passRows ?? []);
        // Per-inviter burn rate (Adrian, 2026-08-29 "foolproof plan"): even a
        // qualified inviter mints at most 5 trials per rolling 30 days — a
        // paid student farming trials for a friend's serial re-signups burns
        // the allowance in a month's first week and the chain stops. The
        // signup itself still works and attributes; only the free 3 days stop.
        if (inviterQualifies) {
          const since = new Date(Date.now() - 30 * 86400e3).toISOString();
          const { count } = await supabase
            .from('portal_passes')
            .select('id', { count: 'exact', head: true })
            .eq('source', 'trial')
            .like('reference', `invite:${inviter.id}:%`)
            .gte('created_at', since);
          // Tuition students are trusted super-inviters (10/30d); paid
          // strangers stay at 5. A LEGIT streak that hits the cap must never
          // die silently — Adrian gets a Telegram and can hand-grant trials
          // (or raise the cap) while the momentum is hot.
          const capForInviter = inviter.airtable_student_id && !inviter.deactivated_at ? 10 : 5;
          if ((count ?? 0) >= capForInviter) {
            inviterQualifies = false;
            sendTelegram(`🎟⚠ ${inviter.display_name || 'An inviter'} hit their trial cap (${capForInviter}/30d) — latest invitee signed up WITHOUT a trial. Legit streak? Grant manually via /api/admin/passes or say the word to raise caps.`).catch(() => {});
          }
        }
      } catch { inviterQualifies = false; }
    }
  }

  // ── Create the Auth user (mirrors activate: email_confirm → instant login) ─
  const { data: created, error: userErr } = await supabase.auth.admin.createUser({
    email: v.email,
    password: v.password,
    email_confirm: true,
  });
  if (userErr || !created?.user) {
    const msg = userErr?.message || 'Could not create the account';
    const status = /already|registered|exists/i.test(msg) ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? 'An account with this email already exists. Try logging in instead.' : msg },
      { status },
    );
  }

  const { error: acctErr } = await supabase.from('portal_accounts').insert({
    id: created.user.id,
    airtable_student_id: '', // stranger — no Airtable record; NOT NULL column
    email: v.email,
    display_name: v.name,
    level: v.level,
    subjects: subjects.length ? subjects : null,
    invited_by: inviter?.id ?? null,
    consent_record: buildSelfServeConsentRecord({ ref: inviter?.id ?? null }),
  });
  if (acctErr) {
    // Roll back the orphan Auth user so the email can be retried cleanly.
    await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json({ error: `Could not create the account: ${acctErr.message}` }, { status: 500 });
  }

  // Referred signup → 3-day trial pass, granted at creation (Adrian,
  // 2026-08-28: the invitee side of the referral is a free trial, not bonus
  // days for the inviter). The signup then lands INSIDE the portal — the /app
  // gate passes any active pass — and /app/pass shows "your trial ends …"
  // once it's about to lapse. Unreferred signups get no trial: straight to
  // the paywall. Fail-soft: a grant hiccup demotes them to the paywall, it
  // never fails the signup (the account is already saved). The reference
  // (invite:<inviter>:<new account>) makes retries idempotent per-invitee.
  let trialGranted = false;
  if (inviter && inviterQualifies) {
    try {
      await grantPass({
        accountId: created.user.id,
        days: TRIAL_PASS_DAYS,
        source: 'trial',
        reference: trialReference(inviter.id, created.user.id),
      });
      trialGranted = true;
    } catch (e) {
      console.error('[portal-join] trial grant failed:', (e as Error).message);
    }
  }

  // Doorbell to Adrian — fire-and-forget (same policy as portal requests: the
  // account is already saved; a Telegram hiccup must never fail the signup).
  try {
    await sendTelegram(selfServeSignupTelegramText(v.name, v.level, inviter?.display_name ?? null, trialGranted));
  } catch (e) {
    console.warn('[portal-join] telegram notify failed:', (e as Error).message);
  }

  return NextResponse.json({ ok: true, trial: trialGranted });
}
