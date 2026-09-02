import { describe, expect, it } from 'vitest';
import {
  accountAudience,
  audienceBadge,
  isSubgroupVisibility,
  normaliseVisibility,
  questionServableTo,
  subgroupInTree,
  subgroupVisibleTo,
  visibleSubgroups,
} from './subgroup-visibility';

// Adrian's real rows (2026-09-02), as data — the ids are only labels here.
const MODULUS = { id: 809, level: 'AM', visibility: 'ip', ip_extra_level: null };                 // AM Modulus Functions
const INTEGRATING_FACTOR = { id: 863, level: 'JC', visibility: 'hidden', ip_extra_level: null };  // not in 9758
const SPECIAL_FACTORISATION = { id: 461, level: 'S2', visibility: 'all', ip_extra_level: 'S1' }; // S2, lent to IP Sec 1
const ORDINARY_AM = { id: 1, level: 'AM', visibility: 'all', ip_extra_level: null };
const LEGACY_DEFAULT = { id: 2, level: 'AM' }; // column absent (older selects) → 'all'

describe('subgroupVisibleTo — full truth table', () => {
  const cases: Array<{
    visibility: string | null;
    isIp: boolean;
    levelMatch: 'home' | 'lent' | 'none';
    expected: boolean;
  }> = [
    // visibility 'all'
    { visibility: 'all', isIp: false, levelMatch: 'home', expected: true },
    { visibility: 'all', isIp: true, levelMatch: 'home', expected: true },
    { visibility: 'all', isIp: false, levelMatch: 'lent', expected: false },
    { visibility: 'all', isIp: true, levelMatch: 'lent', expected: true },
    { visibility: 'all', isIp: false, levelMatch: 'none', expected: false },
    { visibility: 'all', isIp: true, levelMatch: 'none', expected: false },
    // visibility 'ip'
    { visibility: 'ip', isIp: false, levelMatch: 'home', expected: false },
    { visibility: 'ip', isIp: true, levelMatch: 'home', expected: true },
    { visibility: 'ip', isIp: false, levelMatch: 'lent', expected: false },
    { visibility: 'ip', isIp: true, levelMatch: 'lent', expected: true },
    { visibility: 'ip', isIp: false, levelMatch: 'none', expected: false },
    { visibility: 'ip', isIp: true, levelMatch: 'none', expected: false },
    // visibility 'hidden' — nobody
    { visibility: 'hidden', isIp: false, levelMatch: 'home', expected: false },
    { visibility: 'hidden', isIp: true, levelMatch: 'home', expected: false },
    { visibility: 'hidden', isIp: false, levelMatch: 'lent', expected: false },
    { visibility: 'hidden', isIp: true, levelMatch: 'lent', expected: false },
    // NULL visibility = column default 'all'
    { visibility: null, isIp: false, levelMatch: 'home', expected: true },
    { visibility: null, isIp: true, levelMatch: 'lent', expected: true },
    // unknown value fails closed
    { visibility: 'public', isIp: true, levelMatch: 'home', expected: false },
  ];

  for (const c of cases) {
    it(`visibility=${c.visibility} isIp=${c.isIp} level=${c.levelMatch} → ${c.expected}`, () => {
      const sg = { level: 'S2', visibility: c.visibility, ip_extra_level: 'S1' };
      const viewerLevel = c.levelMatch === 'home' ? 'S2' : c.levelMatch === 'lent' ? 'S1' : 'AM';
      expect(subgroupVisibleTo(sg, { level: viewerLevel, isIp: c.isIp })).toBe(c.expected);
    });
  }

  it('admin sees every row in the tree, including hidden and lent, but nothing outside it', () => {
    expect(subgroupVisibleTo(INTEGRATING_FACTOR, { level: 'JC', isIp: false, admin: true })).toBe(true);
    expect(subgroupVisibleTo(MODULUS, { level: 'AM', isIp: false, admin: true })).toBe(true);
    expect(subgroupVisibleTo(SPECIAL_FACTORISATION, { level: 'S1', isIp: false, admin: true })).toBe(true);
    expect(subgroupVisibleTo(SPECIAL_FACTORISATION, { level: 'EM', isIp: false, admin: true })).toBe(false);
  });

  it('a row with no ip_extra_level is never lent anywhere', () => {
    expect(subgroupVisibleTo(ORDINARY_AM, { level: 'EM', isIp: true })).toBe(false);
    expect(subgroupVisibleTo(LEGACY_DEFAULT, { level: 'AM', isIp: false })).toBe(true);
  });

  it('level comparison is case/space-insensitive; an empty viewer level sees nothing', () => {
    expect(subgroupVisibleTo({ level: 'am', visibility: 'all' }, { level: 'AM ', isIp: false })).toBe(true);
    expect(subgroupVisibleTo(ORDINARY_AM, { level: '', isIp: true, admin: true })).toBe(false);
  });
});

