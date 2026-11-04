import { describe, it, expect } from 'vitest';
import { PRICES, ALERT_EXTRA_USD, baseUsd, project, warnings, newWarnings, briefLines, costSummary, cycleFor, type Usage } from './supabase-cost';
import { parsePlatformUsage } from './supabase-cost-store';

const D = 86_400_000;
const start = Date.UTC(2026, 9, 27);   // 27 Oct 2026
const end = Date.UTC(2026, 10, 27);    // 27 Nov 2026
// Adrian's Usage page on 4 Nov 2026 (day 9): 129.95 GB uncached, 5.98 GB cached, 93.3 GB storage.
const today: Usage = {
  cycleStart: start, cycleEnd: end, now: start + 9 * D,
  egressGb: 129.95, cachedEgressGb: 5.98, storageGb: 93.3,
  compute: { maths: 'micro', science: 'micro', trading: 'micro' },
  exact: true, topEgress: 'the science project',
};

describe('supabase cost check', () => {
  it('prices are the published Pro numbers (4 Nov 2026)', () => {
    expect(PRICES.planUsd).toBe(25);
    expect(PRICES.egressQuotaGb).toBe(250);
    expect(PRICES.egressUsdPerGb).toBe(0.09);
    expect(PRICES.storageQuotaGb).toBe(100);
    expect(PRICES.storageUsdPerGbMonth).toBe(0.0213);
    expect(PRICES.computeCreditUsd).toBe(10);
    expect(ALERT_EXTRA_USD).toBe(25);
  });

  it('usual bill = plan + servers − the US$10 credit', () => {
    expect(baseUsd({ a: 'micro' })).toBe(25);   // one micro ≈ US$9.81, inside the credit
    expect(baseUsd({ a: 'micro', b: 'micro', c: 'micro' })).toBeCloseTo(25 + 3 * 0.01344 * 730 - 10, 1);
    expect(baseUsd({ a: 'small' })).toBeCloseTo(25 + 0.0206 * 730 - 10, 1);
    expect(baseUsd({ a: 'mystery' })).toBe(25);
  });

  it("today's numbers: ~433 GB projected → ~US$16 extra, below US$25; egress projected over, storage past 90%", () => {
    const p = project(today);
    expect(p.egressGb!).toBeGreaterThan(440);
    expect(p.extraParts.storage).toBe(0);
    const w = warnings(today, p, 25);
    expect(w.map((x) => x.key)).toEqual(['egress:over', 'storage:90']);
    expect(w[1].line).toBe('⚠️ Supabase file storage has passed 90% of what the plan includes: 93 GB of 100 GB.');
    expect(w[0].line).toMatch(/data sent out: 130 GB of the 250 GB included so far \(52%\), on course for about 4\d\d GB/);
  });

  it('cost line passes the threshold once per step, in plain words', () => {
    const u = { ...today, egressGb: 200 };   // → ~689 GB → ~US$39 extra
    const p = project(u);
    const w = warnings(u, p, 25);
    const cost = w.find((x) => x.key.startsWith('cost:'))!;
    expect(cost.key).toBe('cost:1');
    expect(cost.line).toMatch(/^💸 Supabase: on course for about US\$\d+ this month \(US\$\d+ usual \+ ~US\$\d+ extra data\)\. Mostly the science project\. Nothing to do unless you want me to cut it\.$/);
    expect(w.find((x) => x.key === 'egress:90')).toBeUndefined();
    expect(warnings({ ...u, egressGb: 230 }, project({ ...u, egressGb: 230 }), 25).some((x) => x.key === 'egress:90')).toBe(true);
  });

  it('no repeats in a cycle; a new cycle starts afresh', () => {
    const w = warnings(today, project(today), 25);
    expect(newWarnings(w, ['egress:over', 'storage:90'], start, start)).toEqual([]);
    expect(newWarnings(w, ['egress:over'], start, start).map((x) => x.key)).toEqual(['storage:90']);
    expect(newWarnings(w, ['egress:over', 'storage:90'], start - 31 * D, start)).toHaveLength(2);
    expect(newWarnings(w, null, null, start)).toHaveLength(2);
  });

  it('estimate lines say so, with one caveat line; nothing new → no lines at all', () => {
    const u = { ...today, exact: false, caveat: 'database reads are not counted' };
    const w = warnings(u, project(u), 25);
    expect(w[0].line).toMatch(/\(our own estimate\)/);
    expect(briefLines(w, u).at(-1)).toBe('(database reads are not counted)');
    expect(briefLines([], u)).toEqual([]);
  });

  it('storage over 100 GB costs per GB-month; summary is one line', () => {
    const u = { ...today, egressGb: 10, storageGb: 150 };
    const p = project(u);
    expect(p.extraParts.storage).toBeCloseTo(50 * 0.0213, 1);
    expect(warnings(u, p, 25).map((x) => x.key)).toEqual(['storage:over', 'storage:90']);
    expect(costSummary(today, project(today))).toMatch(/^day 9 of 31 · egress 130 GB → ~4\d\d GB\/250 GB · storage 93 GB\/100 GB · bill ~US\$\d+/);
  });

  it('cycle from the anchor day (27th)', () => {
    expect(cycleFor(Date.UTC(2026, 10, 4))).toEqual({ start, end });
    expect(cycleFor(Date.UTC(2026, 10, 27, 1)).start).toBe(end);
    expect(cycleFor(Date.UTC(2027, 0, 3)).start).toBe(Date.UTC(2026, 11, 27));
  });

  it('parses the dashboard usage answer, bytes or GB, and refuses a strange shape', () => {
    expect(parsePlatformUsage({ usages: [{ metric: 'EGRESS', usage: 129.95 }, { metric: 'CACHED_EGRESS', usage: 5.98 }, { metric: 'STORAGE_SIZE', usage: 93.3 }] }))
      .toEqual({ egressGb: 129.95, cachedEgressGb: 5.98, storageGb: 93.3 });
    expect(parsePlatformUsage([{ metric: 'EGRESS', usage: 129_950_000_000 }])?.egressGb).toBeCloseTo(129.95, 2);
    expect(parsePlatformUsage({ message: 'Unauthorized' })).toBeNull();
    expect(parsePlatformUsage({ usages: [{ metric: 'MAU', usage: 11 }] })).toBeNull();
  });
});
