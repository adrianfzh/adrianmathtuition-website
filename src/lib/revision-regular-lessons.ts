// Helpers to cancel / restore a student's June 2026 *Regular* lessons when
// they sign up for (or revert) the June Revision Sprint. Revision students
// don't attend their normal weekly lessons in June, so those Regular records
// are soft-cancelled (Status='Cancelled') and tagged with a marker so the
// revert flow can restore exactly the ones we cancelled.
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';

export const REVISION_CANCEL_MARKER = 'Cancelled — June Revision Sprint sign-up';

const JUNE_REGULAR = (status: string) =>
  `AND({Date}>='2026-06-01',{Date}<'2026-07-01',{Type}='Regular',{Status}='${status}')`;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function patchLessons(records: { id: string; fields: Record<string, unknown> }[]) {
  for (const batch of chunk(records, 10)) {
    await airtableRequest('Lessons', '', {
      method: 'PATCH',
      body: JSON.stringify({ records: batch }),
    });
  }
}

/**
 * Soft-cancel this student's June 2026 Regular lessons that are still
 * 'Scheduled'. Tags Notes with REVISION_CANCEL_MARKER. Returns the count.
 * Linked-record fields can't be filtered by ID in Airtable formulas, so we
 * filter by date/type/status in Airtable and match the student in JS.
 */
export async function cancelJuneRegularLessons(studentId: string): Promise<number> {
  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(JUNE_REGULAR('Scheduled'))}&fields[]=Student&fields[]=Notes`
  );
  const mine = data.records.filter((r: any) => r.fields['Student']?.[0] === studentId);
  if (!mine.length) return 0;

  const updates = mine.map((r: any) => {
    const existing = (r.fields['Notes'] || '').toString().trim();
    const notes = existing ? `${existing} | ${REVISION_CANCEL_MARKER}` : REVISION_CANCEL_MARKER;
    return { id: r.id, fields: { Status: 'Cancelled', Notes: notes } };
  });
  await patchLessons(updates);
  return updates.length;
}

/**
 * Restore June 2026 Regular lessons we previously cancelled for this student
 * (Status='Cancelled' AND Notes carries REVISION_CANCEL_MARKER) back to
 * 'Scheduled', stripping the marker from Notes. Returns the count.
 */
export async function restoreJuneRegularLessons(studentId: string): Promise<number> {
  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(JUNE_REGULAR('Cancelled'))}&fields[]=Student&fields[]=Notes`
  );
  const mine = data.records.filter(
    (r: any) =>
      r.fields['Student']?.[0] === studentId &&
      (r.fields['Notes'] || '').toString().includes(REVISION_CANCEL_MARKER)
  );
  if (!mine.length) return 0;

  const updates = mine.map((r: any) => {
    const cleaned = (r.fields['Notes'] || '')
      .toString()
      .replace(REVISION_CANCEL_MARKER, '')
      .replace(/\s*\|\s*$/, '')
      .replace(/^\s*\|\s*/, '')
      .trim();
    return { id: r.id, fields: { Status: 'Scheduled', Notes: cleaned } };
  });
  await patchLessons(updates);
  return updates.length;
}
