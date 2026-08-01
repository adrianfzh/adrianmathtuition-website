// Draw-and-hold shape snapping (SPEC-ANNOTATE.md §4): decide whether a held stroke
// is a straight line, a rectangle or an ellipse/circle, with the spec's thresholds.
// Priority order line → rect → ellipse; anything else returns null (keep freehand).
//
// All thresholds are RELATIVE to the stroke's own size, so the fit behaves the same
// on a 1600px photo and a 2500px scan. The one absolute input, minLength, is passed
// by the overlay in image px (it derives it from screen px so a deliberate dot or
// comma never snaps).

import type { SnappedShape, StrokePoint } from './types';
import {
  angleDiff, dist, maxChordDeviation, pathLength, pointSegmentDistance, rdpSimplify,
  resampleByArcLength, type XY,
} from './stroke-geometry';

const LINE_MAX_DEVIATION = 0.04;    // of stroke length
const CLOSURE_MAX_GAP = 0.15;       // first↔last gap, of perimeter (rect + ellipse)
const RDP_EPSILON = 0.025;          // of stroke length (corner detection)
const RECT_ANGLE_TOL = (20 * Math.PI) / 180;   // corner angle within 20° of 90°
const RECT_AXIS_TOL = (10 * Math.PI) / 180;    // all edges within 10° of axes → axis-aligned
const ELLIPSE_MAX_RADIAL_ERR = 0.06;           // mean |r-1| in ellipse frame
const CIRCLE_AXIS_RATIO = 0.12;                // axes within 12% of each other → circle

export type FitOptions = { minLength?: number };

export function fitStroke(points: StrokePoint[], opts: FitOptions = {}): SnappedShape | null {
  const minLength = opts.minLength ?? 30;
  if (points.length < 8) return null;
  const len = pathLength(points);
  if (len < minLength) return null;

  const line = fitLine(points, len);
  if (line) return line;

  // Rect and ellipse both require a closed-ish loop.
  const gap = dist(points[0], points[points.length - 1]);
  if (gap > CLOSURE_MAX_GAP * len) return null;

  return fitRect(points, len) ?? fitEllipse(points);
}

function fitLine(points: XY[], len: number): SnappedShape | null {
  const a = points[0], b = points[points.length - 1];
  // A loop's chord is tiny relative to its path — never a line.
  if (dist(a, b) < 0.5 * len) return null;
  if (maxChordDeviation(points) > LINE_MAX_DEVIATION * len) return null;
  return { kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

function fitRect(points: XY[], len: number): SnappedShape | null {
  const eps = RDP_EPSILON * len;
  const simplified = rdpSimplify(points, eps);
  // Drop a closing vertex that rejoins the start (the "≤5 corners" of the spec).
  const corners = simplified.slice();
  if (corners.length > 1 && dist(corners[0], corners[corners.length - 1]) < CLOSURE_MAX_GAP * len) {
    corners.pop();
  }
  // A stroke that starts mid-edge keeps its start point as an RDP endpoint even
  // though it is no corner — drop endpoints that are collinear with the loop edge
  // joining their neighbours (real corners stick out by ~the sagitta, far past eps).
  for (const end of [0, 1]) {
    if (corners.length !== 5) break;
    const i = end === 0 ? 0 : corners.length - 1;
    const prev = corners[(i - 1 + corners.length) % corners.length];
    const next = corners[(i + 1) % corners.length];
    if (pointSegmentDistance(corners[i], prev, next) <= eps) corners.splice(i, 1);
  }
  if (corners.length !== 4) return null;

  // Every corner must turn roughly 90°: angle between adjacent edges.
  const edgeAngles: number[] = [];
  for (let i = 0; i < 4; i++) {
    const p = corners[i], q = corners[(i + 1) % 4];
    edgeAngles.push(Math.atan2(q.y - p.y, q.x - p.x));
  }
  for (let i = 0; i < 4; i++) {
    const turn = angleDiff(edgeAngles[i], edgeAngles[(i + 1) % 4]);
    if (Math.abs(turn - Math.PI / 2) > RECT_ANGLE_TOL) return null;
  }

  // Axis-aligned if every edge sits within 10° of horizontal/vertical: snap to the
  // bounding box of the ORIGINAL points (not the simplified corners).
  const axisAligned = edgeAngles.every((ang) => {
    const mod = angleDiff(ang, 0) % (Math.PI / 2);
    const offAxis = Math.min(mod, Math.PI / 2 - mod);
    return offAxis <= RECT_AXIS_TOL;
  });
  if (axisAligned) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      kind: 'rect',
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
      w: maxX - minX, h: maxY - minY, angle: 0,
    };
  }

  // Rotated: build an orthonormal frame from the average direction of one pair of
  // opposite edges, then box the original points in that frame.
  const dir = averageEdgeDirection(edgeAngles[0], edgeAngles[2]);
  const u = { x: Math.cos(dir), y: Math.sin(dir) };
  const v = { x: -u.y, y: u.x };
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const p of points) {
    const pu = p.x * u.x + p.y * u.y;
    const pv = p.x * v.x + p.y * v.y;
    if (pu < minU) minU = pu;
    if (pu > maxU) maxU = pu;
    if (pv < minV) minV = pv;
    if (pv > maxV) maxV = pv;
  }
  const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
  return {
    kind: 'rect',
    cx: cu * u.x + cv * v.x, cy: cu * u.y + cv * v.y,
    w: maxU - minU, h: maxV - minV, angle: dir,
  };
}

