import { NextRequest } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';

/** Number of days within which a lesson's progress fields may be edited. */
export const EDIT_WINDOW_DAYS = 14;

/** Today's date in SGT as YYYY-MM-DD (server-side, no TZ dependency). */
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Date n calendar days before today in YYYY-MM-DD (SGT). */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function verifyAdminAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export function formatDateSlotLabel(
  dateStr: string,
  slotFields: { Day?: string; Time?: string }
): string {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  const day = d.toLocaleDateString('en-SG', { weekday: 'short', timeZone: 'Asia/Singapore' });
  const date = d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
  return `${day}, ${date} ${slotFields.Time ?? ''}`.trim();
}

export async function countLessonsInSlot(slotId: string, date: string): Promise<number> {
  const formula = encodeURIComponent(
    `AND(FIND('${slotId}',ARRAYJOIN({Slot}))>0,{Date}='${date}',{Status}!='Cancelled',{Status}!='Absent')`
  );
  const data = await airtableRequestAll('Lessons', `?filterByFormula=${formula}&fields[]=Status`);
  return data.records.length;
}

