// 👻 lib/shadow-read-report — the website half of the cheaper-reader shadow.
// The worked example is the TWIN of the bot's test/shadow-read.test.js §6.
import { describe, it, expect } from 'vitest';
import { summariseShadowReads, noiseFloor, levelOf, shadowLine, shadowReport, type ShadowRun, type ShadowPage } from './shadow-read-report';

const delivered = [
  { question_number: '1', photo_index: 0, marking_output: { parts: [{ label: '(a)', awarded: 2, max: 2 }, { label: '(b)', awarded: 1, max: 3 }] } },
  { question_number: '2', photo_index: 1, marking_output: { parts: [{ label: '', awarded: 4, max: 4 }] } },
];
const run = (id: string, name: string, pages: ShadowPage[]): ShadowRun => ({
  id, paper_name: name, student_name: 'Kai', created_at: '2026-10-01T00:00:00Z',
  result_json: { results: delivered, shadow_read: { at: '2026-10-01T01:00:00Z', arms: [{ key: 'claude-sonnet-5-5+ref', model: 'claude-sonnet-5-5', reference: true, cost_usd: 0.3, pages }] } },
});
const agreeing: ShadowPage[] = [
  { photo_index: 0, parts: [{ q: '1', part: '(a)', awarded: 2, max: 2 }, { q: '1', part: '(b)', awarded: 1, max: 3 }] },
  { photo_index: 1, parts: [{ q: '2', part: '', awarded: 4, max: 4 }] },
];
const disagreeing: ShadowPage[] = [
  { photo_index: 0, parts: [{ q: '1', part: '(a)', awarded: 2, max: 2 }, { q: '1', part: '(b)', awarded: 3, max: 3, why: 'method mark for the substitution' }] },
  { photo_index: 1, parts: [], error: 'timeout' },
];
const noiseRuns: ShadowRun[] = [{ id: 'n', result_json: { results: delivered, shadow_runs: [{ at: '2026-09-28', results: [
  { question_number: '1', marking_output: { parts: [{ label: '(a)', awarded: 2, max: 2 }, { label: '(b)', awarded: 1, max: 3 }] } },
  { question_number: '2', marking_output: { parts: [{ label: '', awarded: 3, max: 4 }] } },
] }] } }];

describe('shadow-read-report', () => {
  it('matches the bot twin: per arm + per level, diffs from the stored pages, verdict against the floor', () => {
    const noise = noiseFloor(noiseRuns);
    expect(noise).toEqual({ papers: 1, parts: 3, same: 2, agree_pct: 66.7 });
    const s = summariseShadowReads([run('r1', 'E Math 2023 P2', agreeing), run('r2', 'A Math 2022 P1', disagreeing)], noise);
    const A = s.arms[0];
    expect(A.all).toMatchObject({ papers: 2, with_reference: 2, pages: 4, pages_failed: 1, parts: 5, same: 4, agree_pct: 80, abs_diff: 2, cost_per_paper: 0.3 });
    expect(A.all.verdict).toMatch(/too few papers/);
    expect(A.levels.map((l) => [l.level, l.papers, l.agree_pct])).toEqual([['E Math', 1, 100], ['A Math', 1, 50]]);
    expect(A.diffs).toHaveLength(1);
    expect(A.diffs[0]).toMatchObject({ run_id: 'r2', delivered: 1, shadow: 3, why: 'method mark for the substitution' });
    const many = Array.from({ length: 10 }, (_, i) => run(`m${i}`, 'E Math 2024 P1', agreeing));
    expect(summariseShadowReads(many, noise).arms[0].all.verdict).toMatch(/a candidate/);
    expect(summariseShadowReads(many, null).arms[0].all.verdict).toMatch(/no noise floor/);
    expect(levelOf('Sec 2 EOY 2025')).toBe('Lower Sec');
    expect(levelOf('H2 2024 P2')).toBe('H2');
  });

  it('the Monday line and the weekly message read plainly; nothing shadowed → null', () => {
    expect(shadowLine(summariseShadowReads([], null))).toBeNull();
    expect(shadowReport(summariseShadowReads([], null))).toBeNull();
    const s = summariseShadowReads([run('r1', 'E Math 2023 P2', agreeing), run('r2', 'A Math 2022 P1', disagreeing)], noiseFloor(noiseRuns));
    expect(shadowLine(s)).toBe('👻 Shadow (claude-sonnet-5-5+ref): 2 papers; same mark on E Math 100% of 3, A Math 50% of 2 (marker vs itself 66.7%); 1 part to adjudicate.');
    const msg = shadowReport(s)!;
    expect(msg).toContain('E Math: 1 papers — too few papers');
    expect(msg).toContain('Kai — A Math 2022 P1 · Q1(b) · 1 → 3 / 3 · "method mark for the substitution"');
    expect(msg).toContain('/admin/mark-paper?run=r2');
  });
});
