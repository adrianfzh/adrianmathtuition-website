import { describe, it, expect } from 'vitest';
import { isScribble, reversals, scribbleTargets } from './scribble';
import type { Stroke } from './types';

const zigzag = (x0: number, x1: number, y: number, passes: number, drift = 6, n = 14) => {
  const pts: { x: number; y: number }[] = [];
  for (let p = 0; p < passes; p++) for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push({ x: p % 2 ? x1 - (x1 - x0) * t : x0 + (x1 - x0) * t, y: y + p * drift + Math.sin(i) * 1.5 });
  }
  return pts;
};
const line = (x0: number, y0: number, x1: number, y1: number, n = 30) => Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y: y0 + ((y1 - y0) * i) / (n - 1) }));
const stroke = (points: { x: number; y: number }[]): Stroke => ({ tool: 'pen', color: '#dc2626', width: 3, points: points.map((p) => ({ ...p, p: 0.5 })) } as Stroke);

// 7 Oct 2026, Adrian: "how about scribble with the pen as the eraser, like how one uses the eraser to erase"
describe('a rubbing zigzag', () => {
  it('six passes back and forth is a scribble; so is a vertical one', () => {
    expect(isScribble(zigzag(100, 220, 300, 6), 24)).toBe(true);
    expect(isScribble(zigzag(100, 220, 300, 6).map((p) => ({ x: p.y, y: p.x })), 24)).toBe(true);
    expect(reversals(zigzag(100, 220, 300, 6))).toBe(5);
  });
  it('writing is not: a line, a tick, an underline drawn twice, a wavy line, a circle', () => {
    expect(isScribble(line(100, 300, 400, 300), 24)).toBe(false);
    expect(isScribble([...line(100, 300, 120, 330, 10), ...line(120, 330, 180, 250, 20)], 24)).toBe(false);          // a tick
    expect(isScribble(zigzag(100, 300, 300, 2), 24)).toBe(false);                                                  // there and back
    expect(isScribble(Array.from({ length: 80 }, (_, i) => ({ x: 100 + i * 4, y: 300 + Math.sin(i / 3) * 12 })), 24)).toBe(false);   // a wave that keeps going right
    expect(isScribble(Array.from({ length: 60 }, (_, i) => ({ x: 200 + 50 * Math.cos(i / 9), y: 300 + 50 * Math.sin(i / 9) })), 24)).toBe(false);
  });
  it('a tiny zigzag (a letter-sized wiggle) is not', () => {
    expect(isScribble(zigzag(100, 112, 300, 6, 1), 24)).toBe(false);
  });
});

describe('what it rubs out', () => {
  const page = [stroke(line(110, 310, 210, 312)), stroke(line(110, 500, 210, 500)), stroke(line(400, 310, 500, 310))];
  it('the ink under the zigzag, and nothing else on the page', () => {
    expect(scribbleTargets(page, zigzag(100, 220, 300, 6), 8)).toEqual([0]);
  });
  it('a zigzag over blank paper lands on nothing — the overlay then keeps it as ink', () => {
    expect(scribbleTargets(page, zigzag(100, 220, 700, 6), 8)).toEqual([]);
  });
  it('a long line that only passes near the edge of the patch is left alone unless the zigzag crosses it', () => {
    const long = [stroke(line(0, 400, 800, 400))];
    expect(scribbleTargets(long, zigzag(100, 220, 300, 6), 8)).toEqual([]);
    expect(scribbleTargets(long, zigzag(100, 220, 385, 6), 8)).toEqual([0]);
  });
});
