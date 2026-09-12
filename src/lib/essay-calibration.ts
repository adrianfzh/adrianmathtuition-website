// The essay calibration gate's arithmetic (SPEC-ESSAY-MARKING.md §Calibration).
// Three tests, none of them "within ±2 of Adrian": the same essay read twice
// gives the same band (consistency); the app orders a teacher's class set the
// way that teacher did (ranking — rank correlation, never absolute agreement,
// because teachers disagree with each other by whole bands); anchors of known
// band land in their band (anchor fit). Pure; tested. The harness in
// scripts/essay-calibration/ feeds it rows and prints the verdict.

export interface BandPair { essay: string; criterion: string; a: number | null; b: number | null }

export interface ConsistencyResult {
  pairs: number;
  agree: number;
  offByOne: number;
  offByMore: number;
  /** Share of pairs that agree exactly. The gate wants ≥ 0.9 and no pair off by two. */
  rate: number;
  pass: boolean;
}

export const CONSISTENCY_MIN_RATE = 0.9;
export const RANK_MIN_RHO = 0.7;
export const RANK_MIN_SET = 8;

/** Same essay, two reads: how often the band is the same. Pairs with a missing band are skipped. */
export function consistency(pairs: readonly BandPair[]): ConsistencyResult {
  let agree = 0, offByOne = 0, offByMore = 0, n = 0;
  for (const p of pairs) {
    if (p.a == null || p.b == null) continue;
    n++;
    const d = Math.abs(p.a - p.b);
    if (d === 0) agree++; else if (d === 1) offByOne++; else offByMore++;
  }
  const rate = n ? agree / n : 0;
  return { pairs: n, agree, offByOne, offByMore, rate, pass: n > 0 && rate >= CONSISTENCY_MIN_RATE && offByMore === 0 };
}

/** Average ranks, ties shared (1-based). */
export function ranks(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
  const out = new Array<number>(values.length);
  let k = 0;
  while (k < order.length) {
    let j = k;
    while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
    const r = (k + 1 + j + 1) / 2;
    for (let m = k; m <= j; m++) out[order[m].i] = r;
    k = j + 1;
  }
  return out;
}

/** Spearman's rank correlation of two equal-length lists (Pearson on ranks, so ties are handled). NaN when either list is constant. */
export function spearman(x: readonly number[], y: readonly number[]): number {
  if (x.length !== y.length || x.length < 2) return NaN;
  const rx = ranks(x), ry = ranks(y);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
  const my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < rx.length; i++) {
    const dx = rx[i] - mx, dy = ry[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

export interface RankRow { essay: string; teacher: number; app: number }
export interface RankingResult { n: number; rho: number; pass: boolean; reason: string | null }

/**
 * One teacher's class set on one prompt: does the app order the essays the way
 * the teacher did? `app` is the midpoint of the app's total range; `teacher` the
 * teacher's mark. The gate wants ≥ 8 essays and rho ≥ 0.7.
 */
export function ranking(rows: readonly RankRow[]): RankingResult {
  const n = rows.length;
  if (n < RANK_MIN_SET) return { n, rho: NaN, pass: false, reason: `needs ${RANK_MIN_SET} essays from one teacher on one prompt, has ${n}` };
  const rho = spearman(rows.map(r => r.teacher), rows.map(r => r.app));
  if (Number.isNaN(rho)) return { n, rho, pass: false, reason: 'one side gave every essay the same mark — nothing to order' };
  return { n, rho, pass: rho >= RANK_MIN_RHO, reason: rho >= RANK_MIN_RHO ? null : `rho ${rho.toFixed(2)} is under ${RANK_MIN_RHO}` };
}

export interface AnchorRow { essay: string; criterion: string; known: number; app: number | null }
export interface AnchorResult { n: number; exact: number; offByOne: number; offByMore: number; pass: boolean }

/** Anchors of known band, marked blind: in their band, or one away. Two away fails the gate. */
export function anchorFit(rows: readonly AnchorRow[]): AnchorResult {
  let exact = 0, offByOne = 0, offByMore = 0, n = 0;
  for (const r of rows) {
    if (r.app == null) continue;
    n++;
    const d = Math.abs(r.known - r.app);
    if (d === 0) exact++; else if (d === 1) offByOne++; else offByMore++;
  }
  return { n, exact, offByOne, offByMore, pass: n > 0 && offByMore === 0 };
}

/** The midpoint of the app's total range — the one number the RANKING test may use, and only there. */
export function midpoint(total: { min: number; max: number } | null | undefined): number | null {
  if (!total) return null;
  return (Number(total.min) + Number(total.max)) / 2;
}
