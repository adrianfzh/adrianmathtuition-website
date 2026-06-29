import { describe, it, expect } from 'vitest';
import { quadratic, linear2 } from '../solve';

const res = (rs: { re: number }[]) => rs.map((r) => r.re).sort((a, b) => a - b);

describe('solve.quadratic', () => {
  it('two real roots', () => {
    expect(res(quadratic(1, -5, 6))).toEqual([2, 3]); // (x-2)(x-3)
  });
  it('complex roots have ±imaginary parts', () => {
    const rs = quadratic(1, 0, 1); // x² + 1 = 0  → ±i
    expect(rs.map((r) => r.re)).toEqual([0, 0]);
    expect(rs.map((r) => r.im).sort((a, b) => a - b)).toEqual([-1, 1]);
  });
});

describe('solve.linear2', () => {
  it('solves a 2x2 system', () => {
    // x + y = 5 ; x - y = 1  → x=3, y=2
    expect(linear2(1, 1, 5, 1, -1, 1)).toEqual({ x: 3, y: 2 });
  });
  it('returns null for a singular system', () => {
    expect(linear2(1, 1, 5, 2, 2, 9)).toBeNull();
  });
});
