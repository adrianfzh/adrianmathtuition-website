// Before the paper (SPEC-NOTEBOOK-V2 §4, Adrian 11 Sep 2026: "yes do it", at
// five days). When an exam the student has keyed is within BEFORE_PAPER_DAYS,
// the Notebook pins one card that opens a page composed from the tested
// topics: the live mistakes there, the skills that keep coming up, the answers
// they saved, their photos and clippings, and the formulas they have met in
// those topics (lib/formula-sheet.ts). Pure: the page hands in the stream
// items and the exams; this picks and groups.
import type { UpcomingExam } from './portal-exams';
import type { StreamItem } from './notebook-stream';

/** Days before the paper the card appears (Adrian, 11 Sep 2026 — not a fortnight). */
export const BEFORE_PAPER_DAYS = 5;

export function examsInWindow(exams: readonly UpcomingExam[], days = BEFORE_PAPER_DAYS): UpcomingExam[] {
  return exams.filter(e => e.daysLeft >= 0 && e.daysLeft <= days).sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Case-folded words, British spelling ("Factorization" → "factorisation"). "Algebra (Quadratic Equations)" → "algebra quadratic equations". */
function fold(s: string): string {
  return (s || '').toLowerCase().replace(/ization/g, 'isation').replace(/[^a-z0-9]+/g, ' ').trim();
}
/** The words inside the bracketed qualifier, or '' — "Algebra (Factorization)" → "factorisation". */
function qualifier(s: string): string {
  const m = (s || '').match(/\(([^)]*)\)/);
  return m ? fold(m[1]) : '';
}
function base(s: string): string {
  return fold((s || '').replace(/\s*\(.*?\)\s*/g, ' '));
}

/**
 * Does an item filed under `itemTopic` belong to an exam that tests `examTopic`?
 * Case-folded; equal, or one contains the other ("Trigonometry" tests
 * "Trigonometry (R-Formula)", "Proportion" covers "Direct proportion"). A
 * bracketed qualifier is the specific part: two different qualifiers never
 * match ("Algebra (Identities)" ≠ "Algebra (Factorization)"); an exam topic
 * with a qualifier needs the item to name it ("Algebra (Identities)" takes the
 * marker's "Algebraic identities and special products", not its "Algebra");
 * an item with a qualifier belongs to the exam's general topic by base name.
 * Never "same chapter".
 */
export function topicMatches(examTopic: string, itemTopic: string | null | undefined): boolean {
  if (!itemTopic) return false;
  const a = fold(examTopic);
  const b = fold(itemTopic);
  if (!a || !b) return false;
  if (a === b) return true;
  const qa = qualifier(examTopic);
  const qb = qualifier(itemTopic);
  if (qa && qb) return false;
  if (qa) return qa.split(' ').every(w => b.includes(w));
  if (qb) {
    const ab = base(examTopic);
    const bb = base(itemTopic);
    return !!ab && !!bb && (ab === bb || ab.includes(bb) || bb.includes(ab));
  }
  return a.includes(b) || b.includes(a);
}

export interface BeforePaperGroups {
  mistakes: StreamItem[];
  skills: StreamItem[];
  saves: StreamItem[];
  photos: StreamItem[];
  /** Tested topics that nothing in the book touches — the honest "nothing filed" list. */
  untouched: string[];
}

/** The items in the tested topics, grouped for the page. Fixed mistakes stay out — the page is about what still costs marks. */
export function beforePaperGroups(exam: Pick<UpcomingExam, 'testedTopics'>, items: readonly StreamItem[]): BeforePaperGroups {
  const topics = exam.testedTopics;
  const inTopics = (it: StreamItem) => topics.some(t => topicMatches(t, it.topic));
  const hit = items.filter(inTopics);
  const touched = new Set<string>();
  for (const t of topics) if (hit.some(it => topicMatches(t, it.topic))) touched.add(t);
  return {
    mistakes: hit.filter(it => it.kind === 'mistake' && it.mistake?.live),
    skills: hit.filter(it => it.kind === 'skill'),
    saves: hit.filter(it => it.kind === 'saved'),
    photos: hit.filter(it => it.kind === 'photo' || it.kind === 'clip'),
    untouched: topics.filter(t => !touched.has(t)),
  };
}

/** "WA3 · A Math P1 · in 3 days" / "· tomorrow" / "· today". */
export function beforePaperLine(exam: Pick<UpcomingExam, 'label' | 'subject' | 'paper' | 'daysLeft' | 'approx'>): string {
  const when = exam.daysLeft === 0 ? 'today' : exam.daysLeft === 1 ? 'tomorrow' : `in ${exam.daysLeft} days`;
  const paper = [exam.subject, exam.paper].filter(Boolean).join(' ');
  return [exam.label, paper, `${exam.approx ? '~' : ''}${when}`].filter(Boolean).join(' · ');
}
