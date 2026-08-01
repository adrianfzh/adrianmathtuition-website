import { describe, expect, it } from 'vitest';
import { outlineToPath, strokeOutline } from './ink-outline';
import type { StrokePoint } from './types';

const line = (p: number, n = 20): StrokePoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0, p }));

const bboxHeight = (outline: number[][]) => {
  const ys = outline.map((pt) => pt[1]);
  return Math.max(...ys) - Math.min(...ys);
};

describe('strokeOutline', () => {
  it('is deterministic — same stroke, same polygon', () => {
    const a = strokeOutline(line(0.7), 6);
    const b = strokeOutline(line(0.7), 6);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(4);
  });
  it('pressure visibly widens pen strokes', () => {
    const light = bboxHeight(strokeOutline(line(0.2), 6));
    const heavy = bboxHeight(strokeOutline(line(0.9), 6));
    expect(heavy).toBeGreaterThan(light * 1.3);
  });
  it('highlighter width ignores pressure (uniform ribbon)', () => {
    const light = bboxHeight(strokeOutline(line(0.2), 14, 'highlighter'));
    const heavy = bboxHeight(strokeOutline(line(0.9), 14, 'highlighter'));
    expect(Math.abs(heavy - light)).toBeLessThan(1);
  });
  it('handles degenerate inputs without crashing', () => {
    expect(strokeOutline([], 6)).toEqual([]);
    expect(Array.isArray(strokeOutline([{ x: 5, y: 5, p: 0.5 }], 6))).toBe(true);
    expect(Array.isArray(strokeOutline(line(0.5, 2), 6))).toBe(true);
  });
});

describe('outlineToPath', () => {
  it('builds a closed SVG path', () => {
    const d = outlineToPath([[0, 0], [10, 0], [10, 10]]);
    expect(d.startsWith('M0.00 0.00')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
  it('returns empty for degenerate outlines', () => {
    expect(outlineToPath([])).toBe('');
    expect(outlineToPath([[1, 1]])).toBe('');
  });
});
