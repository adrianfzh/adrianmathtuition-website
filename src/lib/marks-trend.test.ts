import { describe, it, expect } from 'vitest';
import { marksTrend, slopeOf, verdictOf, trendLine, type TrendRun } from './marks-trend';

const run = (date: string, got: number, max: number, subject = 'math', extra: Partial<TrendRun> = {}): TrendRun =>
  ({ id: `${subject}-${date}`, created_at: `${date}T08:00:00Z`, paper_name: `${subject} ${date}`, subject, total_awarded: got, total_max: max, ...extra });

describe('marksTrend — is the student improving? (9 Sep 2026)', () => {
  it('orders oldest → newest per subject and reads improvement off the slope, not the last two papers', () => {
    const t = marksTrend([run('2026-09-01', 74, 90), run('2026-08-01', 56, 90), run('2026-08-15', 63, 90), run('2026-08-25', 60, 90)]);
    expect(t).toHaveLength(1);
    expect(t[0].points.map(p => p.pct)).toEqual([62, 70, 67, 82]);
    expect(t[0].verdict).toBe('improving');
    expect(t[0].delta).toBe(15);
    expect(trendLine(t[0])).toBe('62% → 70% → 67% → 82%');
  });
  it('keeps subjects apart and counts a re-marked paper once', () => {
    const t = marksTrend([
      run('2026-08-01', 40, 80, 'math'), run('2026-08-08', 44, 80, 'math'), run('2026-08-15', 48, 80, 'math'),
      run('2026-08-10', 30, 100, 'physics'),
      run('2026-08-12', 10, 80, 'math', { superseded_by: 'x' }),   // replaced by a re-mark — ignored
    ]);
    expect(t.map(x => x.subject)).toEqual(['math', 'physics']);
    expect(t[0].points.map(p => p.pct)).toEqual([50, 55, 60]);
    expect(t[1].verdict).toBe('too few');
  });
  it('a flat run is steady; a falling run is slipping; a run with no max is skipped', () => {
    expect(marksTrend([run('2026-08-01', 60, 100), run('2026-08-08', 61, 100), run('2026-08-15', 60, 100)])[0].verdict).toBe('steady');
    expect(marksTrend([run('2026-08-01', 80, 100), run('2026-08-08', 70, 100), run('2026-08-15', 60, 100)])[0].verdict).toBe('slipping');
    expect(marksTrend([run('2026-08-01', 0, 0)])).toEqual([]);
  });
  it('slope and verdict thresholds', () => {
    expect(slopeOf([50, 55, 60])).toBe(5);
    expect(slopeOf([50, 55])).toBeNull();
    expect(verdictOf(1.4)).toBe('steady');
    expect(verdictOf(1.5)).toBe('improving');
    expect(verdictOf(-2)).toBe('slipping');
  });
});

describe('marksTrend with a caller-named series', () => {
  it('keys A Math and E Math apart off the paper name when the subject column says math for both', () => {
    const t = marksTrend([
      run('2026-08-01', 50, 100), run('2026-08-08', 60, 100), run('2026-08-15', 70, 100),
      { ...run('2026-08-03', 90, 100), paper_name: 'em tys 2022 p1' },
    ], r => (/\bem\b/i.test(r.paper_name || '') ? 'E Math' : 'A Math'));
    expect(t.map(x => [x.subject, x.points.length])).toEqual([['A Math', 3], ['E Math', 1]]);
  });
});

describe('marksTrend leaves Practice Again sheets out', () => {
  it('a 97% on a remedial sheet does not turn two exam papers into an improving run', () => {
    const t = marksTrend([
      run('2026-08-29', 50, 90), { ...run('2026-09-04', 56, 58), paper_name: 'Practice Again — from your A Math 2021 Paper 1' }, run('2026-09-08', 65, 90),
    ]);
    expect(t[0].points.map(p => p.pct)).toEqual([56, 72]);
    expect(t[0].verdict).toBe('too few');
  });
});
