import { describe, expect, it } from 'vitest';
import { fitStroke, shapeToPolyline } from './shape-fit';
import type { StrokePoint } from './types';

// ── deterministic fixtures ───────────────────────────────────────────────────
// Seeded PRNG so "hand wobble" is the same on every run.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const noise = (rand: () => number, amp: number) => (rand() * 2 - 1) * amp;
const pt = (x: number, y: number): StrokePoint => ({ x, y, p: 0.5 });

/** Straight-ish line 0,0 → 300,6 with ±1.5px hand wobble. */
function wobblyLine(): StrokePoint[] {
  const rand = mulberry32(1);
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push(pt(t * 300 + noise(rand, 1), t * 6 + noise(rand, 1.5)));
  }
  return pts;
}

/** Deliberate quarter-circle arc, radius 150 — a curve, NOT a line. */
function deliberateArc(): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * (Math.PI / 2);
    pts.push(pt(150 * Math.cos(a), 150 * Math.sin(a)));
  }
  return pts;
}

/** Walk a rectangle's perimeter with noise; optionally rotated; start offset into the top edge. */
function rectLoop(w: number, h: number, angleDeg: number, startAlongTop = 0, seed = 2): StrokePoint[] {
  const rand = mulberry32(seed);
  const a = (angleDeg * Math.PI) / 180;
  const rot = (x: number, y: number) =>
    pt(x * Math.cos(a) - y * Math.sin(a) + 400, x * Math.sin(a) + y * Math.cos(a) + 300);
  const path: StrokePoint[] = [];
  const per = 2 * (w + h);
  const step = per / 80;
  // Walk from (startAlongTop, 0) all the way round, closing ~6px short of the start.
  let traveled = 0;
  while (traveled < per - 6) {
    const d = (startAlongTop + traveled) % per;
    let x: number, y: number;
    if (d < w) { x = d; y = 0; }
    else if (d < w + h) { x = w; y = d - w; }
    else if (d < 2 * w + h) { x = w - (d - w - h); y = h; }
    else { x = 0; y = h - (d - 2 * w - h); }
    path.push(rot(x + noise(rand, 1.5), y + noise(rand, 1.5)));
    traveled += step;
  }
  return path;
}

/** Ellipse loop with noise; full circle when rx === ry. Closes ~4px short. */
function ellipseLoop(rx: number, ry: number, seed = 3): StrokePoint[] {
  const rand = mulberry32(seed);
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= 70; i++) {
    const t = (i / 70) * 2 * Math.PI * 0.995;
    pts.push(pt(300 + rx * Math.cos(t) + noise(rand, 2), 300 + ry * Math.sin(t) + noise(rand, 2)));
  }
  return pts;
}

/** Open 270° C — closed enough to look loopy, but NOT a closed shape. */
function openC(): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= 50; i++) {
    const t = (i / 50) * 1.5 * Math.PI;
    pts.push(pt(200 + 100 * Math.cos(t), 200 + 100 * Math.sin(t)));
  }
  return pts;
}

function zigzag(): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = i * 10;
    pts.push(pt(x, (Math.floor(i / 8) % 2 === 0 ? 1 : -1) * (i % 8) * 10));
  }
  return pts;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('fitStroke — lines', () => {
  it('snaps a hand-wobbly line', () => {
    const fit = fitStroke(wobblyLine());
    expect(fit?.kind).toBe('line');
    if (fit?.kind === 'line') {
      expect(fit.x1).toBeCloseTo(0, -1);
      expect(fit.x2).toBeCloseTo(300, -1);
    }
  });
  it('a deliberate curve is never a line (since 22 Sep 2026 it is an arc)', () => {
    const fit = fitStroke(deliberateArc());
    expect(fit?.kind).toBe('arc');
  });
  it('a zigzag is never a line (since 22 Sep 2026 it is a smoothed curve)', () => {
    expect(fitStroke(zigzag())?.kind).toBe('curve');
  });
});

