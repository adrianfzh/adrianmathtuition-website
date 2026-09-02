import { NextRequest } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';
import { safeEqual } from '@/lib/safe-equal';
import { nextDayISO } from '@/lib/billing-math';
import { SEC_CAP_SETTING, parseSecCapOverride } from '@/lib/capacity-override';
import { sgtDayStart, sgtDaysAgoISO, sgtTodayISO } from '@/lib/sgt';

/** Number of days within which a lesson's progress fields may be edited. */
export const EDIT_WINDOW_DAYS = 14;

/** Today's date in Singapore as YYYY-MM-DD. These two read the SINGAPORE
 *  calendar, not the server's: they used to build the string from server-local
 *  date components, which on Vercel (UTC) is a day behind between 00:00 and
 *  08:00 SGT. Name kept so the ~40 callers don't churn. */
export function localToday(): string {
  return sgtTodayISO();
}

/** Date n calendar days before today in YYYY-MM-DD (Singapore). */
export function daysAgo(n: number): string {
  return sgtDaysAgoISO(n);
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
  return safeEqual(req.headers.get('authorization') ?? '', `Bearer ${pw}`);
}

export function formatDateSlotLabel(
  dateStr: string,
  slotFields: { Day?: string; Time?: string }
): string {
  const d = sgtDayStart(dateStr);
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
// Counts lessons that OCCUPY a seat — the same rule as occupiesSlot()
// (lib/double-booking.ts) and findStudentSlotConflict below: not Cancelled,
// not Absent, and NOT Rescheduled-away. A lesson moved off this date frees
// its seat; counting it made a 4-student Sunday read "Slot full — 6/6" (two
// moved-away records still on the date), forcing a needless admin override
// while the calendar badge correctly said 4 (31 Jul 2026).
export async function countLessonsOnDateBySlot(date: string): Promise<Record<string, number>> {
  const formula = encodeURIComponent(
    `AND(${onDateFormula(date)},{Status}!='Cancelled',{Status}!='Absent',{Status}!='Rescheduled')`
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

// Double-booking guard: does this student already OCCUPY this (date, slot)?
// Occupying = not Cancelled / Absent / Rescheduled-away (same rule as
// lib/double-booking.ts). Same linked-record gotcha as above — filter by
// Date + Status in Airtable, match the student/slot record IDs in JS.
// Returns the conflicting lesson or null. Every route that CREATES a lesson
// for a student at a slot must call this and 409 on a hit — the same student
// twice in one slot is physically impossible (Adele, Sun 26 Jul 2026).
export async function findStudentSlotConflict(
  studentId: string, date: string, slotId: string
): Promise<{ id: string; type: string } | null> {
  const formula = encodeURIComponent(
    `AND(${onDateFormula(date)},{Status}!='Cancelled',{Status}!='Absent',{Status}!='Rescheduled')`
  );
  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${formula}&fields[]=Slot&fields[]=Student&fields[]=Type`
  );
  for (const r of data.records) {
    if (r.fields['Student']?.[0] === studentId && r.fields['Slot']?.[0] === slotId) {
      return { id: r.id, type: (r.fields['Type'] as string) || '' };
    }
  }
  return null;
}

/**
 * Active Sec-capacity override (null = off). Read fresh on each booking check —
 * one tiny Settings query; failure means "no override" so bookings never break
 * on a Settings hiccup.
 */
export async function fetchSecCapOverride(): Promise<number | null> {
  try {
    const data = await airtableRequest(
      'Settings',
      `?filterByFormula=${encodeURIComponent(`{Setting Name}='${SEC_CAP_SETTING}'`)}&maxRecords=1`
    );
    return parseSecCapOverride(data.records?.[0]?.fields?.['Value'] ?? null);
  } catch {
    return null;
  }
}

