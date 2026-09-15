// Ending an enrollment when its End Date has passed — the pure half of
// /api/cron/end-enrollments.
//
// Adrian, 15 Sep 2026: "put an end enrollment date and automatically disenroll
// the student when time comes". The End Date already governs BILLING
// (invoiceMonthLessonDates clamps to it) and LESSON GENERATION (the bot's
// generateUpcomingLessons skips dates past it, handlers/flows.js), so a dated
// enrollment already stops producing lessons and invoices on its own. What was
// missing is the record keeping: the row stays Status='Active' for ever, so
// every "active enrollment" count, the portal's offboarding clock
// (cron/deactivate-inactive) and Adrian's own reading of the table stay wrong
// long after the student has left.
//
// The rule, deliberately narrow:
//   • Status 'Active' AND a valid End Date STRICTLY BEFORE today (SGT) → 'Ended'.
//     Strictly before, because End Date is INCLUSIVE everywhere else in the
//     codebase (a lesson ON the end date is generated and billed —
//     billing-math.weekdayLessonDates, "BOTH INCLUSIVE"). Ending on the date
//     itself would silently drop that last lesson.
//   • An enrollment with NO End Date is never touched. An open-ended enrollment
//     is the normal state; only a date Adrian (or this module's caller) set is
//     an instruction to stop.
//   • A student whose LAST Active enrollment just ended, and who is still
//     Students.Status='Active', is proposed for 'Inactive'. A student who keeps
//     another Active enrollment (a second slot, a new level) is left alone.
//
// Nothing here writes; the route applies these decisions and can be dry-run.
export const ENROLLMENT_ACTIVE = 'Active';
export const ENROLLMENT_ENDED = 'Ended';

export interface EnrollmentRow {
  id: string;
  studentId: string | null;
  status: string | null;
  /** Airtable `End Date`, ISO YYYY-MM-DD, or null/'' when open-ended. */
  endDate: string | null;
}

export interface StudentRow {
  id: string;
  name: string;
  status: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Enrollments whose End Date is strictly in the past and are still Active.
 * A malformed or empty End Date fails CLOSED (the row is left Active) — the
 * same posture billing-math takes, where a bad end date yields no lessons
 * rather than a guess.
 */
export function enrollmentsDueToEnd(rows: readonly EnrollmentRow[], todayISO: string): EnrollmentRow[] {
  if (!ISO.test(todayISO)) return [];
  return rows.filter((r) => {
    if ((r.status || '').trim() !== ENROLLMENT_ACTIVE) return false;
    const end = (r.endDate || '').trim();
    if (!ISO.test(end)) return false;
    return end < todayISO;   // string compare is correct for ISO dates
  });
}

/**
 * Students left with no Active enrollment once `endingIds` are ended, and whose
 * Students.Status is still 'Active'. `all` must be EVERY enrollment row known,
 * not just the ending ones — a student keeping a second slot must not be
 * deactivated.
 */
export function studentsLeftWithoutEnrollment(
  all: readonly EnrollmentRow[],
  endingIds: readonly string[],
  students: readonly StudentRow[],
): StudentRow[] {
  const ending = new Set(endingIds);
  const stillActive = new Set<string>();
  for (const r of all) {
    if (ending.has(r.id)) continue;                              // about to become Ended
    if ((r.status || '').trim() !== ENROLLMENT_ACTIVE) continue;
    if (r.studentId) stillActive.add(r.studentId);
  }
  // Only students who actually had one of the ending enrollments are candidates.
  const touched = new Set(all.filter((r) => ending.has(r.id)).map((r) => r.studentId).filter(Boolean) as string[]);
  return students.filter(
    (s) => touched.has(s.id) && !stillActive.has(s.id) && (s.status || '').trim() === 'Active',
  );
}

/** Adrian's Telegram line. Empty string when nothing happened — the caller stays quiet. */
export function endSummaryLine(
  ended: readonly { name: string; endDate: string }[],
  deactivated: readonly { name: string }[],
): string {
  if (!ended.length && !deactivated.length) return '';
  const lines = [`🎓 Enrollments ended (${ended.length})`];
  for (const e of ended) lines.push(`• ${e.name} — ended ${e.endDate}`);
  if (deactivated.length) {
    lines.push('', `Now Inactive (no enrollment left): ${deactivated.map((d) => d.name).join(', ')}`);
  }
  return lines.join('\n');
}