describe('fitStroke — rectangles', () => {
  it('snaps an axis-aligned loop to its bounding box', () => {
    const fit = fitStroke(rectLoop(200, 120, 0));
    expect(fit?.kind).toBe('rect');
    if (fit?.kind === 'rect') {
      expect(fit.angle).toBe(0);
      expect(fit.w).toBeGreaterThan(194);
      expect(fit.w).toBeLessThan(206);
      expect(fit.h).toBeGreaterThan(114);
      expect(fit.h).toBeLessThan(126);
    }
  });
  it('keeps the rotation of a rotated rectangle', () => {
    const fit = fitStroke(rectLoop(160, 100, 30));
    expect(fit?.kind).toBe('rect');
    if (fit?.kind === 'rect') {
      const deg = ((fit.angle * 180) / Math.PI + 180) % 90;
      expect(Math.min(deg, 90 - deg)).toBeGreaterThan(26);
      expect(Math.min(deg, 90 - deg)).toBeLessThanOrEqual(34);
    }
  });
  it('snaps a loop whose stroke starts mid-edge (extra collinear endpoint)', () => {
    const fit = fitStroke(rectLoop(200, 120, 0, 80, 7));
    expect(fit?.kind).toBe('rect');
  });
});

describe('fitStroke — ellipses and circles', () => {
  it('snaps a round-ish loop to a circle (equal axes)', () => {
    const fit = fitStroke(ellipseLoop(100, 100));
    expect(fit?.kind).toBe('ellipse');
    if (fit?.kind === 'ellipse') {
      expect(fit.rx).toBe(fit.ry);
      expect(fit.rx).toBeGreaterThan(93);
      expect(fit.rx).toBeLessThan(107);
    }
  });
  it('snaps an oval to an ellipse with distinct axes', () => {
    const fit = fitStroke(ellipseLoop(160, 90));
    expect(fit?.kind).toBe('ellipse');
    if (fit?.kind === 'ellipse') {
      expect(fit.rx).not.toBe(fit.ry);
      expect(Math.max(fit.rx, fit.ry)).toBeGreaterThan(145);
      expect(Math.min(fit.rx, fit.ry)).toBeLessThan(105);
    }
  });
  it('a circle is an ellipse, never a rectangle', () => {
    const fit = fitStroke(ellipseLoop(80, 80, 9));
    expect(fit?.kind).toBe('ellipse');
  });
});

describe('fitStroke — rejections', () => {
  it('an open C-shape is no closed shape (since 22 Sep 2026 it is a 270° arc)', () => {
    const fit = fitStroke(openC());
    expect(fit?.kind).toBe('arc');
    if (fit?.kind === 'arc') expect(Math.abs(fit.sweep)).toBeCloseTo(1.5 * Math.PI, 1);
  });
  it('strokes below minLength never snap', () => {
    const tiny = wobblyLine().map((p) => ({ ...p, x: p.x / 15, y: p.y / 15 }));
    expect(fitStroke(tiny, { minLength: 30 })).toBeNull();
  });
  it('too few points never snap', () => {
    expect(fitStroke([pt(0, 0), pt(100, 0), pt(200, 1)])).toBeNull();
  });
});

describe('shapeToPolyline', () => {
  it('line → 2 points', () => {
    const pts = shapeToPolyline({ kind: 'line', x1: 0, y1: 0, x2: 10, y2: 10 });
    expect(pts).toHaveLength(2);
    expect(pts[1]).toMatchObject({ x: 10, y: 10 });
  });
  it('rect → closed 5-point loop honouring rotation', () => {
    const pts = shapeToPolyline({ kind: 'rect', cx: 0, cy: 0, w: 10, h: 6, angle: Math.PI / 2 });
    expect(pts).toHaveLength(5);
    expect(pts[0]).toMatchObject(pts[4]);
    // Rotated 90°: the box now spans 6 wide × 10 tall.
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10);
  });
  it('ellipse → closed 33-point loop', () => {
    const pts = shapeToPolyline({ kind: 'ellipse', cx: 5, cy: 5, rx: 4, ry: 2, angle: 0 });
    expect(pts).toHaveLength(33);
    expect(pts[0].x).toBeCloseTo(pts[32].x);
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(9);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(7);
  });
});

describe('triangle (17 Sep 2026)', () => {
  const walk = (corners: { x: number; y: number }[], perSide = 12) => {
    const pts: { x: number; y: number; p: number }[] = [];
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i], b = corners[(i + 1) % corners.length];
      for (let k = 0; k < perSide; k++) pts.push({ x: a.x + (b.x - a.x) * (k / perSide), y: a.y + (b.y - a.y) * (k / perSide), p: 0.5 });
    }
    pts.push({ x: corners[0].x + 2, y: corners[0].y - 1, p: 0.5 });
    return pts;
  };
  it('a three-cornered loop snaps to a triangle that closes on itself', () => {
    const fit = fitStroke(walk([{ x: 100, y: 300 }, { x: 300, y: 300 }, { x: 200, y: 100 }]));
    expect(fit?.kind).toBe('triangle');
    const poly = shapeToPolyline(fit!);
    expect(poly).toHaveLength(4);
    expect(poly[0]).toEqual(poly[3]);
  });
  it('a four-cornered loop is still a rect', () => {
    expect(fitStroke(walk([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 250 }, { x: 100, y: 250 }]))?.kind).toBe('rect');
  });
});

