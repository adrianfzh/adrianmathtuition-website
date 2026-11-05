// Self-serve plans — THE ONE PLACE for every price and limit (Adrian, 5 Nov 2026:
// "let's build it first, including the pricing, then we can change later, but
// let's prototype first"). SPEC-PLANS.md has the story; change a number here and
// every screen, the checkout and the meter follow.
//
// Shape:
//   Free  — practice stays open (it is cheap to run) + FREE_MARKED_PAPERS marked
//           paper(s) for life: the "show the value before asking for money" step.
//           A friend who signs up through an invite link gets REFERRED_EXTRA_FREE_PAPERS more.
//   Paid  — Lite / Plus / Max, split by full papers marked per 30-day period.
//           A purchase is a portal_passes row (tier = the plan key, 30 days), so
//           stacking, the payment webhooks and the referral reward all reuse the
//           S$29 pass plumbing unchanged.
// Tuition students (linked to Airtable) never see any of this.
//
// PROTOTYPE SWITCH: plansActive() is true on the test site and locally, and on the
// main site only when PLANS_OPEN_TO_STUDENTS (lib/portal-beta.ts) is flipped. While
// it is false on the main site, production keeps the old S$29 pass exactly as before.
import { PLANS_OPEN_TO_STUDENTS } from './portal-beta';

export type PlanKey = 'lite' | 'plus' | 'max';

export interface Plan {
  key: PlanKey;
  label: string;
  /** Price for one 30-day period, in SGD (whole dollars or cents both fine). */
  priceSgd: number;
  /** Full papers marked per 30-day period. */
  papersPerPeriod: number;
  /** Most exam papers in one Singapore day (smooths the overnight queue). null = no daily cap. */
  dailyCap: number | null;
  blurb: string;
}

// ── EDIT PRICES AND LIMITS HERE ─────────────────────────────────────────────
export const PLANS: Record<PlanKey, Plan> = {
  lite: { key: 'lite', label: 'Lite', priceSgd: 15, papersPerPeriod: 3, dailyCap: 1, blurb: 'A paper most weeks' },
  plus: { key: 'plus', label: 'Plus', priceSgd: 29, papersPerPeriod: 8, dailyCap: 2, blurb: 'Two papers a week' },
  max: { key: 'max', label: 'Max', priceSgd: 69, papersPerPeriod: 20, dailyCap: 3, blurb: 'Exam season — a paper most days' },
};
export const PLAN_ORDER: PlanKey[] = ['lite', 'plus', 'max'];
/** Days one purchase lasts. */
export const PLAN_PERIOD_DAYS = 30;
/** Marked papers every free account gets, once (not per month). */
export const FREE_MARKED_PAPERS = 1;
/** Extra free marked papers for a friend who joins through an invite link (0 = off). */
export const REFERRED_EXTRA_FREE_PAPERS = 1;
/** What marking one full paper costs us, SGD (≈ US$1.40 of model time, 5 Nov 2026). */
export const COST_PER_PAPER_SGD = 1.9;
/** Card fee estimate (Stripe SG domestic card: 3.4% + S$0.50). Only used for the margin table. */
export const CARD_FEE_PCT = 0.034;
export const CARD_FEE_FIXED_SGD = 0.5;
// ────────────────────────────────────────────────────────────────────────────

/** Legacy pass tiers still on old rows: their meter stays what was sold. */
export const LEGACY_PAPERS: Record<'standard' | 'intensive', number> = { standard: 8, intensive: 20 };
export const LEGACY_DAILY_CAP: Record<'standard' | 'intensive', number> = { standard: 1, intensive: 3 };

export function isPlanKey(v: unknown): v is PlanKey {
  return v === 'lite' || v === 'plus' || v === 'max';
}

/** The test site (Vercel 'preview') or a local `next dev` with pulled env ('development').
 *  Anything else — production, or no VERCEL_ENV at all (unit tests) — is NOT the test site. */
export function isTestSite(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.VERCEL_ENV || '').trim();
  return v === 'preview' || v === 'development';
}

/** Plans on: always on the test site; on the main site only with the switch. */
export function plansActive(env: Record<string, string | undefined> = process.env): boolean {
  return PLANS_OPEN_TO_STUDENTS || isTestSite(env);
}

/** Is a pretend checkout (no money taken) allowed here? Only ever on the test site. */
export function testCheckoutAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return isTestSite(env);
}

/** Free marked papers this account may use in total. */
export function freePaperAllowance(bonusPapers: number | null | undefined): number {
  return FREE_MARKED_PAPERS + Math.max(0, Math.floor(bonusPapers ?? 0));
}

/** Free marked papers still unused. Never negative. */
export function freePapersLeft(acct: { free_papers_used?: number | null; bonus_papers?: number | null }): number {
  return Math.max(0, freePaperAllowance(acct.bonus_papers) - Math.max(0, acct.free_papers_used ?? 0));
}

/** Money per plan at FULL use — the margin table for Adrian (and the test that keeps it healthy). */
export function planEconomics(p: Plan): { costSgd: number; feeSgd: number; marginSgd: number; marginPct: number; perPaperSgd: number } {
  const costSgd = round2(p.papersPerPeriod * COST_PER_PAPER_SGD);
  const feeSgd = round2(p.priceSgd * CARD_FEE_PCT + CARD_FEE_FIXED_SGD);
  const marginSgd = round2(p.priceSgd - costSgd - feeSgd);
  return {
    costSgd,
    feeSgd,
    marginSgd,
    marginPct: p.priceSgd > 0 ? Math.round((marginSgd / p.priceSgd) * 100) : 0,
    perPaperSgd: round2(p.priceSgd / p.papersPerPeriod),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "S$15" / "S$15.50". */
export function sgd(n: number): string {
  return Number.isInteger(n) ? `S$${n}` : `S$${n.toFixed(2)}`;
}

/** The student-facing line when a free account has used its free paper(s). */
export function freeUsedMessage(allowance: number): string {
  return allowance === 1
    ? 'You’ve used your free marked paper. Pick a plan to get more papers marked — practice stays free.'
    : `You’ve used your ${allowance} free marked papers. Pick a plan to get more papers marked — practice stays free.`;
}

/** The student-facing line when a plan's papers for this period are used. */
export function planUsedMessage(allowance: number): string {
  return `You’ve used all ${allowance} marked papers in this plan. Upgrade, or your next 30 days bring a fresh set — practice stays free.`;
}
