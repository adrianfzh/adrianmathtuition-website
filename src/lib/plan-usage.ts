// Self-serve plans — where an account stands (SPEC-PLANS.md, 5 Nov 2026).
// Prices and limits live in lib/plans.ts; this file only COUNTS.
//
// Storage (no new columns — the live portal_accounts row is student-writable
// under RLS, so a counter there could be reset by the student):
//   • Plan papers   → the current portal_passes row's handins_used (the S$29
//                     pass meter, unchanged) with tier = lite|plus|max.
//   • Free used     → marked-paper runs stamped result_json.plan_free = true by
//                     the submit route (service-only table, cannot be tampered).
//   • Bonus papers  → portal_passes rows with source 'bonus': never active
//                     (expires_at = starts_at), handins_used = papers given.
//                     The invite bonus and Adrian's hand grants both write one.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';
import {
  currentPassInRows,
  handinAllowance,
  isTuitionAccount,
  type MeteredPassRow,
  type PassAccountLike,
} from './portal-passes';
import { PLANS, freePaperAllowance, isPlanKey, plansActive, type PlanKey } from './plans';

export const BONUS_SOURCE = 'bonus';

export type PlanStatus =
  | { kind: 'tuition' }
  | {
      kind: 'free';
      allowance: number;
      used: number;
      left: number;
      bonus: number;
    }
  | {
      kind: 'plan';
      /** lite|plus|max, or null for an old S$29 pass / trial / referral days. */
      plan: PlanKey | null;
      label: string;
      allowance: number;
      used: number;
      left: number;
      endsAt: string;
      pass: MeteredPassRow;
    };

export interface PassRowWithSource extends MeteredPassRow {
  starts_at?: string | null;
}

/** Bonus papers given to this account (sum of 'bonus' rows). */
export function bonusPapersInRows(rows: Array<{ source?: string | null; handins_used?: number | null }>): number {
  // A negative row is Adrian taking papers back; the total never drops below 0.
  const total = rows
    .filter(r => r.source === BONUS_SOURCE)
    .reduce((n, r) => n + (r.handins_used ?? 0), 0);
  return Math.max(0, total);
}

/** Pure: where does this (non-tuition) account stand? */
export function planStatusFromRows(rows: PassRowWithSource[], freeUsed: number, now: Date): Exclude<PlanStatus, { kind: 'tuition' }> {
  const metered = rows.filter(r => r.source !== BONUS_SOURCE);
  const current = currentPassInRows(metered, now);
  if (current) {
    const allowance = handinAllowance(current);
    const used = Math.max(0, current.handins_used ?? 0);
    const plan = isPlanKey(current.tier) ? current.tier : null;
    return {
      kind: 'plan',
      plan,
      label: plan ? PLANS[plan].label : current.source === 'trial' ? 'Trial' : current.tier === 'intensive' ? 'Intensive pass' : 'Pass',
      allowance,
      used,
      left: Math.max(0, allowance - used),
      endsAt: current.expires_at,
      pass: current,
    };
  }
  const bonus = bonusPapersInRows(rows);
  const allowance = freePaperAllowance(bonus);
  const used = Math.max(0, freeUsed);
  return { kind: 'free', allowance, used, left: Math.max(0, allowance - used), bonus };
}

type Client = Pick<SupabaseClient, 'from'>;

/** Free marked papers this identity has used (runs stamped plan_free). */
export async function countFreePapersUsed(studentIdentity: string, client: Client = getSupabaseAdmin()): Promise<number> {
  const { count, error } = await client
    .from('paper_marking_runs')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentIdentity)
    .eq('result_json->>plan_free', 'true');
  if (error) throw new Error(`free paper count failed: ${error.message}`);
  return count ?? 0;
}

/** The account's plan status (one passes read + one head count). */
export async function getPlanStatus(
  account: PassAccountLike & { id: string },
  studentIdentity: string,
  now: Date = new Date(),
  client: Client = getSupabaseAdmin(),
): Promise<PlanStatus> {
  if (isTuitionAccount(account)) return { kind: 'tuition' };
  const { data, error } = await client
    .from('portal_passes')
    .select('id, source, starts_at, expires_at, tier, handins_used')
    .eq('account_id', account.id);
  if (error) throw new Error(`portal_passes read failed: ${error.message}`);
  const rows = (data ?? []) as PassRowWithSource[];
  const freeUsed = await countFreePapersUsed(studentIdentity, client);
  return planStatusFromRows(rows, freeUsed, now);
}

/** Give an account extra free marked papers (invite bonus, or Adrian by hand).
 *  Idempotent on reference when one is given. */
export async function grantBonusPapers(
  opts: { accountId: string; papers: number; reference?: string | null; now?: Date },
  client: Client = getSupabaseAdmin(),
): Promise<{ duplicate: boolean }> {
  const papers = Math.floor(opts.papers);
  if (!Number.isFinite(papers) || papers === 0) throw new Error('papers must be a non-zero whole number');
  const reference = opts.reference ?? null;
  if (reference) {
    const { data } = await client
      .from('portal_passes')
      .select('id')
      .eq('source', BONUS_SOURCE)
      .eq('reference', reference)
      .limit(1)
      .maybeSingle();
    if (data) return { duplicate: true };
  }
  const at = (opts.now ?? new Date()).toISOString();
  const { error } = await client.from('portal_passes').insert({
    account_id: opts.accountId,
    source: BONUS_SOURCE,
    reference,
    starts_at: at,
    expires_at: at, // never active: the pass gates use a strict expires_at > now
    tier: BONUS_SOURCE,
    handins_used: papers,
  });
  if (error) throw new Error(`bonus grant failed: ${error.message}`);
  return { duplicate: false };
}

/** The hand-in page's "papers used" card (null = show the form). Pure. */
export function planBlockFor(st: PlanStatus | null): { title: string; body: string } | null {
  if (!st || st.kind === 'tuition' || st.left > 0) return null;
  if (st.kind === 'free') {
    return {
      title: st.allowance === 1 ? 'Your free marked paper is used' : `Your ${st.allowance} free marked papers are used`,
      body: 'Pick a plan to get more papers marked. Practice stays free.',
    };
  }
  return {
    title: `All ${st.allowance} marked papers in your ${st.label} plan are used`,
    body: 'Upgrade for more papers now, or a fresh set comes with your next 30 days. Practice stays free.',
  };
}

/** Server pages: the block for this account, only while plans are on. Never throws. */
export async function submitPlanBlock(
  account: PassAccountLike & { id: string },
  studentIdentity: string,
): Promise<{ title: string; body: string } | null> {
  if (!plansActive() || isTuitionAccount(account)) return null;
  const st = await getPlanStatus(account, studentIdentity).catch(() => null);
  return planBlockFor(st);
}
