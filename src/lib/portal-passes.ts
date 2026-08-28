// Portal pass entitlements — the money core for the $29 / 30-day portal pass.
//
// Who gets in (portalAccessAllowed):
//   1. Tuition students — any account linked to an Airtable Students record
//      (non-empty airtable_student_id) is ALWAYS free: they already pay for
//      lessons. Future "stranger" accounts (invite/payments build) will have no
//      airtable_student_id and fall through to the pass check.
//   2. Everyone else needs an unexpired row in Supabase `portal_passes`
//      (service-role only, RLS locked): account_id, source
//      ('hitpay'|'stripe'|'manual'|'trial'), reference, starts_at, expires_at.
//      'trial' = the free 3-day pass a REFERRED self-serve signup gets at
//      creation (/api/portal/join) — same table, same gate, shorter clock.
//
// Granting (grantPass) STACKS: the new expiry is max(now, latest existing
// expiry) + days, so buying again before expiry extends from the end of the
// current pass — a renewal never wastes the days already paid for.
//
// Money logic lives here as pure functions with injectable now/rows (tested in
// portal-passes.test.ts); the service wrappers only fetch rows and insert.
// Enforcement (2026-08-28): the /app layout redirects pass-less strangers to
// /app/pass (page gate), and requireActiveAccess() below is the API belt on
// the expensive routes (grade / generate / similar / submit / print POST).
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';

export type PassSource = 'hitpay' | 'stripe' | 'manual' | 'referral' | 'trial';

/** Days a single standard purchase buys. */
export const DEFAULT_PASS_DAYS = 30;

/** Days a referred self-serve signup gets free (the invite hook). */
export const TRIAL_PASS_DAYS = 3;

/** Floor (SGD) below which a verified payment does NOT auto-grant — stops a
 *  S$1 payment-link typo, or a malicious tiny payment aimed at a guessed
 *  account uuid, from buying 30 days. Override with PASS_MIN_AMOUNT_SGD. */
export const DEFAULT_PASS_MIN_AMOUNT_SGD = 25;

export interface PassRow {
  expires_at: string;
}

// ── Tiers + the hand-in meter (Adrian, 2026-08-28: "build the counter") ─────
// A pass is 'standard' (S$29) or 'intensive' (S$49). Everything in the portal
// stays unlimited on both; ONLY marked hand-ins are metered — they are the
// expensive human+model loop the pass actually sells. Tuition students are
// never metered (they don't ride passes at all). Trials carry the column
// default 'standard'. DB: portal_passes.tier text default 'standard',
// portal_passes.handins_used int default 0 (added 2026-08-28, verified live).

export type PassTier = 'standard' | 'intensive';

/** Marked hand-ins one pass includes, by tier. */
export const HANDINS_PER_PASS: Record<PassTier, number> = { standard: 8, intensive: 20 };

/** Hand-ins per SGT day for a STRANGER on this tier (tuition students keep the
 *  global DAILY_SUBMIT_CAP from lib/portal-submit-limit.ts). */
export const DAILY_HANDIN_CAP_BY_TIER: Record<PassTier, number> = { standard: 1, intensive: 3 };

/** Anything that isn't exactly 'intensive' (old rows, trials, NULL, typos)
 *  meters as 'standard' — the safe floor. */
export function normalizeTier(tier: string | null | undefined): PassTier {
  return tier === 'intensive' ? 'intensive' : 'standard';
}

/** A portal_passes row as the meter reads it. */
export interface MeteredPassRow extends PassRow {
  id: string;
  source: string;
  tier: string | null;
  handins_used: number | null;
}

/**
 * The account's CURRENT pass among `rows`: active (expires_at strictly after
 * `now`) with the LATEST expiry — the same row stacking extends, so a renewal
 * mid-pass keeps counting on the pass that ends last. Null when none is active.
 */
export function currentPassInRows<T extends PassRow>(rows: T[], now: Date): T | null {
  let best: T | null = null;
  let bestTime = now.getTime();
  for (const r of rows) {
    const t = Date.parse(r.expires_at);
    if (Number.isFinite(t) && t > bestTime) {
      best = r;
      bestTime = t;
    }
  }
  return best;
}

/** Marked hand-ins this pass includes in total (tier-normalized). */
export function handinAllowance(pass: Pick<MeteredPassRow, 'tier'> | null | undefined): number {
  return HANDINS_PER_PASS[normalizeTier(pass?.tier)];
}

/** Marked hand-ins still unspent on this pass; 0 with no pass. Never negative
 *  (an over-count from the accepted increment race clamps to 0, not -1). */
export function handinsRemaining(
  pass: Pick<MeteredPassRow, 'tier' | 'handins_used'> | null | undefined,
): number {
  if (!pass) return 0;
  return Math.max(0, handinAllowance(pass) - (pass.handins_used ?? 0));
}

