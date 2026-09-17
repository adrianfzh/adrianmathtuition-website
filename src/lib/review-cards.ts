// Review my mistakes (17 Sep 2026, SPEC-STUDENT-FIRST §7): the cards a student
// scrolls through — one per question that lost marks across the papers they
// ticked, newest paper first, biggest loss first inside a paper — and the two
// small rules around them: where on the page the jump lands, and which papers
// an upcoming exam pre-ticks. Pure; tested.
import type { StudentPaper, StudentQuestion } from './portal-marking';
import type { UpcomingExam } from './portal-exams';
import { examsInWindow, topicMatches } from './before-paper';

export interface ReviewCard {
  key: string;
  runId: string;
  paperName: string;
  paperDate: string;
  question: StudentQuestion;
  /** Marks lost on this question. */
  lost: number;
  /** The page the question is on (photo index), when the marking recorded it. */
  photoIndex: number | null;
  /** 0..1 down the page — where the jump lands (from the marker's "region" words). */
  at: number;
}

/** Newest paper first; inside a paper, the biggest loss first (StudentPaper.dropped is already so ordered). */
export function buildReviewCards(papers: readonly StudentPaper[]): ReviewCard[] {
  const ordered = [...papers].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const out: ReviewCard[] = [];
  for (const p of ordered) {
    for (const q of p.dropped) {
      out.push({
        key: `${p.id}:${q.questionNumber}`, runId: p.id, paperName: p.name, paperDate: p.date, question: q,
        lost: Math.max(0, q.max - q.awarded), photoIndex: q.photoIndex ?? null, at: regionFraction(q.region),
      });
    }
  }
  return out;
}

/** The marker's "region" words → how far down the page to land. Unknown words land near the top. */
export function regionFraction(region: string | null | undefined): number {
  const r = (region ?? '').toLowerCase();
  if (!r) return 0.08;
  if (/bottom|lower|foot/.test(r)) return /third|two-thirds/.test(r) ? 0.45 : 0.62;
  if (/middle|centre|center/.test(r)) return 0.38;
  if (/top|upper|start/.test(r)) return 0.08;
  return 0.12;
}

/** The exam band: for each exam within BEFORE_PAPER_DAYS in this subject, the ticked papers = those that lost marks on a tested topic. */
export function examReviewBands(exams: readonly UpcomingExam[], papers: readonly StudentPaper[], subject: string): { exam: UpcomingExam; paperIds: string[] }[] {
  return examsInWindow(exams)
    .filter(e => !e.subject || e.subject === subject || (e.subject === 'Math' && (subject === 'E Math' || subject === 'A Math')))
    .map(e => ({
      exam: e,
      paperIds: papers.filter(p => p.dropped.some(q => e.testedTopics.some(t => topicMatches(t, q.topic)))).map(p => p.id),
    }))
    .filter(b => b.paperIds.length > 0 || true);
}

/** The URL the deck's "See it on my paper" opens. */
export function jumpHref(card: Pick<ReviewCard, 'runId' | 'photoIndex' | 'at' | 'question'>): string {
  const q = encodeURIComponent(card.question.questionNumber);
  if (card.photoIndex == null) return `/app/marking/${card.runId}?q=${q}`;
  return `/app/marking/${card.runId}?q=${q}&page=${card.photoIndex}&at=${card.at.toFixed(2)}#page-${card.photoIndex}`;
}
