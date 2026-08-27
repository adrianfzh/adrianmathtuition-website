import { describe, it, expect } from 'vitest';
import {
  isTuitionAccount,
  hasActivePassInRows,
  computeGrantExpiry,
  portalAccessAllowed,
  DEFAULT_PASS_DAYS,
  type PassRow,
} from './portal-passes';

const NOW = new Date('2026-08-28T04:00:00.000Z'); // 12:00 SGT
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();

describe('isTuitionAccount', () => {
  it('linked Airtable student → tuition (always free)', () => {
    expect(isTuitionAccount({ id: 'u1', airtable_student_id: 'recABC123' })).toBe(true);
  });
  it('future stranger accounts (no airtable_student_id) fall through to the pass check', () => {
    expect(isTuitionAccount({ id: 'u1', airtable_student_id: null })).toBe(false);
    expect(isTuitionAccount({ id: 'u1', airtable_student_id: '' })).toBe(false);
    expect(isTuitionAccount({ id: 'u1' })).toBe(false);
  });
  it('whitespace-only id is not a link', () => {
    expect(isTuitionAccount({ id: 'u1', airtable_student_id: '   ' })).toBe(false);
  });
  it('no account at all → not tuition', () => {
    expect(isTuitionAccount(null)).toBe(false);
    expect(isTuitionAccount(undefined)).toBe(false);
  });
});

describe('hasActivePassInRows', () => {
  it('no rows → no access', () => {
    expect(hasActivePassInRows([], NOW)).toBe(false);
  });
  it('a pass expiring in the future → active', () => {
    expect(hasActivePassInRows([{ expires_at: iso(NOW.getTime() + DAY) }], NOW)).toBe(true);
  });
  it('an expired pass → inactive', () => {
    expect(hasActivePassInRows([{ expires_at: iso(NOW.getTime() - DAY) }], NOW)).toBe(false);
  });
  it('boundary: a pass expiring EXACTLY now is already expired (strict >)', () => {
    expect(hasActivePassInRows([{ expires_at: NOW.toISOString() }], NOW)).toBe(false);
  });
  it('boundary: one millisecond in the future is still active', () => {
    expect(hasActivePassInRows([{ expires_at: iso(NOW.getTime() + 1) }], NOW)).toBe(true);
  });
  it('one expired + one live row → active (any live row wins)', () => {
    const rows: PassRow[] = [
      { expires_at: iso(NOW.getTime() - 10 * DAY) },
      { expires_at: iso(NOW.getTime() + 5 * DAY) },
    ];
    expect(hasActivePassInRows(rows, NOW)).toBe(true);
  });
  it('garbage expires_at is ignored, not treated as active', () => {
    expect(hasActivePassInRows([{ expires_at: 'not-a-date' }], NOW)).toBe(false);
  });
});

describe('computeGrantExpiry (stacking)', () => {
  it('first pass: now + days', () => {
    expect(computeGrantExpiry([], 30, NOW).toISOString()).toBe(iso(NOW.getTime() + 30 * DAY));
  });
  it('all passes lapsed: based on now, not the stale expiry (a lapsed pass never eats new days)', () => {
    const rows = [{ expires_at: iso(NOW.getTime() - 40 * DAY) }];
    expect(computeGrantExpiry(rows, 30, NOW).toISOString()).toBe(iso(NOW.getTime() + 30 * DAY));
  });
  it('renewal mid-pass EXTENDS from the current expiry — stacking never wastes paid days', () => {
    const currentExpiry = NOW.getTime() + 12 * DAY;
    const rows = [{ expires_at: iso(currentExpiry) }];
    expect(computeGrantExpiry(rows, 30, NOW).toISOString()).toBe(iso(currentExpiry + 30 * DAY));
  });
  it('stacks on the LATEST of several rows', () => {
    const rows: PassRow[] = [
      { expires_at: iso(NOW.getTime() + 3 * DAY) },
      { expires_at: iso(NOW.getTime() + 20 * DAY) }, // latest
      { expires_at: iso(NOW.getTime() - 90 * DAY) },
    ];
    expect(computeGrantExpiry(rows, 30, NOW).toISOString()).toBe(iso(NOW.getTime() + 50 * DAY));
  });
  it('boundary: an expiry exactly at now behaves like a lapsed pass (base = now)', () => {
    const rows = [{ expires_at: NOW.toISOString() }];
    expect(computeGrantExpiry(rows, 30, NOW).toISOString()).toBe(iso(NOW.getTime() + 30 * DAY));
  });
  it('two back-to-back 30-day purchases = 60 days from now', () => {
    const first = computeGrantExpiry([], DEFAULT_PASS_DAYS, NOW);
    const second = computeGrantExpiry([{ expires_at: first.toISOString() }], DEFAULT_PASS_DAYS, NOW);
    expect(second.toISOString()).toBe(iso(NOW.getTime() + 60 * DAY));
  });
  it('ignores unparseable expiry rows', () => {
    const rows = [{ expires_at: 'garbage' }, { expires_at: iso(NOW.getTime() + 2 * DAY) }];
    expect(computeGrantExpiry(rows, 1, NOW).toISOString()).toBe(iso(NOW.getTime() + 3 * DAY));
  });
  it('refuses non-positive or non-finite day counts (money guard)', () => {
    expect(() => computeGrantExpiry([], 0, NOW)).toThrow();
    expect(() => computeGrantExpiry([], -5, NOW)).toThrow();
    expect(() => computeGrantExpiry([], NaN, NOW)).toThrow();
    expect(() => computeGrantExpiry([], Infinity, NOW)).toThrow();
  });
});

describe('portalAccessAllowed', () => {
  // A client whose .from() must never be reached — proves the tuition
  // short-circuit does not touch the database.
  const explodingClient = {
    from() {
      throw new Error('portal_passes should not be queried for a tuition account');
    },
  } as unknown as Parameters<typeof portalAccessAllowed>[2];

  // Minimal stub of the head-count query hasActivePass() builds.
  function countingClient(count: number) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      gt: () => builder,
      then: (resolve: (r: { count: number; error: null }) => unknown) =>
        resolve({ count, error: null }),
    };
    return { from: () => builder } as unknown as Parameters<typeof portalAccessAllowed>[2];
  }

  it('tuition account → allowed without any pass lookup', async () => {
    await expect(
      portalAccessAllowed({ id: 'u1', airtable_student_id: 'recABC' }, NOW, explodingClient)
    ).resolves.toBe(true);
  });
  it('stranger with an active pass → allowed', async () => {
    await expect(
      portalAccessAllowed({ id: 'u2', airtable_student_id: null }, NOW, countingClient(1))
    ).resolves.toBe(true);
  });
  it('stranger with no pass → refused', async () => {
    await expect(
      portalAccessAllowed({ id: 'u2', airtable_student_id: null }, NOW, countingClient(0))
    ).resolves.toBe(false);
  });
  it('anonymous (no account) → refused, no lookup', async () => {
    await expect(portalAccessAllowed(null, NOW, explodingClient)).resolves.toBe(false);
    await expect(portalAccessAllowed(undefined, NOW, explodingClient)).resolves.toBe(false);
  });
});