describe('real hands (17 Sep 2026)', () => {
  it('a triangle with rounded corners still snaps', () => {
    const c = [{ x: 100, y: 300 }, { x: 320, y: 310 }, { x: 210, y: 110 }];
    const pts: { x: number; y: number; p: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const a = c[i], b = c[(i + 1) % 3], n = c[(i + 2) % 3];
      for (let k = 0; k < 18; k++) { const t = k / 18; pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: 0.5 }); }
      // the rounded corner: a short arc bending towards the next side
      for (let k = 1; k <= 3; k++) { const t = k / 4; pts.push({ x: b.x + (n.x - b.x) * t * 0.08 - (b.x - a.x) * (1 - t) * 0.05, y: b.y + (n.y - b.y) * t * 0.08 - (b.y - a.y) * (1 - t) * 0.05, p: 0.5 }); }
    }
    expect(fitStroke(pts)?.kind).toBe('triangle');
  });
  it('a slightly oval hand circle snaps to a true circle', () => {
    const pts: { x: number; y: number; p: number }[] = [];
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2 * 0.95; pts.push({ x: 300 + 120 * Math.cos(a), y: 300 + 100 * Math.sin(a), p: 0.5 }); }
    const fit = fitStroke(pts);
    expect(fit?.kind).toBe('ellipse');
    if (fit?.kind === 'ellipse') expect(fit.rx).toBeCloseTo(fit.ry, 6);
  });
});

// ── 22 Sep 2026: what a real hold on the iPad delivers (Adrian: "draw and hold to turn
// into a perfect circle … usually turns into a square") ─────────────────────────────
import { cleanLoop, trimClusters } from './shape-fit';
import { pathLength } from './stroke-geometry';

/** A hand circle: sparse (n points), jittered, overshooting the start by `close`−1 of a turn, ending in a hold cluster. */
function handCircle(R: number, opts: { n?: number; jitter?: number; close?: number; tail?: number; seed?: number; squareness?: number } = {}): StrokePoint[] {
  const { n = 24, jitter = 2, close = 1, tail = 30, seed = 5, squareness = 0 } = opts;
  const rand = mulberry32(seed);
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = 0.3 + (i / n) * 2 * Math.PI * close;
    const r = R * (1 + squareness * Math.cos(4 * (t - 0.3 - Math.PI / 4)));
    pts.push(pt(300 + r * Math.cos(t) + noise(rand, jitter), 300 + r * Math.sin(t) + noise(rand, jitter)));
  }
  const last = pts[pts.length - 1];
  for (let i = 0; i < tail; i++) pts.push(pt(last.x + noise(rand, 1.5), last.y + noise(rand, 1.5)));
  return pts;
}
/** A rounded square (superellipse exponent 12) drawn the same way. */
function handSquare(a: number, opts: { n?: number; jitter?: number; close?: number; tail?: number; seed?: number; rot?: number } = {}): StrokePoint[] {
  const { n = 40, jitter = 2, close = 1.08, tail = 30, seed = 6, rot = 0 } = opts;
  const rand = mulberry32(seed);
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = 0.3 + (i / n) * 2 * Math.PI * close, c = Math.cos(t), s = Math.sin(t);
    const x = a * Math.sign(c) * Math.abs(c) ** (2 / 12), y = a * Math.sign(s) * Math.abs(s) ** (2 / 12);
    pts.push(pt(300 + x * Math.cos(rot) - y * Math.sin(rot) + noise(rand, jitter), 300 + x * Math.sin(rot) + y * Math.cos(rot) + noise(rand, jitter)));
  }
  const last = pts[pts.length - 1];
  for (let i = 0; i < tail; i++) pts.push(pt(last.x + noise(rand, 1.5), last.y + noise(rand, 1.5)));
  return pts;
}

