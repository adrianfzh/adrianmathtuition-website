import { describe, it, expect } from 'vitest';
import {
  buildWritePlan, easeStroke, hash2, mulberry32, orderStrokes, pathLength, penAt, rdp, seedFrom,
  smoothPath, thinBitmap, traceSkeleton, valueNoise, PRUNE_PX,
  type Chain, type PlanStroke, type Pt,
} from './chalk-strokes';

/** A blank bitmap with a 1-px border, and a filled-rectangle helper. */
function grid(w: number, h: number) {
  const bin = new Uint8Array(w * h);
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) bin[y * w + x] = 1;
  };
  const ink = () => {
    const out: Pt[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bin[y * w + x]) out.push([x, y]);
    return out;
  };
  return { bin, fill, ink, w, h };
}

const line = (from: Pt, to: Pt, n = 12): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n] as Pt);

describe('thinBitmap (Zhang–Suen)', () => {
  it('reduces a fat bar to a one-pixel line down its middle, end to end', () => {
    const g = grid(13, 26);
    g.fill(4, 3, 8, 22);                 // 5 px wide, 20 tall
    thinBitmap(g.bin, g.w, g.h);
    const ink = g.ink();
    expect(ink.length).toBeGreaterThan(10);
    // one pixel per row, and every one of them near the bar's centreline
    const rows = new Map<number, number>();
    for (const [x, y] of ink) rows.set(y, (rows.get(y) ?? 0) + 1);
    for (const [, n] of rows) expect(n).toBe(1);
    for (const [x] of ink) expect(Math.abs(x - 6)).toBeLessThanOrEqual(1);
    // the skeleton still spans (most of) the bar
    const ys = ink.map(p => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(14);
  });

  it('keeps a cross connected — the thinned figure still touches all four arms', () => {
    const g = grid(25, 25);
    g.fill(10, 3, 14, 21);
    g.fill(3, 10, 21, 14);
    thinBitmap(g.bin, g.w, g.h);
    const ink = g.ink();
    const xs = ink.map(p => p[0]), ys = ink.map(p => p[1]);
    expect(Math.min(...xs)).toBeLessThanOrEqual(6);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(18);
    expect(Math.min(...ys)).toBeLessThanOrEqual(6);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(18);
  });

  it('leaves an already-thin figure alone', () => {
    const g = grid(12, 12);
    for (let y = 2; y <= 9; y++) g.bin[y * 12 + 6] = 1;
    const before = g.ink().length;
    thinBitmap(g.bin, g.w, g.h);
    expect(g.ink().length).toBe(before);
  });
});

describe('traceSkeleton', () => {
  it('a bar is ONE chain, roughly as long as the bar', () => {
    const g = grid(13, 26);
    g.fill(4, 3, 8, 22);
    thinBitmap(g.bin, g.w, g.h);
    const chains = traceSkeleton(g.bin, g.w, g.h);
    expect(chains.length).toBe(1);
    expect(chains[0].cycle).toBe(false);
    expect(pathLength(chains[0].pts)).toBeGreaterThanOrEqual(14);
  });

  it('a cross comes out as two strokes THROUGH the junction, not four stubs', () => {
    const g = grid(25, 25);
    g.fill(11, 3, 13, 21);
    g.fill(3, 11, 21, 13);
    thinBitmap(g.bin, g.w, g.h);
    const chains = traceSkeleton(g.bin, g.w, g.h);
    // the collinear merge is the point: the stem and the bar survive whole
    const long = chains.filter(c => pathLength(c.pts) > 12);
    expect(long.length).toBe(2);
    const spans = long.map(c => {
      const xs = c.pts.map(p => p[0]), ys = c.pts.map(p => p[1]);
      return { dx: Math.max(...xs) - Math.min(...xs), dy: Math.max(...ys) - Math.min(...ys) };
    });
    expect(spans.some(s => s.dy > s.dx)).toBe(true);   // the stem
    expect(spans.some(s => s.dx > s.dy)).toBe(true);   // the crossbar
  });

  it('a closed loop — the bowl of an "o" — is traced as one cycle that closes on itself', () => {
    // A one-pixel ring. Note it is FULL of staircase corners with three
    // 8-neighbours, so the tracer sees junctions everywhere; what makes it a
    // cycle is that the merged chain leaves one junction and returns to it.
    const N = 41, R = 15;
    const g = grid(N, N);
    const c = (N - 1) / 2;
    for (let k = 0; k < 720; k++) {
      const t = (k / 720) * Math.PI * 2;
      g.bin[Math.round(c + Math.sin(t) * R) * N + Math.round(c + Math.cos(t) * R)] = 1;
    }
    const chains = traceSkeleton(g.bin, g.w, g.h);
    expect(chains).toHaveLength(1);
    expect(chains[0].cycle).toBe(true);
    const pts = chains[0].pts;
    expect(Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1])).toBe(0);
    expect(pathLength(pts)).toBeGreaterThan(2 * Math.PI * R * 0.9);
  });

  it('prunes thinning spurs shorter than the threshold', () => {
    const g = grid(30, 14);
    g.fill(3, 5, 26, 8);                                // a bar with a bulge that thins into a spur
    g.fill(14, 3, 16, 8);
    thinBitmap(g.bin, g.w, g.h);
    const chains = traceSkeleton(g.bin, g.w, g.h);
    for (const c of chains) expect(pathLength(c.pts)).toBeGreaterThanOrEqual(Math.min(PRUNE_PX, 3));
  });
});

