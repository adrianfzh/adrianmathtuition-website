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

// 22 Sep 2026 (Adrian: "draw and hold to turn into a perfect circle … usually turns
// into a square"): the points a real hold delivers are not the clean loops the first
// fixtures drew. Holding the Pencil still keeps the touch stream ticking, so a stroke
// ends in a CLUSTER of thirty jittered points; a hand overshoots the start of a circle
// by a tenth of a turn; a small circle on an iPad is twenty sparse points. Each of
// those alone made the ellipse fit fail (the cluster and the overlap bias the moment
// fit) while the rectangle fit — which only asks for four RDP corners turning ~90°,
// something a round loop's inscribed square satisfies — still went through. Now a
// loop is CLEANED first (tail and head clusters collapsed, the overshoot cut, the
// path smoothed) and rect vs ellipse is decided by which outline the ink actually
// lies closer to, never by which fit was tried first.
const CLUSTER_FRACTION = 0.02;      // a head/tail cluster: every point within this × len of the end
const OVERSHOOT_CLOSE_FRACTION = 0.05;   // back within this × len of the start …
const OVERSHOOT_MIN_TAIL = 0.06;         // … with at least this × len still to come → cut there
const SMOOTH_SAMPLES = 96;
/** Two RDP vertices closer than this fraction of the perimeter are one rounded corner. */
const CORNER_MERGE_FRACTION = 0.08;


const LINE_MAX_DEVIATION = 0.04;    // of stroke length
const CLOSURE_MAX_GAP = 0.25;       // first↔last gap, of perimeter (rect + ellipse) — 0.15 until 17 Sep 2026: real hands under-close a circle
const RDP_EPSILON = 0.025;          // of stroke length (corner detection)
const RECT_ANGLE_TOL = (20 * Math.PI) / 180;   // corner angle within 20° of 90°
const RECT_AXIS_TOL = (10 * Math.PI) / 180;    // all edges within 10° of axes → axis-aligned
const ELLIPSE_MAX_RADIAL_ERR = 0.13;           // mean |r-1| in ellipse frame — 0.06 until 17 Sep 2026, 0.10 until 22 Sep (a hand circle is lumpy; rect wins the residual contest when it is really a box)
const CIRCLE_AXIS_RATIO = 0.28;                // axes within 28% of each other → circle (12 % until 17 Sep 2026: hand circles came out as ellipses)

export type FitOptions = { minLength?: number };

export function fitStroke(points: StrokePoint[], opts: FitOptions = {}): SnappedShape | null {
  const minLength = opts.minLength ?? 30;
  if (points.length < 8) return null;
  const len = pathLength(points);
  if (len < minLength) return null;

  const line = fitLine(trimClusters(points), pathLength(trimClusters(points)));
  if (line) return line;

  // Rect, triangle and ellipse all require a closed-ish loop — of the CLEANED path.
  const loop = cleanLoop(points);
  const loopLen = pathLength(loop);
  if (loop.length < 8 || loopLen < minLength) return null;
  const gap = dist(loop[0], loop[loop.length - 1]);
  if (gap > CLOSURE_MAX_GAP * loopLen) return null;

  const rect = fitRect(loop, loopLen);
  if (rect) {
    // A round loop can pass the corner test (its inscribed square turns 90° four
    // times); let the ink decide — whichever outline it sits closer to.
    const ellipse = fitEllipse(loop);
    if (ellipse && outlineResidual(loop, ellipse) < outlineResidual(loop, rect)) return ellipse;
    return rect;
  }
  return fitTriangle(loop, loopLen) ?? fitEllipse(loop);
}

/** Collapse the pen-down blob and the hold cluster at either end into one point each. */
export function trimClusters(points: StrokePoint[]): StrokePoint[] {
  if (points.length < 3) return points.slice();
  const r = CLUSTER_FRACTION * pathLength(points);
  const within = (o: XY, i: number) => dist(points[i], o) <= r;
  // tail: the earliest index from which every later point sits within r of the last
  let t = points.length - 1;
  while (t > 0 && within(points[points.length - 1], t - 1)) t--;
  // head: the latest index up to which every earlier point sits within r of the first
  let h = 0;
  while (h < t && within(points[0], h + 1)) h++;
  const centroid = (from: number, to: number): StrokePoint => {
    let x = 0, y = 0, p = 0, n = 0;
    for (let i = from; i <= to; i++) { x += points[i].x; y += points[i].y; p += points[i].p; n++; }
    return { x: x / n, y: y / n, p: p / n };
  };
  const out: StrokePoint[] = [];
  if (h > 0) out.push(centroid(0, h)); else out.push(points[0]);
  for (let i = h + 1; i < t; i++) out.push(points[i]);
  if (t > h) out.push(t < points.length - 1 ? centroid(t, points.length - 1) : points[t]);
  return out;
}

/**
 * The loop a closed-shape fit reads: clusters collapsed, the overshoot past the
 * start cut off, then resampled and lightly smoothed so Pencil jitter neither
 * inflates the path length (which sets every relative threshold) nor reads as a
 * corner. Exported for the tests.
 */
