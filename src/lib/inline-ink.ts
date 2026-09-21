// Write-anywhere ink on the paper page (18 Sep 2026, Adrian: "write on my paper
// is hard to use"): the pure pieces — where a touch lands in page-image pixels,
// how thick a tool draws on a page of a given size, which strokes an eraser
// touches, and the one history step an action pushes. The component
// (app/marking/StudentInk.tsx) only wires events to these.
import type { Stroke, StrokePoint } from './annotate/types';
import type { InkPages } from './student-ink';
import { fitStroke, shapeToPolyline } from './annotate/shape-fit';

export type Nat = { w: number; h: number };
export type InkTool = 'pen' | 'hl' | 'er';

/** A client point → page-image pixels, clamped to the page. */
export function toImagePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, nat: Nat, p = 0.5): StrokePoint {
  const fx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const fy = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  const c = (v: number) => Math.min(1, Math.max(0, v));
  return { x: Math.round(c(fx) * nat.w * 10) / 10, y: Math.round(c(fy) * nat.h * 10) / 10, p: p > 0 ? Math.min(1, p) : 0.5 };
}

/** Tool widths scale with the page so a note looks the same on a 1200 px and a 2400 px scan. */
export function toolWidth(tool: InkTool, nat: Nat): number {
  const w = Math.max(400, nat.w);
  return Math.round((tool === 'hl' ? w * 0.014 : w * 0.0024) * 10) / 10;
}

/** Indices of the strokes with any point within `radius` image px of (x, y). A typed note is hit at its anchor. */
export function hitStrokes(strokes: Stroke[], x: number, y: number, radius: number): number[] {
  const out: number[] = [];
  strokes.forEach((s, i) => {
    const r = radius + (s.width || 0) / 2;
    const r2 = r * r;
    // a fast stroke has points far apart — test the segments, not only the points
    for (let k = 0; k < s.points.length; k++) {
      const a = s.points[k], b = s.points[k + 1] ?? a;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
      const px = a.x + t * dx - x, py = a.y + t * dy - y;
      if (px * px + py * py <= r2) { out.push(i); return; }
    }
  });
  return out;
}

export function addStroke(pages: InkPages, index: number, stroke: Stroke, nat: Nat): InkPages {
  const cur = pages[index];
  return { ...pages, [index]: { strokes: [...(cur?.strokes ?? []), stroke], w: cur?.w || nat.w, h: cur?.h || nat.h } };
}

export function removeStrokes(pages: InkPages, index: number, idxs: number[]): InkPages {
  const cur = pages[index];
  if (!cur || !idxs.length) return pages;
  const drop = new Set(idxs);
  const strokes = cur.strokes.filter((_, i) => !drop.has(i));
  const next = { ...pages };
  if (strokes.length) next[index] = { ...cur, strokes }; else delete next[index];
  return next;
}

/** A stroke too short to be meant (a tap, a palm graze): under 2 points or shorter than ~0.3% of the page width. */
export function isAccident(points: StrokePoint[], nat: Nat): boolean {
  if (points.length < 2) return true;
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len < nat.w * 0.003;
}

// ── 22 Sep 2026 (Adrian: "select the different colours for the pen and highlighter …
// allow for redo … allow for snap to shapes … double tap to erase") ─────────────

/** The pen's palette — the first entry is the default for a student; Adrian's ink is the green. */
export const PEN_COLORS: readonly { hex: string; name: string }[] = [
  { hex: '#2563eb', name: 'Blue' },
  { hex: '#111827', name: 'Black' },
  { hex: '#dc2626', name: 'Red' },
  { hex: '#047857', name: 'Green' },
  { hex: '#7c3aed', name: 'Purple' },
  { hex: '#ea580c', name: 'Orange' },
];
/** The highlighter's palette — drawn at 38 % with multiply, so these are the bright originals. */
export const HL_COLORS: readonly { hex: string; name: string }[] = [
  { hex: '#facc15', name: 'Yellow' },
  { hex: '#4ade80', name: 'Green' },
  { hex: '#f472b6', name: 'Pink' },
  { hex: '#38bdf8', name: 'Blue' },
  { hex: '#fb923c', name: 'Orange' },
];
export const PEN_COLOR_DEFAULT = PEN_COLORS[0].hex;
export const HL_COLOR_DEFAULT = HL_COLORS[0].hex;

