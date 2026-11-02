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
  /** Already billed on some invoice (Billed checkbox) — never bill again. */
  billed: boolean;
}

export function mapAdditionalRecord(r: { id: string; fields: Record<string, unknown> }): AdditionalLessonRecord {
  return {
    id: r.id,
    date: (r.fields['Date'] as string) || '',
    studentId: (r.fields['Student'] as string[] | undefined)?.[0] ?? null,
    isRevisionMakeup: r.fields['Is Revision Makeup'] === true,
    notes: (r.fields['Notes'] as string) || '',
    billed: r.fields['Billed'] === true,
  };
}

/**
 * The student's billable Additional lessons from a window-fetched pool.
 * Revision makeups are NEVER billable — the Revision Sprint was already paid
 * (structured flag first, legacy "Revision makeup" note text as safety net).
 * Lessons already MARKED billed (manual adjustment invoice, or a previous
 * generator run's write-back) are excluded — the marker, not the window, is
 * the primary double-billing guard.
 */
export function billableAdditionalFor(pool: AdditionalLessonRecord[], studentId: string): AdditionalLessonRecord[] {
  return pool
    .filter(l => l.studentId === studentId && !l.billed && !l.isRevisionMakeup && !/revision makeup/i.test(l.notes))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * First day (inclusive) of the advance run's Additional-lesson window: the 1st
 * of the month THREE months before the run day (SGT). The Billed checkbox, not
 * the window, stops a second billing — so the window can look back far enough
 * that no extra is stranded.
 *
 * REGRESSION — found 2 Nov 2026: the window used to be the 15th of last month
 * to the run day. A student with no lessons in the month being billed (a
 * skipped November or December) gets no invoice that run, and the NEXT run's
 * window had already moved on — so their extras from that window were never
 * billed (e.g. a December-skipper's extras from 15 Oct–14 Nov).
 */
export function advanceExtrasWindowStartISO(runDayISO: string, monthsBack = 3): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(runDayISO);
  if (!m) throw new Error(`bad run day: ${runDayISO}`);
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) - monthsBack;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}
