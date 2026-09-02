// Which subject a STUDENT's hand-in is marked as — and the gate that keeps a
// student from tagging one they may not.
//
// Adrian, 2 Sep 2026 ("build 1 and 2"): science marking is live for Adrian on
// the admin page, but a student's hand-in must never be silently marked with the
// wrong brain, and must never reach science before the calibration gate is met.
// Two rules, both here and both pure so the gate is testable without a request:
//   1. derive the subjects a student COULD hand in, from their enrolment;
//   2. resolve the ONE subject a given hand-in is marked as, refusing any the
//      student is not entitled to — the client picker is only UX; this decides.
import { MARK_SUBJECTS, DEFAULT_MARK_SUBJECT, isMarkSubject, type MarkSubject } from './mark-subjects';

/** Airtable `Students.Subjects` label → mark subject. Every Math variant (Math,
 *  E Math, A Math, IP Math, H1/H2 Math) is one mark subject: 'math'. Science
 *  labels map by their first word. Options that do not yet exist in Airtable
 *  simply never appear — nothing to guess. */
export function markSubjectOfLabel(label: string): MarkSubject | null {
  const s = String(label || '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('math')) return 'math';
  if (s.includes('phys')) return 'physics';
  if (s.includes('chem')) return 'chemistry';
  if (s.includes('bio')) return 'biology';
  return null;
}

/**
 * The mark subjects a student could hand a paper in for, from their enrolment.
 * Math always included (a science student still sits maths, and it is the safe
 * default), math first, then each science they are enrolled in, de-duplicated.
 * An empty or unknown enrolment yields just ['math'].
 */
export function markSubjectsFromEnrolment(subjects: unknown): MarkSubject[] {
  const arr = Array.isArray(subjects) ? subjects : [];
  const found = new Set<MarkSubject>(['math']);
  for (const s of arr) { const m = markSubjectOfLabel(String(s)); if (m) found.add(m); }
  return MARK_SUBJECTS.filter(s => found.has(s));   // canonical order, math first
}

export type MarkSubjectAccess = 'preview' | 'open' | 'closed';

/**
 * THE GATE. The one subject a hand-in is marked as. Never trusts `requested`
 * blindly — that is a value from the browser.
 *   - 'preview' (Adrian's admin cookie): any valid subject he asks for.
 *   - 'open' (flag on): the requested subject only if the student is enrolled in
 *     it; anything else falls back to math.
 *   - 'closed' (default today): always math, whatever was requested — students
 *     cannot reach science marking until the calibration gate is passed.
 */
export function resolveHandinSubject(opts: {
  requested?: unknown;
  enrolled?: MarkSubject[];
  access: MarkSubjectAccess;
}): MarkSubject {
  const req = isMarkSubject(opts.requested) ? opts.requested : null;
  if (opts.access === 'preview') return req ?? DEFAULT_MARK_SUBJECT;
  if (opts.access === 'closed' || !req) return DEFAULT_MARK_SUBJECT;
  const enrolled = opts.enrolled && opts.enrolled.length ? opts.enrolled : ['math'];
  return enrolled.includes(req) ? req : DEFAULT_MARK_SUBJECT;
}

/**
 * The subjects to OFFER in the picker. Empty (and one-element) lists mean no
 * picker — the hand-in is implicitly math. Preview sees every subject so Adrian
 * can test; open sees exactly what the student is enrolled in; closed sees none.
 */
export function pickableSubjects(opts: { enrolled: MarkSubject[]; access: MarkSubjectAccess }): MarkSubject[] {
  if (opts.access === 'preview') return [...MARK_SUBJECTS];
  if (opts.access === 'open') return opts.enrolled.length > 1 ? opts.enrolled : [];
  return [];
}
