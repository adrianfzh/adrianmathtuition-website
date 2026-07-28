// Billable Additional lessons for the monthly invoice generator.
//
// REGRESSION GUARD — never filter the Lessons table by {Student}='recXXX' in
// an Airtable formula: linked-record fields coerce to their DISPLAY NAME in
// formulas, so a record-id comparison matches NOTHING. The generator shipped
// with exactly that filter, which silently unbilled every Additional lesson
// from launch until 2026-07-26 (0 of 315 invoices ever carried an Additional
// line item; Tan Heng Kang's July extras were only billed because Adrian
// amended the invoice by hand). Fetch by Type/Status/Date window only, then
// match the student link in JS — the documented pattern (CLAUDE.md Gotchas).

export interface AdditionalLessonRecord {
  id: string;
  date: string;
  studentId: string | null;
  isRevisionMakeup: boolean;
  notes: string;
}

export function mapAdditionalRecord(r: { id: string; fields: Record<string, unknown> }): AdditionalLessonRecord {
  return {
    id: r.id,
    date: (r.fields['Date'] as string) || '',
    studentId: (r.fields['Student'] as string[] | undefined)?.[0] ?? null,
    isRevisionMakeup: r.fields['Is Revision Makeup'] === true,
    notes: (r.fields['Notes'] as string) || '',
  };
}

/**
 * The student's billable Additional lessons from a window-fetched pool.
 * Revision makeups are NEVER billable — the Revision Sprint was already paid
 * (structured flag first, legacy "Revision makeup" note text as safety net).
 */
export function billableAdditionalFor(pool: AdditionalLessonRecord[], studentId: string): AdditionalLessonRecord[] {
  return pool
    .filter(l => l.studentId === studentId && !l.isRevisionMakeup && !/revision makeup/i.test(l.notes))
    .sort((a, b) => a.date.localeCompare(b.date));
}
