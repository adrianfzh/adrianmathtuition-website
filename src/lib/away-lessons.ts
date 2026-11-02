// Lessons that fall in one of Adrian's own away periods (🏖 Away dates on /admin/schedule).
//
// Adrian, 2 Nov 2026: "can it also mark the scheduled lessons as missed with reason?
// and remind me to arrange for make up lessons with the parents 2 weeks before?"
//
// Pure rules only (tested in away-lessons.test.ts); the Airtable side is
// away-lessons-store.ts. A lesson in an away period becomes Status 'Absent'
// (missed, owed a make-up) with one Notes line that names the period, so the
// line both explains the chip and lets removing the period undo exactly the
// lessons it marked — never one Adrian marked absent by hand.
import type { BlockedRange } from '@/lib/blocked-dates';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Days before an away period starts that Adrian is reminded to arrange make-ups. */
export const MAKEUP_REMINDER_DAYS = 14;

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** "28 Oct–1 Nov 2026", "3–9 Aug 2026", "5 Dec 2026", "28 Dec 2026–3 Jan 2027". */
export function rangeLabel(r: { start: string; end: string }): string {
  const a = parts(r.start), b = parts(r.end);
  if (r.start === r.end) return `${a.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m - 1]} ${a.y}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m - 1]}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${a.d}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

/** The Notes line a lesson gets when the away period marks it missed. */
export function awayNote(r: { start: string; end: string }): string {
  return `Missed (Adrian): tutor away ${rangeLabel(r)}`;
}

/** Add the away line to existing notes (once). */
export function withAwayNote(notes: string | undefined | null, r: { start: string; end: string }): string {
  const line = awayNote(r);
  const cur = (notes || '').trim();
  if (cur.split('\n').some((l) => l.trim() === line)) return cur;
  return cur ? `${cur}\n${line}` : line;
}

/** True when these notes carry THIS period's away line. */
export function hasAwayNote(notes: string | undefined | null, r: { start: string; end: string }): boolean {
  const line = awayNote(r);
  return (notes || '').split('\n').some((l) => l.trim() === line);
}

/** The notes with this period's away line taken out. */
export function withoutAwayNote(notes: string | undefined | null, r: { start: string; end: string }): string {
  const line = awayNote(r);
  return (notes || '').split('\n').filter((l) => l.trim() !== line).join('\n').trim();
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The day the make-up reminder is due for this period. */
export function reminderDate(r: { start: string }): string {
  return addDays(r.start, -MAKEUP_REMINDER_DAYS);
}

/**
 * Should the make-up reminder go out today? Once per period, from 14 days
 * before it starts until it starts — so a period added 5 days ahead still gets
 * its reminder the next morning, and a missed cron run catches up.
 */
export function reminderDue(r: BlockedRange & { remindedOn?: string }, today: string): boolean {
  if (r.remindedOn) return false;
  return reminderDate(r) <= today && today < r.start;
}

/** Periods still worth sweeping for new Scheduled lessons (not over yet). */
export function liveRanges<T extends { end: string }>(ranges: T[], today: string): T[] {
  return ranges.filter((r) => r.end >= today);
}

export type AwayLesson = { date: string; time: string; student: string };

/** The Telegram reminder: who to arrange a make-up with. */
export function reminderMessage(r: BlockedRange, lessons: AwayLesson[]): string {
  const head = `🏖 <b>You are away ${rangeLabel(r)}</b>${r.reason ? ` (${r.reason})` : ''} — starts in ${MAKEUP_REMINDER_DAYS} days or less.`;
  if (!lessons.length) return `${head}\nNo lessons are booked in those days, so there are no make-ups to arrange.`;
  const byStudent = new Map<string, AwayLesson[]>();
  for (const l of [...lessons].sort((a, b) => a.date.localeCompare(b.date))) {
    byStudent.set(l.student, [...(byStudent.get(l.student) || []), l]);
  }
  const lines = [...byStudent.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([who, ls]) => `• ${who} — ${ls.map((l) => `${shortDate(l.date)}${l.time ? ` ${l.time}` : ''}`).join(', ')}`);
  return [
    head,
    '',
    `Arrange make-up lessons with these parents (${byStudent.size} student${byStudent.size === 1 ? '' : 's'}, ${lessons.length} lesson${lessons.length === 1 ? '' : 's'} already marked missed):`,
    ...lines,
  ].join('\n');
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const { m, d: day } = parts(iso);
  return `${wd} ${day} ${MONTHS[m - 1]}`;
}
