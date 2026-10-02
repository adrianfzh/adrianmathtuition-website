// The jump from a mistake card to the spot on the marked page (17 Sep 2026,
// SPEC-STUDENT-FIRST §7). The card deck this file also built lived at
// /app/marking/review until 1 Oct 2026, when the comparison moved onto every
// Notebook card (app/marking/MistakeCompare.tsx) and the deck went. Pure; tested.
import type { StudentQuestion } from './portal-marking';

/** The marker's "region" words → how far down the page to land. Unknown words land near the top. */
export function regionFraction(region: string | null | undefined): number {
  const r = (region ?? '').toLowerCase();
  if (!r) return 0.08;
  if (/bottom|lower|foot/.test(r)) return /third|two-thirds/.test(r) ? 0.45 : 0.62;
  if (/middle|centre|center/.test(r)) return 0.38;
  if (/top|upper|start/.test(r)) return 0.08;
  return 0.12;
}

/** The URL "See it on my paper" opens. */
export function jumpHref(card: { runId: string; photoIndex: number | null; at?: number; question: Pick<StudentQuestion, 'questionNumber' | 'region' | 'jump'> }): string {
  const q = encodeURIComponent(card.question.questionNumber);
  if (card.photoIndex == null) return `/app/marking/${card.runId}?q=${q}`;
  // The marker's own box first (1 Oct 2026, `span` says so); else the region words.
  const box = card.question.jump;
  if (box) return `/app/marking/${card.runId}?q=${q}&page=${card.photoIndex}&at=${box.at.toFixed(3)}&span=${box.span.toFixed(3)}#page-${card.photoIndex}`;
  const at = card.at ?? regionFraction(card.question.region);
  return `/app/marking/${card.runId}?q=${q}&page=${card.photoIndex}&at=${at.toFixed(2)}#page-${card.photoIndex}`;
}
