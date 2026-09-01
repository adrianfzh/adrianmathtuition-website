import { describe, it, expect } from 'vitest';
import {
  MIN_LIMIT_SEC, coachingLine, formatClock, marksForTiming, normaliseCount, parseTimedMeta,
  planSlots, secondsPerMark, summariseSet, timeLimitSeconds, type SetItemOutcome,
} from './timed-set';

describe('exam pace', () => {
  it('O-Level 90 s/mark, H2 108 s/mark', () => {
    expect(secondsPerMark('AM')).toBe(90);
    expect(secondsPerMark('S3_EM')).toBe(90);
    expect(secondsPerMark('S1')).toBe(90);
    expect(secondsPerMark('JC1')).toBe(108);
    expect(secondsPerMark('JC2')).toBe(108);
  });
  it('rounds the limit up to whole minutes with a floor', () => {
    expect(timeLimitSeconds('AM', 17)).toBe(26 * 60);   // 1530 s → 26 min
    expect(timeLimitSeconds('JC2', 10)).toBe(18 * 60);  // 1080 s exactly
    expect(timeLimitSeconds('AM', 1)).toBe(MIN_LIMIT_SEC);
    expect(timeLimitSeconds('AM', 0)).toBe(MIN_LIMIT_SEC);
    expect(timeLimitSeconds('AM', -3)).toBe(MIN_LIMIT_SEC);
  });
  it('marksForTiming falls back for unmarked bank rows', () => {
    expect(marksForTiming(6)).toBe(6);
    expect(marksForTiming(0)).toBe(4);
    expect(marksForTiming(null)).toBe(4);
    expect(marksForTiming(undefined)).toBe(4);
  });
});

describe('planSlots', () => {
  const noShuffle = () => 0.999; // Fisher–Yates with j = i keeps the order
  it('round-robins across the topics', () => {
    expect(planSlots(['A', 'B'], 5, noShuffle)).toEqual(['A', 'B', 'A', 'B', 'A']);
    expect(planSlots(['A', 'B', 'C', 'D'], 3, noShuffle)).toEqual(['A', 'B', 'C']);
  });
  it('de-duplicates and trims, and is empty with nothing to draw from', () => {
    expect(planSlots([' A ', 'A', 'B '], 3, noShuffle)).toEqual(['A', 'B', 'A']);
    expect(planSlots([], 3)).toEqual([]);
    expect(planSlots(['A'], 0)).toEqual([]);
  });
  it('shuffles with the injected generator', () => {
    const rotated = planSlots(['A', 'B', 'C'], 3, () => 0); // always swaps with index 0
    expect(rotated).toHaveLength(3);
    expect(new Set(rotated)).toEqual(new Set(['A', 'B', 'C']));
  });
});

describe('normaliseCount + formatClock', () => {
  it('only 3 or 5', () => {
    expect(normaliseCount(5)).toBe(5);
    expect(normaliseCount('5')).toBe(5);
    expect(normaliseCount(3)).toBe(3);
    expect(normaliseCount(99)).toBe(3);
    expect(normaliseCount(undefined)).toBe(3);
  });
  it('m:ss, clamped at zero', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(1560)).toBe('26:00');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(NaN)).toBe('0:00');
  });
});

describe('summariseSet', () => {
  const items: SetItemOutcome[] = [
    { marks: 5, attempted: true, score: 4, outOf: 5 },
    { marks: 4, attempted: false, score: null, outOf: null },
    { marks: 6, attempted: true, score: null, outOf: null },  // grade call failed
    { marks: 3, attempted: true, score: 3, outOf: 3 },
  ];
  it('counts blanks and unmarked separately and keeps their marks in the denominator', () => {
    const s = summariseSet(items);
    expect(s).toEqual({ total: 4, attempted: 3, blank: 1, unmarked: 1, score: 7, outOf: 18, pct: 39 });
  });
  it('handles the empty set', () => {
    expect(summariseSet([]).pct).toBeNull();
  });
});

describe('coachingLine', () => {
  const base = { total: 3, attempted: 3, blank: 0, unmarked: 0, score: 10, outOf: 12, pct: 83 };
  it('blanks come first', () => {
    expect(coachingLine({ ...base, blank: 1, attempted: 2 }, 600, 1200)).toMatch(/left blank/);
  });
  it('the whole clock', () => {
    expect(coachingLine(base, 1200, 1200)).toMatch(/whole clock/);
  });
  it('fast + accurate vs fast + sloppy', () => {
    expect(coachingLine(base, 500, 1200)).toMatch(/Fast and accurate/);
    expect(coachingLine({ ...base, score: 4, pct: 33 }, 500, 1200)).toMatch(/time to spare/);
  });
  it('steady strong, and the default', () => {
    expect(coachingLine(base, 1000, 1200)).toMatch(/Strong set/);
    expect(coachingLine({ ...base, score: 7, pct: 58 }, 1000, 1200)).toMatch(/redo the ones/);
    expect(coachingLine({ ...base, total: 0 }, 0, 0)).toBe('');
  });
});

describe('parseTimedMeta', () => {
  it('accepts a well-formed tag and flags overtime', () => {
    expect(parseTimedMeta({ setId: '7f3c2a1e-1111-2222-3333-444455556666', elapsedSec: 1199.6, timeLimitSec: 1200 }))
      .toEqual({ setId: '7f3c2a1e-1111-2222-3333-444455556666', elapsedSec: 1200, timeLimitSec: 1200, overtime: true });
    expect(parseTimedMeta({ setId: 'abcdefgh', elapsedSec: 30, timeLimitSec: 300 })?.overtime).toBe(false);
  });
  it('rejects anything malformed', () => {
    expect(parseTimedMeta(undefined)).toBeNull();
    expect(parseTimedMeta('x')).toBeNull();
    expect(parseTimedMeta({ setId: 'short', elapsedSec: 1, timeLimitSec: 1 })).toBeNull();
    expect(parseTimedMeta({ setId: 'abcdefgh', elapsedSec: -1, timeLimitSec: 300 })).toBeNull();
    expect(parseTimedMeta({ setId: 'abcdefgh', elapsedSec: 10, timeLimitSec: 0 })).toBeNull();
    expect(parseTimedMeta({ setId: 'abcdefgh', elapsedSec: 99999, timeLimitSec: 300 })).toBeNull();
    expect(parseTimedMeta({ setId: 'abcdefgh', elapsedSec: 'soon', timeLimitSec: 300 })).toBeNull();
  });
});