describe('a held stroke on the iPad (22 Sep 2026)', () => {
  it('trimClusters collapses the hold cluster at the end and the pen-down blob at the start', () => {
    const raw = handCircle(60, { tail: 40 });
    const out = trimClusters(raw);
    expect(out.length).toBeLessThan(raw.length - 30);
    expect(out[out.length - 1]).toBeDefined();
    // the head is untouched when there is no cluster there
    expect(out[0]).toEqual(raw[0]);
  });
  it('cleanLoop cuts the overshoot so the loop is about one perimeter long', () => {
    const loop = cleanLoop(handCircle(60, { close: 1.18, jitter: 0, tail: 0, n: 60 }));
    expect(pathLength(loop)).toBeGreaterThan(2 * Math.PI * 60 * 0.9);
    expect(pathLength(loop)).toBeLessThan(2 * Math.PI * 60 * 1.06);
  });
  it('a circle ending in a hold cluster is a circle', () => {
    for (const seed of [1, 2, 3, 4]) {
      const fit = fitStroke(handCircle(40, { seed }), { minLength: 20 });
      expect(fit?.kind, `seed ${seed}`).toBe('ellipse');
      if (fit?.kind === 'ellipse') expect(fit.rx).toBeCloseTo(fit.ry, 6);
    }
  });
  it('a circle that overshoots its start is still a circle', () => {
    for (const close of [1.08, 1.15, 1.25]) {
      const fit = fitStroke(handCircle(60, { close, n: 40 }), { minLength: 20 });
      expect(fit?.kind, `close ${close}`).toBe('ellipse');
      if (fit?.kind === 'ellipse') { expect(fit.rx).toBeCloseTo(fit.ry, 6); expect(fit.rx).toBeGreaterThan(52); expect(fit.rx).toBeLessThan(68); }
    }
  });
  it('a small, sparse, lumpy hand circle snaps to a circle, never a rectangle', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const fit = fitStroke(handCircle(25, { n: 20, jitter: 2, squareness: 0.12, seed }), { minLength: 20 });
      expect(fit?.kind, `seed ${seed}`).toBe('ellipse');
    }
  });
  it('a rounded square with an overshoot and a hold cluster is a rectangle, not a circle', () => {
    for (const rot of [0, 0.35]) for (const seed of [1, 2, 3]) {
      const fit = fitStroke(handSquare(50, { rot, seed }), { minLength: 20 });
      expect(fit?.kind, `rot ${rot} seed ${seed}`).toBe('rect');
    }
  });
  it('a held straight line with a hold cluster is a line', () => {
    const rand = mulberry32(8);
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= 20; i++) pts.push(pt(i * 10 + noise(rand, 1), 100 + i * 0.5 + noise(rand, 1.5)));
    for (let i = 0; i < 30; i++) pts.push(pt(200 + noise(rand, 1.5), 110 + noise(rand, 1.5)));
    const fit = fitStroke(pts, { minLength: 20 });
    expect(fit?.kind).toBe('line');
    if (fit?.kind === 'line') expect(fit.x2).toBeGreaterThan(195);
  });
});

// ── arcs and curves (22 Sep 2026, Adrian: "trace a curve … snaps to the closest fitted curve, like Notability") ──

/** A hand-drawn arc: radius r, from angle a to b, ±jitter, ending in a hold cluster. */
function handArc(r: number, a: number, b: number, opts: { seed?: number; jitter?: number; tail?: number; n?: number } = {}): StrokePoint[] {
  const { seed = 1, jitter = 1.2, tail = 25, n = 40 } = opts;
  const rand = mulberry32(seed);
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a + ((b - a) * i) / n;
    pts.push(pt(300 + r * Math.cos(t) + noise(rand, jitter), 300 + r * Math.sin(t) + noise(rand, jitter)));
  }
  const end = pts[pts.length - 1];
  for (let i = 0; i < tail; i++) pts.push(pt(end.x + noise(rand, 0.8), end.y + noise(rand, 0.8)));
  return pts;
}

/** A wobbly S-curve (a sine over 400 px) — no shape, but a curve the hand meant. */
function handS(seed = 1, jitter = 1.5): StrokePoint[] {
  const rand = mulberry32(seed);
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = (i / 60) * 400;
    pts.push(pt(x + noise(rand, jitter), 80 * Math.sin((x / 400) * 2 * Math.PI) + noise(rand, jitter)));
  }
  return pts;
}

/** Mean distance from the drawn points to the fitted polyline. */
function residual(points: StrokePoint[], poly: StrokePoint[]): number {
  let sum = 0;
  for (const p of points) {
    let best = Infinity;
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1], b = poly[i];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      if (d < best) best = d;
    }
    sum += best;
  }
  return sum / points.length;
}

