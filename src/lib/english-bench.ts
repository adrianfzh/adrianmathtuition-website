// The bench for the English Practise checker (docs/HANDOFF-ENGLISH-BUILD.md step 2,
// 7 Oct 2026) — truth by construction, like the humanities bench: every question of our
// own sets carries answers written AT a known mark (lib/english-own OwnSeed).
// Pure: scripts/english-bench/run.ts reads the answers and every verdict is computed
// here, so the tests pin the rules.
//
// Gate before the switch opens:
//   SEEDED       ≥ 90 % of short answers land on the seeded mark, and none is a GROSS miss
//                (full marks for a 0, 0 for a full, or 2+ marks away)
//   REPEATS      the same answer read twice gets the same mark ≥ 90 % of the time, never 2+ apart
//   PADDING      empty words before and after an answer do not move its mark (≥ 90 %)
//   SWAPPED      a full answer to ANOTHER question of the same set earns 0 (≥ 90 %)
//   SUMMARY      the content count is within 1 of the seeded count ≥ 90 % of the time, never 3+ away
// An answer that could not be read at all fails its check.

export interface MarkRow { truth: number; max: number; awarded: number | null }

export const grossMiss = (r: { truth: number; max: number; awarded: number }): boolean =>
  (r.truth === 0 && r.awarded >= r.max) || (r.truth >= r.max && r.awarded === 0) || Math.abs(r.awarded - r.truth) >= 2;

export interface SeededVerdict { n: number; read: number; right: number; gross: number; unread: number; rate: number; pass: boolean }

export function seededVerdict(rows: MarkRow[]): SeededVerdict {
  const done = rows.filter((r): r is MarkRow & { awarded: number } => r.awarded != null);
  const right = done.filter(r => r.awarded === r.truth).length;
  const gross = done.filter(grossMiss).length;
  const unread = rows.length - done.length;
  const rate = done.length ? right / done.length : 0;
  return { n: rows.length, read: done.length, right, gross, unread, rate, pass: done.length > 0 && unread === 0 && rate >= 0.9 && gross === 0 };
}

export interface Pair { first: number | null; second: number | null }
export interface PairVerdict { n: number; same: number; farApart: number; unread: number; rate: number; pass: boolean }

/** The same answer read twice (repeats), or an answer and its padded copy (padding). */
export function pairVerdict(pairs: Pair[], far = 2): PairVerdict {
  const done = pairs.filter((p): p is { first: number; second: number } => p.first != null && p.second != null);
  const same = done.filter(p => p.first === p.second).length;
  const farApart = done.filter(p => Math.abs(p.first - p.second) >= far).length;
  const unread = pairs.length - done.length;
  const rate = done.length ? same / done.length : 0;
  return { n: pairs.length, same, farApart, unread, rate, pass: done.length > 0 && unread === 0 && rate >= 0.9 && farApart === 0 };
}

export interface ZeroVerdict { n: number; zero: number; unread: number; rate: number; pass: boolean }

/** A full answer to another question: every one should earn 0. */
export function swappedVerdict(awarded: (number | null)[]): ZeroVerdict {
  const done = awarded.filter((a): a is number => a != null);
  const zero = done.filter(a => a === 0).length;
  const unread = awarded.length - done.length;
  const rate = done.length ? zero / done.length : 0;
  return { n: awarded.length, zero, unread, rate, pass: done.length > 0 && unread === 0 && rate >= 0.9 };
}

export interface SummaryRow { truthHit: number[]; hit: number[] | null; max: number }
export interface SummaryVerdict { n: number; read: number; within1: number; far: number; unread: number; rate: number; pointsAgree: number; pass: boolean }

const content = (hit: number[], max: number): number => Math.min(max, hit.length);

/** The summary: the count within one of the seeded count; and, point by point, how often the two agree. */
export function summaryVerdict(rows: SummaryRow[], nPoints: (i: number) => number): SummaryVerdict {
  const done = rows.map((r, i) => ({ r, i })).filter((x): x is { r: SummaryRow & { hit: number[] }; i: number } => x.r.hit != null);
  let within1 = 0, far = 0, agree = 0, total = 0;
  for (const { r, i } of done) {
    const d = Math.abs(content(r.hit, r.max) - content(r.truthHit, r.max));
    if (d <= 1) within1++;
    if (d >= 3) far++;
    for (let p = 1; p <= nPoints(i); p++) { total++; if (r.hit.includes(p) === r.truthHit.includes(p)) agree++; }
  }
  const unread = rows.length - done.length;
  const rate = done.length ? within1 / done.length : 0;
  return { n: rows.length, read: done.length, within1, far, unread, rate, pointsAgree: total ? agree / total : 0, pass: done.length > 0 && unread === 0 && rate >= 0.9 && far === 0 };
}

const PAD_BEFORE = 'I have read the text carefully and I will now write my answer to this question.';
const PAD_AFTER = 'That is my answer to the question. Thank you.';
/** Length with nothing in it: the mark must not move. */
export const padAnswer = (text: string): string => `${PAD_BEFORE} ${text.trim()} ${PAD_AFTER}`;

/** The question a full answer is swapped onto: the one half the set away (never itself). */
export function swapTarget(i: number, n: number): number | null {
  if (n < 4) return null;
  const j = (i + Math.floor(n / 2)) % n;
  return j === i ? null : j;
}

export const pct = (x: number): string => `${Math.round(x * 100)}%`;
