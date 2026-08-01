import { describe, expect, it } from 'vitest';
import {
  angleDiff, dist, maxChordDeviation, pathLength, pointLineDistance,
  pointSegmentDistance, rdpSimplify, resampleByArcLength,
} from './stroke-geometry';

describe('pathLength', () => {
  it('sums segment lengths', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 14 }])).toBeCloseTo(15);
  });
  it('is 0 for fewer than 2 points', () => {
    expect(pathLength([])).toBe(0);
    expect(pathLength([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe('pointSegmentDistance', () => {
  it('uses perpendicular distance beside the segment', () => {
    expect(pointSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
  });
  it('clamps to the nearest endpoint past the ends', () => {
    expect(pointSegmentDistance({ x: 14, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
  });
  it('degenerates to point distance for zero-length segments', () => {
    expect(pointSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5);
  });
});

describe('pointLineDistance', () => {
  it('ignores segment bounds (infinite line)', () => {
    expect(pointLineDistance({ x: 25, y: 7 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(7);
  });
});

describe('maxChordDeviation', () => {
  it('finds the apex of a triangle path', () => {
    expect(maxChordDeviation([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }])).toBeCloseTo(20);
  });
  it('is 0 for 2 points', () => {
    expect(maxChordDeviation([{ x: 0, y: 0 }, { x: 9, y: 9 }])).toBe(0);
  });
});

describe('rdpSimplify', () => {
  it('drops small wobble but keeps real corners', () => {
    // An L shape with 1px wobble along each arm.
    const pts = [];
    for (let x = 0; x <= 100; x += 5) pts.push({ x, y: x % 10 === 0 ? 0 : 1 });
    for (let y = 5; y <= 100; y += 5) pts.push({ x: 100, y: y % 10 === 0 ? y : y + 1 });
    const out = rdpSimplify(pts, 3);
    expect(out.length).toBeLessThanOrEqual(4);
    // The corner at (100, ~0) survives.
    expect(out.some((p) => p.x === 100 && p.y <= 1)).toBe(true);
  });
  it('keeps endpoints untouched', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }];
    const out = rdpSimplify(pts, 10);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 2, y: 0 });
  });
});

describe('resampleByArcLength', () => {
  it('returns n points, evenly spaced, endpoints kept', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const out = resampleByArcLength(pts, 5);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[4]).toEqual({ x: 10, y: 10 });
    for (let i = 1; i < out.length; i++) {
      expect(dist(out[i - 1], out[i])).toBeCloseTo(5, 5);
    }
  });
});

describe('angleDiff', () => {
  it('wraps around 2π', () => {
    expect(angleDiff(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(0.2);
  });
  it('caps at π', () => {
    expect(angleDiff(0, Math.PI)).toBeCloseTo(Math.PI);
  });
});
