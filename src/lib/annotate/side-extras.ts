// ✏️ Annotate side panel extras (Adrian, 2 Nov 2026: "question's math expression should be
// in latex/katex" · "is solutions able to show the mark scheme itself? like where is A1, M1").
//
// Once per question a model writes (a) the question text with its maths in $…$, and (b) the
// worked solution with each scheme mark put at the end of the line that earns it — "[M1]".
// The model may ONLY add codes: sameApartFromCodes refuses any copy whose text changed, so
// the working the page shows is never the model's rewrite. Pure rules here (tested);
// the call and the cache are in annotate-side-store.ts.
import type { SolutionsItem, SolutionsPart } from '@/lib/render-solutions-pdf';

export type SideExtras = {
  /** The question with its maths in $…$; '' = keep what the page had. */
  questionLatex: string;
  /** Solution key ('' = the one-block solution, else the part path "a", "b.ii") → the same
   *  text with " [M1]" codes at line ends. Only copies that passed sameApartFromCodes. */
  marked: Record<string, string>;
};

const CODE_TAG = /\s*\[(?:\s*[BMA]\d(?:ft)?\s*,?)+\]/g;

/** The full scheme a worked solution earns: the marker's codes with every mark won —
 *  "M1 A0 A1ft" → "M1 A1 A1". */
export function fullScheme(codes: string): string {
  return String(codes || '').split(/\s+/).filter(Boolean)
    .map((c) => c.replace(/^([BMA])\d+.*$/i, (_, l: string) => `${l.toUpperCase()}1`))
    .filter((c) => /^[BMA]1$/.test(c)).join(' ');
}

/** The text with every "[M1]" / "[A1 B1]" tag taken out. */
export function stripCodes(text: string): string {
  return String(text || '').replace(CODE_TAG, '');
}

const norm = (t: string) => t.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');

/** True when the marked copy is the original plus code tags and nothing else. */
export function sameApartFromCodes(original: string, marked: string): boolean {
  return norm(stripCodes(marked)) === norm(original) && new RegExp(CODE_TAG.source).test(marked);
}

/** Any "[M1 …]" note already in the text — the bank's own scheme notes win; nothing to add. */
export function hasOwnCodes(text: string): boolean {
  return /\[\s*[BMA]\d/.test(String(text || ''));
}

/** Every solution text on an item, keyed the way SideExtras.marked is. */
export function solutionTexts(item: SolutionsItem): Record<string, string> {
  const out: Record<string, string> = {};
  if (item.solutionFromParts && item.parts?.length) {
    const walk = (parts: SolutionsPart[], prefix: string[]) => {
      for (const p of parts) {
        const path = [...prefix, String(p.label ?? '').replace(/[()]/g, '').trim()].filter(Boolean);
        if ((p.solution ?? '').trim()) out[path.join('.')] = String(p.solution);
        if (p.subparts?.length) walk(p.subparts, path);
      }
    };
    walk(item.parts, []);
  } else if (item.solution.trim()) {
    out[''] = item.solution;
  }
  return out;
}

/** The item with the extras laid in: the typeset question (only where the page had none of
 *  its own), each marked solution, and the part / question code tags dropped where the codes
 *  now sit on the lines (never shown twice). */
export function applyExtras(item: SolutionsItem, ex: SideExtras | null): SolutionsItem {
  if (!ex) return item;
  const out: SolutionsItem = { ...item };
  if (ex.questionLatex && (item.questionFromMarker || !/\$/.test(item.questionText))) out.questionText = ex.questionLatex;
  const texts = solutionTexts(item);
  const ok = (k: string) => typeof ex.marked[k] === 'string' && texts[k] != null && sameApartFromCodes(texts[k], ex.marked[k]);
  if (item.solutionFromParts && item.parts?.length) {
    const walk = (parts: SolutionsPart[], prefix: string[]): SolutionsPart[] => parts.map((p) => {
      const path = [...prefix, String(p.label ?? '').replace(/[()]/g, '').trim()].filter(Boolean);
      const k = path.join('.');
      const next: SolutionsPart = { ...p };
      if (ok(k)) { next.solution = ex.marked[k]; next.codes = null; }
      if (p.subparts?.length) next.subparts = walk(p.subparts, path);
      return next;
    });
    out.parts = walk(item.parts, []);
  } else if (ok('')) {
    out.solution = ex.marked[''];
    out.codes = null;
  }
  return out;
}
