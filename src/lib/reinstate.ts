// Reinstate a discontinued student (17 Sep 2026, SPEC-STUDENT-FIRST §4, Option
// A: "put everything back exactly as it was"). The discontinue route writes a
// snapshot of what it ended and removed; this file is the pure half of undoing
// it — which lesson fields to write back, and the clash rule that stops the
// undo when a slot has since been given to someone else. Tested.

export interface SavedEnrollment { id: string; endDate: string | null }
export interface SavedLesson { id: string; fields: Record<string, unknown> }
export interface DiscontinueSnapshot {
  enrollments: SavedEnrollment[];
  lessons: SavedLesson[];
  /** Invoices voided by the discontinue — reported, never un-voided (money is a human decision). */
  invoicesVoided: string[];
  studentStatus: string | null;
}

/** The Lessons fields a re-created lesson carries back. Formulas, lookups and
 *  progress fields are left out: Airtable rejects the former and the latter
 *  belong to a lesson that happened. */
export const LESSON_RESTORE_FIELDS = ['Student', 'Slot', 'Date', 'Type', 'Status', 'Billing Month', 'Booked Via', 'Notes', 'Is Makeup', 'Makeup For'] as const;

export function lessonRestoreFields(saved: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of LESSON_RESTORE_FIELDS) if (saved[k] !== undefined && saved[k] !== null && saved[k] !== '') out[k] = saved[k];
  // A restored lesson is a scheduled one again, whatever the snapshot said.
  out.Status = 'Scheduled';
  return out;
}

export interface ExistingLesson { id: string; student: string | null; slot: string | null; date: string; status: string }

/** Lessons that cannot come back because the same slot on the same day now
 *  holds another student's scheduled lesson. Option A stops on any clash and
 *  names them; nothing is written. */
export function clashes(saved: SavedLesson[], existing: ExistingLesson[], studentId: string): { date: string; slot: string | null; heldBy: string | null }[] {
  const out: { date: string; slot: string | null; heldBy: string | null }[] = [];
  for (const s of saved) {
    const date = String(s.fields.Date ?? '');
    const slot = Array.isArray(s.fields.Slot) ? String(s.fields.Slot[0] ?? '') : null;
    if (!date || !slot) continue;
    const hit = existing.find(e => e.date === date && e.slot === slot && e.status === 'Scheduled' && e.student && e.student !== studentId);
    if (hit) out.push({ date, slot, heldBy: hit.student });
  }
  return out;
}

/** Lessons already back (a partial earlier reinstate, or a re-created one) are skipped, not doubled. */
export function lessonsToRecreate(saved: SavedLesson[], existing: ExistingLesson[], studentId: string): SavedLesson[] {
  return saved.filter(s => {
    const date = String(s.fields.Date ?? '');
    const slot = Array.isArray(s.fields.Slot) ? String(s.fields.Slot[0] ?? '') : null;
    return !existing.some(e => e.date === date && e.slot === slot && e.student === studentId);
  });
}
