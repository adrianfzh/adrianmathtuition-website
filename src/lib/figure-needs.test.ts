import { describe, it, expect } from 'vitest';
import { normShape, groupNeeds, weeklyMessage, READY_AT, type FigureNeedRow } from './figure-needs';

const row = (id: number, shape: string, seed: string | null, at = '2026-10-04T00:00:00Z', extra: Partial<FigureNeedRow> = {}): FigureNeedRow => ({
  id, created_at: at, bank: 'maths', seed_id: seed, subject: 'maths', level: 'EM', topic: 'Probability', what: `need ${id}`, shape, source: 'twins-lane', status: 'open', ...extra,
});

describe('normShape', () => {
  it('folds spelling into one key', () => {
    expect(normShape('Venn Probability')).toBe('venn-probability');
    expect(normShape('venn-probabilities')).toBe('venn-probability');
    expect(normShape('A diagram of the manometers')).toBe('manometer');
    expect(normShape('', 'U-tube manometer with two liquids and a gas supply')).toBe('u-tube-manometer-two');
    expect(normShape(null, null)).toBe('unknown');
    expect(normShape('glass')).toBe('glass');
  });
});

describe('groupNeeds', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  it('counts distinct seeds, marks a shape ready at 3, skips closed rows, biggest first', () => {
    const g = groupNeeds([
      row(1, 'venn-probability', null), row(2, 'Venn probabilities', null),
      row(3, 'venn-probability', 'a', '2026-10-05T01:00:00Z'), row(4, 'venn-probability', 'a', '2026-10-05T02:00:00Z'),
      row(5, 'riemann-rectangles', null),
      row(6, 'manometer', 'b', '2026-09-01T00:00:00Z', { bank: 'science', subject: 'physics', topic: 'Pressure' }),
      row(7, 'manometer', 'c', '2026-10-01T00:00:00Z', { status: 'built' }),
    ], now);
    expect(g.map((x) => [x.shape, x.count, x.ready])).toEqual([['venn-probability', 3, true], ['riemann-rectangle', 1, false], ['manometer', 1, false]]);
    expect(g[0].newThisWeek).toBe(4);
    expect(g[2].newThisWeek).toBe(0);
    expect(READY_AT).toBe(3);
  });
});

describe('weeklyMessage', () => {
  it('plain words, ✅ on ready shapes, asks to build them; null when nothing is open', () => {
    const g = groupNeeds([row(1, 'venn-probability', 'a'), row(2, 'venn-probability', 'b'), row(3, 'venn-probability', 'c'), row(4, 'manometer', 'd', undefined, { subject: 'physics', topic: 'Pressure' })], new Date('2026-10-05T00:00:00Z'));
    const m = weeklyMessage(g)!;
    expect(m).toMatch(/^🖼 Figures we need/);
    expect(m).toMatch(/✅ venn probability — 3 questions/);
    expect(m).toMatch(/• manometer — 1 question \(physics, Pressure\)/);
    expect(m).toMatch(/One shape is needed by 3 or more questions \(✅\) — build it\?/);
    expect(weeklyMessage([])).toBeNull();
  });
});
