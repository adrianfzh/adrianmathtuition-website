import { describe, expect, it } from 'vitest';
import {
  PLANS,
  PLAN_ORDER,
  COST_PER_PAPER_SGD,
  FREE_MARKED_PAPERS,
  freePaperAllowance,
  freePapersLeft,
  isPlanKey,
  isTestSite,
  planEconomics,
  plansActive,
  testCheckoutAllowed,
  sgd,
} from './plans';
import { PLANS_OPEN_TO_STUDENTS } from './portal-beta';
import { dailyHandinCapForTier, handinAllowance, handinsRemaining } from './portal-passes';
import { bonusPapersInRows, planBlockFor, planStatusFromRows, type PassRowWithSource } from './plan-usage';

const NOW = new Date('2026-11-05T04:00:00Z');
const future = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();
const past = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe('plans config', () => {
  it('every plan keeps a healthy margin over marking cost + card fee, even at full use', () => {
    for (const k of PLAN_ORDER) {
      const e = planEconomics(PLANS[k]);
      expect(e.marginPct).toBeGreaterThanOrEqual(35);
      expect(e.perPaperSgd).toBeGreaterThan(COST_PER_PAPER_SGD * 1.5);
    }
  });
  it('bigger plans give more papers and cost less per paper', () => {
    const [a, b, c] = PLAN_ORDER.map(k => PLANS[k]);
    expect(a.papersPerPeriod).toBeLessThan(b.papersPerPeriod);
    expect(b.papersPerPeriod).toBeLessThan(c.papersPerPeriod);
    expect(planEconomics(a).perPaperSgd).toBeGreaterThan(planEconomics(c).perPaperSgd);
  });
  it('plan keys never collide with the old pass tiers', () => {
    expect(isPlanKey('standard')).toBe(false);
    expect(isPlanKey('intensive')).toBe(false);
    expect(isPlanKey('bonus')).toBe(false);
    for (const k of PLAN_ORDER) expect(isPlanKey(k)).toBe(true);
  });
  it('sgd formats whole and part dollars', () => {
    expect(sgd(15)).toBe('S$15');
    expect(sgd(15.5)).toBe('S$15.50');
  });
});

