// Handwriting motion, as maths — the pure half of the chalk writing engine.
//
// The lesson player's chalk / paper stages do not "reveal" a sentence behind a
// moving curtain; a chalk tip WRITES it, and the ink appears only where the tip
// has been. Everything that decides the shape and the rhythm of that hand lives
// here, with no DOM and no canvas, so it can be unit-tested:
//
//   1. thinBitmap      Zhang–Suen thinning: a filled glyph bitmap → a 1-px
//                      skeleton (the line a pen would have taken).
//   2. traceSkeleton   the skeleton → ordered pixel chains, junctions resolved,
//                      spurs pruned, collinear chains merged through junctions.
//   3. smoothPath/rdp  smooth the staircase, drop redundant points.
//   4. orderStrokes    a plausible writing order: longest stroke first, then
//                      left to right, tiny marks (dots, accents) last.
//   5. buildWritePlan  strokes + word/letter boundaries → a timeline: stroke
//                      durations that grow sub-linearly with length, pen moves
//                      between them, lifts, and pauses between letters and
//                      (longer) between words. Normalised to 0‥1 so the caller
//                      can pace it to a narration clip of any length.
//   6. penAt           where the tip is at time t, and whether it is touching.
//
// Ported from the 2026-09-04 ink probe Adrian chose from (its sample (a) +
// the Kalam hand), with the algorithms unchanged and the constants named.
//
// The honest weakness, recorded so nobody rediscovers it as a bug: stroke ORDER
// is guessed from geometry, not from how a person actually forms the letter. An
// attentive eye will catch the odd crossbar drawn before its stem. Every "e" is
// also identical, which is why the caller jitters each letter's tilt and drift.
// The way out is real stroke data (§ docs/LESSONS.md, "Adrian's own hand") —
// buildWritePlan takes strokes, and does not care where they came from.
//
// Pure module (repo testing policy): no I/O, no DOM, no React.

export type Pt = [number, number];

export interface Chain {
  pts: Pt[];
  /** A closed loop (an "o", the bowl of a "b") — traced from its top. */
  cycle: boolean;
}

// ── 1. Thinning ──────────────────────────────────────────────────────────────

/**
 * Zhang–Suen thinning, in place: `bin` is a w×h array of 0/1 (1 = ink) with a
 * ≥ 1 px empty border, and comes back as a 1-px-wide skeleton. Both sub-
 * iterations run until a pass deletes nothing.
 */
export function thinBitmap(bin: Uint8Array, w: number, h: number): void {
  let changed = true;
  const del: number[] = [];
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!bin[i]) continue;
          // p2..p9 clockwise from north.
          const p2 = bin[i - w], p3 = bin[i - w + 1], p4 = bin[i + 1], p5 = bin[i + w + 1];
          const p6 = bin[i + w], p7 = bin[i + w - 1], p8 = bin[i - 1], p9 = bin[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          let A = 0;
          if (!p2 && p3) A++; if (!p3 && p4) A++; if (!p4 && p5) A++; if (!p5 && p6) A++;
          if (!p6 && p7) A++; if (!p7 && p8) A++; if (!p8 && p9) A++; if (!p9 && p2) A++;
          if (A !== 1) continue;
          if (pass === 0) { if (p2 * p4 * p6 || p4 * p6 * p8) continue; }
          else { if (p2 * p4 * p8 || p2 * p6 * p8) continue; }
          del.push(i);
        }
      }
      if (del.length) { changed = true; for (const i of del) bin[i] = 0; }
    }
  }
}

// ── 2. Tracing ───────────────────────────────────────────────────────────────

/** 4-neighbours first, so a walk prefers the orthogonal continuation. */
const N8: readonly Pt[] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];

/** A spur (or a tiny junction loop) shorter than this many pixels is thinning noise. */
export const PRUNE_PX = 7;
/** Two chains meeting at a junction merge when their directions oppose by more than this. */
const MERGE_DOT = -0.25;

export function pathLength(p: readonly Pt[]): number {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return L;
}

