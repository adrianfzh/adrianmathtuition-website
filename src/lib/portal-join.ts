// Self-serve signup ("/join") pure helpers — the invite → stranger-signup →
// paywall loop for OUTSIDE students (accounts with no Airtable record).
//
// Tuition students keep joining via admin-issued activation links
// (/api/portal/activate). This module serves the second door: any current
// student shares /join?ref=<their account id>; the friend creates an UNLINKED
// portal account (airtable_student_id = '' — the column is NOT NULL, so empty
// string is the "stranger" marker; lib/portal-passes.isTuitionAccount already
// treats '' as not-a-tuition-account) and must hold a S$29/30-day pass
// (lib/portal-passes) to get past the /app layout gate.
//
// Everything here is pure (tested in portal-join.test.ts); the I/O lives in
// /api/portal/join and the /join + /pass pages.
import { POLICY_VERSION } from './portal-consent';
import { escapeTelegramHtml } from './requests';

// ── Levels ───────────────────────────────────────────────────────────────────
// The exact Airtable Students.Level vocabulary ("Sec 1"…"Sec 5", "JC1", "JC2")
// — the same values qbLevelsFor (lib/qb-levels.ts) parses to scope practice,
// so a stranger's chosen level drives the practice pickers with zero extra
// wiring: practice already reads portal_accounts.level.
export const JOIN_LEVELS: { value: string; label: string }[] = [
  { value: 'Sec 1', label: 'Sec 1' },
  { value: 'Sec 2', label: 'Sec 2' },
  { value: 'Sec 3', label: 'Sec 3' },
  { value: 'Sec 4', label: 'Sec 4' },
  { value: 'Sec 5', label: 'Sec 5' },
  { value: 'JC1', label: 'JC1 (H2 Math)' },
  { value: 'JC2', label: 'JC2 (H2 Math)' },
];

/** Case/whitespace-forgiving match against JOIN_LEVELS; canonical value or null. */
export function normalizeJoinLevel(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const wanted = input.trim().toLowerCase();
  if (!wanted) return null;
  return JOIN_LEVELS.find(l => l.value.toLowerCase() === wanted)?.value ?? null;
}

// ── Invite ref ───────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ?ref= is only ever a portal account uuid. Anything else (Airtable recXXX
 *  ids, garbage, injection attempts) → null: the signup still succeeds, just
 *  unattributed — a mangled share link must never block a paying stranger. */
export function validateInviteRef(ref: unknown): string | null {
  if (typeof ref !== 'string') return null;
  const t = ref.trim();
  return UUID_RE.test(t) ? t.toLowerCase() : null;
}

/** The personal share link a student hands their friend. */
export function inviteLinkFor(accountId: string): string {
  return `https://www.adrianmathtuition.com/join?ref=${accountId}`;
}

/** portal_passes.reference for the referred-signup 3-day trial. Carries BOTH
 *  uuids: the inviter for the audit trail, the new account so grantPass's
 *  (source, reference) idempotency dedupes per-INVITEE — a reference of just
 *  the inviter would make the second friend Zane refers "a duplicate" and
 *  silently deny their trial. */
export function trialReference(inviterId: string, newAccountId: string): string {
  return `invite:${inviterId}:${newAccountId}`;
}

// ── Signup validation ────────────────────────────────────────────────────────

export type JoinValidation =
  | { ok: true; name: string; email: string; password: string; level: string }
  | { ok: false; error: string };

/** Field validation for the self-serve signup POST — same bars as the
 *  activate route (email shape, 8-char password, explicit consent) plus the
 *  stranger-only fields (name, level). */
export function validateJoinSignup(body: {
  name?: unknown; email?: unknown; password?: unknown; consent?: unknown; level?: unknown;
}): JoinValidation {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: 'Tell us your name (2–80 characters)' };
  }
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Enter a valid email address' };
  }
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }
  const level = normalizeJoinLevel(body.level);
  if (!level) return { ok: false, error: 'Pick your level' };
  if (body.consent !== true) {
    return { ok: false, error: 'Please agree to the privacy policy to create the account' };
  }
  return { ok: true, name, email, password: body.password, level };
}

// ── Consent record ───────────────────────────────────────────────────────────

/** PDPA consent record for a self-serve account — same shape family as the
 *  activate route's (consented_by / policy_version / consented_at), with the
 *  source marked 'self-serve invite' and the inviter ref kept for the audit
 *  trail. No invite_email: nothing was emailed; the account's own email is
 *  the identity that consented. */
export function buildSelfServeConsentRecord(opts: { ref: string | null; now?: Date }): {
  source: 'self-serve invite';
  ref: string | null;
  consented_by: 'student';
  policy_version: string;
  consented_at: string;
} {
  return {
    source: 'self-serve invite',
    ref: opts.ref,
    consented_by: 'student',
    policy_version: POLICY_VERSION,
    consented_at: (opts.now ?? new Date()).toISOString(),
  };
}

// ── Telegram note ────────────────────────────────────────────────────────────

/** "🆕 Self-serve signup: <name> (<level>), invited by <inviter or 'nobody'>"
 *  (+ " · 3-day trial granted" when the referral trial landed) — student-typed
 *  strings escaped for parse_mode:'HTML'. */
export function selfServeSignupTelegramText(
  name: string,
  level: string,
  inviterName: string | null,
  trialGranted = false,
): string {
  const who = escapeTelegramHtml(name.trim() || 'Someone');
  const inviter = inviterName && inviterName.trim()
    ? escapeTelegramHtml(inviterName.trim())
    : 'nobody';
  return `🆕 Self-serve signup: <b>${who}</b> (${escapeTelegramHtml(level)}), invited by ${inviter}`
    + (trialGranted ? ' · 3-day trial granted' : '');
}

// ── Stripe payment link ──────────────────────────────────────────────────────

/** STRIPE_PASS_LINK + ?client_reference_id=<account uuid> — the reference the
 *  stripe-webhook uses to auto-grant the pass to exactly this account. Null
 *  when the configured link is not a URL (button then degrades, never a
 *  broken href). */
export function passCheckoutUrl(link: string, accountId: string): string | null {
  try {
    const u = new URL(link.trim());
    u.searchParams.set('client_reference_id', accountId);
    return u.toString();
  } catch {
    return null;
  }
}

// ── Rate limiting (pure sliding window) ──────────────────────────────────────

/** Prune hits outside the window and decide whether one more is allowed.
 *  Callers keep the returned array (with `now` appended when allowed). */
export function rateLimitStep(
  hits: number[],
  now: number,
  opts: { windowMs: number; max: number },
): { allowed: boolean; hits: number[] } {
  const fresh = hits.filter(t => now - t < opts.windowMs);
  if (fresh.length >= opts.max) return { allowed: false, hits: fresh };
  fresh.push(now);
  return { allowed: true, hits: fresh };
}
