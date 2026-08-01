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
  it('does NOT snap a deliberate curve', () => {
    expect(fitStroke(deliberateArc())).toBeNull();
  });
  it('does NOT snap a zigzag', () => {
    expect(fitStroke(zigzag())).toBeNull();
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
  it('an open C-shape fits nothing', () => {
    expect(fitStroke(openC())).toBeNull();
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
