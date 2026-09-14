// A page of the student's paper that the marked copy would otherwise drop.
//
// THE INVARIANT (Adrian, 14 Sep 2026): every page a student handed in appears
// in their marked copy. It did not hold. The assembly in
// /api/admin/mark-paper-pdf draws the pages it is handed — `annotated_photos` —
// and says nothing about the ones it isn't, so a page whose annotated JPEG
// never reached the student-files bucket simply wasn't in the document. Alexis
// Wong's A Math GCE 2022 Paper 1 (run 94326fea) was marked in full and came
// back four pages short: Q5, Q7, Q8 and Q10 had been marked, their ink rendered,
// and then lost to a burst of `fetch failed` on the upload. Nothing in the PDF,
// the cover or the app said a page was missing — the paper just looked like a
// shorter paper. Kiara Tan Jia Min and Isabelle Toh Si Xian lost three pages
// each the same way in the same week.
//
// The upload is retried now (bot lib/student-files putStudentFile), and a page
// with no entry can be redrawn (bot ai/reannotate-page upsertByPhotoIndex).
// This is the floor under both: when there is no annotated image for a page but
// the run still holds the student's own photo of it, the plain photo goes in,
// in its right place. Unmarked is worse than marked; it is far better than gone.
//
// Every gap between 8 and 10 Sep 2026 carried an upload error on its
// `annotation_debug` entry. The 108 gaps before 24 Aug 2026 are a different,
// now-extinct class — pages with no marked question that the marker of the day
// left alone — and the rule covers them too, deliberately: a page the student
// wrote on and the marker skipped is exactly the page that must not disappear
// silently. Deciding which gap "deserves" a page is the kind of judgment that
// loses pages; the rule is simply that a page in, is a page out.

/** One page recovered from the run's own record of what the student sent. */
export type PageGap = {
  photo_index: number;
  /** The stored original — an /api/files URL the assembly fetches with fetchOurFile. */
  url: string;
};

type Row = Record<string, unknown>;

/** A photo_index that is a real page number, or null. */
function indexOf(row: unknown): number | null {
  if (!row || typeof row !== 'object') return null;
  const n = Number((row as Row).photo_index);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * The pages `sourcePhotos` has and `annotatedPhotos` does not — each with the
 * original photo's URL, in page order.
 *
 * `sourcePhotos` is `result_json.source.photos` (`{photo_index, original_url}`);
 * `annotatedPhotos` is whatever the assembly was handed. Pure, and forgiving of
 * both shapes: a run whose source it cannot read yields [] and the PDF is
 * exactly the one it always was. An annotated entry with no usable `url` counts
 * as absent — a row pointing at nothing is the same missing page wearing a hat.
 */
export function missingAnnotatedPages(sourcePhotos: unknown, annotatedPhotos: unknown): PageGap[] {
  if (!Array.isArray(sourcePhotos)) return [];
  const have = new Set<number>();
  for (const a of Array.isArray(annotatedPhotos) ? annotatedPhotos : []) {
    const i = indexOf(a);
    const url = (a as Row)?.url;
    if (i !== null && typeof url === 'string' && url.trim()) have.add(i);
  }
  const gaps = new Map<number, PageGap>();
  for (const p of sourcePhotos) {
    const i = indexOf(p);
    if (i === null || have.has(i) || gaps.has(i)) continue;
    const url = (p as Row)?.original_url;
    if (typeof url !== 'string' || !url.trim()) continue;   // no photo kept: nothing to fall back to
    gaps.set(i, { photo_index: i, url: url.trim() });
  }
  return [...gaps.values()].sort((a, b) => a.photo_index - b.photo_index);
}
