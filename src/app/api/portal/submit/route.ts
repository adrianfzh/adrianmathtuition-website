// POST /api/portal/submit — a student hands in a photographed paper.
//
// The submission IS a saved mark-paper run: the bot's phase:'save-paper' creates
// the same "⏳ uploaded — not marked yet" row Adrian's own uploads make, so it
// appears in /admin/mark-paper history with the ▶ Mark button, counts on the
// admin hub's ⏳ papers-to-mark card, and rides the existing remark machinery.
// Nothing new to mark FROM — only a new door IN.
//
// Hand-ins AUTO-QUEUE (Adrian, 13 Aug 2026 — "auto-mark hand-ins"): the run goes
// straight into the bot's 🌙 marking queue via phase:'enqueue', so instead of a
// "come tap ▶ Mark" doorbell, Adrian's Telegram gets the FINISHED marking with the
// 🖼 PDF attached (the queue worker's message, which names the student and nudges
// Release). The doorbell text below survives only as the fallback when the enqueue
// itself fails — a hand-in must never sit silent. The release gate is untouched:
// the run reaches /app/marking only when Adrian releases it in triage, because the
// queue's flags only catch what the model *doubts* — one human glance before a
// student sees red ink stays worth it.
//
// Ownership is stamped server-side from the session — the client sends photo
// URLs and an optional name, never a student id. A URL is accepted only from
// OUR blob store AND under this student's own portal prefix (the submit-token
// route pins uploads there), so one student cannot submit another's photos.
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isOurBlobUrl } from '@/lib/blob-url';
import { keyFromUrl } from '@/lib/student-files-url';
import { DAILY_SUBMIT_CAP, countHandinsToday } from '@/lib/portal-submit-limit';
import type { HandinCountingClient } from '@/lib/portal-submit-limit';
import { sendTelegram } from '@/lib/telegram';
import { canTransition, type AssignmentRow } from '@/lib/assignments';
import { portalIdentity } from '@/lib/portal-auth';
import { markSubjectAccess } from '@/lib/portal-beta';
import { enrolledMarkSubjects } from '@/lib/student-mark-subjects';
import { resolveHandinSubject } from '@/lib/mark-subject-for-student';
import {
  dailyHandinCapForTier,
  handinAllowance,
  handinsRemaining,
  isTuitionAccount,
  requireActiveAccess,
} from '@/lib/portal-passes';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PAGES = 20;

/** How long a repeat of the same photos counts as a retry rather than a new
 *  hand-in. Long enough to cover a phone that reconnects minutes later, far
 *  shorter than the daily slot it protects. */
