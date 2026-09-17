import { describe, it, expect } from 'vitest';
import { kindTrend, pairs, trendLine } from './kind-trend';

const r = (student_id: string, level: string, created_at: string, lost: number, careless: number, concept: number, pct: number) => ({ student_id, level, created_at, lost, careless, concept, pct });

describe('kind trend', () => {
  it('pairs the newest two papers per student and level, oldest first', () => {
    const p = pairs([r('a', 'EM', '2026-09-01', 10, 8, 2, 70), r('a', 'EM', '2026-09-10', 10, 3, 7, 75), r('a', 'EM', '2026-08-01', 10, 5, 5, 60), r('a', 'AM', '2026-09-05', 5, 5, 0, 80)]);
    expect(p).toHaveLength(1);
    expect(p[0].map(x => x.created_at)).toEqual(['2026-09-01', '2026-09-10']);
  });
  it('counts careless share down, method share up, score up', () => {
    const t = kindTrend([r('a', 'EM', '2026-09-01', 10, 8, 2, 70), r('a', 'EM', '2026-09-10', 10, 3, 7, 76)]);
    expect(t).toEqual({ students: 1, carelessDown: 1, carelessUp: 0, conceptDown: 0, conceptUp: 1, scoreUp: 1, scoreDown: 0 });
    expect(trendLine(t)).toMatch(/careless share down for 1, up for 0; method share down for 0, up for 1; score up 5\+ for 1, drastic drop for 0/);
  });
  it('a lone paper counts nothing', () => {
    expect(kindTrend([r('a', 'EM', '2026-09-01', 10, 8, 2, 70)]).students).toBe(0);
    expect(trendLine(kindTrend([]))).toMatch(/no student/);
  });
});