describe('arcs (22 Sep 2026)', () => {
  it('a hand arc ending in a hold cluster snaps to the circle it sits on', () => {
    for (const seed of [1, 2, 3]) {
      const fit = fitStroke(handArc(120, 0.2, 2.0, { seed }), { minLength: 20 });
      expect(fit?.kind, `seed ${seed}`).toBe('arc');
      if (fit?.kind === 'arc') {
        expect(fit.r).toBeCloseTo(120, -1);
        expect(fit.cx).toBeCloseTo(300, -1);
        expect(fit.cy).toBeCloseTo(300, -1);
        expect(fit.sweep).toBeCloseTo(1.8, 1);
      }
    }
  });
  it('the arc keeps the ends where the hand put them', () => {
    const raw = handArc(100, -1, 1, { jitter: 0, tail: 0 });
    const fit = fitStroke(raw, { minLength: 20 });
    expect(fit?.kind).toBe('arc');
    const poly = shapeToPolyline(fit!);
    expect(Math.hypot(poly[0].x - raw[0].x, poly[0].y - raw[0].y)).toBeLessThan(3);
    const last = raw[raw.length - 1], plast = poly[poly.length - 1];
    expect(Math.hypot(plast.x - last.x, plast.y - last.y)).toBeLessThan(3);
  });
  it('a shallow bend (under 25°) is a line, not an arc', () => {
    const fit = fitStroke(handArc(600, 0, 0.3, { jitter: 0, tail: 0 }), { minLength: 20 });
    expect(fit?.kind).toBe('line');
  });
  it('a near-full loop is a circle, not an arc', () => {
    const fit = fitStroke(handArc(80, 0, 6.0, { jitter: 0.5 }), { minLength: 20 });
    expect(fit?.kind).toBe('ellipse');
  });
  it('an arc → a dense polyline along the circle', () => {
    const poly = shapeToPolyline({ kind: 'arc', cx: 0, cy: 0, r: 100, a0: 0, sweep: Math.PI / 2 });
    expect(poly.length).toBeGreaterThan(8);
    for (const p of poly) expect(Math.hypot(p.x, p.y)).toBeCloseTo(100, 6);
    expect(poly[poly.length - 1].x).toBeCloseTo(0, 6);
    expect(poly[poly.length - 1].y).toBeCloseTo(100, 6);
  });
});

describe('smoothed curves (22 Sep 2026)', () => {
  it('a wobbly S-curve becomes a smooth curve that follows the hand', () => {
    for (const seed of [1, 2]) {
      const raw = handS(seed);
      const fit = fitStroke(raw, { minLength: 20 });
      expect(fit?.kind, `seed ${seed}`).toBe('curve');
      const poly = shapeToPolyline(fit!);
      // stays on the drawn path (well within the 2 % tolerance) …
      expect(residual(raw, poly)).toBeLessThan(0.015 * 500);
      // … with the ends close to where the hand started and stopped (the pen-down
      // blob and the hold cluster collapse to their centroids first)
      expect(Math.hypot(poly[0].x - raw[0].x, poly[0].y - raw[0].y)).toBeLessThan(8);
      const last = raw[raw.length - 1], plast = poly[poly.length - 1];
      expect(Math.hypot(plast.x - last.x, plast.y - last.y)).toBeLessThan(8);
    }
  });
  it('the smoothed curve has far fewer bends than the jitter (few Béziers)', () => {
    const fit = fitStroke(handS(3), { minLength: 20 });
    expect(fit?.kind).toBe('curve');
    if (fit?.kind === 'curve') expect(fit.beziers.length).toBeLessThanOrEqual(8);
  });
  it('a closed blob that is no shape becomes a closed smooth curve', () => {
    // a heart — not a rect, triangle or ellipse (a gently dented circle is still
    // an ellipse on purpose: hand circles are lumpy)
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= 80; i++) {
      const t = (i / 80) * 2 * Math.PI;
      pts.push(pt(
        200 + 8 * 16 * Math.sin(t) ** 3,
        200 - 8 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
      ));
    }
    const fit = fitStroke(pts, { minLength: 20 });
    expect(fit?.kind).toBe('curve');
    const poly = shapeToPolyline(fit!);
    const a = poly[0], b = poly[poly.length - 1];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
  });
  it('a curve below minLength still keeps its freehand ink', () => {
    const raw = handS(1).map((p) => ({ ...p, x: p.x / 20, y: p.y / 20 }));
    expect(fitStroke(raw, { minLength: 30 })).toBeNull();
  });
});
