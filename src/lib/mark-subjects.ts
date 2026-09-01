// The subjects a marking run can carry (paper_marking_runs.subject — text NOT
// NULL default 'math', CHECK-constrained to this list; SPEC-SCIENCE-MARKING.md).
// One place for the list so the mark-paper picker, the library/triage chips,
// the ?subject= filters and the calibration dashboard can never disagree on
// spelling or order.

export const MARK_SUBJECTS = ['math', 'physics', 'chemistry', 'biology'] as const;
export type MarkSubject = (typeof MARK_SUBJECTS)[number];

export const DEFAULT_MARK_SUBJECT: MarkSubject = 'math';

export function isMarkSubject(x: unknown): x is MarkSubject {
  return typeof x === 'string' && (MARK_SUBJECTS as readonly string[]).includes(x);
}

/** Display spelling for a chip or a card title. Unknown values pass through
 *  capitalised so a row from a future migration still shows something. */
export function subjectLabel(subject: string): string {
  switch (subject) {
    case 'math': return 'Math';
    case 'physics': return 'Physics';
    case 'chemistry': return 'Chemistry';
    case 'biology': return 'Biology';
    default: return subject ? subject.charAt(0).toUpperCase() + subject.slice(1) : '';
  }
}