describe('smoothing', () => {
  it('rdp collapses a straight run to its two ends and keeps a real corner', () => {
    expect(rdp(line([0, 0], [10, 0], 20), 0.5)).toHaveLength(2);
    const bent = [...line([0, 0], [5, 0], 5), ...line([5, 0], [5, 5], 5).slice(1)];
    const out = rdp(bent, 0.5);
    expect(out.length).toBe(3);
    expect(out[1]).toEqual([5, 0]);
  });

  it('smoothPath keeps the endpoints and pulls a spike in', () => {
    const spiky: Pt[] = [[0, 0], [1, 4], [2, 0], [3, 0]];
    const out = smoothPath(spiky);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([3, 0]);
    expect(out[1][1]).toBeLessThan(4);
  });

  it('pathLength adds up the segments', () => {
    expect(pathLength([[0, 0], [3, 4], [3, 8]])).toBeCloseTo(9, 6);
  });
});

describe('orderStrokes — a plausible hand', () => {
  const chain = (pts: Pt[], cycle = false): Chain => ({ pts, cycle });

  it('writes the longest stroke first, then left to right, dots last', () => {
    const stem = chain(line([0.2, -0.7], [0.2, 0], 8));       // the long one
    const barLeft = chain(line([0.05, -0.35], [0.18, -0.35], 4));
    const barRight = chain(line([0.45, -0.35], [0.6, -0.35], 4));
    const dot = chain(line([0.5, -0.72], [0.51, -0.71], 2));  // a tittle
    const out = orderStrokes([barRight, dot, stem, barLeft]);
    expect(out[0].pts).toEqual(stem.pts);
    expect(out[out.length - 1].pts[0][0]).toBeCloseTo(0.5, 5);   // the dot went last
    const [a, b] = [out[1], out[2]];
    expect(a.pts[0][0]).toBeLessThan(b.pts[0][0]);               // left before right
  });

  it('runs an open stroke top-left → bottom-right whichever way it was traced', () => {
    const down = orderStrokes([chain(line([0, -0.6], [0.3, 0], 6))])[0];
    const up = orderStrokes([chain(line([0.3, 0], [0, -0.6], 6))])[0];
    expect(down.pts[0][1]).toBeLessThan(down.pts[down.pts.length - 1][1]);
    expect(up.pts[0][1]).toBeLessThan(up.pts[up.pts.length - 1][1]);
  });

  it('starts a cycle at its topmost point and turns anticlockwise, like an "o"', () => {
    const ring: Pt[] = [];
    for (let k = 0; k <= 24; k++) {
      const t = (k / 24) * Math.PI * 2;
      ring.push([0.25 + Math.cos(t) * 0.25, -0.25 + Math.sin(t) * 0.25]);
    }
    const out = orderStrokes([chain(ring, true)])[0];
    const top = Math.min(...out.pts.map(p => p[1]));
    expect(out.pts[0][1]).toBeCloseTo(top, 5);
    // the first tenth of the path heads LEFT — the way a hand opens a bowl
    const k = Math.max(1, Math.floor(out.pts.length * 0.08));
    expect(out.pts[k][0]).toBeLessThanOrEqual(out.pts[0][0]);
  });

  it('a single stroke needs no ordering', () => {
    expect(orderStrokes([chain(line([0, 0], [1, 1], 3))])).toHaveLength(1);
  });
});

