// The humanities bench (SPEC-HUMANITIES.md §4, 2 Oct 2026) — truth by
// construction, no marked scripts. Pure: the script hands answers in and reads
// the rows back; every verdict is computed here so the tests pin the rules.
//
// Gate to open the switch: seeded answers ≥ 90 % in the right level and none two
// levels off; the same answer read twice lands on the same level ≥ 90 % of the
// time and never two apart; the truth-free checks pass.

export interface SeededResult { truth: number; level: number | null }

export interface SeededVerdict { n: number; read: number; right: number; oneOff: number; twoOff: number; unread: number; rate: number; pass: boolean }

export function seededVerdict(rows: SeededResult[]): SeededVerdict {
  const done = rows.filter(r => r.level != null);
  const right = done.filter(r => r.level === r.truth).length;
  const twoOff = done.filter(r => Math.abs((r.level as number) - r.truth) >= 2).length;
  const oneOff = done.length - right - twoOff;
  const rate = done.length ? right / done.length : 0;
  const unread = rows.length - done.length;
  return { n: rows.length, read: done.length, right, oneOff, twoOff, unread, rate, pass: done.length > 0 && unread === 0 && rate >= 0.9 && twoOff === 0 };
}

export interface PairResult { first: number | null; second: number | null }
export interface ConsistencyVerdict { n: number; same: number; twoApart: number; unread: number; rate: number; pass: boolean }

/** The same answer handed in twice. */
export function consistencyVerdict(pairs: PairResult[]): ConsistencyVerdict {
  const done = pairs.filter(p => p.first != null && p.second != null);
  const same = done.filter(p => p.first === p.second).length;
  const twoApart = done.filter(p => Math.abs((p.first as number) - (p.second as number)) >= 2).length;
  const rate = done.length ? same / done.length : 0;
  const unread = pairs.length - done.length;
  return { n: pairs.length, same, twoApart, unread, rate, pass: done.length > 0 && unread === 0 && rate >= 0.9 && twoApart === 0 };
}

// ── Truth-free checks: variants whose right level we know only RELATIVE to the original ──

const PAD_BEFORE = 'I will now answer the question. I have read the sources carefully before writing my answer.';
const PAD_AFTER = 'This is my answer to the question. In conclusion, that is what I think about the question. Thank you for reading my answer.';

/** Length with nothing in it: the level must not move. */
export function padAnswer(text: string): string {
  return `${PAD_BEFORE} ${text.trim()} ${PAD_AFTER}`;
}

/** The answer with every sentence that quotes a source taken out: the level must not go UP. Null when nothing is left to hand in. */
export function stripEvidence(text: string): string | null {
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  const kept = sentences.filter(s => !/['‘’"“”]/.test(s.replace(/\b(\w+)['’](s|t|re|ve|d|ll)\b/g, '$1$2')));
  if (kept.length === sentences.length || !kept.length) return null;
  const out = kept.join(' ');
  return out.split(/\s+/).length >= 3 ? out : null;
}

/** A weak answer with the top answer written after it: the level must not go DOWN. */
export function addSupported(weak: string, top: string): string {
  return `${weak.trim()} ${top.trim()}`;
}

export type VariantKind = 'padding' | 'evidence_removed' | 'supported_added';
export interface VariantResult { kind: VariantKind; base: number | null; variant: number | null }

/** Did one variant keep its promise? Null = one of the two was not read. */
export function variantHolds(r: VariantResult): boolean | null {
  if (r.base == null || r.variant == null) return null;
  if (r.kind === 'padding') return r.variant === r.base;
  if (r.kind === 'evidence_removed') return r.variant <= r.base;
  return r.variant >= r.base;
}

export function truthFreeVerdict(rows: VariantResult[]): { n: number; held: number; broke: number; unread: number; pass: boolean; byKind: Record<string, { n: number; held: number }> } {
  let held = 0, broke = 0, unread = 0;
  const byKind: Record<string, { n: number; held: number }> = {};
  for (const r of rows) {
    const k = (byKind[r.kind] ??= { n: 0, held: 0 });
    k.n++;
    const v = variantHolds(r);
    if (v == null) unread++; else if (v) { held++; k.held++; } else broke++;
  }
  return { n: rows.length, held, broke, unread, pass: rows.length > 0 && broke === 0 && unread === 0, byKind };
}
