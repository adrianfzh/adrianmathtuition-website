// Write-anywhere ink on the paper page (18 Sep 2026, Adrian: "write on my paper
// is hard to use"): the pure pieces — where a touch lands in page-image pixels,
// how thick a tool draws on a page of a given size, which strokes an eraser
// touches, and the one history step an action pushes. The component
// (app/marking/StudentInk.tsx) only wires events to these.
import type { Stroke, StrokePoint } from './annotate/types';
import { lassoSelect, strokesBBox } from './annotate/lasso';
import type { InkPages } from './student-ink';
import { fitStroke, shapeToPolyline } from './annotate/shape-fit';
import { splitStrokeAtCircle } from './annotate/stroke-split';

export type Nat = { w: number; h: number };
/** Five tools since 23 Sep 2026: the lasso selects strokes to move / copy / recolour / delete; the pointer is a laser trail that is never saved. */
export type InkTool = 'pen' | 'hl' | 'er' | 'lasso' | 'pointer';
/** The tools that draw ink (the others select or point). */
export const DRAW_TOOLS: readonly InkTool[] = ['pen', 'hl'];
/** Three sizes per tool (22 Sep 2026, Adrian: "select different sizes for pen, highlighter and eraser"). */
export type InkSize = 'S' | 'M' | 'L';
export const INK_SIZES: readonly InkSize[] = ['S', 'M', 'L'];
export const INK_SIZE_DEFAULT: InkSize = 'M';
/** Stroke width multiplier per size — M is what every stroke drew before sizes existed. */
export const SIZE_FACTOR: Record<InkSize, number> = { S: 0.6, M: 1, L: 1.7 };
/** The eraser's reach in SCREEN px per size (the page's pixel scale is applied by the caller). */
export const ERASER_SCREEN_PX: Record<InkSize, number> = { S: 7, M: 14, L: 26 };
/** A stored size is honoured only when it is one of the three. */
export function sizeChoice(stored: string | null | undefined): InkSize {
  return (INK_SIZES as readonly string[]).includes(stored || '') ? (stored as InkSize) : INK_SIZE_DEFAULT;
}

/** A client point → page-image pixels, clamped to the page. */
export function toImagePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, nat: Nat, p = 0.5): StrokePoint {
  const fx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const fy = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  const c = (v: number) => Math.min(1, Math.max(0, v));
  return { x: Math.round(c(fx) * nat.w * 10) / 10, y: Math.round(c(fy) * nat.h * 10) / 10, p: p > 0 ? Math.min(1, p) : 0.5 };
}

/** Tool widths scale with the page so a note looks the same on a 1200 px and a 2400 px scan. */
export function toolWidth(tool: InkTool, nat: Nat, size: InkSize = 'M'): number {
  const w = Math.max(400, nat.w);
  return Math.round((tool === 'hl' ? w * 0.014 : w * 0.0024) * SIZE_FACTOR[size] * 10) / 10;
}

