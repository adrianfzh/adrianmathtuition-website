import { describe, it, expect } from 'vitest';
import { normalcdf, normalpdf, invNorm, binompdf } from '../stats';

describe('stats — normal distribution', () => {
  it('normalcdf over ±1 sd ≈ 0.6827', () => {
    expect(normalcdf(-1, 1, 0, 1)).toBeCloseTo(0.6827, 3);
  });
  it('normalcdf below the mean ≈ 0.5', () => {
    expect(normalcdf(-1e12, 0, 0, 1)).toBeCloseTo(0.5, 4);
  });
  it('normalpdf peak ≈ 0.3989', () => {
    expect(normalpdf(0, 0, 1)).toBeCloseTo(0.3989, 4);
  });
  it('invNorm(0.975) ≈ 1.96', () => {
    expect(invNorm(0.975, 0, 1)).toBeCloseTo(1.96, 2);
  });
});

describe('stats — binomial', () => {
  it('binompdf(10, 0.5, 5) ≈ 0.2461', () => {
    expect(binompdf(10, 0.5, 5)).toBeCloseTo(0.2461, 4);
  });
});
