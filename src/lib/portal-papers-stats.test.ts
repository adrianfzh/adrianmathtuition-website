import { describe, it, expect } from 'vitest';
import { statsBySubject, subjectStats, trendLabel, isTileSubject, type StatPaper } from './portal-papers-stats';

const p = (date: string, pct: number | null, subject: string | null): StatPaper => ({ date, pct, subject });

describe('subjectStats — one subject, its own papers only', () => {
  it('latest is the newest scored paper, average is the mean, trend is newest minus oldest', () => {
    const s = subjectStats([
      p('2026-09-01', 80, 'A Math'),
      p('2026-08-15', 60, 'A Math'),
      p('2026-08-01', 50, 'A Math'),
      p('2026-08-20', 95, 'E Math'),   // another subject — must not leak in
    ], 'A Math');
    expect(s).toEqual({ subject: 'A Math', papers: 3, latestPct: 80, averagePct: 63, trendPts: 30 });
  });

  it('is order-independent (the page passes newest-first, the test passes oldest-first)', () => {
    const s = subjectStats([
      p('2026-08-01', 50, 'E Math'),
      p('2026-09-01', 70, 'E Math'),
    ], 'E Math');
    expect(s.latestPct).toBe(70);
    expect(s.trendPts).toBe(20);
  });

  it('unscored papers count towards N but not towards latest/average/trend', () => {
    const s = subjectStats([
      p('2026-09-02', null, 'A Math'),
      p('2026-09-01', 40, 'A Math'),
    ], 'A Math');
    expect(s).toEqual({ subject: 'A Math', papers: 2, latestPct: 40, averagePct: 40, trendPts: null });
  });

  it('a subject with no papers is all-null and zero', () => {
    expect(subjectStats([p('2026-09-01', 80, 'A Math')], 'H2 Math'))
      .toEqual({ subject: 'H2 Math', papers: 0, latestPct: null, averagePct: null, trendPts: null });
  });
});

describe('statsBySubject — the tabs', () => {
  it('one block per allowed subject the student has papers in, in allowed order', () => {
    const out = statsBySubject([
      p('2026-09-01', 80, 'E Math'),
      p('2026-08-20', 60, 'A Math'),
    ], ['A Math', 'E Math']);
    expect(out.map(s => s.subject)).toEqual(['A Math', 'E Math']);
  });

  it('a subject the account has but no papers in gets no tab', () => {
    const out = statsBySubject([p('2026-09-01', 80, 'E Math')], ['A Math', 'E Math']);
    expect(out.map(s => s.subject)).toEqual(['E Math']);
  });

  it('"Other" and untagged papers count in no tile', () => {
    const out = statsBySubject([
      p('2026-09-03', 100, 'Other'),
      p('2026-09-02', 10, null),
      p('2026-09-01', 70, 'A Math'),
    ], ['A Math', 'E Math']);
    expect(out).toEqual([{ subject: 'A Math', papers: 1, latestPct: 70, averagePct: 70, trendPts: null }]);
  });

  it('is empty when every paper is Other — the page then shows no tiles', () => {
    expect(statsBySubject([p('2026-09-03', 100, 'Other')], ['A Math', 'E Math'])).toEqual([]);
  });

  it('a subject outside the allowed list never surfaces, even with papers', () => {
    // An E Math-only account holding an A Math run (a mis-tag) — the page has
    // already filtered the list; this is the belt.
    const out = statsBySubject([p('2026-09-01', 80, 'A Math')], ['E Math']);
    expect(out).toEqual([]);
  });
});

describe('trendLabel — the ±5 noise band', () => {
  it('names a real move and calls a small one steady', () => {
    expect(trendLabel(12)).toEqual({ text: '↑ 12 pts', tone: 'up' });
    expect(trendLabel(-7)).toEqual({ text: '↓ 7 pts', tone: 'down' });
    expect(trendLabel(4)).toEqual({ text: 'steady', tone: 'steady' });
    expect(trendLabel(-4)).toEqual({ text: 'steady', tone: 'steady' });
    expect(trendLabel(5)).toEqual({ text: '↑ 5 pts', tone: 'up' });
  });
  it('is null with no trend', () => {
    expect(trendLabel(null)).toBeNull();
  });
});

describe('isTileSubject', () => {
  it('accepts the three maths and rejects Other/null', () => {
    expect(isTileSubject('A Math')).toBe(true);
    expect(isTileSubject('H2 Math')).toBe(true);
    expect(isTileSubject('Other')).toBe(false);
    expect(isTileSubject(null)).toBe(false);
  });
});
