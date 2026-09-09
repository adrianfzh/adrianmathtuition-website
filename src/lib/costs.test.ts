import { describe, it, expect } from 'vitest';
import { costEntries, costByDay, costByPath, monthTotal, foldCostReport, type CostRunRow } from './costs';

const row = (id: string, at: string, over: Partial<CostRunRow> = {}): CostRunRow => ({
  id, created_at: at, student_name: 'Alessi', paper_name: 'am tys 2021 p1', num_photos: 20, cost_usd: 1.5, input_tokens: 100, output_tokens: 10, model: 'claude-opus-5', total_max: 90,
  result_json: { queue: { queued_at: at } }, ...over,
});

describe('costs — per run, per day, per path (9 Sep 2026)', () => {
  it('classifies the bill and prices the API pages, with Mac pages at zero', () => {
    const e = costEntries([
      row('q', '2026-09-09T02:00:00Z'),
      row('m', '2026-09-09T03:00:00Z', { cost_usd: 0.2, result_json: { queue: { queued_at: 'x', external_claim: { delivered_at: 'y' } }, usage: { external: true, externalReads: 20 } } }),
      row('t', '2026-09-09T04:00:00Z', { cost_usd: 4.94, result_json: { queue: { queued_at: 'x', external_claim: { delivered_at: 'y' } }, usage: { external: true, externalReads: 5, batched: false } } }),
    ]);
    expect(e.map(x => x.id)).toEqual(['t', 'm', 'q']);   // newest first
    expect(e[2].path).toBe('api-queue'); expect(e[2].centsPerPage).toBe(8); expect(e[2].macPages).toBe(0);
    expect(e[1].path).toBe('plan'); expect(e[1].macPages).toBe(20); expect(e[1].centsPerPage).toBeNull();
    expect(e[0].macPages).toBe(5); expect(e[0].centsPerPage).toBe(33);   // 4.94 over the 15 API pages
    expect(e[0].day).toBe('2026-09-09');
  });
  it('day totals and path totals add up; the month total takes the SGT day', () => {
    const e = costEntries([row('a', '2026-09-08T17:00:00Z'), row('b', '2026-09-09T01:00:00Z', { cost_usd: 0.5, num_photos: 10 })]);
    const days = costByDay(e);
    expect(days.map(d => [d.day, d.runs, d.cost])).toEqual([['2026-09-09', 2, 2]]);   // 17:00Z on the 8th is the 9th in Singapore
    expect(costByPath(e)['api-queue']).toEqual({ runs: 2, pages: 30, cost: 2 });
    expect(monthTotal(e, '2026-09')).toEqual({ runs: 2, pages: 30, cost: 2 });
    expect(monthTotal(e, '2026-08').runs).toBe(0);
  });
  it('unmarked rows are left out; Gemini tokens are carried when stored', () => {
    const e = costEntries([row('x', '2026-09-09T02:00:00Z', { total_max: null, cost_usd: null }), row('g', '2026-09-09T02:00:00Z', { result_json: { queue: { queued_at: 'x' }, vision_usage: { inputTokens: 1000, outputTokens: 50, pages: 20 } } })]);
    expect(e).toHaveLength(1);
    expect(e[0].gemini).toEqual({ inputTokens: 1000, outputTokens: 50, pages: 20 });
    expect(costByDay(e)[0].geminiTokens).toBe(1050);
  });
  it('folds the Admin API cost report to one line per day', () => {
    const days = foldCostReport({ data: [
      { starting_at: '2026-09-08T00:00:00Z', results: [{ amount: '1.25', currency: 'USD' }, { amount: '0.75', currency: 'USD' }] },
      { starting_at: '2026-09-09T00:00:00Z', results: [{ amount: '3', currency: 'USD' }] },
    ] });
    expect(days).toEqual([{ day: '2026-09-09', amount: 3, currency: 'USD', lines: 1 }, { day: '2026-09-08', amount: 2, currency: 'USD', lines: 2 }]);
    expect(foldCostReport(null)).toEqual([]);
  });
});
