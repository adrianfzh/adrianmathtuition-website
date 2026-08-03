import { describe, expect, it } from 'vitest';
import { outlineToPath, smoothPoints, strokeOutline } from './ink-outline';
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
  it('pressure barely affects pen width — near-uniform, Notability-like (3 Aug 2026)', () => {
    // thinning 0.6 made 60% of the width ride on Pencil pressure and every stroke
    // came out wobbly ("my writing now looks shaky"). The pen is now close to
    // constant-width: still monotone in pressure, but bounded to a subtle range.
    const light = bboxHeight(strokeOutline(line(0.2), 6));
    const heavy = bboxHeight(strokeOutline(line(0.9), 6));
    expect(heavy).toBeGreaterThan(light);
    expect(heavy).toBeLessThan(light * 1.25);
  });
  it('hand tremor is smoothed out of the ink (smoothPoints)', () => {
    // Dense points like a real 240Hz Pencil (~2px apart), ±2px alternating tremor,
    // flat-ended (the anchored endpoints are exempt from smoothing by design).
    const jitter: StrokePoint[] = Array.from({ length: 100 }, (_, i) => ({
      x: i * 2, y: i < 3 || i > 96 ? 0 : (i % 2 ? 2 : -2), p: 0.5,
    }));
    const smoothed = smoothPoints(jitter);
    const interiorAmp = Math.max(...smoothed.slice(4, -4).map((pt) => Math.abs(pt.y)));
    expect(interiorAmp).toBeLessThan(0.6);   // ±2px of tremor survives as < ±0.6px
    // …while a letter-sized curve keeps most of its shape.
    const letter: StrokePoint[] = Array.from({ length: 100 }, (_, i) => ({
      x: i * 2, y: 12 * Math.sin((i * 2 * Math.PI) / 20), p: 0.5,
    }));
    const letterAmp = Math.max(...smoothPoints(letter).slice(4, -4).map((pt) => Math.abs(pt.y)));
    expect(letterAmp).toBeGreaterThan(9);
    // Endpoints stay pinned to the pen tip.
    expect(smoothPoints(letter)[0]).toEqual(letter[0]);
    expect(smoothPoints(letter)[99]).toEqual(letter[99]);
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
