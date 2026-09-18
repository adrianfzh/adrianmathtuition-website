import { describe, it, expect } from 'vitest';
import { toImagePoint, toolWidth, hitStrokes, addStroke, removeStrokes, isAccident } from './inline-ink';
import type { Stroke } from './annotate/types';

const nat = { w: 1600, h: 2260 };
const pen = (pts: [number, number][]): Stroke => ({ tool: 'pen', color: '#2563eb', width: 4, points: pts.map(([x, y]) => ({ x, y, p: 0.5 })) });

describe('inline ink', () => {
  it('maps a screen point to page-image pixels, whatever size the page is drawn at', () => {
    const rect = { left: 100, top: 50, width: 800, height: 1130 };
    expect(toImagePoint(500, 615, rect, nat)).toEqual({ x: 800, y: 1130, p: 0.5 });
    expect(toImagePoint(0, 0, rect, nat)).toMatchObject({ x: 0, y: 0 });        // clamped to the page
    expect(toImagePoint(5000, 5000, rect, nat)).toMatchObject({ x: 1600, y: 2260 });
  });
  it('tool widths follow the page width; the highlighter is the broad one', () => {
    expect(toolWidth('pen', nat)).toBeCloseTo(3.8, 1);
    expect(toolWidth('hl', nat)).toBeGreaterThan(toolWidth('pen', nat) * 4);
    expect(toolWidth('pen', { w: 3200, h: 4520 })).toBeCloseTo(7.7, 1);
  });
  it('the eraser hits a stroke along its segments, not only at its points', () => {
    const s = [pen([[100, 100], [500, 100]]), pen([[100, 400], [500, 400]])];
    expect(hitStrokes(s, 300, 104, 10)).toEqual([0]);   // mid-segment, no point within reach
    expect(hitStrokes(s, 300, 250, 10)).toEqual([]);
    expect(hitStrokes(s, 100, 400, 10)).toEqual([1]);
  });
  it('adding keeps the page size; erasing the last stroke removes the page', () => {
    const a = addStroke({}, 2, pen([[1, 1], [50, 50]]), nat);
    expect(a[2]).toMatchObject({ w: 1600, h: 2260 });
    expect(a[2].strokes).toHaveLength(1);
    expect(removeStrokes(a, 2, [0])).toEqual({});
    expect(removeStrokes(a, 2, [])).toBe(a);
  });
  it('a tap or a palm graze is not a stroke', () => {
    expect(isAccident([{ x: 10, y: 10, p: 0.5 }], nat)).toBe(true);
    expect(isAccident([{ x: 10, y: 10, p: 0.5 }, { x: 11, y: 11, p: 0.5 }], nat)).toBe(true);
    expect(isAccident([{ x: 10, y: 10, p: 0.5 }, { x: 40, y: 30, p: 0.5 }], nat)).toBe(false);
  });
});
