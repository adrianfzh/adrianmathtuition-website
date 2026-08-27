import { describe, it, expect } from 'vitest';
import {
  isTuitionAccount,
  hasActivePassInRows,
  computeGrantExpiry,
  portalAccessAllowed,
  grantPass,
  decimalAmountToCents,
  passMinAmountSgd,
  paymentQualifiesForPass,
  DEFAULT_PASS_DAYS,
  DEFAULT_PASS_MIN_AMOUNT_SGD,
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

describe('decimalAmountToCents', () => {
  it('parses HitPay-style decimal strings exactly', () => {
    expect(decimalAmountToCents('29.00')).toBe(2900);
    expect(decimalAmountToCents('25')).toBe(2500);
    expect(decimalAmountToCents('24.99')).toBe(2499);
    expect(decimalAmountToCents('0.5')).toBe(50);
  });
  it('rejects anything that is not a plain non-negative decimal', () => {
    expect(decimalAmountToCents('')).toBeNull();
    expect(decimalAmountToCents('abc')).toBeNull();
    expect(decimalAmountToCents('-5')).toBeNull();
    expect(decimalAmountToCents('1e3')).toBeNull();
    expect(decimalAmountToCents('29.001')).toBeNull();
  });
});

describe('passMinAmountSgd', () => {
  it('defaults to 25 when unset or garbage', () => {
    expect(DEFAULT_PASS_MIN_AMOUNT_SGD).toBe(25);
    expect(passMinAmountSgd({})).toBe(25);
    expect(passMinAmountSgd({ PASS_MIN_AMOUNT_SGD: 'cheap' })).toBe(25);
    expect(passMinAmountSgd({ PASS_MIN_AMOUNT_SGD: '-3' })).toBe(25);
  });
  it('honours a configured override, including 0 (floor off)', () => {
    expect(passMinAmountSgd({ PASS_MIN_AMOUNT_SGD: '10' })).toBe(10);
    expect(passMinAmountSgd({ PASS_MIN_AMOUNT_SGD: '0' })).toBe(0);
  });
});

describe('paymentQualifiesForPass (auto-grant floor)', () => {
  it('boundary: exactly S$25.00 grants, S$24.99 does not', () => {
    expect(paymentQualifiesForPass({ amountCents: 2500, currency: 'SGD', minAmountSgd: 25 }).ok).toBe(true);
    const under = paymentQualifiesForPass({ amountCents: 2499, currency: 'SGD', minAmountSgd: 25 });
    expect(under.ok).toBe(false);
    expect(under.reason).toContain('below the S$25.00 auto-grant floor');
    expect(under.reason).toContain('S$24.99');
  });
  it('a S$1 typo payment never buys 30 days', () => {
    expect(paymentQualifiesForPass({ amountCents: 100, currency: 'SGD', minAmountSgd: 25 }).ok).toBe(false);
  });
  it('currency must be SGD — case-insensitive, everything else goes manual', () => {
    expect(paymentQualifiesForPass({ amountCents: 2900, currency: 'sgd', minAmountSgd: 25 }).ok).toBe(true);
    const usd = paymentQualifiesForPass({ amountCents: 999900, currency: 'usd', minAmountSgd: 25 });
    expect(usd.ok).toBe(false);
    expect(usd.reason).toContain('USD is not SGD');
    expect(paymentQualifiesForPass({ amountCents: 2900, currency: '', minAmountSgd: 25 }).ok).toBe(false);
  });
  it('unreadable amount never qualifies', () => {
    expect(paymentQualifiesForPass({ amountCents: null, currency: 'SGD', minAmountSgd: 25 }).ok).toBe(false);
    expect(paymentQualifiesForPass({ amountCents: NaN, currency: 'SGD', minAmountSgd: 25 }).ok).toBe(false);
  });
  it('floor 0 disables the amount gate (currency gate stays)', () => {
    expect(paymentQualifiesForPass({ amountCents: 1, currency: 'SGD', minAmountSgd: 0 }).ok).toBe(true);
    expect(paymentQualifiesForPass({ amountCents: 1, currency: 'USD', minAmountSgd: 0 }).ok).toBe(false);
  });
});

// In-memory portal_passes supporting exactly the query shapes grantPass and
// findPassByReference build — proves webhook-retry idempotency end to end.
type FakePass = { id: string; account_id: string; source: string; reference: string | null; starts_at: string; expires_at: string };
function fakePassesDb(seed: FakePass[] = []) {
  const rows: FakePass[] = [...seed];
  const state = { inserts: 0 };
  const client = {
    from() {
      const filters: Array<(r: FakePass) => boolean> = [];
      const matches = () => rows.filter((r) => filters.every((f) => f(r)));
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val);
          return builder;
        },
        limit: () => builder,
        maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
        then: (resolve: (v: { data: FakePass[]; error: null }) => unknown) =>
          resolve({ data: matches(), error: null }),
        insert: (row: Omit<FakePass, 'id'>) => ({
          select: () => ({
            single: async () => {
              state.inserts += 1;
              const full: FakePass = { id: `pass-${rows.length + 1}`, ...row };
              rows.push(full);
              return { data: { id: full.id, expires_at: full.expires_at }, error: null };
            },
          }),
        }),
      };
      return builder;
    },
  } as unknown as Parameters<typeof grantPass>[1];
  return { client, rows, state };
}

describe('grantPass idempotency (webhook retries must not double-grant)', () => {
  it('same source+reference a second time returns the SAME pass, inserts nothing', async () => {
    const db = fakePassesDb();
    const first = await grantPass(
      { accountId: 'acc-1', days: 30, source: 'stripe', reference: 'cs_live_1', now: NOW },
      db.client,
    );
    const retry = await grantPass(
      { accountId: 'acc-1', days: 30, source: 'stripe', reference: 'cs_live_1', now: new Date(NOW.getTime() + 60_000) },
      db.client,
    );
    expect(first.duplicate).toBeUndefined();
    expect(retry).toEqual({ id: first.id, expiresAt: first.expiresAt, duplicate: true });
    expect(db.state.inserts).toBe(1);
    expect(db.rows).toHaveLength(1);
  });
  it('the same reference under a DIFFERENT source is a different payment — both insert', async () => {
    const db = fakePassesDb();
    await grantPass({ accountId: 'acc-1', days: 30, source: 'hitpay', reference: 'ref-x', now: NOW }, db.client);
    const second = await grantPass({ accountId: 'acc-1', days: 30, source: 'stripe', reference: 'ref-x', now: NOW }, db.client);
    expect(second.duplicate).toBeUndefined();
    expect(db.state.inserts).toBe(2);
  });
  it('a genuine renewal (new reference) inserts and STACKS on the first expiry', async () => {
    const db = fakePassesDb();
    const first = await grantPass(
      { accountId: 'acc-1', days: 30, source: 'stripe', reference: 'cs_1', now: NOW },
      db.client,
    );
    const renewal = await grantPass(
      { accountId: 'acc-1', days: 30, source: 'stripe', reference: 'cs_2', now: NOW },
      db.client,
    );
    expect(db.state.inserts).toBe(2);
    expect(Date.parse(renewal.expiresAt)).toBe(Date.parse(first.expiresAt) + 30 * DAY);
  });
  it('manual grants without a reference always insert (no false dedupe on null)', async () => {
    const db = fakePassesDb();
    await grantPass({ accountId: 'acc-1', days: 30, source: 'manual', now: NOW }, db.client);
    const second = await grantPass({ accountId: 'acc-1', days: 30, source: 'manual', now: NOW }, db.client);
    expect(second.duplicate).toBeUndefined();
    expect(db.state.inserts).toBe(2);
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