export function cleanLoop(points: StrokePoint[]): StrokePoint[] {
  const trimmed = trimClusters(points);
  const len = pathLength(trimmed);
  if (trimmed.length < 3 || len === 0) return trimmed;
  // Overshoot: once well round the loop, the first return to the start with a
  // meaningful tail still to come is where the hand should have stopped.
  let cut = trimmed.length - 1;
  let acc = 0;
  for (let i = 1; i < trimmed.length; i++) {
    acc += dist(trimmed[i - 1], trimmed[i]);
    if (acc < 0.6 * len) continue;
    if (dist(trimmed[i], trimmed[0]) <= OVERSHOOT_CLOSE_FRACTION * len && len - acc >= OVERSHOOT_MIN_TAIL * len) { cut = i; break; }
  }
  const kept = trimmed.slice(0, cut + 1);
  const dense = resampleByArcLength(kept, SMOOTH_SAMPLES);
  const p = points[0].p ?? 0.5;
  return dense.map((q, i) => {
    if (i === 0 || i === dense.length - 1) return { x: q.x, y: q.y, p };
    const a = dense[i - 1], b = dense[i + 1];
    return { x: (a.x + q.x + b.x) / 3, y: (a.y + q.y + b.y) / 3, p };
  });
}

/** Mean distance from the loop's points to the shape's outline, in the loop's own units. */
export function outlineResidual(points: XY[], shape: SnappedShape): number {
  const outline = shapeToPolyline(shape);
  let sum = 0;
  for (const p of points) {
    let best = Infinity;
    for (let i = 1; i < outline.length; i++) {
      const d = pointSegmentDistance(p, outline[i - 1], outline[i]);
      if (d < best) best = d;
    }
    sum += best;
  }
  return sum / Math.max(1, points.length);
}

function fitLine(points: XY[], len: number): SnappedShape | null {
  const a = points[0], b = points[points.length - 1];
  // A loop's chord is tiny relative to its path — never a line.
  if (dist(a, b) < 0.5 * len) return null;
  if (maxChordDeviation(points) > LINE_MAX_DEVIATION * len) return null;
  return { kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

export function fitRect(points: XY[], len: number): SnappedShape | null {
  const eps = RDP_EPSILON * len;
  const simplified = rdpSimplify(points, eps);
  // Drop a closing vertex that rejoins the start (the "≤5 corners" of the spec).
  const corners = simplified.slice();
  if (corners.length > 1 && dist(corners[0], corners[corners.length - 1]) < CLOSURE_MAX_GAP * len) {
    corners.pop();
  }
  // A rounded hand corner leaves RDP two points a few percent of the perimeter
  // apart — merge them into one corner (the triangle fitter's rule; 22 Sep 2026,
  // a rounded square that closes a little short used to keep 6–7 "corners").
  const mergeDist = CORNER_MERGE_FRACTION * len;
  for (let i = 0; i < corners.length && corners.length > 4; ) {
    const j = (i + 1) % corners.length;
    if (dist(corners[i], corners[j]) < mergeDist) {
      corners[i] = { x: (corners[i].x + corners[j].x) / 2, y: (corners[i].y + corners[j].y) / 2 };
      corners.splice(j, 1);
      if (j === 0) i = 0;
    } else i++;
  }
  // A stroke that starts mid-edge keeps its start point as an RDP endpoint even
  // though it is no corner — drop endpoints that are collinear with the loop edge
  // joining their neighbours (real corners stick out by ~the sagitta, far past eps).
  for (const end of [0, 1]) {
    if (corners.length <= 4) break;
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

export function fitEllipse(points: XY[]): SnappedShape | null {
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

/** A closed loop that simplifies to exactly three corners (17 Sep 2026). Rect is
 *  tried first, so a four-cornered loop never lands here; a rounded blob
 *  simplifies to many points and falls through to the ellipse fit. */
function fitTriangle(points: XY[], len: number): SnappedShape | null {
  // A looser epsilon than the rect's: a hand-drawn side wobbles, and a wobble
  // must not read as a fourth corner (17 Sep 2026).
  const simplified = rdpSimplify(points, 1.6 * RDP_EPSILON * len);
  let corners = simplified.slice();
  if (corners.length > 1 && dist(corners[0], corners[corners.length - 1]) < CLOSURE_MAX_GAP * len) corners.pop();
  // A hand rounds a corner, so the simplifier often leaves two or three points
  // around one turn: merge points closer than 8 % of the perimeter into one.
  const merged: XY[] = [];
  for (const c of corners) {
    const last = merged[merged.length - 1];
    if (last && dist(last, c) < 0.08 * len) { last.x = (last.x + c.x) / 2; last.y = (last.y + c.y) / 2; }
    else merged.push({ x: c.x, y: c.y });
  }
  if (merged.length > 1 && dist(merged[0], merged[merged.length - 1]) < 0.08 * len) merged.pop();
  corners = merged;
  // Drop points that sit on the straight line between their neighbours (the
  // pen-down blob, a start mid-side) — a corner sticks out well past that.
  corners = corners.filter((c, i) => {
    const a = corners[(i + corners.length - 1) % corners.length], b = corners[(i + 1) % corners.length];
    const ab = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const off = Math.abs((b.x - a.x) * (a.y - c.y) - (a.x - c.x) * (b.y - a.y)) / ab;
    return off > 0.03 * len;
  });
  if (corners.length !== 3) return null;
  // Degenerate (three near-collinear points) is not a triangle.
  const [a, b, c] = corners;
  const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
  if (area2 < 0.02 * len * len) return null;
  return { kind: 'triangle', points: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: c.x, y: c.y }] };
}

/** Convert a fitted shape to the polyline stored on the stroke (see types.ts). */
export function shapeToPolyline(shape: SnappedShape, pressure = 0.6): StrokePoint[] {
  if (shape.kind === 'triangle') {
    const [a, b, c] = shape.points;
    return [a, b, c, a].map(p => ({ x: p.x, y: p.y, p: pressure }));
  }
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