describe('buildWritePlan — the rhythm', () => {
  const stroke = (pts: Pt[], glyph: number, word: number, size = 24): PlanStroke => ({ pts, glyph, word, size });
  const rng = () => mulberry32(12345);

  it('normalises to 0‥1, never runs backwards, and covers every stroke', () => {
    const plan = buildWritePlan([
      stroke(line([0, 0], [10, 0]), 0, 0),
      stroke(line([14, 0], [24, 0]), 1, 0),
      stroke(line([40, 0], [60, 0]), 2, 1),
    ], rng());
    expect(plan.total).toBe(1);
    expect(plan.strokes).toHaveLength(3);
    const all = plan.strokes.flatMap(s => s.times);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...all)).toBeCloseTo(1, 6);
    for (const s of plan.strokes) {
      for (let i = 1; i < s.times.length; i++) expect(s.times[i]).toBeGreaterThanOrEqual(s.times[i - 1]);
    }
    for (let i = 1; i < plan.strokes.length; i++) {
      const prevEnd = plan.strokes[i - 1].times.at(-1) as number;
      expect(plan.strokes[i].times[0]).toBeGreaterThan(prevEnd);
    }
    // segments tile the timeline in order
    for (let i = 1; i < plan.segments.length; i++) {
      expect(plan.segments[i].t0).toBeCloseTo(plan.segments[i - 1].t1, 6);
    }
  });

  it('the pen LIFTS between words and pauses longer there than between letters', () => {
    const plan = buildWritePlan([
      stroke(line([0, 0], [10, 0]), 0, 0),
      stroke(line([13, 0], [23, 0]), 1, 0),   // next letter, same word
      stroke(line([40, 0], [50, 0]), 2, 1),   // next word
    ], rng());
    const moves = plan.segments.filter(s => s.kind === 'move');
    expect(moves).toHaveLength(2);
    const [betweenLetters, betweenWords] = moves as Extract<typeof moves[number], { kind: 'move' }>[];
    expect(betweenWords.pause).toBeGreaterThan(betweenLetters.pause * 2);
    expect(betweenWords.lift).toBe(true);
  });

  it('a long stroke takes longer than a short one, but not proportionally', () => {
    const one = buildWritePlan([stroke(line([0, 0], [20, 0]), 0, 0)], rng());
    const four = buildWritePlan([stroke(line([0, 0], [80, 0]), 0, 0)], rng());
    // both are normalised, so compare the raw durations through a shared plan
    const mixed = buildWritePlan([
      stroke(line([0, 0], [20, 0]), 0, 0),
      stroke(line([0, 40], [80, 40]), 1, 1),
    ], rng());
    const [shortSeg, longSeg] = mixed.segments.filter(s => s.kind === 'draw');
    const dShort = shortSeg.t1 - shortSeg.t0, dLong = longSeg.t1 - longSeg.t0;
    expect(dLong).toBeGreaterThan(dShort);
    expect(dLong).toBeLessThan(dShort * 4);     // 4× the length is not 4× the time
    expect(one.total).toBe(four.total);
  });

  it('is deterministic — the same phrase writes the same way every replay', () => {
    const strokes = [stroke(line([0, 0], [10, 0]), 0, 0), stroke(line([30, 0], [40, 0]), 1, 1)];
    const a = buildWritePlan(strokes, mulberry32(seedFrom('half the coefficient')));
    const b = buildWritePlan(strokes, mulberry32(seedFrom('half the coefficient')));
    expect(a.strokes.map(s => s.times)).toEqual(b.strokes.map(s => s.times));
  });

  it('an empty phrase is an empty plan, not a crash', () => {
    const plan = buildWritePlan([], rng());
    expect(plan.segments).toHaveLength(0);
    expect(penAt(plan, 0.5)).toBeNull();
  });
});