describe("Adrian's decisions, end to end", () => {
  it('Modulus (809–814, ip): a non-IP AM student never sees it, an IP AM student does', () => {
    expect(subgroupVisibleTo(MODULUS, { level: 'AM', isIp: false })).toBe(false);
    expect(subgroupVisibleTo(MODULUS, { level: 'AM', isIp: true })).toBe(true);
  });

  it('integrating factor (863, hidden): no JC student, IP or not — admin only', () => {
    expect(subgroupVisibleTo(INTEGRATING_FACTOR, { level: 'JC', isIp: false })).toBe(false);
    expect(subgroupVisibleTo(INTEGRATING_FACTOR, { level: 'JC', isIp: true })).toBe(false);
    expect(subgroupVisibleTo(INTEGRATING_FACTOR, { level: 'JC', isIp: false, admin: true })).toBe(true);
  });

  it('special factorisation (461: S2, all, lent to S1): every S2 student, plus IP Sec 1 only', () => {
    expect(subgroupVisibleTo(SPECIAL_FACTORISATION, { level: 'S2', isIp: false })).toBe(true);
    expect(subgroupVisibleTo(SPECIAL_FACTORISATION, { level: 'S2', isIp: true })).toBe(true);
    expect(subgroupVisibleTo(SPECIAL_FACTORISATION, { level: 'S1', isIp: true })).toBe(true);
    expect(subgroupVisibleTo(SPECIAL_FACTORISATION, { level: 'S1', isIp: false })).toBe(false);
  });
});

describe('subgroupInTree / visibleSubgroups', () => {
  it('membership is filed-at OR lent-to', () => {
    expect(subgroupInTree(SPECIAL_FACTORISATION, 'S2')).toBe(true);
    expect(subgroupInTree(SPECIAL_FACTORISATION, 'S1')).toBe(true);
    expect(subgroupInTree(SPECIAL_FACTORISATION, 'AM')).toBe(false);
    expect(subgroupInTree(MODULUS, '')).toBe(false);
  });

  it('visibleSubgroups keeps order and drops the rest', () => {
    const rows = [ORDINARY_AM, MODULUS, { id: 3, level: 'AM', visibility: 'hidden' }];
    expect(visibleSubgroups(rows, { level: 'AM', isIp: false }).map(r => r.id)).toEqual([1]);
    expect(visibleSubgroups(rows, { level: 'AM', isIp: true }).map(r => r.id)).toEqual([1, 809]);
    expect(visibleSubgroups(rows, { level: 'AM', isIp: false, admin: true }).map(r => r.id)).toEqual([1, 809, 3]);
  });
});

describe('questionServableTo — the ?qid= / mock-slot gate', () => {
  const AM_LEVELS = ['AM', 'EM']; // a Sec 4 account: bankScope of EM + AM

  it('unfiled (or filed only outside the viewer\'s trees) → servable, as before', () => {
    expect(questionServableTo([], { levels: AM_LEVELS, isIp: false })).toBe(true);
    expect(questionServableTo([INTEGRATING_FACTOR], { levels: AM_LEVELS, isIp: false })).toBe(true);
  });

  it('filed only under Modulus: blocked for a non-IP AM student, open for an IP one', () => {
    expect(questionServableTo([MODULUS], { levels: AM_LEVELS, isIp: false })).toBe(false);
    expect(questionServableTo([MODULUS], { levels: AM_LEVELS, isIp: true })).toBe(true);
  });

  it('filed under Modulus AND an ordinary AM sub-group: the visible filing wins', () => {
    expect(questionServableTo([MODULUS, ORDINARY_AM], { levels: AM_LEVELS, isIp: false })).toBe(true);
  });

  it('hidden-only filing blocks every student in that tree; admin passes', () => {
    expect(questionServableTo([INTEGRATING_FACTOR], { levels: ['JC'], isIp: true })).toBe(false);
    expect(questionServableTo([INTEGRATING_FACTOR], { levels: ['JC'], isIp: false, admin: true })).toBe(true);
  });

  it('a lent filing counts for the lent level: IP Sec 1 yes, ordinary Sec 1 no, any Sec 2 yes', () => {
    expect(questionServableTo([SPECIAL_FACTORISATION], { levels: ['S1'], isIp: true })).toBe(true);
    expect(questionServableTo([SPECIAL_FACTORISATION], { levels: ['S1'], isIp: false })).toBe(false);
    expect(questionServableTo([SPECIAL_FACTORISATION], { levels: ['S2'], isIp: false })).toBe(true);
  });
});

describe('helpers', () => {
  it('normaliseVisibility fails closed on anything unknown', () => {
    expect(normaliseVisibility(null)).toBe('all');
    expect(normaliseVisibility('')).toBe('all');
    expect(normaliseVisibility('ip')).toBe('ip');
    expect(normaliseVisibility('hidden')).toBe('hidden');
    expect(normaliseVisibility('HIDDEN')).toBe('hidden');
    expect(normaliseVisibility('everyone')).toBe('hidden');
    expect(isSubgroupVisibility('ip')).toBe(true);
    expect(isSubgroupVisibility('everyone')).toBe(false);
  });

  it('audienceBadge names the verdict and the loan, from either side', () => {
    expect(audienceBadge(ORDINARY_AM)).toBeNull();
    expect(audienceBadge(MODULUS)).toBe('IP only');
    expect(audienceBadge(INTEGRATING_FACTOR)).toBe('hidden');
    expect(audienceBadge(SPECIAL_FACTORISATION, 'S2')).toBe('also IP S1');
    expect(audienceBadge(SPECIAL_FACTORISATION, 'S1')).toBe('IP only here · filed at S2');
    expect(audienceBadge({ level: 'S2', visibility: 'ip', ip_extra_level: 'S1' }, 'S2')).toBe('IP only · also IP S1');
  });

  it('accountAudience reads is_ip and lets admin see everything', () => {
    expect(accountAudience(null)).toEqual({ isIp: false, admin: false });
    expect(accountAudience({ is_ip: true })).toEqual({ isIp: true, admin: false });
    expect(accountAudience({ is_ip: null })).toEqual({ isIp: false, admin: false });
    expect(accountAudience(null, true)).toEqual({ isIp: true, admin: true });
  });
});
