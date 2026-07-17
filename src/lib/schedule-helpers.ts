import { NextRequest } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';
import { nextDayISO } from '@/lib/billing-math';

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
  // Fail CLOSED when no admin password is configured. Previously returned true
  // here, which meant an unset/blank ADMIN_PASSWORD (bad deploy, cleared env)
  // silently opened every admin + admin-gated portal route to the public.
  if (!pw) return false;
  // Preferred: signed httpOnly session cookie (see lib/admin-session.ts —
  // carries no secret, JS-unreadable). Legacy: raw-password Bearer header,
  // kept for the bot/tools and admin pages not yet migrated.
  if (verifyAdminSession(req.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return true;
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

// Airtable formula matching Lessons ON a single date. {Date}='YYYY-MM-DD'
// equality silently matches NOTHING on the date-typed field (verified live
// 2026-07-17 — it found 0 of 8 records on 2026-07-28, so the capacity gate
// never fired). Half-open range is the only reliable form.
export function onDateFormula(date: string): string {
  return `AND({Date}>='${date}',{Date}<'${nextDayISO(date)}')`;
}

// NOTE: ARRAYJOIN({Slot}) returns slot display names, not record IDs.
// Filter by Date + Status only in Airtable, then match slotId in JS.
// Makeup capacity is the TOTAL slot limit (regular + makeup combined).
// Count all non-cancelled/absent lessons and compare against makeupCapacity.
export async function countLessonsOnDateBySlot(date: string): Promise<Record<string, number>> {
  const formula = encodeURIComponent(
    `AND(${onDateFormula(date)},{Status}!='Cancelled',{Status}!='Absent')`
  );
  const data = await airtableRequestAll('Lessons', `?filterByFormula=${formula}&fields[]=Slot`);
  const counts: Record<string, number> = {};
  for (const r of data.records) {
    const sid = r.fields['Slot']?.[0];
    if (sid) counts[sid] = (counts[sid] ?? 0) + 1;
  }
  return counts;
}

export async function countLessonsInSlot(slotId: string, date: string): Promise<number> {
  return (await countLessonsOnDateBySlot(date))[slotId] ?? 0;
}

