import { describe, expect, it } from 'vitest';
import { densifyPoints, splitStrokeAtCircle, PARTIAL_REACH_FACTOR } from './stroke-split';
import type { Stroke } from './types';

const hline = (x0: number, x1: number, step = 2, width = 2): Stroke => {
  const points = [];
  for (let x = x0; x <= x1; x += step) points.push({ x, y: 0, p: 0.5 });
  return { tool: 'pen', color: '#dc2626', width, points };
};

describe('densifyPoints', () => {
  it('fills long gaps and keeps originals + lerped pressure', () => {
    const out = densifyPoints([{ x: 0, y: 0, p: 0 }, { x: 10, y: 0, p: 1 }], 2.5);
    expect(out.length).toBeGreaterThanOrEqual(5);
    expect(out[0]).toEqual({ x: 0, y: 0, p: 0 });
    expect(out[out.length - 1]).toEqual({ x: 10, y: 0, p: 1 });
    const mid = out[Math.floor(out.length / 2)];
    expect(mid.p).toBeGreaterThan(0.2);
    expect(mid.p).toBeLessThan(0.8);
  });
});

describe('splitStrokeAtCircle', () => {
  it('erasing the middle splits into two pieces trimmed at the rim', () => {
    const pieces = splitStrokeAtCircle(hline(0, 100), 50, 0, 5)!;
    expect(pieces).toHaveLength(2);
    const reach = 5 + 2 * PARTIAL_REACH_FACTOR;
    const leftEnd = pieces[0].points[pieces[0].points.length - 1];
    const rightStart = pieces[1].points[0];
    expect(Math.abs(50 - leftEnd.x)).toBeCloseTo(reach, 0);
    expect(Math.abs(rightStart.x - 50)).toBeCloseTo(reach, 0);
  });
  it('erasing an end trims to one piece', () => {
    const pieces = splitStrokeAtCircle(hline(0, 100), 0, 0, 6)!;
    expect(pieces).toHaveLength(1);
    expect(pieces[0].points[0].x).toBeGreaterThan(4);
  });
  it('covering the whole stroke erases it entirely', () => {
    expect(splitStrokeAtCircle(hline(0, 10), 5, 0, 30)).toEqual([]);
  });
  it('a miss returns null (stroke untouched)', () => {
    expect(splitStrokeAtCircle(hline(0, 100), 50, 40, 5)).toBeNull();
  });
  it('splits a sparse 2-point SNAPPED line through its middle (densification)', () => {
    const line: Stroke = {
      tool: 'pen', color: '#111', width: 2, snapped: 'line',
      points: [{ x: 0, y: 0, p: 0.6 }, { x: 100, y: 0, p: 0.6 }],
    };
    const pieces = splitStrokeAtCircle(line, 50, 0, 5)!;
    expect(pieces).toHaveLength(2);
    // Pieces are open freehand paths now, not shapes.
    expect(pieces.every((p) => !p.snapped)).toBe(true);
  });
  it('drops dust pieces shorter than the minimum', () => {
    // Erase just inside one end: the outer sliver is dust and disappears.
    const pieces = splitStrokeAtCircle(hline(0, 100), 4, 0, 3)!;
    expect(pieces).toHaveLength(1);
    expect(pieces[0].points[0].x).toBeGreaterThan(6);
  });
  it('keeps tool, colour and width on the pieces', () => {
    const hl: Stroke = { ...hline(0, 100), tool: 'highlighter', color: '#facc15', width: 14 };
    const pieces = splitStrokeAtCircle(hl, 50, 0, 5)!;
    expect(pieces.every((p) => p.tool === 'highlighter' && p.color === '#facc15' && p.width === 14)).toBe(true);
  });
});
