import { describe, it, expect } from 'vitest';
import { costPartOf, sumParts, laneOf, buildWeeklyCost, weeklyCostMessage, levers, helperRollUp, levelGuess, type WeeklyCostInput, type WeekRun } from './weekly-cost';

const run = (over: Partial<WeekRun> & { lane?: 'plan' | 'api' | 'batch'; cost?: number; cw?: number; pages?: number } = {}): WeekRun => ({
  id: Math.random().toString(36).slice(2), created_at: '2026-09-29T02:00:00Z', paper_name: over.paper_name ?? 'E MATH • GCE 2024 • Paper 1',
  result_json: {
    usage: { costUsd: over.cost ?? 0.5, claudeCostUsd: 0.05, external: over.lane === 'plan' || over.lane == null, batched: over.lane === 'batch', buckets: { cacheWrite: over.cw ?? 0 } },
    vision_usage: { pages: over.pages ?? 18, costUsd: 0.45 },
    ...(over.result_json || {}),
  },
});
const base = (over: Partial<WeeklyCostInput> = {}): WeeklyCostInput => ({
  weekStart: '2026-09-28', weekEnd: '2026-10-04', monthStart: '2026-10-01', today: '2026-10-05',
  runs: [run(), run(), run({ lane: 'api', cost: 2.0 })],
  ledgerWeek: [
    { date: '2026-09-29', feature: 'marking_vision', model: 'gemini-3.1-pro-preview', cost: 1.2, calls: 90 },
    { date: '2026-09-29', feature: 'marking_read', model: 'claude-opus-5-5', cost: 0.6, calls: 10 },
    { date: '2026-09-30', feature: 'marking_second_look', model: 'claude-sonnet-5', cost: 0.15, calls: 4 },
    { date: '2026-09-30', feature: 'marking_shadow_read', model: 'claude-sonnet-5-5', cost: 8, calls: 40 },
    { date: '2026-09-30', feature: 'web_answer_text', model: 'claude-sonnet-5', cost: 3, calls: 40 },
  ],
  ledgerMonth: [
    { date: '2026-10-01', feature: 'marking_vision', model: 'gemini-3.1-pro-preview', cost: 10, calls: 300 },
    { date: '2026-10-02', feature: 'marking_read', model: 'claude-opus-5-5', cost: 2, calls: 10 },
    { date: '2026-10-02', feature: 'marking_vision_shadow', model: 'gemini-3.7-flash', cost: 1, calls: 10 },
  ],
  tests: [],
  ...over,
});

describe('which part a ledger line is', () => {
  it('pen, read, extra, test — and nothing outside marking', () => {
    expect(costPartOf('marking_vision')).toBe('pen');
    expect(costPartOf('marking_preflight')).toBe('pen');
    expect(costPartOf('marking_read')).toBe('read');
    expect(costPartOf('marking_page_trim')).toBe('read');
    expect(costPartOf('marking_second_look')).toBe('extra');
    expect(costPartOf('handin-read')).toBe('extra');
    expect(costPartOf('marking_shadow_read')).toBe('test');
    expect(costPartOf('marking_vision_shadow')).toBe('test');
    expect(costPartOf('marking_helper_shadow')).toBe('test');
    expect(costPartOf('marking_page_trim_ab')).toBe('test');
    expect(costPartOf('web_answer_text')).toBe(null);
    expect(costPartOf('essay_marking')).toBe(null);
    expect(sumParts(base().ledgerWeek)).toEqual({ pen: 1.2, read: 0.6, extra: 0.15, test: 8 });
  });
});

describe('lanes', () => {
  it('plan, paid, half-price', () => {
    expect(laneOf(run())).toBe('plan');
    expect(laneOf(run({ lane: 'api' }))).toBe('api');
    expect(laneOf(run({ lane: 'batch' }))).toBe('batch');
  });
});

describe('the week', () => {
  it('averages, splits by the ledger, keeps tests out, counts the month', () => {
    const w = buildWeeklyCost(base({ runs: [...base().runs, run({ paper_name: 'BENCH · chemistry · x', cost: 9 })] }));
    expect(w.papers).toBe(3);                       // the bench paper is a test
    expect(w.avg).toBe(1);                           // (0.5 + 0.5 + 2) / 3
    expect(w.split).toEqual({ pen: 0.4, read: 0.2, extra: 0.05 });
    expect(w.lanes.plan).toEqual({ papers: 2, avg: 0.5 });
    expect(w.lanes.api).toEqual({ papers: 1, avg: 2 });
    expect(w.testsWeek).toBe(8);
    expect(w.month).toMatchObject({ spent: 12, tests: 1, days: 4, daysInMonth: 31, projected: 93, label: 'Oct' });
  });
  it('the 1st of a month reports last month in full', () => {
    const w = buildWeeklyCost(base({ weekStart: '2026-10-25', weekEnd: '2026-10-31', monthStart: '2026-10-01', today: '2026-11-01' }));
    expect(w.month.days).toBe(31);
    expect(weeklyCostMessage(w)).toContain('Oct in full');
  });
});

