// Lasso selection (Adrian, 2 Aug 2026): which strokes does a hand-drawn loop
// capture, and what box do they span? A stroke is selected when at least half of
// it lies inside the loop — sampled along its length, so a sparse 2-point snapped
// line crossing the middle of the lasso still counts.

import type { Stroke } from './types';
import { densifyPoints } from './stroke-split';

export type XY = { x: number; y: number };

/** Ray-cast point-in-polygon (polygon closed implicitly). */
export function pointInPolygon(x: number, y: number, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const SELECT_RATIO = 0.5;
const MAX_SAMPLES = 64;

/** Indexes of strokes at least half-inside the lasso polygon. */
export function lassoSelect(strokes: Stroke[], polygon: XY[]): number[] {
  if (polygon.length < 3) return [];
  const out: number[] = [];
  for (let i = 0; i < strokes.length; i++) {
    const pts = strokes[i].points;
    if (!pts.length) continue;
    // Sample evenly along the path: densify sparse polylines, then cap the count.
    let sample = pts.length < 8 ? densifyPoints(pts, 4) : pts;
    if (sample.length > MAX_SAMPLES) {
      const step = (sample.length - 1) / (MAX_SAMPLES - 1);
      sample = Array.from({ length: MAX_SAMPLES }, (_, k) => sample[Math.round(k * step)]);
    }
    let hits = 0;
    for (const p of sample) if (pointInPolygon(p.x, p.y, polygon)) hits++;
    if (hits / sample.length >= SELECT_RATIO) out.push(i);
  }
  return out;
}

/** Bounding box of the given strokes' points; null when empty. */
export function strokesBBox(strokes: Stroke[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}
