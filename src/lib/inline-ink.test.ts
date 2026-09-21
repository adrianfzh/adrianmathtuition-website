import { describe, it, expect } from 'vitest';
import { toImagePoint, toolWidth, hitStrokes, addStroke, removeStrokes, isAccident } from './inline-ink';
import * as I from './inline-ink';
import type { Stroke } from './annotate/types';
import type { InkPages } from './student-ink';

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

describe('inline ink — colours, hold-to-snap, double-tap, undo/redo (22 Sep 2026)', () => {
  const nat = { w: 1000, h: 1414 };
  const pt = (x: number, y: number) => ({ x, y, p: 0.5 });
  it('a stored colour is honoured only from the palette', () => {
    expect(I.paletteColor('pen', '#DC2626')).toBe('#dc2626');
    expect(I.paletteColor('pen', '#123456')).toBe(I.PEN_COLOR_DEFAULT);
    expect(I.paletteColor('hl', null)).toBe(I.HL_COLOR_DEFAULT);
    expect(I.paletteColor('hl', '#4ade80')).toBe('#4ade80');
  });
  it('a held, roughly straight stroke snaps to a two-point line; a dot never snaps', () => {
    const wobbly = Array.from({ length: 30 }, (_, i) => pt(100 + i * 10, 200 + (i % 3) * 1.5));
    const snapped = I.snapHeldStroke(wobbly, nat);
    expect(snapped?.snapped).toBe('line');
    expect(snapped?.points.length).toBe(2);
    expect(I.snapHeldStroke([pt(100, 100), pt(103, 101), pt(105, 100), pt(106, 102), pt(107, 101), pt(108, 100), pt(109, 101), pt(110, 100)], nat)).toBeNull();
  });
  it('a hand-drawn circle snaps to an ellipse', () => {
    const circle = Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * Math.PI * 2; return pt(500 + 120 * Math.cos(a) + (i % 2) * 2, 500 + 118 * Math.sin(a)); });
    circle.push(circle[0]);
    expect(I.snapHeldStroke(circle, nat)?.snapped).toBe('ellipse');
  });
  it('heldStill is true only while the pen stays within the still radius', () => {
    const still = [pt(10, 10), pt(11, 10), pt(11, 11), pt(10, 11)];
    expect(I.heldStill(still, 0, nat)).toBe(true);
    expect(I.heldStill([...still, pt(30, 30)], 0, nat)).toBe(false);
    expect(I.heldStill(still, 9, nat)).toBe(false);
  });
  it('two Pencil taps close together in time and place are a double-tap', () => {
    expect(I.isDoubleTap({ x: 100, y: 100, at: 1000 }, { x: 105, y: 102 }, 1250, nat)).toBe(true);
    expect(I.isDoubleTap({ x: 100, y: 100, at: 1000 }, { x: 105, y: 102 }, 1400, nat)).toBe(false);
    expect(I.isDoubleTap({ x: 100, y: 100, at: 1000 }, { x: 140, y: 100 }, 1100, nat)).toBe(false);
    expect(I.isDoubleTap(null, { x: 100, y: 100 }, 1100, nat)).toBe(false);
  });
  it('undo steps back, redo steps forward, and a new change clears the redo pile', () => {
    const a: InkPages = {}, b: InkPages = { 0: { strokes: [], w: 1, h: 1 } }, c: InkPages = { 1: { strokes: [], w: 1, h: 1 } };
    let h = I.emptyHistory();
    h = I.pushHistory(h, a);           // now at b
    h = I.pushHistory(h, b);           // now at c
    const u1 = I.undoInk(h, c)!; expect(u1.ink).toBe(b); expect(u1.history.future).toEqual([c]);
    const u2 = I.undoInk(u1.history, b)!; expect(u2.ink).toBe(a);
    expect(I.undoInk(u2.history, a)).toBeNull();
    const r1 = I.redoInk(u2.history, a)!; expect(r1.ink).toBe(b);
    const r2 = I.redoInk(r1.history, b)!; expect(r2.ink).toBe(c);
    expect(I.redoInk(r2.history, c)).toBeNull();
    const fresh = I.pushHistory(u1.history, b); expect(fresh.future).toEqual([]);
  });
});
