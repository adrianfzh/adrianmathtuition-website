// Eraser hit-testing (SPEC-ANNOTATE.md §6.3): does a pen position touch a stroke?
// Distance to the stroke's polyline, with the stroke's own half-width added to the
// tolerance so fat strokes are as easy to hit as they are to see.

import type { Stroke } from './types';
import { dist, pointSegmentDistance } from './stroke-geometry';

export function strokeHit(stroke: Stroke, x: number, y: number, tolerance: number): boolean {
  const reach = tolerance + stroke.width / 2;
  const pts = stroke.points;
  if (pts.length === 0) return false;
  if (pts.length === 1) return dist(pts[0], { x, y }) <= reach;
  for (let i = 1; i < pts.length; i++) {
    if (pointSegmentDistance({ x, y }, pts[i - 1], pts[i]) <= reach) return true;
  }
  return false;
}

/**
 * Indexes of all strokes hit at (x, y), topmost (most recently drawn) first —
 * the order an eraser drag should consume them in.
 */
export function hitStrokes(strokes: Stroke[], x: number, y: number, tolerance: number): number[] {
  const out: number[] = [];
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (strokeHit(strokes[i], x, y, tolerance)) out.push(i);
  }
  return out;
}
