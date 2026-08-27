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
// NOTHING enforces this yet — entitlement gating lands with the invite build.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';

export type PassSource = 'hitpay' | 'stripe' | 'manual' | 'trial';

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

/** The slice of a portal account this module needs. Matches PortalAccount
 *  (portal-auth.ts) structurally; optional so partial selects also fit. */
export interface PassAccountLike {
  id: string;
  airtable_student_id?: string | null;
}

// ── Pure logic ───────────────────────────────────────────────────────────────

/** Tuition students ride free: a non-empty airtable_student_id means Adrian
 *  already teaches (and bills) this person. Stranger accounts from the future
 *  invite/payments flow will have null/empty here and fall through to passes. */
export function isTuitionAccount(account: PassAccountLike | null | undefined): boolean {
  return Boolean(account?.airtable_student_id && account.airtable_student_id.trim() !== '');
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
  opts: { accountId: string; days: number; source: PassSource; reference?: string | null; now?: Date },
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
