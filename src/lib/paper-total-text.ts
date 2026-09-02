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

export type PaperTotalInput = { awarded: number; max: number };

/**
 * True when the marks add up to more than the paper holds. A paper with no
 * usable total (max ≤ 0, or not a number) is never over-count — there is
 * nothing to be over.
 */
export function overCount(p: PaperTotalInput): boolean {
  return Number.isFinite(p.max) && Number.isFinite(p.awarded) && p.max > 0 && p.awarded > p.max;
}

/**
 * The strip's two lines. Normal: `PAPER TOTAL` over `89 / 90`. Over-count:
 * `PAPER TOTAL · NEEDS A CHECK` over `92 of 90` — "of", not a slash, so it never
 * reads as a fraction a student can take home as final.
 */
export function paperTotalText(p: PaperTotalInput): { label: string; score: string } {
  if (overCount(p)) {
    return { label: 'PAPER TOTAL · NEEDS A CHECK', score: `${p.awarded} of ${p.max}` };
  }
  return { label: 'PAPER TOTAL', score: `${p.awarded} / ${p.max}` };
}