/** The SGT-daily hand-in ceiling for a stranger on this tier. */
export function dailyHandinCapForTier(tier: string | null | undefined): number {
  return DAILY_HANDIN_CAP_BY_TIER[normalizeTier(tier)];
}

/** The slice of a portal account this module needs. Matches PortalAccount
 *  (portal-auth.ts) structurally; optional so partial selects also fit. */
export interface PassAccountLike {
  id: string;
  airtable_student_id?: string | null;
  /** Offboarding (2026-08-28): set when Adrian deactivates the account
   *  (POST /api/admin/passes {action:'deactivate'}). A deactivated account is
   *  no longer tuition-free — see isTuitionAccount. */
  deactivated_at?: string | null;
}

// ── Pure logic ───────────────────────────────────────────────────────────────

/** Tuition students ride free: a non-empty airtable_student_id means Adrian
 *  already teaches (and bills) this person. Stranger accounts from the
 *  invite/payments flow have null/empty here and fall through to passes.
 *
 *  Offboarding (2026-08-28): a DEACTIVATED account (deactivated_at set) is no
 *  longer tuition-free even with a linked Airtable record — a graduate can pay
 *  S$29 like anyone else, otherwise the paywall stops them. NOTE this makes
 *  "not tuition" wider than "stranger": portal-auth's portalIdentity
 *  deliberately does NOT consult deactivated_at, so an offboarded ex-student
 *  keeps their `rec…` identity (marked papers, notebook, attempts stay theirs)
 *  while paying like a stranger. */
export function isTuitionAccount(account: PassAccountLike | null | undefined): boolean {
  if (!account) return false;
  if (account.deactivated_at) return false;
  return Boolean(account.airtable_student_id && account.airtable_student_id.trim() !== '');
}
/**
 * May this INVITER's link grant a 3-day trial? (Adrian, 2026-08-29: "let's
 * guard against that" — trial-farming.) Qualified = an active (non-deactivated)
 * tuition student, or an account holding any ACTIVE pass that wasn't itself a
 * trial ('stripe' | 'hitpay' | 'manual' | 'referral' — referral days only ever
 * come from a friend actually paying). A trial-only account can invite (the
 * link still works, attribution still lands) but its invitees get NO trial —
 * which breaks A→B→C self-referral chains that would mint free marking
 * forever. Pure over the inviter row + their pass rows.
 */
export function qualifiesToGrantTrials(
  inviter: { id?: string; airtable_student_id?: string | null; deactivated_at?: string | null },
  passRows: Array<{ expires_at: string; source?: string | null }>,
  now: Date = new Date(),
): boolean {
  if (isTuitionAccount({ id: inviter.id ?? '', ...inviter })) return true;
  return passRows.some(p => p.source !== 'trial' && new Date(p.expires_at) > now);
}


/** Any pass strictly in the future keeps access on. A pass expiring exactly at
 *  `now` is already expired (strict >, mirroring the DB filter `expires_at > now`). */
export function hasActivePassInRows(rows: PassRow[], now: Date): boolean {
  return rows.some((r) => {
    const t = Date.parse(r.expires_at);
    return Number.isFinite(t) && t > now.getTime();
  });
}

/**
 * Expiry for a NEW pass of `days` days: max(now, latest existing expiry) + days.
 *  - no rows / all expired  → now + days (an old lapsed pass never eats new days)
 *  - active pass running    → its expiry + days (stacking extends, never overlaps)
 * Day arithmetic is exact milliseconds (SGT has no DST; column is timestamptz).
 */
export function computeGrantExpiry(rows: PassRow[], days: number, now: Date): Date {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(`grantPass: days must be a positive number, got ${days}`);
  }
  let base = now.getTime();
  for (const r of rows) {
    const t = Date.parse(r.expires_at);
    if (Number.isFinite(t) && t > base) base = t;
  }
  return new Date(base + days * 86_400_000);
}

/** Latest expiry across an account's passes, or null when it has none with a
 *  readable date. Powers the /pass "your trial ends <date>" renew screen. */
