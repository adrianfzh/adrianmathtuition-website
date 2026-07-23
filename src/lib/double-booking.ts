// Double-booking detection — the same student holding two lessons in the same
// (date, slot) is physically impossible to attend, so it is ALWAYS a data
// error (Adele, Sun 26 Jul 2026: the end of a thrice-moved chain landed in the
// same slot as an unrelated makeup). Client-safe pure logic; the schedule page
// uses it to badge affected chips, and the server-side creation guard in
// lib/schedule-helpers.ts (findStudentSlotConflict) applies the same
// occupancy rule when blocking new bookings.

export type BookingLite = {
  id: string;
  studentId: string | null;
  date: string;
  slotId: string | null;
  status: string;
};

// A lesson OCCUPIES its slot unless it was cancelled, marked absent, or
// rescheduled away — a rescheduled-away record is a tombstone pointing at its
// replacement; the student isn't coming for it.
export function occupiesSlot(status: string): boolean {
  return status !== 'Cancelled' && status !== 'Absent' && status !== 'Rescheduled';
}

// IDs of every lesson involved in a double-booking: the same student occupying
// the same (date, slot) 2+ times. Lessons without a student (Trial) or without
// a slot (Revision Sprint) can't double-book and are skipped.
export function findDoubleBookedIds(lessons: BookingLite[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const l of lessons) {
    if (!l.studentId || !l.slotId || !l.date) continue;
    if (!occupiesSlot(l.status)) continue;
    const key = `${l.studentId}|${l.date}|${l.slotId}`;
    const ids = groups.get(key);
    if (ids) ids.push(l.id);
    else groups.set(key, [l.id]);
  }
  const flagged = new Set<string>();
  for (const ids of groups.values()) {
    if (ids.length > 1) for (const id of ids) flagged.add(id);
  }
  return flagged;
}