describe('penAt — where the tip is', () => {
  const plan = buildWritePlan([
    { pts: line([0, 0], [40, 0]), glyph: 0, word: 0, size: 24 },
    { pts: line([90, 0], [130, 0]), glyph: 1, word: 1, size: 24 },
  ], mulberry32(7));

  it('starts on the first point and ends on the last, touching the board', () => {
    const a = penAt(plan, 0);
    const z = penAt(plan, 1);
    expect(a).toMatchObject({ x: 0, y: 0, down: true });
    expect(z?.x).toBeCloseTo(130, 6);
    expect(z?.down).toBe(true);
  });

  it('moves left to right along a stroke, monotonically', () => {
    let last = -Infinity;
    for (let t = 0; t <= 0.35; t += 0.01) {
      const p = penAt(plan, t);
      expect(p!.x).toBeGreaterThanOrEqual(last - 1e-9);
      last = p!.x;
    }
  });

  it('lifts off the board between the two words', () => {
    const move = plan.segments.find(s => s.kind === 'move') as Extract<typeof plan.segments[number], { kind: 'move' }>;
    const mid = move.t0 + move.pause + (move.t1 - move.t0 - move.pause) / 2;   // past the pause, mid-hop
    const p = penAt(plan, mid)!;
    expect(p.lifted).toBe(true);
    expect(p.down).toBe(false);
    expect(p.y).toBeLessThan(0);                 // the hop arcs above the line
  });

  it('holds still while the pause before a move runs out', () => {
    const move = plan.segments.find(s => s.kind === 'move') as Extract<typeof plan.segments[number], { kind: 'move' }>;
    const p = penAt(plan, move.t0 + move.pause * 0.4)!;
    expect(p.x).toBeCloseTo(move.from[0], 6);
  });
});

describe('the chalk grain (noise)', () => {
  it('hash2 is in [0,1), stable, and different for different cells', () => {
    for (let i = 0; i < 50; i++) {
      const v = hash2(i, i * 3, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5));
    expect(hash2(3, 4, 5)).not.toBe(hash2(4, 3, 5));
    expect(hash2(3, 4, 5)).not.toBe(hash2(3, 4, 6));
  });

  it('valueNoise is smooth: neighbouring samples are close, distant ones are not tied', () => {
    const a = valueNoise(10.0, 4.0, 1), b = valueNoise(10.02, 4.0, 1);
    expect(Math.abs(a - b)).toBeLessThan(0.06);
    expect(valueNoise(10, 4, 1)).not.toBe(valueNoise(37.5, 91.25, 1));
    for (let i = 0; i < 40; i++) {
      const v = valueNoise(i * 0.37, i * 1.1, 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('mulberry32 replays exactly, and seedFrom separates two phrases', () => {
    const a = mulberry32(99), b = mulberry32(99);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
    expect(seedFrom('square it')).toBe(seedFrom('square it'));
    expect(seedFrom('square it')).not.toBe(seedFrom('square them'));
  });

  it('easeStroke runs 0 → 1, monotonically, faster through the middle than at the ends', () => {
    expect(easeStroke(0)).toBe(0);
    expect(easeStroke(1)).toBe(1);
    for (let u = 0; u < 0.999; u += 0.05) expect(easeStroke(u + 0.05)).toBeGreaterThan(easeStroke(u));
    // the SPEED, not the position: a hand accelerates into a stroke and eases out
    const speed = (u: number) => (easeStroke(u + 0.005) - easeStroke(u - 0.005)) / 0.01;
    expect(speed(0.5)).toBeGreaterThan(speed(0.02) * 1.8);
    expect(speed(0.5)).toBeGreaterThan(speed(0.98) * 1.8);
  });
});