export function latestPassExpiry(rows: PassRow[]): Date | null {
  let latest = -Infinity;
  for (const r of rows) {
    const t = Date.parse(r.expires_at);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  return Number.isFinite(latest) ? new Date(latest) : null;
}

/** What the /app Home banner says when a pass is about to run out. */
export interface PassEndingNudge {
  /** 'trial' when the ending pass is the free referred trial, else 'pass'. */
  kind: 'trial' | 'pass';
  when: 'today' | 'tomorrow';
}

/** SGT calendar date (YYYY-MM-DD) of an epoch-ms instant — SGT has no DST, so
 *  a fixed +8h shift is exact. */
function sgtDateOf(ms: number): string {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}

/**
 * The Home-page "⏳ your trial/pass is about to end" banner decision: fires
 * only for a pass that is ACTIVE (strict >, matching every other gate here),
 * ends within 48h, AND ends on today's or tomorrow's SGT calendar day — so
 * the copy "ends today/tomorrow" is always literally true (a pass 47h out but
 * on the day AFTER tomorrow says nothing rather than lying). Null = no banner.
 * Tuition accounts never reach this — callers short-circuit on
 * isTuitionAccount first, keeping their Home render at zero pass cost.
 */
export function passEndingNudge(
  pass: Pick<MeteredPassRow, 'source' | 'expires_at'> | null | undefined,
  now: Date,
): PassEndingNudge | null {
  if (!pass) return null;
  const t = Date.parse(pass.expires_at);
  if (!Number.isFinite(t) || t <= now.getTime()) return null; // lapsed (or garbage) — the paywall's job, not a nudge
  if (t - now.getTime() > 48 * 3600_000) return null; // not soon enough to nag
  const kind: PassEndingNudge['kind'] = pass.source === 'trial' ? 'trial' : 'pass';
  const endDay = sgtDateOf(t);
  if (endDay === sgtDateOf(now.getTime())) return { kind, when: 'today' };
  if (endDay === sgtDateOf(now.getTime() + 86_400_000)) return { kind, when: 'tomorrow' };
  return null;
}

/** "29.00" / "25" → integer cents; null when not a plain non-negative decimal
 *  with ≤2 dp (HitPay sends amounts as decimal strings — money never rides
 *  through bare parseFloat comparisons here). */
export function decimalAmountToCents(amount: string): number | null {
  if (typeof amount !== 'string' || !/^\d+(\.\d{1,2})?$/.test(amount.trim())) return null;
  return Math.round(parseFloat(amount.trim()) * 100);
}

/** The configured auto-grant floor in SGD: PASS_MIN_AMOUNT_SGD when it parses
 *  to a finite non-negative number (0 = floor off), else the default 25. */
export function passMinAmountSgd(env: Record<string, string | undefined> = process.env): number {
  const raw = parseFloat(env.PASS_MIN_AMOUNT_SGD ?? '');
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_PASS_MIN_AMOUNT_SGD;
}

/**
 * Should a VERIFIED completed payment auto-grant a pass? Two gates, both in
 * integer cents (no float drift on the boundary):
 *   - currency must be SGD (case-insensitive) — a webhook in any other
 *     currency goes to the manual-note path, never a guessed conversion;
 *   - amount ≥ the floor (exactly the floor qualifies; one cent under fails).
 * Returns a human `reason` for the Telegram note when it refuses.
 */
export function paymentQualifiesForPass(opts: {
  amountCents: number | null;
  currency: string;
  minAmountSgd?: number;
}): { ok: boolean; reason?: string } {
  const min = opts.minAmountSgd ?? passMinAmountSgd();
  if ((opts.currency || '').toUpperCase() !== 'SGD') {
    return { ok: false, reason: `currency ${(opts.currency || '(none)').toUpperCase()} is not SGD` };
  }
  if (opts.amountCents === null || !Number.isFinite(opts.amountCents)) {
    return { ok: false, reason: 'amount unreadable' };
  }
  if (opts.amountCents < Math.round(min * 100)) {
    return {
      ok: false,
      reason: `amount S$${(opts.amountCents / 100).toFixed(2)} is below the S$${min.toFixed(2)} auto-grant floor`,
    };
  }
  return { ok: true };
}

// ── Service pieces (Supabase, service-role) ─────────────────────────────────
// `client` is injectable for tests (portal-submit-limit.ts precedent); the
// default is the RLS-bypassing admin client — portal_passes is service-only.

type PassesClient = Pick<SupabaseClient, 'from'>;

/** True iff the account holds any pass with expires_at strictly after `now`. */
export async function hasActivePass(
  accountId: string,
  now: Date = new Date(),
  client: PassesClient = getSupabaseAdmin(),
): Promise<boolean> {
  const { count, error } = await client
    .from('portal_passes')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gt('expires_at', now.toISOString());
  if (error) throw new Error(`portal_passes lookup failed: ${error.message}`);
  return (count ?? 0) > 0;
}

/** The pass previously recorded for a (source, reference) pair, if any — the
 *  webhook's idempotency check, so a HitPay retry never stacks a second 30 days. */
export async function findPassByReference(
  source: PassSource,
  reference: string,
  client: PassesClient = getSupabaseAdmin(),
): Promise<{ id: string; expires_at: string } | null> {
  const { data, error } = await client
    .from('portal_passes')
    .select('id, expires_at')
    .eq('source', source)
    .eq('reference', reference)
    .limit(1)
    .maybeSingle<{ id: string; expires_at: string }>();
  if (error) throw new Error(`portal_passes reference lookup failed: ${error.message}`);
  return data ?? null;
}

/**
 * Insert a new pass for the account, expiring `days` after whichever is later:
 * now, or the account's latest existing expiry (stacking). Returns the row.
 *
 * IDEMPOTENT on (source, reference): when a reference is given and a pass with
 * that source+reference already exists, the existing pass is returned with
 * `duplicate: true` and NOTHING is inserted — payment webhooks retry until
 * they see 200, and a retry must never stack a second 30 days. (Manual grants
 * without a reference always insert.)
 *
 * (Read-then-insert has a race window if two grants land in the same instant —
 * at this scale the worst case is two passes both counted, which only ever
 * gives days away, never takes them.)
 */
export async function grantPass(
  opts: {
    accountId: string;
    days: number;
    source: PassSource;
    reference?: string | null;
    now?: Date;
    /** 'standard' (default) or 'intensive' — sets the pass's hand-in meter. */
    tier?: PassTier;
  },
  client: PassesClient = getSupabaseAdmin(),
): Promise<{ id: string; expiresAt: string; duplicate?: boolean }> {
  const now = opts.now ?? new Date();

  const reference = opts.reference ?? null;
  if (reference) {
    const already = await findPassByReference(opts.source, reference, client);
    if (already) return { id: already.id, expiresAt: already.expires_at, duplicate: true };
  }

  const { data: existing, error: readErr } = await client
    .from('portal_passes')
    .select('expires_at')
    .eq('account_id', opts.accountId);
  if (readErr) throw new Error(`portal_passes read failed: ${readErr.message}`);

  const expiresAt = computeGrantExpiry((existing ?? []) as PassRow[], opts.days, now);
  const { data, error } = await client
    .from('portal_passes')
    .insert({
      account_id: opts.accountId,
      source: opts.source,
      reference,
      starts_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      tier: normalizeTier(opts.tier),
    })
    .select('id, expires_at')
    .single<{ id: string; expires_at: string }>();
  if (error || !data) throw new Error(`portal_passes insert failed: ${error?.message ?? 'no row returned'}`);
  return { id: data.id, expiresAt: data.expires_at };
}

/** The one gate future enforcement should call: tuition students always pass;
 *  anyone else needs an active pass. Null/anonymous → false. */
export async function portalAccessAllowed(
  account: PassAccountLike | null | undefined,
  now: Date = new Date(),
  client?: PassesClient,
): Promise<boolean> {
  if (!account) return false;
  if (isTuitionAccount(account)) return true; // short-circuits: no DB hit for tuition students
  return hasActivePass(account.id, now, client ?? getSupabaseAdmin());
}

/** The account's current pass row (active, latest expiry) with its tier and
 *  hand-in meter — what /app/pass and the submit meter read. Null when no pass
 *  is active. */
export async function getCurrentPass(
  accountId: string,
  now: Date = new Date(),
  client: PassesClient = getSupabaseAdmin(),
): Promise<MeteredPassRow | null> {
  const { data, error } = await client
    .from('portal_passes')
    .select('id, source, expires_at, tier, handins_used')
    .eq('account_id', accountId);
  if (error) throw new Error(`portal_passes read failed: ${error.message}`);
  return currentPassInRows((data ?? []) as MeteredPassRow[], now);
}

/** What a 402 tells the student. The page-level paywall (the /app layout →
 *  /app/pass redirect) is the normal path; this message is the API belt for
 *  direct calls after a pass lapses mid-session. */
export const PASS_REQUIRED_MESSAGE =
  'Your pass has ended — renew at /app/pass (S$29 for 30 days) to keep going.';

export type AccessCheck =
  /** `pass` is the stranger's current pass row (their meter), null for tuition
   *  accounts — the tuition short-circuit never touches the DB. */
  | { ok: true; pass: MeteredPassRow | null }
  | { ok: false; status: 402; error: string };

/**
 * API-level pass enforcement for the EXPENSIVE routes (grade / generate /
 * similar / submit / print-paper POST — each one spends real model or human
 * time). Tuition accounts short-circuit with zero extra cost; a stranger
 * without an active pass gets a friendly 402 naming /app/pass. Cheap reads
 * stay behind the page gate only.
 */
export async function requireActiveAccess(
  account: PassAccountLike | null | undefined,
  now: Date = new Date(),
  client?: PassesClient,
): Promise<AccessCheck> {
  if (account && isTuitionAccount(account)) return { ok: true, pass: null };
  if (account) {
    const pass = await getCurrentPass(account.id, now, client ?? getSupabaseAdmin());
    if (pass) return { ok: true, pass };
  }
  return { ok: false, status: 402, error: PASS_REQUIRED_MESSAGE };
}
