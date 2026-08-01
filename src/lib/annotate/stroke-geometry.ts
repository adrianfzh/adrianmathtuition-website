// Geometry primitives for the annotate overlay: path measurement, RDP
// simplification, point↔segment distance, arc-length resampling. Pure — shared by
// shape-fit (snap detection) and hit-test (eraser).

export type XY = { x: number; y: number };

export function dist(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Total polyline length. 0 for fewer than 2 points. */
export function pathLength(points: XY[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

/** Shortest distance from point p to the segment a→b. */
export function pointSegmentDistance(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Perpendicular distance from point p to the infinite line through a→b. */
export function pointLineDistance(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return dist(p, a);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Largest distance from any interior point to the chord first→last. */
export function maxChordDeviation(points: XY[]): number {
  if (points.length < 3) return 0;
  const a = points[0], b = points[points.length - 1];
  let max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i], a, b);
    if (d > max) max = d;
  }
  return max;
}

/** Ramer–Douglas–Peucker simplification. Keeps endpoints; epsilon in input units. */
export function rdpSimplify<T extends XY>(points: T[], epsilon: number): T[] {
  if (points.length < 3) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = pointSegmentDistance(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > epsilon) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Resample a polyline to n points evenly spaced by arc length (endpoints kept).
 * Stabilises moment-based ellipse fitting against uneven pen-speed sampling.
 */
export function resampleByArcLength(points: XY[], n: number): XY[] {
  if (points.length < 2 || n < 2) return points.slice();
  const total = pathLength(points);
  if (total === 0) return [points[0], points[points.length - 1]];
  const step = total / (n - 1);
  const out: XY[] = [{ x: points[0].x, y: points[0].y }];
  let segIdx = 0;
  let segStartAcc = 0; // arc length at points[segIdx]
  for (let i = 1; i < n - 1; i++) {
    const target = i * step;
    while (segIdx < points.length - 2) {
      const segLen = dist(points[segIdx], points[segIdx + 1]);
      if (segStartAcc + segLen >= target) break;
      segStartAcc += segLen;
      segIdx++;
    }
    const a = points[segIdx], b = points[segIdx + 1];
    const segLen = dist(a, b) || 1;
    const t = Math.max(0, Math.min(1, (target - segStartAcc) / segLen));
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  out.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
  return out;
}

/** Smallest absolute difference between two angles (radians), in [0, π]. */
export function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}
