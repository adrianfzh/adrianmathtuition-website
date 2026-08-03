// Unmarked lessons — past lessons whose attendance was never recorded.
//
// The definition mirrors the /admin/schedule chip's "? unmarked" flag
// (DraggableLessonChip.isPastUnmarked): a lesson still at Status='Scheduled'
// whose date is strictly before today, excluding Trials. Status='Scheduled'
// already excludes Rescheduled-away/Cancelled/Absent/Completed records, so no
// extra status clauses are needed. Any surface that counts or lists unmarked
// lessons must build its Airtable filter through this function — don't
// re-derive the formula inline in a route.

/**
 * Airtable filterByFormula selecting unmarked lessons as of `todayISO`
 * (YYYY-MM-DD, SGT). `{Date}<'todayISO'` is strictly-before-today — the
 * repo-wide date-filter gotcha only bites `<=` upper bounds, and today's
 * still-in-progress lessons must NOT count as unmarked.
 */
export function unmarkedLessonsFilterFormula(todayISO: string): string {
  return `AND({Status}='Scheduled',{Type}!='Trial',{Date}<'${todayISO}')`;
}