/**
 * A thinned bitmap → the pen chains it implies. Junction pixels are clustered
 * into nodes; every chain runs endpoint→junction, junction→junction or round a
 * cycle. Spurs are pruned, then chains that run straight THROUGH a junction are
 * merged, so a crossed "t" comes out as one long stroke plus one crossbar
 * rather than four stubs.
 */
export function traceSkeleton(bin: Uint8Array, w: number, h: number): Chain[] {
  const deg = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!bin[i]) continue;
      let d = 0;
      for (const [dx, dy] of N8) if (bin[i + dy * w + dx]) d++;
      deg[i] = d;
    }
  }

  // Junction clusters (degree ≥ 3 pixels that touch each other) → one node.
  const junc = new Int32Array(w * h).fill(-1);
  const nodes: { cx: number; cy: number }[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!bin[i] || deg[i] < 3 || junc[i] >= 0) continue;
      const id = nodes.length;
      const px: number[] = [];
      const st = [i];
      junc[i] = id;
      while (st.length) {
        const j = st.pop() as number;
        px.push(j);
        const jx = j % w, jy = (j - jx) / w;
        for (const [dx, dy] of N8) {
          const k = (jy + dy) * w + (jx + dx);
          if (bin[k] && deg[k] >= 3 && junc[k] < 0) { junc[k] = id; st.push(k); }
        }
      }
      let cx = 0, cy = 0;
      for (const j of px) { cx += j % w; cy += Math.floor(j / w); }
      nodes.push({ cx: cx / px.length, cy: cy / px.length });
    }
  }

  const visited = new Uint8Array(w * h);
  type Raw = { pts: Pt[]; a: number; b: number; cycle?: boolean };
  const chains: Raw[] = [];

  const walk = (x: number, y: number, fromNode: number): Raw => {
    const pts: Pt[] = [];
    let endNode = -1;
    let first = true;
    for (;;) {
      const i = y * w + x;
      visited[i] = 1;
      pts.push([x, y]);
      let touch = -1, nx = -1, ny = -1;
      for (const [dx, dy] of N8) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!bin[j]) continue;
        if (junc[j] >= 0) {
          if (first && junc[j] === fromNode) continue;
          if (touch < 0) touch = junc[j];
          continue;
        }
        if (visited[j]) continue;
        if (nx < 0) { nx = xx; ny = yy; }
      }
      if (touch >= 0) { endNode = touch; break; }
      if (nx < 0) break;
      x = nx; y = ny; first = false;
    }
    return { pts, a: fromNode, b: endNode };
  };

  // From each junction outwards…
  nodes.forEach((_, id) => {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (junc[i] !== id) continue;
        for (const [dx, dy] of N8) {
          const xx = x + dx, yy = y + dy;
          const k = yy * w + xx;
          if (bin[k] && junc[k] < 0 && !visited[k]) chains.push(walk(xx, yy, id));
        }
      }
    }
  });
  // …then from free endpoints…
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (bin[i] && junc[i] < 0 && !visited[i] && deg[i] <= 1) chains.push(walk(x, y, -1));
    }
  }
  // …and whatever is left is a closed loop: start at its topmost pixel.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (bin[i] && junc[i] < 0 && !visited[i]) {
        const c = walk(x, y, -1);
        c.cycle = true;
        c.pts.push([c.pts[0][0], c.pts[0][1]]);
        chains.push(c);
      }
    }
  }

  // Junction centroids close the gap at each end.
  for (const c of chains) {
    if (c.a >= 0) c.pts.unshift([nodes[c.a].cx, nodes[c.a].cy]);
    if (c.b >= 0) c.pts.push([nodes[c.b].cx, nodes[c.b].cy]);
  }

  // Prune thinning spurs and hairline junction loops.
  let live = chains.filter(c => {
    const L = pathLength(c.pts);
    const spur = (c.a >= 0) !== (c.b >= 0) && L < PRUNE_PX;
    const tinyLoop = c.a >= 0 && c.a === c.b && L < PRUNE_PX;
    return !(spur || tinyLoop);
  });

  // Merge chains that continue straight through a junction.
  const dirAt = (pts: Pt[], end: 0 | 1): Pt => {
    const k = Math.min(6, pts.length - 1);
    const p = end === 1 ? pts[pts.length - 1] : pts[0];
    const q = end === 1 ? pts[pts.length - 1 - k] : pts[k];
    const dx = p[0] - q[0], dy = p[1] - q[1];
    const L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  };
  for (let guard = 0; guard < 200; guard++) {
    const ends = new Map<number, { c: Raw; end: 0 | 1 }[]>();
    for (const c of live) {
      if (c.a >= 0) { const l = ends.get(c.a) ?? []; l.push({ c, end: 0 }); ends.set(c.a, l); }
      if (c.b >= 0) { const l = ends.get(c.b) ?? []; l.push({ c, end: 1 }); ends.set(c.b, l); }
    }
    let best: { dot: number; A: { c: Raw; end: 0 | 1 }; B: { c: Raw; end: 0 | 1 } } | null = null;
    for (const list of ends.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (list[i].c === list[j].c) continue;
          const d1 = dirAt(list[i].c.pts, list[i].end), d2 = dirAt(list[j].c.pts, list[j].end);
          const dot = d1[0] * d2[0] + d1[1] * d2[1];
          if (dot < MERGE_DOT && (!best || dot < best.dot)) best = { dot, A: list[i], B: list[j] };
        }
      }
    }
    if (!best) break;
    const { A, B } = best;
    const pa = A.c.pts.slice(), pb = B.c.pts.slice();
    let aOther: number, bOther: number;
    if (A.end === 0) { pa.reverse(); aOther = A.c.b; } else aOther = A.c.a;
    if (B.end === 1) { pb.reverse(); bOther = B.c.a; } else bOther = B.c.b;
    const merged: Raw = { pts: pa.concat(pb.slice(1)), a: aOther, b: bOther };
    live = live.filter(c => c !== A.c && c !== B.c);
    live.push(merged);
  }

  // A chain that leaves a junction and comes back to the SAME one is a closed
  // bowl — the "o", the belly of a "b". Geometry has to say so, because a
  // digital curve is full of staircase corners with three 8-neighbours, so the
  // leftover-pixels pass above almost never sees a junction-free loop.
  return live.map(c => ({ pts: c.pts, cycle: !!c.cycle || (c.a >= 0 && c.a === c.b) }));
}

