// Airtable side of away-lessons.ts: mark the lessons in an away period missed,
// put them back when the period is removed, and list them for the reminder.
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import type { BlockedRange } from '@/lib/blocked-dates';
import { withAwayNote, hasAwayNote, withoutAwayNote, type AwayLesson } from '@/lib/away-lessons';

// Airtable dates: the upper bound is exclusive, so use the day after `end`.
function dayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function inRange(r: BlockedRange, status: string): string {
  return `AND({Status}='${status}',NOT(IS_BEFORE({Date},'${r.start}')),IS_BEFORE({Date},'${dayAfter(r.end)}'))`;
}

async function patchAll(updates: { id: string; fields: Record<string, unknown> }[]): Promise<void> {
  for (let i = 0; i < updates.length; i += 10) {
    await airtableRequest('Lessons', '', {
      method: 'PATCH',
      body: JSON.stringify({ records: updates.slice(i, i + 10) }),
    });
  }
}

/** Every lesson still Scheduled in the period → Absent with the away line. Returns how many. */
export async function markAwayLessons(r: BlockedRange): Promise<number> {
  const { records } = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(inRange(r, 'Scheduled'))}&fields[]=Notes`,
  );
  await patchAll(records.map((rec: any) => ({
    id: rec.id,
    fields: { Status: 'Absent', Notes: withAwayNote(rec.fields['Notes'], r) },
  })));
  return records.length;
}

/**
 * Undo markAwayLessons when the period is removed: only lessons that carry
 * this period's line, are still Absent and have no make-up booked against them.
 */
export async function restoreAwayLessons(r: BlockedRange): Promise<number> {
  const { records } = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(inRange(r, 'Absent'))}&fields[]=Notes&fields[]=Rescheduled Lesson ID`,
  );
  const mine = records.filter((rec: any) =>
    hasAwayNote(rec.fields['Notes'], r) && !(rec.fields['Rescheduled Lesson ID'] || []).length);
  await patchAll(mine.map((rec: any) => ({
    id: rec.id,
    fields: { Status: 'Scheduled', Notes: withoutAwayNote(rec.fields['Notes'], r) },
  })));
  return mine.length;
}

/** The lessons this period marked missed, with student name and slot time, for the reminder. */
export async function awayLessonsFor(r: BlockedRange): Promise<AwayLesson[]> {
  const { records } = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(inRange(r, 'Absent'))}&fields[]=Notes&fields[]=Date&fields[]=Student&fields[]=Slot`,
  );
  const mine = records.filter((rec: any) => hasAwayNote(rec.fields['Notes'], r));
  if (!mine.length) return [];
  const [students, slots] = await Promise.all([
    airtableRequestAll('Students', '?fields[]=Student Name'),
    airtableRequestAll('Slots', '?fields[]=Time'),
  ]);
  const nameOf = new Map(students.records.map((s: any) => [s.id, s.fields['Student Name'] as string]));
  const timeOf = new Map(slots.records.map((s: any) => [s.id, (s.fields['Time'] as string) || '']));
  return mine.map((rec: any) => ({
    date: rec.fields['Date'],
    time: timeOf.get(rec.fields['Slot']?.[0]) || '',
    student: nameOf.get(rec.fields['Student']?.[0]) || 'Unknown student',
  }));
}
