// Piecewise cubic Bézier fitting of a freehand path (Schneider, "An Algorithm for
// Automatically Fitting Digitized Curves", Graphics Gems 1990 — the fit Paper.js,
// Inkscape and the note apps' "smooth this curve" use). 22 Sep 2026, Adrian: "trace a
// curve, then the pen stroke snaps to the closest fitted curve, like Notability".
//
// Given the points of a stroke and a tolerance (image px), returns the fewest cubic
// Béziers whose distance from every point stays under the tolerance: each segment is a
// least-squares fit of the handle lengths along the end tangents; where the error is
// too large the run is split at the worst point and each half fitted again.

import type { XY } from './stroke-geometry';

export type CubicBezier = [XY, XY, XY, XY];

const MAX_REPARAM_ITERATIONS = 4;
const MIN_HANDLE = 1e-6;

const sub = (a: XY, b: XY): XY => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: XY, b: XY): XY => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: XY, k: number): XY => ({ x: a.x * k, y: a.y * k });
const dot = (a: XY, b: XY): number => a.x * b.x + a.y * b.y;
const norm = (a: XY): number => Math.hypot(a.x, a.y);
const unit = (a: XY): XY => { const n = norm(a) || 1; return { x: a.x / n, y: a.y / n }; };

/** The point on a cubic at parameter t (Bernstein form). */
export function bezierPoint(b: CubicBezier, t: number): XY {
  const mt = 1 - t;
  const a = mt * mt * mt, c = 3 * mt * mt * t, d = 3 * mt * t * t, e = t * t * t;
  return { x: a * b[0].x + c * b[1].x + d * b[2].x + e * b[3].x, y: a * b[0].y + c * b[1].y + d * b[2].y + e * b[3].y };
}

/** Fit a path with cubic Béziers so no input point is further than maxError from the curve. */
export function fitBeziers(points: XY[], maxError: number): CubicBezier[] {
  const pts: XY[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) pts.push({ x: p.x, y: p.y });
  }
  if (pts.length < 2) return [];
  const tHat1 = unit(sub(pts[1], pts[0]));
  const tHat2 = unit(sub(pts[pts.length - 2], pts[pts.length - 1]));
  return fitCubic(pts, tHat1, tHat2, Math.max(maxError, 1e-3));
}

function fitCubic(pts: XY[], tHat1: XY, tHat2: XY, error: number): CubicBezier[] {
  if (pts.length === 2) {
    const d = norm(sub(pts[1], pts[0])) / 3;
    return [[pts[0], add(pts[0], mul(tHat1, d)), add(pts[1], mul(tHat2, d)), pts[1]]];
  }
  let u = chordLengthParameterize(pts);
  let bez = generateBezier(pts, u, tHat1, tHat2);
  let err = maxErrorOf(pts, bez, u);
  if (err.max < error) return [bez];
  // Close but not quite: re-parameterise (Newton–Raphson on each point's t) and refit.
  if (err.max < error * error) {
    for (let i = 0; i < MAX_REPARAM_ITERATIONS; i++) {
      const uPrime = reparameterize(bez, pts, u);
      bez = generateBezier(pts, uPrime, tHat1, tHat2);
      err = maxErrorOf(pts, bez, uPrime);
      if (err.max < error) return [bez];
      u = uPrime;
    }
  }
  // Split at the worst point and fit each side with a shared centre tangent.
  const split = err.at;
  const centre = unit(sub(pts[split - 1], pts[split + 1]));
  const left = fitCubic(pts.slice(0, split + 1), tHat1, centre, error);
  const right = fitCubic(pts.slice(split), mul(centre, -1), tHat2, error);
  return left.concat(right);
}

function chordLengthParameterize(pts: XY[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + norm(sub(pts[i], pts[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

/** Least-squares handle lengths along the two end tangents (Schneider's GenerateBezier). */
function generateBezier(pts: XY[], u: number[], tHat1: XY, tHat2: XY): CubicBezier {
  const first = pts[0], last = pts[pts.length - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i], mt = 1 - t;
    const b0 = mt * mt * mt, b1 = 3 * mt * mt * t, b2 = 3 * mt * t * t, b3 = t * t * t;
    const a0 = mul(tHat1, b1), a1 = mul(tHat2, b2);
    c00 += dot(a0, a0); c01 += dot(a0, a1); c11 += dot(a1, a1);
    const tmp = sub(pts[i], add(mul(first, b0 + b1), mul(last, b2 + b3)));
    x0 += dot(a0, tmp); x1 += dot(a1, tmp);
  }
  const detC = c00 * c11 - c01 * c01;
  const detCX = c00 * x1 - c01 * x0;
  const detXC = x0 * c11 - x1 * c01;
  let alphaL = detC === 0 ? 0 : detXC / detC;
  let alphaR = detC === 0 ? 0 : detCX / detC;
  const segLen = norm(sub(last, first));
  const epsilon = MIN_HANDLE * segLen;
  if (alphaL < epsilon || alphaR < epsilon) { alphaL = segLen / 3; alphaR = segLen / 3; }
  return [first, add(first, mul(tHat1, alphaL)), add(last, mul(tHat2, alphaR)), last];
}

function maxErrorOf(pts: XY[], bez: CubicBezier, u: number[]): { max: number; at: number } {
  let max = 0, at = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = norm(sub(bezierPoint(bez, u[i]), pts[i]));
    if (d > max) { max = d; at = i; }
  }
  return { max, at };
}

/** One Newton–Raphson step per point towards the parameter of its nearest curve point. */
function reparameterize(bez: CubicBezier, pts: XY[], u: number[]): number[] {
  return u.map((t, i) => {
    const q = bezierPoint(bez, t);
    const d1: [XY, XY, XY] = [mul(sub(bez[1], bez[0]), 3), mul(sub(bez[2], bez[1]), 3), mul(sub(bez[3], bez[2]), 3)];
    const d2: [XY, XY] = [mul(sub(d1[1], d1[0]), 2), mul(sub(d1[2], d1[1]), 2)];
    const mt = 1 - t;
    const q1 = add(add(mul(d1[0], mt * mt), mul(d1[1], 2 * mt * t)), mul(d1[2], t * t));
    const q2 = add(mul(d2[0], mt), mul(d2[1], t));
    const diff = sub(q, pts[i]);
    const numer = dot(diff, q1);
    const denom = dot(q1, q1) + dot(diff, q2);
    if (Math.abs(denom) < 1e-12) return t;
    const nt = t - numer / denom;
    return Math.min(1, Math.max(0, nt));
  });
}

/** Sample a chain of cubics into one polyline, denser on longer segments. */
export function beziersToPolyline(beziers: CubicBezier[]): XY[] {
  const out: XY[] = [];
  beziers.forEach((b, bi) => {
    const approxLen = norm(sub(b[1], b[0])) + norm(sub(b[2], b[1])) + norm(sub(b[3], b[2]));
    const steps = Math.min(32, Math.max(6, Math.ceil(approxLen / 6)));
    for (let i = bi === 0 ? 0 : 1; i <= steps; i++) out.push(bezierPoint(b, i / steps));
  });
  return out;
}