// ── 3. Smoothing ─────────────────────────────────────────────────────────────

/** One [1 2 1] pass over the interior points — takes the staircase off a traced chain. */
export function smoothPath(p: readonly Pt[]): Pt[] {
  if (p.length < 3) return p.slice();
  const out: Pt[] = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    out.push([(p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4, (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4]);
  }
  out.push(p[p.length - 1]);
  return out;
}

/** Ramer–Douglas–Peucker: drop points no further than `eps` from the chord. */
export function rdp(p: readonly Pt[], eps: number): Pt[] {
  if (p.length < 3) return p.slice();
  let maxD = 0, idx = 0;
  const [ax, ay] = p[0], [bx, by] = p[p.length - 1];
  const L = Math.hypot(bx - ax, by - ay);
  for (let i = 1; i < p.length - 1; i++) {
    const [x, y] = p[i];
    const d = L < 1e-9 ? Math.hypot(x - ax, y - ay) : Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / L;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const l = rdp(p.slice(0, idx + 1), eps);
    const r = rdp(p.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [p[0], p[p.length - 1]];
}

// ── 4. Writing order ─────────────────────────────────────────────────────────

/** A stroke short enough (in em) to be a dot, a tittle or an accent — written last. */
const TINY_EM = 0.08;
/** Stroke starts within this many em of each other count as the same column. */
const COLUMN_EM = 0.12;

/**
 * A plausible order for one letter's strokes, and a direction for each: the
 * longest stroke first (the stem), then the rest left to right, with dots and
 * accents last. Non-cycles run top-left → bottom-right; a cycle starts at its
 * topmost point and goes anticlockwise (the way a hand draws an "o").
 *
 * Input points are in EM units (origin = the pen position on the baseline).
 */
export function orderStrokes(strokes: readonly Chain[]): { pts: Pt[]; len: number; cycle: boolean }[] {
  const S = strokes.map(s => {
    let p = s.pts;
    if (s.cycle) {
      let mi = 0;
      for (let i = 1; i < p.length - 1; i++) if (p[i][1] < p[mi][1]) mi = i;
      p = p.slice(mi, p.length - 1).concat(p.slice(0, mi), [[p[mi][0], p[mi][1]]]);
      const k = Math.max(1, Math.floor(p.length * 0.08));
      if (p[k][0] > p[0][0]) p = p.slice().reverse();
    } else {
      const sc = (q: Pt) => 0.7 * q[0] + q[1];
      if (sc(p[p.length - 1]) < sc(p[0])) p = p.slice().reverse();
    }
    return { pts: p, len: pathLength(p), cycle: s.cycle };
  });
  if (S.length <= 1) return S;
  let li = 0;
  for (let i = 1; i < S.length; i++) if (S[i].len > S[li].len) li = i;
  const first = S[li];
  const rest = S.filter((_, i) => i !== li);
  const tiny = rest.filter(s => s.len < TINY_EM);
  const big = rest.filter(s => s.len >= TINY_EM);
  const column = (s: { pts: Pt[] }) => Math.round(s.pts[0][0] / COLUMN_EM);
  big.sort((a, b) => column(a) - column(b) || a.pts[0][1] - b.pts[0][1]);
  tiny.sort((a, b) => a.pts[0][0] - b.pts[0][0]);
  return [first, ...big, ...tiny];
}

// ── 5. The timeline ──────────────────────────────────────────────────────────

/** A stroke about to be written, in CSS pixels, with the letter it belongs to. */
export interface PlanStroke {
  pts: Pt[];
  /** Index of the letter this stroke belongs to (letters are written in order). */
  glyph: number;
  /** Index of the word — a boundary here buys a longer pause and a pen lift. */
  word: number;
  /** The letter's font size in px (sets what counts as a "short" hop). */
  size: number;
}

export type WriteSegment =
  | { kind: 'draw'; t0: number; t1: number; stroke: number }
  | { kind: 'move'; t0: number; t1: number; from: Pt; to: Pt; lift: boolean; dist: number; pause: number };

export interface WritePlan {
  segments: WriteSegment[];
  /** Per stroke: its points and the normalised time each point is reached. */
  strokes: { pts: Pt[]; times: number[] }[];
  /** Always 1 — the plan is normalised, and the caller scales it to a clip. */
  total: number;
}

/** Pen speed along a stroke: quick in the middle, softer at both ends. */
export const easeStroke = (u: number): number => 0.5 * u + 0.5 * u * u * (3 - 2 * u);

// Rhythm constants (arbitrary units — the plan is normalised at the end; only
// their RATIOS matter). Ported from the probe, where they were tuned by eye.
const PAUSE_WORD = 140, PAUSE_WORD_J = 70;    // between words
const PAUSE_LETTER = 28, PAUSE_LETTER_J = 32; // between letters
const PAUSE_STROKE = 8, PAUSE_STROKE_J = 10;  // between strokes of one letter
const MOVE_LIFT = 36, MOVE_LIFT_K = 0.55;     // travel with the tip off the board
const MOVE_DOWN = 10, MOVE_DOWN_K = 0.7;      // a short hop that stays in contact
const LIFT_HOP_EM = 0.12;                     // longer than this and the tip lifts
const STROKE_MS = 11, STROKE_POW = 0.72;      // duration grows sub-linearly with length

/**
 * Strokes (already ordered, in CSS px) → when each point of each is reached,
 * plus the pen's travel between them. `rng` makes the pauses uneven — seed it
 * per phrase so the same sentence always writes the same way.
 *
 * Times are normalised to 0‥1: the caller multiplies by the clip time it has,
 * which is what makes 2× write faster and a pause freeze the tip mid-word.
 */
export function buildWritePlan(strokes: readonly PlanStroke[], rng: () => number): WritePlan {
  const segments: WriteSegment[] = [];
  const out: { pts: Pt[]; times: number[] }[] = [];
  let t = 0;
  let prevEnd: Pt | null = null;
  let prevGlyph = -1, prevWord = -1;

  strokes.forEach((s, si) => {
    const start = s.pts[0];
    if (prevEnd) {
      const dist = Math.hypot(start[0] - prevEnd[0], start[1] - prevEnd[1]);
      const newGlyph = s.glyph !== prevGlyph;
      const newWord = newGlyph && s.word !== prevWord;
      const pause = newWord ? PAUSE_WORD + rng() * PAUSE_WORD_J
        : newGlyph ? PAUSE_LETTER + rng() * PAUSE_LETTER_J
        : PAUSE_STROKE + rng() * PAUSE_STROKE_J;
      const lift = newWord || dist > s.size * LIFT_HOP_EM;
      const move = lift ? MOVE_LIFT + dist * MOVE_LIFT_K : MOVE_DOWN + dist * MOVE_DOWN_K;
      segments.push({ kind: 'move', t0: t, t1: t + pause + move, from: prevEnd, to: start, lift, dist, pause });
      t += pause + move;
    }
    const L = pathLength(s.pts);
    const dur = Math.max(40, STROKE_MS * Math.pow(L, STROKE_POW));
    let acc = 0;
    const times = s.pts.map((p, i) => {
      if (i > 0) acc += Math.hypot(p[0] - s.pts[i - 1][0], p[1] - s.pts[i - 1][1]);
      return t + dur * easeStroke(L > 0 ? acc / L : 1);
    });
    out.push({ pts: s.pts, times });
    segments.push({ kind: 'draw', t0: t, t1: t + dur, stroke: si });
    t += dur;
    prevEnd = s.pts[s.pts.length - 1];
    prevGlyph = s.glyph;
    prevWord = s.word;
  });

  const k = t > 0 ? 1 / t : 1;
  for (const seg of segments) { seg.t0 *= k; seg.t1 *= k; if (seg.kind === 'move') seg.pause *= k; }
  for (const s of out) s.times = s.times.map(v => v * k);
  return { segments, strokes: out, total: 1 };
}

export interface PenState { x: number; y: number; down: boolean; lifted: boolean }

/** Where the tip is at normalised time `t` (null for an empty plan). */
export function penAt(plan: WritePlan, t: number): PenState | null {
  const segs = plan.segments;
  if (segs.length === 0) return null;
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m].t0 <= t) lo = m; else hi = m - 1; }
  const s = segs[lo];
  if (s.kind === 'draw') {
    const st = plan.strokes[s.stroke];
    const { pts, times } = st;
    const last = pts[pts.length - 1];
    if (t >= s.t1) return { x: last[0], y: last[1], down: true, lifted: false };
    let a = 0, b = times.length - 1;
    while (a < b) { const m = (a + b + 1) >> 1; if (times[m] <= t) a = m; else b = m - 1; }
    if (a >= pts.length - 1) return { x: last[0], y: last[1], down: true, lifted: false };
    const u = (t - times[a]) / Math.max(1e-9, times[a + 1] - times[a]);
    return { x: pts[a][0] + (pts[a + 1][0] - pts[a][0]) * u, y: pts[a][1] + (pts[a + 1][1] - pts[a][1]) * u, down: true, lifted: false };
  }
  const travel = Math.max(1e-9, s.t1 - s.t0 - s.pause);
  const u = t < s.t0 + s.pause ? 0 : Math.min(1, (t - s.t0 - s.pause) / travel);
  const e = u * u * (3 - 2 * u);
  const x = s.from[0] + (s.to[0] - s.from[0]) * e;
  let y = s.from[1] + (s.to[1] - s.from[1]) * e;
  // A lifted hop arcs up off the board, so the tip visibly leaves the surface.
  if (s.lift) y -= Math.sin(Math.PI * u) * (3 + s.dist * 0.05);
  return { x, y, down: !s.lift, lifted: s.lift };
}

// ── 6. Noise (the chalk's grain) ─────────────────────────────────────────────

/** A stable 2-D hash in [0,1) — no allocation, same answer every visit. */
export function hash2(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise over `hash2` — the patchiness of chalk on a board. */
export function valueNoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** A small seeded PRNG — the same phrase jitters the same way on every replay. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string → a stable seed (so a sentence's jitter survives a reload). */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
