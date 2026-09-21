// Which exams are close, and whether a topic belongs to one — the two rules
// Review my mistakes (lib/review-cards.ts) pre-ticks papers with. They lived
// in lib/before-paper.ts until 21 Sep 2026, when the Notebook's Before-the-
// paper page went; the rules stayed because the Papers tab still needs them.
import type { UpcomingExam } from './portal-exams';

/** Days before an exam it counts as "upcoming" for Review my mistakes (Adrian, 11 Sep 2026 — not a fortnight). */
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