/** The eraser circle in page-image px: its screen size for `size`, scaled by how big the page is drawn. */
export function eraserRadius(size: InkSize, nat: Nat, drawnWidth: number): number {
  return ERASER_SCREEN_PX[size] * (nat.w / Math.max(1, drawnWidth));
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

/**
 * The eraser rubs out what is UNDER it, not the whole stroke (22 Sep 2026, Adrian:
 * "can eraser erase partially (not whole objects?)"): every touched freehand stroke is
 * cut at the circle and its surviving pieces stay; a typed note has no line to cut and
 * goes whole. Returns the same object when nothing is touched, so the caller can tell.
 */
export function eraseAt(pages: InkPages, index: number, x: number, y: number, radius: number): InkPages {
  const cur = pages[index];
  if (!cur) return pages;
  const hits = hitStrokes(cur.strokes, x, y, radius);
  if (!hits.length) return pages;
  const hit = new Set(hits);
  let changed = false;
  const strokes: Stroke[] = [];
  cur.strokes.forEach((s, i) => {
    if (!hit.has(i)) { strokes.push(s); return; }
    if (s.text) { changed = true; return; }
    const pieces = splitStrokeAtCircle(s, x, y, radius);
    if (pieces === null) { strokes.push(s); return; }
    changed = true;
    strokes.push(...pieces);
  });
  if (!changed) return pages;
  const next = { ...pages };
  if (strokes.length) next[index] = { ...cur, strokes }; else delete next[index];
  return next;
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

/** The pen's palette — the first entry is the default for a student; Adrian's ink is the green. Twelve since 22 Sep 2026. */
export const PEN_COLORS: readonly { hex: string; name: string }[] = [
  { hex: '#2563eb', name: 'Blue' },
  { hex: '#111827', name: 'Black' },
  { hex: '#dc2626', name: 'Red' },
  { hex: '#047857', name: 'Green' },
  { hex: '#7c3aed', name: 'Purple' },
  { hex: '#ea580c', name: 'Orange' },
  { hex: '#db2777', name: 'Pink' },
  { hex: '#0d9488', name: 'Teal' },
  { hex: '#0284c7', name: 'Sky' },
  { hex: '#4338ca', name: 'Indigo' },
  { hex: '#92400e', name: 'Brown' },
  { hex: '#6b7280', name: 'Grey' },
];
/** The highlighter's palette — drawn at 38 % with multiply, so these are the bright originals. Eight since 22 Sep 2026. */
export const HL_COLORS: readonly { hex: string; name: string }[] = [
  { hex: '#facc15', name: 'Yellow' },
  { hex: '#4ade80', name: 'Green' },
  { hex: '#f472b6', name: 'Pink' },
  { hex: '#38bdf8', name: 'Blue' },
  { hex: '#fb923c', name: 'Orange' },
  { hex: '#c084fc', name: 'Purple' },
  { hex: '#f87171', name: 'Red' },
  { hex: '#2dd4bf', name: 'Teal' },
];
export const PEN_COLOR_DEFAULT = PEN_COLORS[0].hex;
export const HL_COLOR_DEFAULT = HL_COLORS[0].hex;

/** A stored colour choice is honoured only when it is in the palette (a stale key never paints an odd colour). */
export function paletteColor(tool: 'pen' | 'hl', stored: string | null | undefined): string {
  const pal = tool === 'hl' ? HL_COLORS : PEN_COLORS;
  const hex = normalizeHex(stored);
  return hex ?? pal[0].hex;
}

// ── 23 Sep 2026 (Adrian: "colour picker that allows the whole suite of colours?") ──

/** `#rgb` or `#rrggbb` → lower-case `#rrggbb`; anything else → null. (Alpha is never stored: the highlighter's is fixed.) */
export function normalizeHex(v: unknown): string | null {
  const t = (typeof v === 'string' ? v : '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  if (/^#[0-9a-f]{3}$/.test(t)) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  return null;
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100, lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/** The full grid, Apple's shape: a greys row (white → black) over hue columns at five lightnesses (pale → deep). 12 columns × 6 rows. */
export const COLOR_GRID_COLUMNS = 12;
export const COLOR_GRID: readonly (readonly string[])[] = (() => {
  const greys = Array.from({ length: COLOR_GRID_COLUMNS }, (_, i) => hslToHex(0, 0, 100 - Math.round((i * 100) / (COLOR_GRID_COLUMNS - 1))));
  const hues = Array.from({ length: COLOR_GRID_COLUMNS }, (_, i) => i * (360 / COLOR_GRID_COLUMNS));
  const rows = [86, 72, 58, 45, 32].map(l => hues.map(h => hslToHex(h, l > 70 ? 80 : 75, l)));
  return [greys, ...rows];
})();

export const RECENT_COLORS_MAX = 8;
/** A colour picked from the wheel goes to the front of the recent row; the row never repeats and never exceeds the cap. */
export function rememberColor(recent: readonly string[], hex: string): string[] {
  const h = normalizeHex(hex); if (!h) return [...recent];
  return [h, ...recent.filter(c => c !== h)].slice(0, RECENT_COLORS_MAX);
}
export function recentColors(stored: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(stored || '[]');
    return Array.isArray(arr) ? arr.map(normalizeHex).filter((c): c is string => !!c).slice(0, RECENT_COLORS_MAX) : [];
  } catch { return []; }
}

// ── 23 Sep 2026 (Adrian: "would also like lasso to select and do stuff") ───────────

export type Selection = { index: number; ids: number[] };
export type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** The strokes on `index` a hand-drawn loop captures (lib/annotate/lasso's half-inside rule); null when it caught nothing. */
export function selectByLasso(pages: InkPages, index: number, polygon: { x: number; y: number }[]): Selection | null {
  const cur = pages[index]; if (!cur || polygon.length < 3) return null;
  const ids = lassoSelect(cur.strokes, polygon);
  return ids.length ? { index, ids } : null;
}

export function selectionBox(pages: InkPages, sel: Selection | null): Box | null {
  if (!sel) return null;
  const cur = pages[sel.index]; if (!cur) return null;
  return strokesBBox(sel.ids.map(i => cur.strokes[i]).filter(Boolean));
}

/** Is (x, y) inside the box, grown by `pad` image px on every side? A tap there drags the selection instead of starting a new lasso. */
export function inBox(box: Box | null, x: number, y: number, pad = 0): boolean {
  return !!box && x >= box.minX - pad && x <= box.maxX + pad && y >= box.minY - pad && y <= box.maxY + pad;
}

const mapSelected = (pages: InkPages, sel: Selection, f: (s: Stroke) => Stroke): InkPages => {
  const cur = pages[sel.index]; if (!cur) return pages;
  const set = new Set(sel.ids);
  return { ...pages, [sel.index]: { ...cur, strokes: cur.strokes.map((s, i) => (set.has(i) ? f(s) : s)) } };
};
const shift = (s: Stroke, dx: number, dy: number): Stroke => ({ ...s, points: s.points.map(p => ({ ...p, x: Math.round((p.x + dx) * 10) / 10, y: Math.round((p.y + dy) * 10) / 10 })) });

/** Slide the selected strokes by (dx, dy) image px — the page is unchanged when nothing moved. */
export function moveSelected(pages: InkPages, sel: Selection, dx: number, dy: number): InkPages {
  if (!dx && !dy) return pages;
  return mapSelected(pages, sel, s => shift(s, dx, dy));
}
export function recolorSelected(pages: InkPages, sel: Selection, color: string): InkPages {
  const hex = normalizeHex(color); if (!hex) return pages;
  return mapSelected(pages, sel, s => (s.color === hex ? s : { ...s, color: hex }));
}
/** Remove the selected strokes; a page left empty is dropped so the layer can be "empty". */
export function deleteSelected(pages: InkPages, sel: Selection): InkPages {
  const cur = pages[sel.index]; if (!cur) return pages;
  const set = new Set(sel.ids);
  const strokes = cur.strokes.filter((_, i) => !set.has(i));
  if (strokes.length === cur.strokes.length) return pages;
  const out = { ...pages };
  if (strokes.length) out[sel.index] = { ...cur, strokes }; else delete out[sel.index];
  return out;
}
/** Copy the selected strokes a little down and right; the copies become the new selection. */
export function duplicateSelected(pages: InkPages, sel: Selection): { pages: InkPages; selection: Selection } {
  const cur = pages[sel.index]; if (!cur) return { pages, selection: sel };
  const d = Math.round(cur.w * 0.03);
  const copies = sel.ids.map(i => cur.strokes[i]).filter(Boolean).map(s => shift(s, d, d));
  const ids = copies.map((_, k) => cur.strokes.length + k);
  return { pages: { ...pages, [sel.index]: { ...cur, strokes: [...cur.strokes, ...copies] } }, selection: { index: sel.index, ids } };
}

// ── 23 Sep 2026 (Adrian: "possible to have pointer as well?") ──────────────────────

/** How long the laser's trail lingers behind the tip. */
export const TRAIL_MS = 550;
export type TrailPoint = { x: number; y: number; t: number };
/** Drop what is older than the trail; each point comes back with its alpha (1 at the tip → 0 at the tail). */
export function trailAlive(trail: readonly TrailPoint[], now: number): { x: number; y: number; a: number }[] {
  return trail.filter(p => now - p.t < TRAIL_MS).map(p => ({ x: p.x, y: p.y, a: Math.max(0, 1 - (now - p.t) / TRAIL_MS) }));
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

// ── the toolbar under pinch zoom (22 Sep 2026, Adrian: "would like the toolbar to stay
// even when zoomed in/out (and stay at same size at the centre)") ────────────────────
// A `position: fixed` element is fixed to the LAYOUT viewport, so a pinch zoom scales it
// and carries it off screen with the page. The visual viewport says where the screen
// actually is in layout px; the pill is moved to the bottom-centre of THAT and counter-
// scaled by 1/scale so it keeps its size in screen px.

export type VisualViewportLike = { scale: number; offsetLeft: number; offsetTop: number; width: number; height: number };

/** Inline style that pins the toolbar to the visual viewport, or null when not zoomed (the CSS classes then place it). */
export function toolbarPlacement(vv: VisualViewportLike | null | undefined, gapScreenPx: number): { left: number; top: number; scale: number } | null {
  if (!vv || !(vv.scale > 1.02) || !(vv.width > 0) || !(vv.height > 0)) return null;
  const scale = vv.scale;
  return {
    left: vv.offsetLeft + vv.width / 2,
    top: vv.offsetTop + vv.height - gapScreenPx / scale,
    scale: 1 / scale,
  };
}
