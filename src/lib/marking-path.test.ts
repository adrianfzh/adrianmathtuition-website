import { describe, it, expect } from 'vitest';
import { markingPath, isHandin, markingShare, planShareLow, type MarkingRunRow } from './marking-path';

const NOW = Date.parse('2026-09-02T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

function row(over: Partial<MarkingRunRow> & { rj?: MarkingRunRow['result_json'] }): MarkingRunRow {
  const { rj, ...rest } = over;
  // An explicit `rj: null` means "no result_json at all" — only an OMITTED rj gets the queued default.
  const result_json = 'rj' in over ? (rj as MarkingRunRow['result_json']) : { queue: { queued_at: daysAgo(1) } };
  return { created_at: daysAgo(1), total_max: 80, cost_usd: 2, num_photos: 16, result_json, ...rest };
}

describe('markingPath', () => {
  it('calls a delivered Mac claim plan-billed', () => {
    expect(markingPath(row({ rj: { queue: { queued_at: daysAgo(1), external_claim: { by: 'mac-plan-x', delivered_at: daysAgo(1) } } } }))).toBe('plan');
  });

  it('a claim the Mac RELEASED (never delivered) is not plan — the API marked it', () => {
    expect(markingPath(row({ rj: { queue: { queued_at: daysAgo(1), external_claim: { by: 'mac-plan-x', at: daysAgo(1), released_at: daysAgo(1) } } } }))).toBe('api-queue');
  });

  it('⚡ mark_now outranks the queue label', () => {
    expect(markingPath(row({ rj: { queue: { queued_at: daysAgo(1), mark_now: true } } }))).toBe('api-now');
  });

  it('no queue key at all = the synchronous ▶ Mark button', () => {
    expect(markingPath(row({ rj: { source: {} } as MarkingRunRow['result_json'] }))).toBe('api-sync');
    expect(markingPath(row({ rj: null }))).toBe('api-sync');
  });
});

describe('isHandin', () => {
  it('portal and Telegram hand-ins are hand-ins; Adrian uploads are not', () => {
    expect(isHandin(row({ rj: { queue: { queued_at: daysAgo(1) }, portal_submission: { id: 'x' } } }))).toBe(true);
    expect(isHandin(row({ rj: { queue: { queued_at: daysAgo(1) }, telegram_handin: { chat: 1 } } }))).toBe(true);
    expect(isHandin(row({}))).toBe(false);
  });
});

describe('markingShare', () => {
  const rows: MarkingRunRow[] = [
    row({ cost_usd: 0.34, rj: { queue: { queued_at: daysAgo(1), external_claim: { by: 'mac', delivered_at: daysAgo(1) } } } }),      // plan, 1d
    row({ cost_usd: 0.22, rj: { queue: { queued_at: daysAgo(2), external_claim: { by: 'mac', delivered_at: daysAgo(2) } } } }),      // plan, 2d
    row({ cost_usd: 2.33 }),                                                                                                       // api-queue, 1d
    row({ cost_usd: '1.99', created_at: daysAgo(3), rj: null }),                                                                   // api-sync, 3d (numeric comes back as string)
    row({ cost_usd: 7.75, rj: { queue: { queued_at: daysAgo(1) }, telegram_handin: { chat: 1 } } }),                               // hand-in, 1d
    row({ cost_usd: 4.0, created_at: daysAgo(20) }),                                                                               // api-queue, 20d — outside 7d
    row({ cost_usd: 9.0, total_max: null }),                                                                                       // unmarked — ignored
    row({ cost_usd: 9.0, created_at: daysAgo(-1) }),                                                                               // in the future — ignored
  ];

  it('splits own papers by bill, keeps hand-ins apart, honours the window', () => {
    const s7 = markingShare(rows, NOW, 7);
    expect(s7.own.plan).toEqual({ runs: 2, costUsd: 0.56, photos: 32 });
    expect(s7.own.api).toEqual({ runs: 2, costUsd: 4.32, photos: 32 });
    expect(s7.own.byPath).toEqual({ plan: 2, 'api-queue': 1, 'api-now': 0, 'api-sync': 1 });
    expect(s7.handins).toEqual({ runs: 1, costUsd: 7.75, photos: 16 });
    expect(s7.planShare).toBe(0.5);

    const s30 = markingShare(rows, NOW, 30);
    expect(s30.own.api.runs).toBe(3);
    expect(s30.own.api.costUsd).toBe(8.32);
    expect(s30.planShare).toBeCloseTo(0.4);
  });

  it('reports null share when Adrian queued nothing', () => {
    const s = markingShare([rows[4]], NOW, 7);
    expect(s.planShare).toBeNull();
    expect(s.handins.runs).toBe(1);
  });
});

describe('planShareLow', () => {
  it('flags a losing week only once there are enough papers to mean something', () => {
    const lowButQuiet = markingShare([row({}), row({})], NOW, 7);           // 2 API, 0 plan
    expect(planShareLow(lowButQuiet)).toBe(false);
    const lowAndBusy = markingShare([row({}), row({}), row({})], NOW, 7);   // 3 API, 0 plan
    expect(planShareLow(lowAndBusy)).toBe(true);
    const healthy = markingShare([
      row({ rj: { queue: { queued_at: daysAgo(1), external_claim: { delivered_at: daysAgo(1) } } } }),
      row({ rj: { queue: { queued_at: daysAgo(1), external_claim: { delivered_at: daysAgo(1) } } } }),
      row({}),
    ], NOW, 7);
    expect(planShareLow(healthy)).toBe(false);
  });
});
