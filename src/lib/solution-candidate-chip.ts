/**
 * What the Solutions vet lane TELLS Adrian about a cleaned candidate.
 *
 * Every card in /admin/figures-bank?kind=solution shows the stamped image that is
 * switched off beside the candidate that would replace it, and one chip saying what
 * was done to produce that candidate. The chip is the only place the difference is
 * stated, and the difference is the whole decision:
 *
 *   • an EXACT removal deletes the stamp object and leaves the school's artwork alone;
 *   • a pixel edit (flat-field / alpha-inverse subtraction) ESTIMATES what sat under it;
 *   • a CLEAN COPY is a crop from a different scan of the same paper — no pixels edited,
 *     but it can differ (one of them is greyscale where the stored image is colour);
 *   • a REDRAW is a new drawing from the registry. Nothing was removed from anything;
 *     the review question is "does this say the same maths?", not "are the pale lines
 *     intact at 1:1".
 *
 * Until 5 Sep 2026 the chip inferred all of this from ONE field: a candidate with no
 * `method_note` read "✅ judged clean · <route> · exact removal". Measured through the
 * shipped handler that day, all ten apply-ready Sec candidates had a null method_note —
 * 5 redraws, 4 clean copies and one whose own note text underneath said "RECONSTRUCTED
 * PIXELS, declared" — so every one of them claimed an exact removal, the green claim
 * furthest from what had actually happened. The class is now read from `route`, which
 * the cleaning sessions write as a structured field; prose is still never parsed (a
 * keyword guess once labelled an uninspected image as inspected).
 */

export type CandidateLike = {
  verdict: string;
  route: string | null;
  note: string | null;
  holdKind: string | null;
  holdReason: string | null;
  methodNote: string | null;
};

/** How the candidate came to exist. Decided from `route` alone. */
export type CandidateClass = 'redraw' | 'clean-copy' | 'exact' | 'pixel-edit';

export function candidateClass(route: string | null | undefined): CandidateClass {
  const r = (route ?? '').trim().toLowerCase();
  if (r.startsWith('registry-redraw')) return 'redraw';
  if (r === 'clean-source-copy') return 'clean-copy';
  if (r === 'xobject-blank') return 'exact';
  return 'pixel-edit';
}

/** The registry family behind a redraw, when the route names one
 *  (`registry-redraw:graph-paper` → `graph-paper`). */
export function redrawFamily(route: string | null | undefined): string | null {
  const r = (route ?? '').trim();
  const i = r.toLowerCase().startsWith('registry-redraw') ? r.indexOf(':') : -1;
  const fam = i >= 0 ? r.slice(i + 1).trim() : '';
  return fam || null;
}

export type Chip = { text: string; colour: string; hint?: string };

const GREEN = '#15803d';
const AMBER = '#b45309';
const VIOLET = '#7c3aed';
const BLUE = '#0369a1';
const GREY = '#64748b';

export function candidateChip(c: CandidateLike): Chip {
  if (c.verdict === 'apply') {
    const cls = candidateClass(c.route);
    if (cls === 'redraw') {
      const fam = redrawFamily(c.route);
      return {
        text: `🖊 REDRAWN${fam ? ` · ${fam}` : ''} — a NEW figure, not the school's scan`,
        colour: VIOLET,
        hint: 'Check it says the same maths as the image on the left — labels, values, shading, orientation.',
      };
    }
    if (cls === 'clean-copy') {
      return {
        text: '📄 CLEAN COPY of the same paper — a different scan, no pixels edited',
        colour: BLUE,
        hint: 'Check nothing present on the left is missing here (and that colour is not needed).',
      };
    }
    if (c.methodNote) {
      return {
        text: `✅ cleaned · ${c.route || 'reconstructed'} · pixels under the stamp RECONSTRUCTED`,
        colour: GREEN,
        hint: c.methodNote.slice(0, 240),
      };
    }
    if (cls === 'exact') {
      return { text: `✅ exact removal · ${c.route} — the stamp object deleted, artwork untouched`, colour: GREEN };
    }
    // A pixel edit that declared nothing. It is NOT an exact removal: say so plainly
    // rather than inventing a claim the cleaning session never made.
    return {
      text: `✅ cleaned${c.route ? ` · ${c.route}` : ''} · NOT declared an exact removal`,
      colour: AMBER,
      hint: 'The session did not record what happened to the pixels under the stamp — look at 1:1 before approving.',
    };
  }
  if (c.holdKind === 'residue') return { text: '⚠️ checked — faint lettering survives the strict stretch', colour: AMBER };
  if (c.holdKind === 'unverified') {
    return { text: '❓ not verified — produced by a method we no longer trust', colour: GREY, hint: 'nobody has inspected this one' };
  }
  if (c.verdict === 'hold') return { text: '❓ held — see note', colour: GREY };
  return { text: '❓ no verdict recorded', colour: GREY };
}

/** The caption above the candidate image — it names the check to actually make. */
export function candidateCaption(c: CandidateLike | null | undefined): string {
  if (!c) return 'Cleaned candidate · tap to open full size';
  switch (candidateClass(c.route)) {
    case 'redraw':
      return 'Redrawn figure · tap to open full size — check it says the SAME maths as the image on the left';
    case 'clean-copy':
      return 'Clean copy from another scan · tap to open full size — check nothing on the left is missing here';
    default:
      return 'Cleaned candidate · tap to open full size — check pale lines and curves at 1:1';
  }
}

/** The approve button's label. A redraw is not a "cleaned" anything. */
export function candidateButtonLabel(c: CandidateLike): string {
  if (c.verdict !== 'apply') return 'Use it anyway';
  switch (candidateClass(c.route)) {
    case 'redraw': return '✓ Use the redrawn figure';
    case 'clean-copy': return '✓ Use the clean copy';
    default: return '✓ Use cleaned candidate';
  }
}

/** Button colour: still an action, but only a true clean of the school's own artwork
 *  gets the green that reads as "this is the original, minus the stamp". */
export function candidateButtonColour(c: CandidateLike): string {
  if (c.verdict !== 'apply') return AMBER;
  const cls = candidateClass(c.route);
  if (cls === 'redraw') return VIOLET;
  if (cls === 'clean-copy') return BLUE;
  return GREEN;
}
