import { describe, it, expect } from 'vitest';
import { overCount, paperTotalText } from './paper-total-text';

// Adrian, 3 Sep 2026 (Kassandra, parts summed to 94 on a paper out of 90, 92
// awarded): "92 out of 90 is not possible … build it".
describe('paperTotalText — how the strip words the score', () => {
  it('a normal score is the plain label over a fraction', () => {
    expect(paperTotalText({ awarded: 89, max: 90 })).toEqual({ label: 'PAPER TOTAL', score: '89 / 90' });
  });

  it('full marks are normal — equal is not over', () => {
    expect(paperTotalText({ awarded: 90, max: 90 })).toEqual({ label: 'PAPER TOTAL', score: '90 / 90' });
    expect(overCount({ awarded: 90, max: 90 })).toBe(false);
  });

  it('a score above the total says so and never reads as a fraction', () => {
    expect(paperTotalText({ awarded: 92, max: 90 })).toEqual({
      label: 'PAPER TOTAL · NEEDS A CHECK', score: '92 of 90',
    });
    expect(overCount({ awarded: 92, max: 90 })).toBe(true);
  });

  it('one mark over is enough', () => {
    expect(paperTotalText({ awarded: 91, max: 90 }).score).toBe('91 of 90');
  });

  it('a paper with no usable total is never over-count — there is nothing to be over', () => {
    expect(overCount({ awarded: 5, max: 0 })).toBe(false);
    expect(overCount({ awarded: 5, max: NaN })).toBe(false);
    expect(paperTotalText({ awarded: 5, max: 0 })).toEqual({ label: 'PAPER TOTAL', score: '5 / 0' });
  });
});
