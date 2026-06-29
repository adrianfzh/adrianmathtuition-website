import { describe, it, expect } from 'vitest';
import { derivative, integral, findZero } from '../calc';

describe('calc — numeric calculus', () => {
  it("derivative of x² at x=3 ≈ 6", () => {
    expect(derivative((x) => x * x, 3)).toBeCloseTo(6, 4);
  });
  it('integral of x² from 0 to 3 ≈ 9', () => {
    expect(integral((x) => x * x, 0, 3)).toBeCloseTo(9, 4);
  });
  it('findZero of x²−4 on [0,5] ≈ 2', () => {
    expect(findZero((x) => x * x - 4, 0, 5)).toBeCloseTo(2, 4);
  });
});
