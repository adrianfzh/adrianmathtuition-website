// 📏 lib/shadow-diff — the website half of the consistency measure.
//
// These cases are the TWIN of the bot repo's test/shadow-diff.test.js, worked
// example for worked example. The two modules are deliberate copies (separate
// repos, separate deploys), so a drift between them shows up here as a failing
// test rather than as two different numbers in two places.
import { describe, it, expect } from 'vitest';
import { flattenParts, diffAssemblies, paperRollup, consistencyLine, latestPair, type ShadowDiff, type ShadowReading } from './shadow-diff';

const q = (n: string, parts: { label: string; awarded: number; max: number }[]) => ({ question_number: n, marking_output: { parts } });
const p = (label: string, awarded: number, max: number) => ({ label, awarded, max });

describe('flattenParts', () => {
  it('keys a part on question + label, and folds a question split over two photos into one', () => {
    const flat = flattenParts([q('9(a)', [p('(i)', 1, 2)]), q('9(b)', [p('', 3, 3)]), q('9(a)', [p('(ii)', 2, 2)])]);
    expect([...flat.keys()].sort()).toEqual(['9(a)(i)', '9(a)(ii)', '9(b)']);
    expect(flat.get('9(a)(i)')!.question).toBe('9');
  });

  it('reads the back-compat `marking.parts` shape the same as `marking_output.parts`', () => {
    const a = flattenParts([{ question_number: '1', marking: { parts: [p('(a)', 2, 3)] } }]);
    const b = flattenParts([q('1', [p('(a)', 2, 3)])]);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it('keys a partless question on its number alone', () => {
    expect([...flattenParts([q('4', [p('', 5, 5)])]).keys()]).toEqual(['4']);
  });
});

describe('diffAssemblies', () => {
  it('names the parts that moved, and only those', () => {
    const before = [q('1', [p('(a)', 2, 2), p('(b)', 3, 3)]), q('2', [p('', 4, 5)])];
    const after = [q('1', [p('(a)', 0, 2), p('(b)', 3, 3)]), q('2', [p('', 5, 5)])];
    const d = diffAssemblies(before, after);
    expect(d.parts).toEqual({ total: 3, moved: 2, same: 1, appeared: 0, disappeared: 0 });
    expect(d.moved.map((m) => [m.key, m.before, m.after, m.delta])).toEqual([['1(a)', 2, 0, -2], ['2', 4, 5, 1]]);
    expect(d.totals).toEqual({ before: { awarded: 9, max: 10 }, after: { awarded: 8, max: 10 }, delta: -1 });
    expect(d.summary).toBe('2 of 3 parts moved, total 9 → 8');
  });

  it('counts a part only one reading scored, and names it appeared or disappeared', () => {
    const d = diffAssemblies([q('1', [p('(a)', 2, 2), p('(b)', 1, 3)])], [q('1', [p('(a)', 2, 2), p('(c)', 0, 1)])]);
    expect(d.disappeared.map((x) => x.key)).toEqual(['1(b)']);
    expect(d.appeared.map((x) => x.key)).toEqual(['1(c)']);
    expect(d.parts.total).toBe(3);
    expect(d.parts.moved).toBe(0);
    expect(d.summary).toBe('0 of 3 parts moved, 1 new, 1 gone, total 3 → 2');
  });

  it('does not call a max that moved on its own a mark that moved', () => {
    const d = diffAssemblies([q('1', [p('(a)', 2, 2)])], [q('1', [p('(a)', 2, 3)])]);
    expect(d.parts.moved).toBe(0);
    expect(d.summary).toBe('0 of 1 part moved, total 2 unchanged');
  });

  it('reports a max that moved WITH the award on the row', () => {
    const d = diffAssemblies([q('1', [p('(a)', 2, 2)])], [q('1', [p('(a)', 3, 4)])]);
    expect(d.moved[0]).toEqual({ key: '1(a)', question: '1', label: '(a)', before: 2, after: 3, delta: 1, max: 4, max_before: 2 });
  });

  it('is quiet when two readings agree — the answer we hope for', () => {
    const r = [q('1', [p('(a)', 2, 2)]), q('2', [p('', 4, 5)])];
    expect(diffAssemblies(r, JSON.parse(JSON.stringify(r))).summary).toBe('0 of 2 parts moved, total 6 unchanged');
  });

  it('takes a whole result_json or a bare results[]', () => {
    const r = [q('1', [p('(a)', 2, 2)])];
    expect(diffAssemblies({ results: r }, r).parts.moved).toBe(0);
  });

  it('treats a missing reading as a diff, not a crash', () => {
    expect(diffAssemblies(null, [q('1', [p('(a)', 2, 2)])]).parts.appeared).toBe(1);
    expect(diffAssemblies(undefined, undefined).summary).toBe('0 of 0 parts moved, total 0 unchanged');
  });
});

describe('consistencyLine — the Monday report', () => {
  const rollup = (label: string, moved: number, parts: number, delta: number) => paperRollup(label, {
    parts: { total: parts, moved, same: parts - moved, appeared: 0, disappeared: 0 },
    moved: [], appeared: [], disappeared: [],
    totals: { before: { awarded: 0, max: 0 }, after: { awarded: delta, max: 0 }, delta },
    summary: '', before_at: null, after_at: null,
  } as ShadowDiff);

  it('names the papers, the parts and the worst mover', () => {
    expect(consistencyLine([rollup('Isabelle EM 2023 P2', 3, 40, -2), rollup('Joey AM 2025 P1', 2, 270, 1)]))
      .toBe('📏 Consistency: 2 papers re-read; parts moved 5 of 310; largest total move 2 marks (Isabelle EM 2023 P2).');
  });

  it('says so in one clause when nothing moved', () => {
    expect(consistencyLine([rollup('a', 0, 40, 0), rollup('b', 0, 30, 0)]))
      .toBe('📏 Consistency: 2 papers re-read; no part moved.');
  });

  it('keeps one paper and one mark singular', () => {
    expect(consistencyLine([rollup('Isabelle EM 2023 P2', 1, 40, 1)]))
      .toBe('📏 Consistency: 1 paper re-read; parts moved 1 of 40; largest total move 1 mark (Isabelle EM 2023 P2).');
  });

  it('reports parts that moved without a phantom "largest move" when the total held', () => {
    expect(consistencyLine([rollup('a', 2, 40, 0)])).toBe('📏 Consistency: 1 paper re-read; parts moved 2 of 40.');
  });

  it('prints no line at all in the first week', () => {
    expect(consistencyLine([])).toBeNull();
    expect(consistencyLine(null)).toBeNull();
  });
});

describe('latestPair', () => {
  it('compares the latest reading with the one before it', () => {
    const r = (at: string): ShadowReading => ({ at, results: [], totals: null, rules_version: null, marked_by: null });
    const runs = [r('T0'), r('T1'), r('T2')];
    expect(latestPair(runs).latest!.at).toBe('T2');
    expect(latestPair(runs).previous!.at).toBe('T1');
    expect(latestPair([runs[0]])).toEqual({ latest: runs[0], previous: null });
    expect(latestPair(null)).toEqual({ latest: null, previous: null });
  });
});
