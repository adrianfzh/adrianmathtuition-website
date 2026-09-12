import { describe, it, expect } from 'vitest';
import { consistency, ranks, spearman, ranking, anchorFit, midpoint } from './essay-calibration';

describe('consistency — the same essay read twice', () => {
  it('passes at nine agreements in ten with nothing two bands apart', () => {
    const pairs = Array.from({ length: 10 }, (_, i) => ({ essay: `e${i}`, criterion: 'language', a: 3, b: i === 0 ? 4 : 3 }));
    const r = consistency(pairs);
    expect(r).toMatchObject({ pairs: 10, agree: 9, offByOne: 1, offByMore: 0, pass: true });
    expect(r.rate).toBeCloseTo(0.9);
  });
  it('fails on one pair two bands apart even when the rest agree, and skips missing bands', () => {
    const pairs = Array.from({ length: 20 }, (_, i) => ({ essay: `e${i}`, criterion: 'content', a: 4, b: i === 3 ? 2 : 4 }));
    expect(consistency(pairs).pass).toBe(false);
    expect(consistency([{ essay: 'x', criterion: 'content', a: null, b: 4 }]).pairs).toBe(0);
  });
});

describe('ranks and spearman', () => {
  it('shares ranks across ties and correlates orderings, not numbers', () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    // A teacher three marks harsher on every essay still agrees on the ORDER — rho 1.
    expect(spearman([18, 22, 15, 25], [15, 19, 12, 22])).toBeCloseTo(1);
    expect(Number.isNaN(spearman([1, 1, 1], [1, 2, 3]))).toBe(true);
  });
});

describe('ranking — one teacher, one prompt, one class', () => {
  const set = (apps: number[]) => apps.map((app, i) => ({ essay: `e${i}`, teacher: [12, 15, 17, 18, 20, 21, 23, 26][i], app }));
  it('passes when the app orders the class the way the teacher did, whatever the numbers', () => {
    const r = ranking(set([9, 14, 15, 17, 18, 19, 22, 24]));
    expect(r.pass).toBe(true);
    expect(r.rho).toBeGreaterThan(0.95);
  });
  it('fails a scrambled order, and refuses a set that is too small', () => {
    expect(ranking(set([24, 9, 22, 14, 19, 15, 18, 17])).pass).toBe(false);
    const small = ranking(set([9, 14, 15]).slice(0, 3));
    expect(small.pass).toBe(false);
    expect(small.reason).toMatch(/needs 8/);
  });
});

describe('anchorFit and midpoint', () => {
  it('an anchor a band away is tolerated; two away fails; the midpoint is the range\'s middle', () => {
    expect(anchorFit([{ essay: 'a', criterion: 'language', known: 4, app: 4 }, { essay: 'b', criterion: 'language', known: 2, app: 3 }]).pass).toBe(true);
    expect(anchorFit([{ essay: 'a', criterion: 'language', known: 5, app: 3 }]).pass).toBe(false);
    expect(midpoint({ min: 16, max: 20 })).toBe(18);
    expect(midpoint(null)).toBeNull();
  });
});
