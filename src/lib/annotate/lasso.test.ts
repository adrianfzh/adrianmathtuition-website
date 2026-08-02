import { describe, expect, it } from 'vitest';
import { lassoSelect, pointInPolygon, strokesBBox } from './lasso';
import type { Stroke } from './types';

const square = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];

const strokeAt = (points: [number, number][], extra?: Partial<Stroke>): Stroke => ({
  tool: 'pen', color: '#dc2626', width: 2,
  points: points.map(([x, y]) => ({ x, y, p: 0.5 })),
  ...extra,
});

describe('pointInPolygon', () => {
  const poly = square(0, 0, 10, 10);
  it('inside / outside / handles concavity direction', () => {
    expect(pointInPolygon(5, 5, poly)).toBe(true);
    expect(pointInPolygon(15, 5, poly)).toBe(false);
    expect(pointInPolygon(-1, -1, poly)).toBe(false);
  });
});

describe('lassoSelect', () => {
  const inside = strokeAt([[20, 20], [30, 25], [40, 20]]);
  const outside = strokeAt([[200, 200], [220, 210]]);
  const halfIn = strokeAt(Array.from({ length: 10 }, (_, i) => [i * 10, 50] as [number, number]));

  it('captures a stroke inside the loop, ignores one outside', () => {
    expect(lassoSelect([inside, outside], square(10, 10, 60, 60))).toEqual([0]);
  });
  it('a stroke half-inside is selected at the 50% rule', () => {
    // Points at x = 0..90; lasso covers x ≤ 46 → 5 of 10 inside.
    expect(lassoSelect([halfIn], square(-5, 40, 46, 60))).toEqual([0]);
    // Cover only 3 of 10 → not selected.
    expect(lassoSelect([halfIn], square(-5, 40, 26, 60))).toEqual([]);
  });
  it('selects a sparse 2-point snapped line crossing the loop (sampling)', () => {
    const line = strokeAt([[0, 50], [100, 50]], { snapped: 'line' });
    expect(lassoSelect([line], square(30, 30, 70, 70))).toEqual([]);
    // Loop covering the middle 60% catches it.
    expect(lassoSelect([line], square(15, 30, 85, 70))).toEqual([0]);
  });
  it('degenerate lasso selects nothing', () => {
    expect(lassoSelect([inside], [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
  });
});

describe('strokesBBox', () => {
  it('spans all points of all strokes', () => {
    const bb = strokesBBox([strokeAt([[10, 20], [30, 5]]), strokeAt([[0, 40]])])!;
    expect(bb).toEqual({ minX: 0, minY: 5, maxX: 30, maxY: 40 });
  });
  it('null for nothing', () => {
    expect(strokesBBox([])).toBeNull();
  });
});