describe('the levers — only a passed test is offered, with its switch', () => {
  it('page-trim: passed → one line with the switch and a monthly figure', () => {
    const inp = base({
      runs: [run({ cw: 255000 }), run(), run({ lane: 'api' })],
      tests: [{ name: 'page-trim', status: 'passed', saving_per_paper_usd: 0.6, measure: { same: 74, parts: 76, noise_pct: 96.1 } }],
    });
    const { savings } = levers(inp);
    expect(savings).toHaveLength(1);
    expect(savings[0].name).toBe('page-trim');
    // (1 paid paper × 0.60 + a 200k-token retry write × $8/M) × 30/7
    expect(savings[0].monthly).toBeCloseTo((0.6 + 200000 * 8 / 1e6) * 30 / 7, 6);
    expect(savings[0].line).toMatch(/say "switch page-trim"/i);
    expect(savings[0].line).toContain('74 of 76 parts');
  });
  it('a lever that is on, failed or still running is never offered', () => {
    for (const status of ['on', 'failed', 'running'] as const) {
      expect(levers(base({ tests: [{ name: 'page-trim', status, saving_per_paper_usd: 1 }] })).savings).toHaveLength(0);
    }
  });
  it('helper-flash: needs 50 pages AND agreement at the Pro-vs-Pro bar', () => {
    const page = { photo_index: 0, kinds: { part_regions: { calls: 1, items: 4, same: 4, moved: 0, missed: 0, extra: 0, proCostUsd: 0.006, flashCostUsd: 0.002, flashFailed: 0 } } };
    const shadow = (pages: number) => [run({ result_json: { helper_shadow: Array.from({ length: pages }, () => page) } })];
    const tests = [{ name: 'helper-flash', status: 'running' as const, measure: { noise_pct: 97 } }];
    expect(levers(base({ tests, shadowRuns: shadow(49) })).savings).toHaveLength(0);
    const s = levers(base({ tests, shadowRuns: shadow(60) })).savings;
    expect(s[0].name).toBe('helper-flash');
    expect(s[0].monthly).toBeCloseTo(0.004 * 54 * 30 / 7, 6);   // 3 papers × 18 pages a week
  });
  it('a cheaper reader for a level: offered only when that level passes', () => {
    const lv = { level: 'E Math', papers: 14, agreePct: 97.2, passes: true };
    const s = levers(base({ readerLevels: [lv, { level: 'A Math', papers: 4, agreePct: 80, passes: false }], readerNoisePct: 96.1 })).savings;
    expect(s.map(x => x.name)).toEqual(['reader-emath']);
    expect(s[0].line).not.toMatch(/sonnet|opus|gemini|flash/i);
  });
});

describe('the message', () => {
  it('plain words, no model names, the switch line last', () => {
    const msg = weeklyCostMessage(buildWeeklyCost(base({ tests: [{ name: 'page-trim', status: 'passed', saving_per_paper_usd: 0.6, measure: { same: 74, parts: 76, noise_pct: 96.1 } }] })));
    expect(msg).toContain('3 papers marked. A paper cost US$1.00 on average');
    expect(msg).toContain('• placing the red pen: US$0.40');
    expect(msg).toContain('By lane: plan 2 (US$0.50 each) · paid reader 1 (US$2.00 each) · half-price 0');
    expect(msg).toContain('Tests running cost US$8.00 this week');
    expect(msg).toContain('Ready to save (passed their test):');
    expect(msg).not.toMatch(/sonnet|opus|gemini|flash|claude/i);
  });
  it('nothing passed → says so', () => {
    expect(weeklyCostMessage(buildWeeklyCost(base()))).toContain('No saving has passed its test yet.');
  });
});

describe('twins', () => {
  it('helperRollUp matches the bot rollUp on the shared example', () => {
    const page = { photo_index: 0, kinds: { token_boxes: { calls: 2, items: 3, same: 2, moved: 1, missed: 0, extra: 0, proCostUsd: 0.008, flashCostUsd: 0.001, flashFailed: 1 } } };
    const r = helperRollUp([run({ result_json: { helper_shadow: [page, page] } }), run()]);
    expect(r.papers).toBe(1);
    expect(r.pages).toBe(2);
    expect(r.kinds.token_boxes.same).toBe(4);
    expect(levelGuess('A MATH • GCE 2021 • Paper 2')).toBe('A Math');
    expect(levelGuess('nicole h2 Math tys 2024 Paper 2')).toBe('H2');
  });
});
