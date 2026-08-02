// Partial (pixel) eraser: split a stroke where it passes under the eraser circle
// (Adrian, 2 Aug 2026 — "erase part of a stroke, not the whole thing").
//
// Point-based with densification: strokes are first densified so no segment is
// longer than ~half the eraser radius (fast pen flicks and snapped shapes have
// sparse polylines — a 2-point snapped line would otherwise pass THROUGH the circle
// with neither endpoint inside and never split). Surviving runs become new strokes;
// run ends are interpolated onto the circle boundary so cuts look clean, not chewed.

import type { Stroke, StrokePoint } from './types';
import { dist } from './stroke-geometry';

/** Extra reach beyond the eraser radius, as a fraction of the stroke's width —
 *  so touching a fat stroke's visible ink (not just its centreline) erases it. */
export const PARTIAL_REACH_FACTOR = 0.35;

/** Pieces shorter than this (image px) are dust, not strokes — drop them. */
const MIN_PIECE_LEN = 3;

/** Insert lerped points so no gap exceeds maxGap. Preserves originals + pressure. */
export function densifyPoints(points: StrokePoint[], maxGap: number): StrokePoint[] {
  if (points.length < 2) return points.slice();
  const out: StrokePoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const d = dist(a, b);
    const n = Math.floor(d / maxGap);
    for (let j = 1; j <= n; j++) {
      const t = j / (n + 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t });
    }
    out.push(b);
  }
  return out;
}

/** Point on segment in→out where it crosses the circle (lerped pressure). */
function boundaryPoint(pin: StrokePoint, pout: StrokePoint, cx: number, cy: number, r: number): StrokePoint {
  // Solve |pin + t(pout-pin) - c| = r for t in [0,1].
  const dx = pout.x - pin.x, dy = pout.y - pin.y;
  const fx = pin.x - cx, fy = pin.y - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let t = 0.5;
  if (a > 1e-9) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      // The crossing with t in [0,1]; prefer the one leaving the circle.
      const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
      t = t2 >= 0 && t2 <= 1 ? t2 : t1 >= 0 && t1 <= 1 ? t1 : 0.5;
    }
  }
  return { x: pin.x + dx * t, y: pin.y + dy * t, p: pin.p + (pout.p - pin.p) * t };
}

function pieceLength(pts: StrokePoint[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/**
 * Split `stroke` at the eraser circle (cx, cy, radius — image px).
 * Returns null when untouched, [] when fully erased, else the surviving pieces
 * (freehand — a partially-erased snapped shape stops being a clean shape).
 */
export function splitStrokeAtCircle(stroke: Stroke, cx: number, cy: number, radius: number): Stroke[] | null {
  const r = radius + stroke.width * PARTIAL_REACH_FACTOR;
  const pts = densifyPoints(stroke.points, Math.max(1.5, r / 2));
  if (!pts.length) return null;
  const r2 = r * r;
  const inside = pts.map((p) => (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r2);
  if (!inside.some(Boolean)) return null;
  if (inside.every(Boolean)) return [];

  const runs: StrokePoint[][] = [];
  let cur: StrokePoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (inside[i]) {
      if (cur.length) {
        cur.push(boundaryPoint(pts[i], pts[i - 1], cx, cy, r));   // close run at the rim
        runs.push(cur);
        cur = [];
      }
      continue;
    }
    if (i > 0 && inside[i - 1]) {
      cur.push(boundaryPoint(pts[i - 1], pts[i], cx, cy, r));     // open run at the rim
    }
    cur.push(pts[i]);
  }
  if (cur.length) runs.push(cur);

  return runs
    .filter((run) => run.length >= 2 && pieceLength(run) >= MIN_PIECE_LEN)
    .map((run) => ({
      tool: stroke.tool,
      color: stroke.color,
      width: stroke.width,
      points: run,
      // no `snapped`: the pieces are open freehand paths now
    }));
}
