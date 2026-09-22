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
  it('any real hex colour is honoured (the whole grid + the wheel since 23 Sep 2026); junk falls back to the default', () => {
    expect(I.paletteColor('pen', '#DC2626')).toBe('#dc2626');
    expect(I.paletteColor('pen', '#123456')).toBe('#123456');
    expect(I.paletteColor('pen', '#abc')).toBe('#aabbcc');
    expect(I.paletteColor('pen', 'red')).toBe(I.PEN_COLOR_DEFAULT);
    expect(I.paletteColor('pen', '#12345')).toBe(I.PEN_COLOR_DEFAULT);
    expect(I.paletteColor('hl', null)).toBe(I.HL_COLOR_DEFAULT);
    expect(I.paletteColor('hl', '#4ade80')).toBe('#4ade80');
  });
  it('the colour grid is 12 wide, greys first, every cell a hex; recents are unique, newest first, capped', () => {
    expect(I.COLOR_GRID.length).toBe(6);
    for (const row of I.COLOR_GRID) { expect(row.length).toBe(12); for (const c of row) expect(c).toMatch(/^#[0-9a-f]{6}$/); }
    expect(I.COLOR_GRID[0][0]).toBe('#ffffff');
    expect(I.COLOR_GRID[0][11]).toBe('#000000');
    expect(I.hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(I.hslToHex(120, 100, 25)).toBe('#008000');
    let r = I.rememberColor([], '#123456');
    r = I.rememberColor(r, '#abcdef'); r = I.rememberColor(r, '#123456');
    expect(r).toEqual(['#123456', '#abcdef']);
    for (let i = 0; i < 20; i++) r = I.rememberColor(r, `#0000${i.toString(16).padStart(2, '0')}`);
    expect(r.length).toBe(I.RECENT_COLORS_MAX);
    expect(I.recentColors('not json')).toEqual([]);
    expect(I.recentColors('["#ABCDEF", "nope", 3]')).toEqual(['#abcdef']);
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

describe('inline ink — sizes, the partial eraser, the toolbar under zoom (22 Sep 2026)', () => {
  const nat = { w: 1600, h: 2260 };
  it('sizes scale the width; M is the old width; a stale stored size falls back to M', () => {
    expect(I.toolWidth('pen', nat, 'M')).toBe(I.toolWidth('pen', nat));
    expect(I.toolWidth('pen', nat, 'S')).toBeLessThan(I.toolWidth('pen', nat, 'M'));
    expect(I.toolWidth('hl', nat, 'L')).toBeGreaterThan(I.toolWidth('hl', nat, 'M'));
    expect(I.sizeChoice('L')).toBe('L');
    expect(I.sizeChoice('XL')).toBe('M');
    expect(I.sizeChoice(null)).toBe('M');
  });
  it('the eraser radius grows with the size and with how small the page is drawn', () => {
    expect(I.eraserRadius('M', nat, 800)).toBeCloseTo(28, 5);
    expect(I.eraserRadius('L', nat, 800)).toBeGreaterThan(I.eraserRadius('M', nat, 800));
    expect(I.eraserRadius('M', nat, 400)).toBeCloseTo(56, 5);
  });
  it('the eraser cuts a stroke where it touches and keeps both ends', () => {
    const line = { tool: 'pen' as const, color: '#000', width: 4, points: [{ x: 0, y: 100, p: 0.5 }, { x: 200, y: 100, p: 0.5 }] };
    const pages = I.addStroke({}, 0, line, nat);
    const out = I.eraseAt(pages, 0, 100, 100, 10);
    expect(out).not.toBe(pages);
    expect(out[0].strokes).toHaveLength(2);
    expect(Math.max(...out[0].strokes[0].points.map(p => p.x))).toBeLessThan(95);
    expect(Math.min(...out[0].strokes[1].points.map(p => p.x))).toBeGreaterThan(105);
  });
  it('a miss returns the same object; a typed note goes whole; a tiny stroke fully under the eraser goes', () => {
    const note = { tool: 'pen' as const, color: '#000', width: 4, points: [{ x: 50, y: 50, p: 0.5 }], text: 'hi' };
    const dot = { tool: 'pen' as const, color: '#000', width: 4, points: [{ x: 300, y: 300, p: 0.5 }, { x: 302, y: 300, p: 0.5 }] };
    let pages = I.addStroke(I.addStroke({}, 0, note, nat), 0, dot, nat);
    expect(I.eraseAt(pages, 0, 900, 900, 10)).toBe(pages);
    pages = I.eraseAt(pages, 0, 50, 50, 10);
    expect(pages[0].strokes).toHaveLength(1);
    expect(pages[0].strokes[0].text).toBeUndefined();
    pages = I.eraseAt(pages, 0, 301, 300, 10);
    expect(pages[0]).toBeUndefined();
  });
  it('the toolbar is placed by CSS until a pinch zoom, then pinned to the visual viewport at 1/scale', () => {
    expect(I.toolbarPlacement({ scale: 1, offsetLeft: 0, offsetTop: 0, width: 390, height: 844 }, 20)).toBeNull();
    expect(I.toolbarPlacement(null, 20)).toBeNull();
    const p = I.toolbarPlacement({ scale: 2, offsetLeft: 100, offsetTop: 300, width: 195, height: 422 }, 20);
    expect(p).toEqual({ left: 197.5, top: 712, scale: 0.5 });
  });

  describe('the lasso (23 Sep 2026)', () => {
    const pt = (x: number, y: number) => ({ x, y, p: 0.5 });
    const line = (x: number, y: number, color = '#2563eb'): Stroke => ({ tool: 'pen', color, width: 3, points: [pt(x, y), pt(x + 40, y)] });
    const pages: InkPages = { 0: { w: 1000, h: 1414, strokes: [line(100, 100), line(500, 500), line(120, 130)] } };
    const loop = [{ x: 80, y: 80 }, { x: 200, y: 80 }, { x: 200, y: 160 }, { x: 80, y: 160 }];
    it('selects the strokes inside the loop and boxes them', () => {
      const sel = I.selectByLasso(pages, 0, loop);
      expect(sel).toEqual({ index: 0, ids: [0, 2] });
      expect(I.selectionBox(pages, sel)).toEqual({ minX: 100, minY: 100, maxX: 160, maxY: 130 });
      expect(I.selectByLasso(pages, 0, [{ x: 900, y: 900 }, { x: 950, y: 900 }, { x: 950, y: 950 }])).toBeNull();
      expect(I.selectByLasso(pages, 3, loop)).toBeNull();
      expect(I.inBox(I.selectionBox(pages, sel), 165, 131, 10)).toBe(true);
      expect(I.inBox(I.selectionBox(pages, sel), 300, 300, 10)).toBe(false);
    });
    it('moves, recolours, deletes and duplicates only the selection; a no-op returns the same object', () => {
      const sel = { index: 0, ids: [0, 2] };
      const moved = I.moveSelected(pages, sel, 10, -5);
      expect(moved[0].strokes[0].points[0]).toEqual({ x: 110, y: 95, p: 0.5 });
      expect(moved[0].strokes[1]).toBe(pages[0].strokes[1]);
      expect(I.moveSelected(pages, sel, 0, 0)).toBe(pages);
      const red = I.recolorSelected(pages, sel, '#dc2626');
      expect(red[0].strokes.map(s => s.color)).toEqual(['#dc2626', '#2563eb', '#dc2626']);
      expect(I.recolorSelected(pages, sel, 'red')).toBe(pages);
      const gone = I.deleteSelected(pages, sel);
      expect(gone[0].strokes.length).toBe(1);
      expect(I.deleteSelected(pages, { index: 0, ids: [0, 1, 2] })[0]).toBeUndefined();
      const dup = I.duplicateSelected(pages, sel);
      expect(dup.pages[0].strokes.length).toBe(5);
      expect(dup.selection).toEqual({ index: 0, ids: [3, 4] });
      expect(dup.pages[0].strokes[3].points[0].x).toBe(130);
    });
  });
  it('the pointer trail keeps the last TRAIL_MS of points, fading from tip to tail', () => {
    const trail = [{ x: 0, y: 0, t: 0 }, { x: 10, y: 0, t: 300 }, { x: 20, y: 0, t: 600 }];
    const alive = I.trailAlive(trail, 600);
    expect(alive.map(p => p.x)).toEqual([10, 20]);
    expect(alive[1].a).toBe(1);
    expect(alive[0].a).toBeCloseTo(1 - 300 / I.TRAIL_MS, 5);
    expect(I.trailAlive(trail, 2000)).toEqual([]);
  });
});
