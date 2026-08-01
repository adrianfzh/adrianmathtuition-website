import { describe, expect, it } from 'vitest';
import { hitStrokes, strokeHit } from './hit-test';
import type { Stroke } from './types';

const stroke = (points: [number, number][], width = 4): Stroke => ({
  tool: 'pen', color: '#dc2626', width,
  points: points.map(([x, y]) => ({ x, y, p: 0.5 })),
});

describe('strokeHit', () => {
  const horizontal = stroke([[0, 0], [100, 0]], 4);

  it('hits the middle of a segment', () => {
    expect(strokeHit(horizontal, 50, 3, 6)).toBe(true);
  });
  it('misses outside tolerance + half width', () => {
    // reach = 6 + 2 = 8 → 9px away misses
    expect(strokeHit(horizontal, 50, 9, 6)).toBe(false);
    expect(strokeHit(horizontal, 50, 7.9, 6)).toBe(true);
  });
  it('tolerance scales with stroke width', () => {
    const fat = stroke([[0, 0], [100, 0]], 20);
    // reach = 6 + 10 = 16
    expect(strokeHit(fat, 50, 15, 6)).toBe(true);
    expect(strokeHit(horizontal, 50, 15, 6)).toBe(false);
  });
  it('handles single-point strokes (a dot)', () => {
    const dot = stroke([[10, 10]], 4);
    expect(strokeHit(dot, 13, 10, 2)).toBe(true);
    expect(strokeHit(dot, 20, 10, 2)).toBe(false);
  });
  it('never hits an empty stroke', () => {
    expect(strokeHit(stroke([]), 0, 0, 100)).toBe(false);
  });
});

describe('hitStrokes', () => {
  it('returns hits topmost (most recent) first', () => {
    const strokes = [
      stroke([[0, 0], [100, 0]]),   // 0 — under
      stroke([[50, -50], [50, 50]]), // 1 — crosses at (50,0), drawn later
    ];
    expect(hitStrokes(strokes, 50, 0, 4)).toEqual([1, 0]);
  });
  it('returns [] when nothing is near', () => {
    expect(hitStrokes([stroke([[0, 0], [10, 0]])], 500, 500, 4)).toEqual([]);
  });
});
