// Pressure-tapered ink outlines — the thing that makes web ink look like a pen and
// not a whiteboard marker. Wraps perfect-freehand's getStroke (the tldraw approach:
// a filled variable-width polygon instead of a stroked constant-width polyline).
//
// The spec's width rule (base × (0.5 + pressure), clamped) is approximated by
// perfect-freehand's size/thinning model: at pressure 0.5 the drawn width ≈ the
// stroke's base width, thinner when light, fatter when pressed. Deviation noted in
// SPEC-ANNOTATE.md §11.

import { getStroke } from 'perfect-freehand';
import type { Stroke, StrokePoint } from './types';

/**
 * Outline polygon for a freehand stroke, in the same coordinate space as its
 * points. Returns [] for empty input. Deterministic: same stroke → same polygon.
 */
export function strokeOutline(points: StrokePoint[], baseWidth: number, tool: Stroke['tool'] = 'pen'): number[][] {
  if (!points.length) return [];
  // A stylus that reports no pressure sends exactly 0.5 everywhere (mouse dev mode
  // does too) — turn on velocity-simulated pressure so those strokes still taper.
  const noRealPressure = points.every((pt) => pt.p === 0.5);
  return getStroke(
    points.map((pt) => [pt.x, pt.y, pt.p]),
    tool === 'highlighter'
      ? {
          // Uniform ribbon: a highlighter has no taper and ignores pressure.
          size: baseWidth, thinning: 0, smoothing: 0.6, streamline: 0.4,
          simulatePressure: false,
          start: { taper: 0, cap: true }, end: { taper: 0, cap: true },
        }
      : {
          // size is the full width at max pressure; with thinning 0.6 the width at
          // p=0.5 is size × 0.7 — so scale size so p=0.5 draws ≈ baseWidth.
          size: baseWidth * 1.45, thinning: 0.6, smoothing: 0.5, streamline: 0.35,
          simulatePressure: noRealPressure,
          last: true,
        },
  );
}

/** SVG-style path string for an outline polygon (for Path2D). */
export function outlineToPath(outline: number[][]): string {
  if (outline.length < 2) return '';
  let d = `M${outline[0][0].toFixed(2)} ${outline[0][1].toFixed(2)}`;
  for (let i = 1; i < outline.length; i++) {
    d += `L${outline[i][0].toFixed(2)} ${outline[i][1].toFixed(2)}`;
  }
  return d + 'Z';
}
