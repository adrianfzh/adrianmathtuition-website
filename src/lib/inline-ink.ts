// Write-anywhere ink on the paper page (18 Sep 2026, Adrian: "write on my paper
// is hard to use"): the pure pieces — where a touch lands in page-image pixels,
// how thick a tool draws on a page of a given size, which strokes an eraser
// touches, and the one history step an action pushes. The component
// (app/marking/StudentInk.tsx) only wires events to these.
import type { Stroke, StrokePoint } from './annotate/types';
import type { InkPages } from './student-ink';

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
