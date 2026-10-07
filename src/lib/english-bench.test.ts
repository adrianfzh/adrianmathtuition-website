import { describe, it, expect } from 'vitest';
import { grossMiss, padAnswer, pairVerdict, seededVerdict, summaryVerdict, swapTarget, swappedVerdict } from './english-bench';

describe('seeded answers', () => {
  it('passes at 90 % with no gross miss', () => {
    const rows = [...Array(9)].map(() => ({ truth: 1, max: 2, awarded: 1 })).concat([{ truth: 1, max: 2, awarded: 2 }]);
    expect(seededVerdict(rows)).toMatchObject({ right: 9, gross: 0, pass: true });
  });
  it('one full-marks read of a wrong answer fails the bench', () => {
    const rows = [...Array(30)].map(() => ({ truth: 2, max: 2, awarded: 2 })).concat([{ truth: 0, max: 1, awarded: 1 }]);
    expect(seededVerdict(rows)).toMatchObject({ gross: 1, pass: false });
  });
  it('an unread answer fails it', () => {
    expect(seededVerdict([{ truth: 1, max: 1, awarded: 1 }, { truth: 1, max: 1, awarded: null }]).pass).toBe(false);
  });
  it('gross: full for a zero, zero for a full, or two marks away', () => {
    expect(grossMiss({ truth: 0, max: 1, awarded: 1 })).toBe(true);
    expect(grossMiss({ truth: 2, max: 2, awarded: 0 })).toBe(true);
    expect(grossMiss({ truth: 1, max: 3, awarded: 3 })).toBe(true);
    expect(grossMiss({ truth: 1, max: 2, awarded: 2 })).toBe(false);
    expect(grossMiss({ truth: 0, max: 2, awarded: 1 })).toBe(false);
  });
});

describe('pairs and swaps', () => {
  it('the same answer twice: same mark nine times in ten, never two apart', () => {
    const same = [...Array(9)].map(() => ({ first: 1, second: 1 }));
    expect(pairVerdict([...same, { first: 1, second: 2 }]).pass).toBe(true);
    expect(pairVerdict([...same, { first: 0, second: 2 }]).pass).toBe(false);
    expect(pairVerdict([...same, { first: 1, second: null }]).pass).toBe(false);
  });
  it('an answer to another question earns nothing', () => {
    expect(swappedVerdict([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]).pass).toBe(true);
    expect(swappedVerdict([0, 0, 1, 1]).pass).toBe(false);
  });
  it('the swap goes half the set away, never onto itself', () => {
    expect(swapTarget(0, 12)).toBe(6);
    expect(swapTarget(9, 12)).toBe(3);
    expect(swapTarget(0, 3)).toBeNull();
  });
  it('padding keeps the answer inside', () => {
    expect(padAnswer(' He was sad. ')).toContain(' He was sad. ');
  });
});

describe('the summary', () => {
  it('within one point passes; three away fails; points are compared one by one', () => {
    const ok = summaryVerdict([{ truthHit: [1, 2, 3, 4], hit: [1, 2, 3], max: 8 }, { truthHit: [], hit: [], max: 8 }], () => 10);
    expect(ok).toMatchObject({ within1: 2, far: 0, pass: true });
    expect(ok.pointsAgree).toBeCloseTo(19 / 20);
    expect(summaryVerdict([{ truthHit: [1, 2], hit: [1, 2, 3, 4, 5], max: 8 }], () => 10).pass).toBe(false);
  });
  it('the count stops at the content maximum', () => {
    expect(summaryVerdict([{ truthHit: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hit: [1, 2, 3, 4, 5, 6, 7, 8], max: 8 }], () => 11).within1).toBe(1);
  });
});
