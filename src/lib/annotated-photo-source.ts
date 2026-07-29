/**
 * Which copy of a marked photo goes into the PDF.
 *
 * The bot renders every annotated page TWICE off one Gemini grounding pass, and the two
 * copies are identical apart from one block in the footer strip. Which one is stapled
 * depends on the button, because the worked solution must appear exactly once per document
 * (Adrian, 29 Jul 2026 — "there is no need for comments to be on both … then the correct
 * solution on transcript"):
 *
 *   📄 full  → photo + typeset transcript sheets. The transcript carries the solution,
 *              so the photo must NOT — otherwise the same answer is printed twice.
 *   🖼 photos → annotated photos only, no transcript anywhere. The footer strip is the only
 *              surface left, so the solution-bearing copy is the one that goes in.
 *
 * `url` is the fallback in every direction: it is the same marked page (same ticks, same
 * score boxes, same Marker's notes) minus the solution block. `url_with_solutions` is
 * absent when nothing on that page was wrong, when the twin's render or upload failed, and
 * on any run marked before this split shipped.
 *
 * Extracted from the route because the failure is silent both ways round: pick `url` in
 * photos mode and a wrong answer goes unanswered; pick the twin in full mode and it is
 * answered twice.
 */

export type AnnotatedPhotoUrls = { url: string; url_with_solutions?: string | null };
export type MarkedPdfMode = 'full' | 'photos';

export function pickAnnotatedPhotoUrl(photo: AnnotatedPhotoUrls, mode: MarkedPdfMode): string {
  if (mode === 'photos' && photo.url_with_solutions) return photo.url_with_solutions;
  return photo.url;
}
