// Smooth, near-uniform ink outlines. Wraps perfect-freehand's getStroke (the tldraw
// approach: a filled polygon instead of a stroked constant-width polyline).
//
// Two deliberate choices make this Notability-like rather than wobbly (Adrian,
// 3 Aug 2026: "the pen pressure affects the stroke… my writing now looks shaky"):
//
// 1. Near-constant width. The original thinning 0.6 made 60% of the width ride on
//    Apple Pencil pressure, which oscillates constantly during normal writing —
//    thin shaky entries, blobby curves. thinning 0.15 keeps a whisper of life in
//    the line (width spans only 0.85–1.0 × size).
// 2. Our own zero-phase smoothing (smoothPoints below). perfect-freehand's
//    `streamline` measurably did nothing for point-level jitter at our densities,
//    so tremor went straight into the outline. The EMA runs forward AND backward
//    (no directional lag), at render time (stored points stay raw, so old drafts
//    smooth too and the eraser/lasso hit-test geometry is untouched), with both
//    endpoints anchored (the ink always reaches exactly where the pen tip is —
//    no catch-up lag on the live stroke).
//
// Retune with a real Pencil, not a mouse.

import { getStroke } from 'perfect-freehand';
import type { Stroke, StrokePoint } from './types';

/**
 * Zero-phase tremor filter: forward+backward EMA over the raw input points.
 * α = 0.5 suppresses ±2px hand jitter ~85–90% while keeping ~85% of a
 * letter-sized curve's amplitude (probed, 3 Aug 2026). First/last points are
 * returned untouched so stroke ends stay pinned to the pen tip.
 */
export function smoothPoints(points: StrokePoint[], alpha = 0.5): StrokePoint[] {
  if (points.length < 5) return points;
  const fwd: StrokePoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = fwd[i - 1];
    fwd.push({ x: prev.x + alpha * (points[i].x - prev.x), y: prev.y + alpha * (points[i].y - prev.y), p: points[i].p });
  }
  const out = new Array<StrokePoint>(fwd.length);
  out[fwd.length - 1] = fwd[fwd.length - 1];
  for (let i = fwd.length - 2; i >= 0; i--) {
    const next = out[i + 1];
    out[i] = { x: next.x + alpha * (fwd[i].x - next.x), y: next.y + alpha * (fwd[i].y - next.y), p: fwd[i].p };
  }
  out[0] = points[0];
  out[out.length - 1] = points[points.length - 1];
  return out;
}

/**
 * Outline polygon for a freehand stroke, in the same coordinate space as its
 * points. Returns [] for empty input. Deterministic: same stroke → same polygon.
 */
export function strokeOutline(points: StrokePoint[], baseWidth: number, tool: Stroke['tool'] = 'pen'): number[][] {
  if (!points.length) return [];
  // A stylus that reports no pressure sends exactly 0.5 everywhere (mouse dev mode
  // does too) — turn on velocity-simulated pressure so those strokes still taper.
  const noRealPressure = points.every((pt) => pt.p === 0.5);
  const pts = smoothPoints(points);
  return getStroke(
    pts.map((pt) => [pt.x, pt.y, pt.p]),
    tool === 'highlighter'
      ? {
          // Uniform ribbon: a highlighter has no taper and ignores pressure.
          size: baseWidth, thinning: 0, smoothing: 0.6, streamline: 0.4,
          simulatePressure: false,
          start: { taper: 0, cap: true }, end: { taper: 0, cap: true },
        }
      : {
          // size is the width at max pressure; with thinning t the width at pressure
          // p is size × (1 − t(1−p)), so at p=0.5 this draws ≈ baseWidth × 1.08 ×
          // 0.925 ≈ baseWidth.
          size: baseWidth * 1.08, thinning: 0.15, smoothing: 0.65, streamline: 0.55,
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