/** A stored colour choice is honoured only when it is in the palette (a stale key never paints an odd colour). */
export function paletteColor(tool: 'pen' | 'hl', stored: string | null | undefined): string {
  const pal = tool === 'hl' ? HL_COLORS : PEN_COLORS;
  const hit = pal.find(c => c.hex === (stored || '').toLowerCase());
  return hit ? hit.hex : pal[0].hex;
}

/** Draw-and-hold: the pen must sit still this long at the end of a stroke to snap it to a shape. */
export const HOLD_SNAP_MS = 500;
/** "Still" = every point in the hold window within this fraction of the page width of the first. */
export const HOLD_STILL_FRACTION = 0.006;
/** A stroke shorter than this fraction of the page width never snaps (a dot, a comma). */
export const SNAP_MIN_FRACTION = 0.02;

/**
 * The shape a held freehand stroke becomes — a clean line, rectangle or ellipse
 * from lib/annotate/shape-fit — or null to keep the freehand. Pure.
 */
export function snapHeldStroke(points: StrokePoint[], nat: Nat): { points: StrokePoint[]; snapped: NonNullable<Stroke['snapped']> } | null {
  const shape = fitStroke(points, { minLength: nat.w * SNAP_MIN_FRACTION });
  if (!shape) return null;
  return { points: shapeToPolyline(shape), snapped: shape.kind };
}

/** Has the pen been still since `sinceIndex`? (all later points within the still radius of that one) */
export function heldStill(points: StrokePoint[], sinceIndex: number, nat: Nat): boolean {
  if (sinceIndex < 0 || sinceIndex >= points.length) return false;
  const o = points[sinceIndex];
  const r = nat.w * HOLD_STILL_FRACTION;
  for (let i = sinceIndex + 1; i < points.length; i++) if (Math.hypot(points[i].x - o.x, points[i].y - o.y) > r) return false;
  return true;
}

/** Two Pencil taps within this long and this close are one double-tap. */
export const DOUBLE_TAP_MS = 350;
export const DOUBLE_TAP_FRACTION = 0.02;

/** Is a tap at (p, at) the second half of a double-tap after `prev`? */
export function isDoubleTap(prev: { x: number; y: number; at: number } | null, p: { x: number; y: number }, at: number, nat: Nat): boolean {
  if (!prev) return false;
  if (at - prev.at > DOUBLE_TAP_MS || at < prev.at) return false;
  return Math.hypot(p.x - prev.x, p.y - prev.y) <= nat.w * DOUBLE_TAP_FRACTION;
}

/** Undo / redo over whole-layer snapshots. A new change clears the redo pile. */
export type InkHistory = { past: InkPages[]; future: InkPages[] };
export type { InkPages };
export const HISTORY_MAX = 60;
export const emptyHistory = (): InkHistory => ({ past: [], future: [] });

export function pushHistory(h: InkHistory, before: InkPages): InkHistory {
  return { past: [...h.past.slice(-(HISTORY_MAX - 1)), before], future: [] };
}
export function undoInk(h: InkHistory, current: InkPages): { history: InkHistory; ink: InkPages } | null {
  if (!h.past.length) return null;
  const prev = h.past[h.past.length - 1];
  return { history: { past: h.past.slice(0, -1), future: [...h.future, current] }, ink: prev };
}
export function redoInk(h: InkHistory, current: InkPages): { history: InkHistory; ink: InkPages } | null {
  if (!h.future.length) return null;
  const next = h.future[h.future.length - 1];
  return { history: { past: [...h.past, current], future: h.future.slice(0, -1) }, ink: next };
}
