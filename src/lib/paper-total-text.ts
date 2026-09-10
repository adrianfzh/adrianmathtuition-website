// How a paper's score is WORDED wherever the site prints it — the red PAPER TOTAL
// strip on the first marked page and the score badge on the cover.
//
// Adrian, 3 Sep 2026, on Kassandra's paper: "92 out of 90 is not possible … build
// it". The marker had summed the parts to 94 against a registry total of 90 and
// awarded 92; the bot now flags that and re-reads the brackets, but whatever
// happens upstream, the site must never print a clean score above the paper's
// total. `awarded` is deliberately never grounded (a 93/90 badge is honest
// over-award surfacing — docs/MARKING.md), so the wording is where the doubt
// goes: "92 of 90 · needs a check" instead of "92 / 90" and a percentage.
//
// Pure, no I/O. Tested in paper-total-text.test.ts.

export type PaperTotalInput = {
  awarded: number;
  max: number;
  /** `totals.counted_max` — the marks the marker could actually locate. */
  countedMax?: number | null;
  /** The paper itself was missing — see `isUngroundedTotal` below. */
  ungrounded?: boolean;
};

/**
 * True when the marks add up to more than the paper holds. A paper with no
 * usable total (max ≤ 0, or not a number) is never over-count — there is
 * nothing to be over.
 */
export function overCount(p: { awarded: number; max: number }): boolean {
  return Number.isFinite(p.max) && Number.isFinite(p.awarded) && p.max > 0 && p.awarded > p.max;
}

/**
 * Was this paper marked with NO question paper and NO mark scheme, against a
 * denominator that came from the name registry rather than from the paper?
 *
 * Adrian, 10 Sep 2026 ("what does the system do if there are no questions or
 * mark scheme available?"). Isabelle's AM TYS 2025 P2: nothing to ground on
 * (`grounding.source` null), every allocation the marker's own guess, the
 * guesses summing to 73 — and the cover printed `68 / 90`, because the registry
 * knows an O-Level A Math paper is out of 90. The 90 was right about the paper
 * and wrong about this marking: 17 of those marks were never located at all, so
 * `68 / 90` reads as a score when it is not one.
 *
 * All three conditions matter. Nothing grounded the marking; the denominator
 * came from somewhere other than counting (registry, cover, override); and the
 * marker located FEWER marks than that denominator. A grounded run, a counted
 * run, or one whose questions add up to the full paper is untouched — those
 * totals are honest.
 *
 * Pure, and deliberately conservative: an unknown/absent field answers false, so
 * every cover that printed a clean score yesterday still does.
 */
export function isUngroundedTotal(p: {
  groundingSource?: string | null;
  maxSource?: string | null;
  countedMax?: number | null;
  max?: number | null;
}): boolean {
  if (p.groundingSource) return false;
  if (!p.maxSource || p.maxSource === 'counted' || p.maxSource === 'brackets') return false;
  const counted = Number(p.countedMax), max = Number(p.max);
  if (!Number.isFinite(counted) || !Number.isFinite(max)) return false;
  return counted > 0 && max > 0 && counted < max;
}

/**
 * The strip's two lines. Normal: `PAPER TOTAL` over `89 / 90`. Over-count:
 * `PAPER TOTAL · NEEDS A CHECK` over `92 of 90` — "of", not a slash, so it never
 * reads as a fraction a student can take home as final. Marked without the
 * paper: `MARKS SEEN · NOT THE OFFICIAL TOTAL` over `68 / 73` — the marks the
 * marker could see, never the registry's 90 dressed up as a result. (The full
 * sentence — "the official total will be confirmed once the paper is in" — is on
 * the cover page; this strip is a header band with room for two lines.)
 */
export function paperTotalText(p: PaperTotalInput): { label: string; score: string } {
  if (overCount(p)) {
    return { label: 'PAPER TOTAL · NEEDS A CHECK', score: `${p.awarded} of ${p.max}` };
  }
  const counted = Number(p.countedMax);
  if (p.ungrounded && Number.isFinite(counted) && counted > 0) {
    return { label: 'MARKS SEEN · NOT THE OFFICIAL TOTAL', score: `${p.awarded} / ${counted}` };
  }
  return { label: 'PAPER TOTAL', score: `${p.awarded} / ${p.max}` };
}
