// Completed Regular lessons for prorated-month invoices (PRORATION_MONTHS —
// June + Oct–Dec bill by actual attendance, in arrears).
//
// REGRESSION GUARD — the same two Airtable-formula bugs lib/additional-lessons.ts
// guards against, found 2026-09-02 in generate-invoices' prorated branch:
//   1. It filtered Lessons with {Student}='recXXX'. Linked-record fields coerce
//      to their DISPLAY NAME in formulas, so a record-id comparison matches
//      NOTHING — the branch found 0 Completed lessons for EVERY student in
//      EVERY prorated month, so it never billed a single regular lesson
//      (students were skipped, or invoiced for Additional lessons only).
//   2. Its window ended {Date}<='monthEnd', which on a date-typed field also
//      silently drops lessons ON the month's last day.
// Fetch the whole month window by Type/Status/Date only — half-open, ONE fetch
// for all students — then match the student link in JS: the documented pattern
// (CLAUDE.md Gotchas).

import { monthWindowClause } from './billing-math';

export interface ProratedLessonRecord {
  id: string;
  date: string;
  studentId: string | null;
}

export function mapProratedRecord(r: { id: string; fields: Record<string, unknown> }): ProratedLessonRecord {
  return {
    id: r.id,
    date: (r.fields['Date'] as string) || '',
    studentId: (r.fields['Student'] as string[] | undefined)?.[0] ?? null,
  };
}

/**
 * The Airtable formula for the ONE window fetch of a prorated month's
 * Completed Regular lessons — all students at once, matched per-student in
 * JS by proratedLessonsFor. Must never contain a {Student} clause (bug 1)
 * and must end half-open at the first of the next month (bug 2).
 * `month` is 1–12.
 */
export function proratedMonthFormula(year: number, month: number): string {
  return `AND({Type}='Regular',{Status}='Completed',${monthWindowClause(year, month)})`;
}

/**
 * The student's Completed Regular lessons from the window-fetched pool,
 * sorted by date ascending (invoice line items print in date order).
 */
export function proratedLessonsFor(pool: ProratedLessonRecord[], studentId: string): ProratedLessonRecord[] {
  return pool
    .filter(l => l.studentId === studentId)
    .sort((a, b) => a.date.localeCompare(b.date));
}
