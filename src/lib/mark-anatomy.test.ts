import { describe, it, expect } from 'vitest';
import { parseMarkAnatomy } from './mark-anatomy';

const good = [
  { code: 'M1', for: 'forming the discriminant inequality', earned: true },
  { code: 'A1', for: 'correct final range with both ends justified', earned: false },
];

describe('parseMarkAnatomy', () => {
  it('accepts a well-formed anatomy and normalises codes', () => {
    const out = parseMarkAnatomy([{ code: ' m1 ', for: '  setup  ', earned: true }]);
    expect(out).toEqual([{ code: 'M1', for: 'setup', earned: true }]);
  });

  it('absent field → undefined (old stored results keep rendering)', () => {
    expect(parseMarkAnatomy(undefined)).toBeUndefined();
    expect(parseMarkAnatomy(null)).toBeUndefined();
  });

  it('non-array / empty array → undefined', () => {
    expect(parseMarkAnatomy('M1')).toBeUndefined();
    expect(parseMarkAnatomy({ code: 'M1' })).toBeUndefined();
    expect(parseMarkAnatomy(42)).toBeUndefined();
    expect(parseMarkAnatomy([])).toBeUndefined();
  });

  it('is all-or-nothing: one malformed item drops the whole anatomy', () => {
    expect(parseMarkAnatomy([...good, { code: 'M2' }])).toBeUndefined();            // missing fields
    expect(parseMarkAnatomy([...good, null])).toBeUndefined();                      // null item
    expect(parseMarkAnatomy([...good, 'A1'])).toBeUndefined();                      // string item
    expect(parseMarkAnatomy([{ code: 'M1', for: 'x', earned: 'true' }])).toBeUndefined(); // earned not boolean
    expect(parseMarkAnatomy([{ code: 'C1', for: 'x', earned: true }])).toBeUndefined();   // not M/A/B
    expect(parseMarkAnatomy([{ code: 'M1', for: '   ', earned: true }])).toBeUndefined(); // blank for
    expect(parseMarkAnatomy([{ code: 'M123', for: 'x', earned: true }])).toBeUndefined(); // code too long
  });

  it('never throws on hostile shapes', () => {
    for (const v of [[[]], [() => {}], [Symbol('x')], [{ code: 1, for: 2, earned: 3 }], new Array(50).fill(good[0])]) {
      expect(() => parseMarkAnatomy(v)).not.toThrow();
      expect(parseMarkAnatomy(v)).toBeUndefined();
    }
  });

  it('reconciles with awarded/outOf when supplied: consistent kept', () => {
    expect(parseMarkAnatomy(good, 1, 2)).toHaveLength(2);
  });

  it('inconsistent with awarded/outOf → dropped (anatomy may never contradict the marks)', () => {
    expect(parseMarkAnatomy(good, 2, 2)).toBeUndefined(); // earned count 1 ≠ awarded 2
    expect(parseMarkAnatomy(good, 1, 3)).toBeUndefined(); // 2 entries ≠ outOf 3
    expect(parseMarkAnatomy(good, 0.5, 2)).toBeUndefined(); // fractional awarded
    expect(parseMarkAnatomy(good, 1, 0)).toBeUndefined();   // outOf must be > 0
    expect(parseMarkAnatomy(good, -1, 2)).toBeUndefined();  // negative awarded
  });

  it('caps the "for" text length', () => {
    const out = parseMarkAnatomy([{ code: 'B1', for: 'x'.repeat(500), earned: true }]);
    expect(out![0].for).toHaveLength(200);
  });

  it('skips the reconciliation gate when awarded/outOf are not numbers', () => {
    expect(parseMarkAnatomy(good, undefined, undefined)).toHaveLength(2);
    expect(parseMarkAnatomy(good, 'a', 'b')).toHaveLength(2);
  });
});