describe('the prototype switch', () => {
  it('is on for the test site and local, off on the main site while the switch is off', () => {
    expect(PLANS_OPEN_TO_STUDENTS).toBe(false);
    expect(plansActive({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(plansActive({ VERCEL_ENV: 'development' })).toBe(true);
    expect(plansActive({ VERCEL_ENV: 'production' })).toBe(false);
    expect(plansActive({})).toBe(false);
  });
  it('a pretend (no money) checkout is never allowed on the main site', () => {
    expect(testCheckoutAllowed({ VERCEL_ENV: 'production' })).toBe(false);
    expect(testCheckoutAllowed({})).toBe(false);
    expect(testCheckoutAllowed({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(isTestSite({ VERCEL_ENV: ' preview ' })).toBe(true);
  });
});

describe('free papers', () => {
  it('everyone gets FREE_MARKED_PAPERS; bonus adds; never negative', () => {
    expect(freePaperAllowance(0)).toBe(FREE_MARKED_PAPERS);
    expect(freePaperAllowance(2)).toBe(FREE_MARKED_PAPERS + 2);
    expect(freePaperAllowance(-5)).toBe(FREE_MARKED_PAPERS);
    expect(freePapersLeft({ free_papers_used: 0, bonus_papers: 0 })).toBe(FREE_MARKED_PAPERS);
    expect(freePapersLeft({ free_papers_used: 9, bonus_papers: 0 })).toBe(0);
  });
  it('bonus rows sum, a negative row takes back, the total never drops below 0', () => {
    expect(bonusPapersInRows([{ source: 'bonus', handins_used: 1 }, { source: 'bonus', handins_used: 2 }, { source: 'stripe', handins_used: 5 }])).toBe(3);
    expect(bonusPapersInRows([{ source: 'bonus', handins_used: 1 }, { source: 'bonus', handins_used: -4 }])).toBe(0);
  });
});

describe('the pass meter reads plan keys', () => {
  it('a plan row meters its plan papers and daily cap', () => {
    expect(handinAllowance({ tier: 'lite' })).toBe(PLANS.lite.papersPerPeriod);
    expect(handinAllowance({ tier: 'max' })).toBe(PLANS.max.papersPerPeriod);
    expect(dailyHandinCapForTier('plus')).toBe(PLANS.plus.dailyCap);
    expect(handinsRemaining({ tier: 'lite', handins_used: PLANS.lite.papersPerPeriod })).toBe(0);
  });
  it('old pass rows keep what was sold', () => {
    expect(handinAllowance({ tier: 'standard' })).toBe(8);
    expect(handinAllowance({ tier: null })).toBe(8);
    expect(handinAllowance({ tier: 'intensive' })).toBe(20);
    expect(dailyHandinCapForTier('standard')).toBe(1);
  });
});

describe('planStatusFromRows', () => {
  const row = (o: Partial<PassRowWithSource>): PassRowWithSource => ({ id: 'r', source: 'stripe', expires_at: future(10), tier: 'standard', handins_used: 0, ...o });

  it('no rows = free, one paper', () => {
    const st = planStatusFromRows([], 0, NOW);
    expect(st).toMatchObject({ kind: 'free', allowance: FREE_MARKED_PAPERS, used: 0, left: FREE_MARKED_PAPERS });
  });
  it('free paper used = nothing left', () => {
    expect(planStatusFromRows([], 1, NOW)).toMatchObject({ kind: 'free', left: 0 });
  });
  it('an invite bonus row adds a paper and is never mistaken for a plan', () => {
    const bonus = row({ source: 'bonus', tier: 'bonus', handins_used: 1, expires_at: NOW.toISOString() });
    const st = planStatusFromRows([bonus], 1, NOW);
    expect(st).toMatchObject({ kind: 'free', allowance: FREE_MARKED_PAPERS + 1, left: 1, bonus: 1 });
  });
  it('a running plan row is the plan, with its papers', () => {
    const st = planStatusFromRows([row({ tier: 'plus', handins_used: 3 })], 1, NOW);
    expect(st).toMatchObject({ kind: 'plan', plan: 'plus', label: 'Plus', allowance: PLANS.plus.papersPerPeriod, used: 3, left: PLANS.plus.papersPerPeriod - 3 });
  });
  it('an ended plan falls back to free', () => {
    expect(planStatusFromRows([row({ tier: 'max', expires_at: past(1) })], 0, NOW).kind).toBe('free');
  });
  it('an old S$29 pass still counts as a plan (no change for pass holders)', () => {
    expect(planStatusFromRows([row({ tier: 'standard', handins_used: 2 })], 0, NOW)).toMatchObject({ kind: 'plan', plan: null, label: 'Pass', allowance: 8, left: 6 });
  });
});

describe('planBlockFor (the hand-in page card)', () => {
  it('shows nothing while papers are left, or for tuition', () => {
    expect(planBlockFor({ kind: 'tuition' })).toBeNull();
    expect(planBlockFor(planStatusFromRows([], 0, NOW))).toBeNull();
    expect(planBlockFor(null)).toBeNull();
  });
  it('names the free paper when it is used', () => {
    expect(planBlockFor(planStatusFromRows([], 1, NOW))?.title).toBe('Your free marked paper is used');
  });
  it('names the plan when its papers are used', () => {
    const st = planStatusFromRows([{ id: 'r', source: 'manual', expires_at: future(5), tier: 'lite', handins_used: 3 }], 0, NOW);
    expect(planBlockFor(st)?.title).toBe(`All ${PLANS.lite.papersPerPeriod} marked papers in your Lite plan are used`);
  });
});