const RESUBMIT_WINDOW_MS = 30 * 60 * 1000;

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id, display_name')
    .eq('id', user.id)
    .single();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Strangers (empty airtable_student_id) hand in as `acct:<uuid>` — the ONE
  // identity convention (lib/portal-auth.portalIdentity). The bot's set-student
  // phase stores it verbatim (student_id/student_name are plain text columns;
  // the 🌙 queue, its Telegram and auto-release all key on the run row, never
  // on Airtable), so the whole marking loop works unchanged.
  const studentId = portalIdentity(account);
  const tuition = isTuitionAccount(account);

  // Pass gate + the hand-in meter (strangers only; tuition costs no DB hit).
  // The paywall page is the normal path — this is the API belt, and it also
  // hands back the CURRENT pass row so the meter below reads no second time.
  const access = await requireActiveAccess(account);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const meteredPass = access.pass; // null for tuition accounts

  let body: { photoUrls?: unknown; paperName?: unknown; assignmentId?: unknown; paperId?: unknown; confirmed?: boolean; subject?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const admin = getSupabaseAdmin();

  // "From Adrian" worksheet (SPEC-ASSIGN.md): the id is client-supplied, so
  // ownership/kind/status are re-checked here. Tagged runs auto-release on
  // marking and flip the assignment to marked; exempt from the daily cap (D3)
  // because Adrian initiated it — one hand-in per assignment is the brake.
  let assignment: AssignmentRow | null = null;
  if (typeof body.assignmentId === 'string' && body.assignmentId) {
    const { data: a } = await admin
      .from('portal_assignments').select('*')
      .eq('id', body.assignmentId).eq('airtable_student_id', studentId)
      .maybeSingle();
    const row = a as AssignmentRow | null;
    if (!row || row.kind !== 'worksheet' || row.status === 'revoked') {
      return NextResponse.json({ error: 'That worksheet isn’t available any more.' }, { status: 404 });
    }
    if (!canTransition(row.status, 'submitted')) {
      return NextResponse.json({ error: 'You have already sent this worksheet in — it’s with Adrian.' }, { status: 409 });
    }
    assignment = row;
  }

  // A self-generated printed paper (SPEC-PRINT-PAPER.md): re-check ownership
  // and status here (the id is client-supplied). Its stored question ids get
  // stamped onto the run below — the pre-registration the marker reads. NOT
  // cap-exempt: self-initiated work spends the day's slot (spec D5).
  let printedPaper: { id: string; question_ids: unknown } | null = null;
  if (!assignment && typeof body.paperId === 'string' && body.paperId) {
    const { data: p } = await admin
      .from('portal_generated_papers')
      .select('id, question_ids, status')
      .eq('id', body.paperId)
      .eq('airtable_student_id', studentId)
      .maybeSingle();
    if (!p) return NextResponse.json({ error: 'That printed paper isn’t available any more.' }, { status: 404 });
    if (p.status !== 'open') {
      return NextResponse.json({ error: 'You have already handed this paper in — it’s with Adrian.' }, { status: 409 });
    }
    printedPaper = { id: p.id, question_ids: p.question_ids };
  }

  const photoUrls = Array.isArray(body.photoUrls)
    ? [...new Set(body.photoUrls.filter((u): u is string => typeof u === 'string'))]
    : [];
  if (!photoUrls.length) return NextResponse.json({ error: 'No photos to submit' }, { status: 400 });
  if (photoUrls.length > MAX_PAGES) {
    return NextResponse.json({ error: `That's too many pages for one paper (max ${MAX_PAGES}) — submit the rest as a second paper.` }, { status: 400 });
  }
  for (const u of photoUrls) {
    let ok = false;
    const key = keyFromUrl(u);
    if (key) {
      // Private-store upload (5 Sep 2026): the submit-token route pinned the key
      // under handins/<identity>/, so the prefix IS the ownership proof.
      ok = key.startsWith(`handins/${studentId}/`);
    } else if (isOurBlobUrl(u)) {
      // decodeURIComponent: a stranger's identity segment (`acct:<uuid>`)
      // contains a colon, which a URL serializer MAY percent-encode — decode
      // before comparing so both spellings match the prefix the submit-token
      // route pinned. Airtable rec ids are alphanumeric, so this is a no-op
      // for tuition students.
      try { ok = decodeURIComponent(new URL(u).pathname).startsWith(`/mark-paper/portal/${studentId}/`); } catch { ok = false; }
    }
    if (!ok) return NextResponse.json({ error: 'A photo upload went wrong — please re-add your photos and try again.' }, { status: 400 });
  }

  // Required since 2026-08-21 (Adrian: "let's just have the student fill it up
  // properly") — the client disables Send until it's typed; this is the backstop.
  const paperName = (typeof body.paperName === 'string' ? body.paperName.trim().slice(0, 80) : '')
    || (assignment ? assignment.title.slice(0, 80) : '');
  if (!paperName) {
    return NextResponse.json({ error: 'Tell us which paper this is (e.g. "Xinmin 2021 Prelim P2") before sending.' }, { status: 400 });
  }

  // Phase G hardening (Adrian, 21 Aug 2026): one hand-in per student per SGT
  // calendar day — replaces the earlier 3-per-10-min soft brake. Counts runs
  // actually saved, so a failed submission does not burn the day's slot.
  // Since 24 Aug 2026 the count spans BOTH surfaces (this and the bot's
  // /handin) — see countHandinsToday. The bot enforces the same ceiling from
  // its side, so whichever a student reaches first spends the day's slot.
  // The cast is TS ergonomics, not a loosening: the generated Supabase client
  // types are deep enough that inferring them through the helper trips TS2589
  // ("type instantiation is excessively deep"). HandinCountingClient names the
  // four methods actually used.
  // Strangers additionally spend their pass's hand-in meter (8 on Standard,
  // 20 on Intensive) — checked BEFORE the daily cap so "pass used up" never
  // masquerades as "come back tomorrow". Assignments stay exempt from both
  // (Adrian initiated them; one hand-in per assignment is the brake).
  if (meteredPass && !assignment && handinsRemaining(meteredPass) <= 0) {
    return NextResponse.json({
      error: `You’ve used all ${handinAllowance(meteredPass)} marked papers in this pass — upgrade to Intensive or wait for your next pass at /app/pass. Everything else stays open.`,
    }, { status: 402 });
  }

  // Daily ceiling: tuition students keep the global cap (1/SGT day, shared
  // with the bot's /handin); a stranger's ceiling comes from their pass tier
  // (Standard 1/day, Intensive 3/day — trials meter as Standard).
  const dailyCap = tuition ? DAILY_SUBMIT_CAP : dailyHandinCapForTier(meteredPass?.tier);
  const count = assignment ? 0 : await countHandinsToday(admin as unknown as HandinCountingClient, studentId);
  if ((count ?? 0) >= dailyCap) {
    return NextResponse.json({
      error: dailyCap === 1
        ? 'Today’s hand-in slot is used — a fresh one opens at midnight. One paper a day gets every script marked properly.'
        : `You’ve handed in ${dailyCap} papers today — a fresh allowance opens at midnight.`,
    }, { status: 429 });
  }

  // ── the same submission, sent twice ────────────────────────────────────────
  // Sophie, 1 Sep 2026: eighteen pages uploaded, then the one small POST that
  // registers them died on a network handover and she saw Safari's bare "Load
  // failed". Her photos were already in Blob storage; nothing reached Adrian.
  //
  // The client can now retry that POST, which needs this route to be safe to
  // call twice — otherwise a reply lost on the way BACK would make a second
  // paper, spend her one hand-in for the day, and put a duplicate in triage.
  //
  // No new column is needed to make it safe: every upload pathname is a fresh
  // crypto.randomUUID() (api/portal/submit-token), so a photo URL is unique to
  // one submission for all time. Finding a recent run of this student's that
  // already carries this exact first photo means this is that same submission
  // arriving again — so hand back the run it already made.
  const firstPhoto = photoUrls[0];
  const { data: already } = await admin
    .from('paper_marking_runs')
    .select('id, created_at')
    .eq('student_id', studentId)
    .gte('created_at', new Date(Date.now() - RESUBMIT_WINDOW_MS).toISOString())
    .contains('source', { photos: [{ original_url: firstPhoto }] })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (already?.id) {
    console.log('[portal-submit] same photos already saved as', already.id, '— returning it rather than duplicating');
    return NextResponse.json({ runId: already.id, resumed: true });
  }

  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return NextResponse.json({ error: 'Submissions are temporarily unavailable' }, { status: 503 });
  const bot = async (payload: Record<string, unknown>) => {
    const r = await fetch(`${botBase}/api/mark-paper`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json().catch(() => ({}));
  };

  // ── look at the hand-in before filing it ───────────────────────────────────
  // Adrian, 1 Sep 2026. The one problem nobody can fix after marking is a page
  // that was never photographed: Q7 with no page produces no row, scores zero,
  // and looks identical to Q7 genuinely left blank. Only the student can tell
  // those apart, and only while the paper is still in front of them.
  //
  // ADVISORY, NEVER A GATE. `confirmed` is what the student sends back after
  // reading the warning, and it always goes through. A checker that can refuse a
  // hand-in is worse than the gap it catches — the paper gets marked with a
  // missing page either way, but a refused hand-in never arrives at all.
  if (!body.confirmed) {
    const pre = await bot({ phase: 'preflight', source: { photos: photoUrls.map(u => ({ original_url: u })) } });
    const findings = Array.isArray(pre?.findings) ? pre.findings : [];
    if (findings.some((f: { blocking?: boolean }) => f?.blocking)) {
      return NextResponse.json({ needsConfirm: true, findings }, { status: 409 });
    }
  }

  // THE GATE (lib/mark-subject-for-student). The client picker is only UX; the
  // subject a hand-in is actually marked as is decided here, server-side, and a
  // student can never reach a subject they are not entitled to: 'closed' (the
  // default until the flag flips) forces math whatever the browser sent, 'open'
  // honours only a subject the student is enrolled in, and Adrian's admin cookie
  // ('preview') may mark anything. Assignments and printed papers are math.
  let subject: string = 'math';
  if (!assignment && !(typeof body.paperId === 'string' && body.paperId)) {
    subject = resolveHandinSubject({
      requested: body.subject,
      enrolled: await enrolledMarkSubjects(studentId),
      access: await markSubjectAccess(),
    });
  }

  const saved = await bot({
    phase: 'save-paper',
    paperName,
    subject,
    source: { photos: photoUrls.map(u => ({ original_url: u })) },
  });
  const runId = saved?.run_id;
  if (!runId) {
    console.error('[portal-submit] save-paper failed:', saved?.error);
    return NextResponse.json({ error: 'The submission could not be saved — try again in a minute.' }, { status: 502 });
  }

  // Tag the run to its student (same phase the admin send row uses).
  await bot({ phase: 'set-student', id: runId, studentId, studentName: account.display_name || '' });

  // Stamp HOW it arrived, so student-facing surfaces can show "with Adrian" for
  // portal hand-ins without ever picking up papers Adrian uploaded himself.
  // Read-merge-write on a row created milliseconds ago — nothing else has it yet.
  try {
    const { data: row } = await admin.from('paper_marking_runs').select('result_json').eq('id', runId).single();
    const rj = (row?.result_json && typeof row.result_json === 'object') ? row.result_json as Record<string, unknown> : {};
    await admin.from('paper_marking_runs').update({
      result_json: {
        ...rj,
        portal_submission: true,
        ...(assignment ? { assignment_id: assignment.id } : {}),
        // Pre-registration (SPEC-PRINT-PAPER.md): the exact QB questions on
        // the printed sheet, in order — the marker can ground on their stored
        // solutions instead of working out what each question even is.
        ...(printedPaper ? { generated_paper_id: printedPaper.id, generated_question_ids: printedPaper.question_ids } : {}),
      },
    }).eq('id', runId);
  } catch (e) {
    console.warn('[portal-submit] portal_submission stamp failed:', (e as Error).message);
  }

  // Spend one hand-in on the stranger's pass meter — AFTER the run is saved,
  // so a failed submission never burns allowance. Read-modify-write on the row
  // requireActiveAccess just fetched: two truly simultaneous submits could
  // write the same value and under-count by one (accepted — it only ever gives
  // a hand-in away, and the daily cap bounds the drift); a failure here is
  // logged, never fatal — the paper is already with Adrian.
  if (meteredPass && !assignment) {
    const { error: meterErr } = await admin
      .from('portal_passes')
      .update({ handins_used: (meteredPass.handins_used ?? 0) + 1 })
      .eq('id', meteredPass.id);
    if (meterErr) console.error('[portal-submit] hand-in meter update failed:', meterErr.message);
  }

  if (assignment) {
    const { error: flipErr } = await admin.from('portal_assignments')
      .update({ status: 'submitted', run_id: runId, submitted_at: new Date().toISOString() })
      .eq('id', assignment.id).eq('status', 'assigned');
    if (flipErr) console.error('[portal-submit] assignment flip failed:', flipErr.message);
  }
  if (printedPaper) {
    const { error: flipErr } = await admin.from('portal_generated_papers')
      .update({ status: 'submitted', run_id: runId })
      .eq('id', printedPaper.id).eq('status', 'open');
    if (flipErr) console.error('[portal-submit] printed-paper flip failed:', flipErr.message);
  }

  // Auto-queue the hand-in for marking (after the stamp above, so the queue
  // worker can never claim the run while the stamp's read-merge-write is in
  // flight). phase:'enqueue' defaults to opus/teacher — the same marking Adrian's
  // own 🌙 button queues. On success we send NOTHING: the queue worker's finished-
  // marking Telegram (student name + 🖼 PDF + Release nudge) is the doorbell now.
  const who = account.display_name || 'A student';
  let queued = false;
  try {
    const q = await bot({ phase: 'enqueue', id: runId });
    queued = !!q?.ok;
    if (!queued) console.warn('[portal-submit] enqueue failed:', q?.error);
  } catch (e) {
    console.warn('[portal-submit] enqueue failed:', (e as Error).message);
  }
  if (!queued) {
    // The run is saved either way — but with no queue entry nobody would ever
    // hear about it, so fall back to the old "come tap ▶ Mark" doorbell.
    sendTelegram(
      `📬 <b>${who}</b> submitted a paper for marking — ${photoUrls.length} page${photoUrls.length === 1 ? '' : 's'}` +
      ` — “${paperName}”.\nAuto-queue failed, so it's waiting as ⏳ in /admin/mark-paper history — tap ▶ Mark yourself.`
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, runId });
}
