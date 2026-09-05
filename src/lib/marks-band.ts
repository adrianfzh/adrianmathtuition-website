// Marks banding for questions-only worksheets (SPEC-WORKSHEET-MENU.md).
//
// `questions.difficulty` is 97–99 % "Standard" at every level (checked 5 Sep
// 2026), so it cannot band anything. Marks can: the setter chose them, they are
// on every question, and within one topic they track how much a question asks.
// A band is a tertile of `total_marks` over the ELIGIBLE POOL for that topic —
// so "advanced" means the top third of what the bank holds for Polygons, not a
// fixed number that suits Plane Geometry and starves Estimation.
//
// Pure and unit-tested. The bot endpoint applies it; the kiosk's tiers are
// untouched (they still read `difficulty`, by design — see practice-tiers.ts).

export type Band = 'standard' | 'intermediate' | 'advanced';
export const BANDS: readonly Band[] = ['standard', 'intermediate', 'advanced'] as const;

/** A request: one band, a split of counts per band, or null (= mixed, no banding). */
export type BandRequest = { kind: 'one'; band: Band } | { kind: 'split'; counts: [number, number, number] } | null;

/**
 * Parse the wire form: 'standard' | 'intermediate' | 'advanced' | 'mixed' |
 * 'a/b/c' (counts per band, standard first) | 'a/b' (standard/advanced).
 * Anything else → null (mixed).
 */
export function parseBand(v: unknown): BandRequest {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === 'mixed') return null;
  if (s === 'standard' || s === 'intermediate' || s === 'advanced') return { kind: 'one', band: s };
  const m = s.match(/^(\d+)\/(\d+)(?:\/(\d+))?$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), c = m[3] === undefined ? null : Number(m[3]);
    const counts: [number, number, number] = c === null ? [a, 0, b] : [a, b, c];
    if (counts.some(n => !Number.isFinite(n) || n < 0) || counts.every(n => n === 0)) return null;
    return { kind: 'split', counts };
  }
  return null;
}

/** Wire form back, for the blob path and the response. */
export function bandKey(req: BandRequest): string {
  if (!req) return 'mixed';
  return req.kind === 'one' ? req.band : req.counts.join('-');
}

/**
 * Split a pool into three bands by marks tertiles. Items with no marks go to
 * standard (the safe default: a question the bank could not size is not
 * "advanced"). Ties at a boundary stay in the lower band, so the bands are
 * deterministic for the same pool.
 */
export function bandPool<T extends { marks: number | null }>(pool: T[]): Record<Band, T[]> {
  const sized = pool.map(q => (q.marks ?? 0));
  const sorted = [...sized].sort((a, b) => a - b);
  const n = sorted.length;
  const out: Record<Band, T[]> = { standard: [], intermediate: [], advanced: [] };
  if (n === 0) return out;
  const lo = sorted[Math.floor(n / 3)] ?? sorted[n - 1];
  const hi = sorted[Math.floor((2 * n) / 3)] ?? sorted[n - 1];
  for (const q of pool) {
    const m = q.marks ?? 0;
    if (m < lo || lo === hi && m <= lo) out.standard.push(q);
    else if (m < hi) out.intermediate.push(q);
    else out.advanced.push(q);
  }
  // A pool too flat to split (every question the same marks) is all one band —
  // report it as standard rather than pretend there are three.
  if (lo === hi && out.intermediate.length === 0 && out.advanced.length && out.standard.length === 0) {
    out.standard = out.advanced; out.advanced = [];
  }
  return out;
}

/**
 * The questions a request should draw from, in draw order per band. For a
 * single band: that band's pool (fall back to the whole pool when it is empty,
 * so a thin topic still yields a sheet — the caller reports `bandFallback`).
 * For a split: `count` items taken per band by `pick` (the caller's
 * deterministic draw), concatenated standard → advanced.
 */
export function applyBand<T extends { marks: number | null }>(
  pool: T[],
  req: BandRequest,
  count: number,
  pick: (items: T[], n: number) => T[],
): { items: T[]; bandFallback: boolean } {
  if (!req) return { items: pick(pool, count), bandFallback: false };
  const bands = bandPool(pool);
  if (req.kind === 'one') {
    const b = bands[req.band];
    if (b.length) return { items: pick(b, count), bandFallback: false };
    return { items: pick(pool, count), bandFallback: true };
  }
  const [s, i, a] = req.counts;
  const want: [Band, number][] = [['standard', s], ['intermediate', i], ['advanced', a]];
  const items: T[] = [];
  let fallback = false;
  const seen = new Set<T>();
  for (const [band, n] of want) {
    if (!n) continue;
    let got = pick(bands[band].filter(q => !seen.has(q)), n);
    if (got.length < n) {
      fallback = true;
      const extra = pick(pool.filter(q => !seen.has(q) && !got.includes(q)), n - got.length);
      got = got.concat(extra);
    }
    for (const q of got) { seen.add(q); items.push(q); }
  }
  return { items, bandFallback: fallback };
}
