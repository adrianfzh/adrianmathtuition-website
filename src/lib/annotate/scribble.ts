// Scribble to erase (7 Oct 2026, Adrian: "how about scribble with the pen as the eraser,
// like how one uses the eraser to erase"). A fast back-and-forth zigzag drawn with the PEN
// over existing ink rubs that ink out, and the zigzag itself is not kept. Pure: the shape
// test and which strokes it lands on. The overlay decides what to do with the answer.
//
// The danger is the opposite mistake — real writing read as an eraser and ink lost — so the
// test is strict (several clear reversals, a path much longer than the patch it covers) and
// a zigzag that lands on nothing is kept as ordinary ink.

import type { Stroke } from './types';
import { pathLength, pointSegmentDistance, type XY } from './stroke-geometry';

/** Direction changes along the scribble's long axis needed to count as rubbing (5 passes). */
export const MIN_REVERSALS = 4;
/** The path must be at least this many times the diagonal of the patch it covers. */
export const MIN_LENGTH_TO_DIAGONAL = 2.6;
/** A turn only counts once the pen has travelled this share of the patch's long side back the other way. */
export const REVERSAL_TRAVEL = 0.22;

function bbox(points: XY[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** How many times the pen turned back along the patch's long axis (small wobbles ignored). */
export function reversals(points: XY[]): number {
  if (points.length < 3) return 0;
  const b = bbox(points);
  const along = b.w >= b.h ? (p: XY) => p.x : (p: XY) => p.y;
  const need = Math.max(b.w, b.h) * REVERSAL_TRAVEL;
  let dir = 0, extreme = along(points[0]), count = 0;
  for (const p of points) {
    const v = along(p);
    if (dir === 0) { if (Math.abs(v - extreme) >= need) { dir = v > extreme ? 1 : -1; extreme = v; } continue; }
    if ((v - extreme) * dir > 0) { extreme = v; continue; }          // still going the same way
    if (Math.abs(v - extreme) >= need) { dir = -dir; extreme = v; count += 1; }
  }
  return count;
}

/** Is this stroke a rubbing zigzag? `minSize` = the smallest long side that counts, in the stroke's own units. */
export function isScribble(points: XY[], minSize: number): boolean {
  if (points.length < 12) return false;
  const b = bbox(points);
  const long = Math.max(b.w, b.h), diag = Math.hypot(b.w, b.h);
  if (long < minSize || diag <= 0) return false;
  if (pathLength(points) < MIN_LENGTH_TO_DIAGONAL * diag) return false;
  return reversals(points) >= MIN_REVERSALS;
}

/**
 * The strokes the scribble rubs out: those with ink inside the scribbled patch that the
 * scribble actually passes over (within `tol`). A typed note is rubbed out when the
 * scribble crosses its anchor. Returns indices into `strokes`.
 */
export function scribbleTargets(strokes: Stroke[], scribble: XY[], tol: number): number[] {
  const b = bbox(scribble);
  const inPatch = (p: XY) => p.x >= b.x0 - tol && p.x <= b.x1 + tol && p.y >= b.y0 - tol && p.y <= b.y1 + tol;
  const near = (p: XY) => { for (let i = 1; i < scribble.length; i++) if (pointSegmentDistance(p, scribble[i - 1], scribble[i]) <= tol) return true; return false; };
  const out: number[] = [];
  strokes.forEach((s, i) => {
    const pts = s.points as XY[];
    if (!pts.length) return;
    let hits = 0;
    const step = Math.max(1, Math.floor(pts.length / 60));
    for (let k = 0; k < pts.length; k += step) { if (inPatch(pts[k]) && near(pts[k])) { hits += 1; if (hits >= 2 || pts.length < 4) break; } }
    if (hits >= 2 || (hits >= 1 && pts.length < 4)) out.push(i);
  });
  return out;
}