/** Mean direction of two roughly-opposite edges (drawn in opposite travel order). */
function averageEdgeDirection(a: number, b: number): number {
  // Map both to [0, π) — direction of a rect edge is orientation, not heading.
  const na = ((a % Math.PI) + Math.PI) % Math.PI;
  let nb = ((b % Math.PI) + Math.PI) % Math.PI;
  if (Math.abs(nb - na) > Math.PI / 2) nb += nb < na ? Math.PI : -Math.PI;
  return (na + nb) / 2;
}

function fitEllipse(points: XY[]): SnappedShape | null {
  const pts = resampleByArcLength(points, 64);
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;

  // Principal axes from second moments. For points uniform on an ellipse,
  // variance along a semi-axis a is a²/2.
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const dx = p.x - cx, dy = p.y - cy;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  if (l2 <= 0) return null;
  let rx = Math.sqrt(2 * l1), ry = Math.sqrt(2 * l2);
  const angle = Math.abs(sxy) < 1e-9 && sxx >= syy ? 0 : Math.atan2(l1 - sxx, sxy || 1e-12);

  // Rotate into the ellipse frame once.
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const frame = pts.map((p) => {
    const dx = p.x - cx, dy = p.y - cy;
    return { ex: dx * cosA + dy * sinA, ey: -dx * sinA + dy * cosA };
  });

  // Arc-length sampling under-weights the fast (major-axis) ends, so the moment
  // estimate of rx/ry is biased on eccentric ellipses. A few alternating
  // least-squares passes on the parametric form (ex=rx·cosφ, ey=ry·sinφ) fix it.
  for (let iter = 0; iter < 3; iter++) {
    let sxc = 0, scc = 0, sys = 0, sss = 0;
    for (const { ex, ey } of frame) {
      const phi = Math.atan2(ey / ry, ex / rx);
      const c = Math.cos(phi), s = Math.sin(phi);
      sxc += ex * c; scc += c * c;
      sys += ey * s; sss += s * s;
    }
    if (scc > 1e-9) rx = Math.abs(sxc / scc);
    if (sss > 1e-9) ry = Math.abs(sys / sss);
    if (rx < 1e-6 || ry < 1e-6) return null;
  }

  // Radial error in the ellipse's own frame.
  let err = 0;
  for (const { ex, ey } of frame) {
    err += Math.abs(Math.hypot(ex / rx, ey / ry) - 1);
  }
  err /= n;
  if (err > ELLIPSE_MAX_RADIAL_ERR) return null;

  if (Math.abs(rx - ry) <= CIRCLE_AXIS_RATIO * Math.max(rx, ry)) {
    const r = (rx + ry) / 2;
    rx = r; ry = r;
  }
  return { kind: 'ellipse', cx, cy, rx, ry, angle: rx === ry ? 0 : angle };
}

/** Convert a fitted shape to the polyline stored on the stroke (see types.ts). */
export function shapeToPolyline(shape: SnappedShape, pressure = 0.6): StrokePoint[] {
  if (shape.kind === 'line') {
    return [
      { x: shape.x1, y: shape.y1, p: pressure },
      { x: shape.x2, y: shape.y2, p: pressure },
    ];
  }
  if (shape.kind === 'rect') {
    const { cx, cy, w, h, angle } = shape;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const local: [number, number][] = [
      [-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2],
    ];
    return local.map(([lx, ly]) => ({
      x: cx + lx * cosA - ly * sinA,
      y: cy + lx * sinA + ly * cosA,
      p: pressure,
    }));
  }
  const { cx, cy, rx, ry, angle } = shape;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const out: StrokePoint[] = [];
  const N = 32;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 * Math.PI;
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    out.push({ x: cx + ex * cosA - ey * sinA, y: cy + ex * sinA + ey * cosA, p: pressure });
  }
  return out;
}
