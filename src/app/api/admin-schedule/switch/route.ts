// POST /api/admin-schedule/switch
// Permanently switches a student to a new slot starting from switchDate:
//   A. Delete all future Scheduled lessons on old slot (from switchDate onward)
//   B. Create new weekly lessons on new slot for 28 days
//   C. Update Enrollment.Slot to new slot
// Mirrors the bot's /switch → sw_confirm flow exactly.

import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Public holidays — no lessons on these dates (matches bot NO_LESSON_DATES)
const NO_LESSON_DATES: string[] = [
  '2026-01-01','2026-01-29','2026-01-30',
  '2026-03-28','2026-04-03','2026-05-01',
  '2026-05-12','2026-06-06','2026-08-09',
  '2026-10-20','2026-11-09','2026-12-25',
];

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r;
}
function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { lessonId: string; newSlotId: string; switchDate: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { lessonId, newSlotId, switchDate } = body;
  if (!lessonId || !newSlotId || !switchDate) {
    return NextResponse.json({ error: 'lessonId, newSlotId and switchDate required' }, { status: 400 });
  }

  // ── Resolve student + old slot from lesson ──────────────────────────────────
  const lesson = await airtableRequest('Lessons', `/${lessonId}`);
  const studentId: string = lesson.fields['Student']?.[0];
  const oldSlotId: string = lesson.fields['Slot']?.[0];
  if (!studentId || !oldSlotId) return NextResponse.json({ error: 'Lesson missing student or slot' }, { status: 400 });

  // ── Resolve new slot details ────────────────────────────────────────────────
  const newSlot = await airtableRequest('Slots', `/${newSlotId}`);
  const newDayRaw: string = (newSlot.fields['Day'] || '').replace(/^\d+\s+/, '').trim();
  const newSlotTime: string = newSlot.fields['Time'] || '';
  const targetDay = DAY_NAMES.indexOf(newDayRaw);
  if (targetDay === -1) return NextResponse.json({ error: `Unknown day: ${newDayRaw}` }, { status: 400 });

  // Old slot name for notes
  const oldSlot = await airtableRequest('Slots', `/${oldSlotId}`);
  const oldDayRaw: string = (oldSlot.fields['Day'] || '').replace(/^\d+\s+/, '').trim();
  const oldSlotName = `${oldDayRaw} ${oldSlot.fields['Time'] || ''}`.trim();
  const newSlotName = `${newDayRaw} ${newSlotTime}`.trim();

  // Student name for notes
  const studentRec = await airtableRequest('Students', `/${studentId}`);
  const studentName: string = studentRec.fields['Student Name'] || studentId;

  const results = { cancelled: 0, created: 0, enrollmentUpdated: false, errors: [] as string[] };

  // ── A. Delete future Scheduled lessons on old slot ──────────────────────────
  try {
    const futureLessons = await airtableRequestAll('Lessons',
      `?filterByFormula=${encodeURIComponent(`AND({Status}='Scheduled',{Date}>='${switchDate}')`)}&fields[]=Student&fields[]=Slot&fields[]=Date`
    );
    const toDelete = futureLessons.records.filter((r: any) =>
      r.fields['Student']?.[0] === studentId && r.fields['Slot']?.[0] === oldSlotId
    );
    for (const r of toDelete) {
      await airtableRequest('Lessons', `/${r.id}`, { method: 'DELETE' });
      results.cancelled++;
    }
  } catch (err: any) {
    results.errors.push(`Cancel step: ${err.message}`);
  }

  // ── B. Create new weekly lessons on new slot (28-day horizon) ───────────────
  try {
    const endDate = addDays(new Date(), 28);
    const dayAfterEnd = addDays(endDate, 1);

    // Existing lessons to avoid duplicates
    const existingData = await airtableRequestAll('Lessons',
      `?filterByFormula=${encodeURIComponent(`AND({Date}>='${switchDate}',IS_BEFORE({Date},'${isoDate(dayAfterEnd)}'))`)}&fields[]=Student&fields[]=Date&fields[]=Slot`
    );
    const existingKeys = new Set(
      existingData.records
        .filter((r: any) => r.fields['Student']?.[0] === studentId)
        .map((r: any) => `${r.fields['Date']}|${r.fields['Slot']?.[0] || ''}`)
    );

    // Find first occurrence of targetDay on or after switchDate
    let d = new Date(switchDate + 'T00:00:00Z');
    while (d.getUTCDay() !== targetDay) d = addDays(d, 1);

    let firstNonHolidayCreated = false;
    while (d <= endDate) {
      const dateStr = isoDate(d);
      if (!existingKeys.has(`${dateStr}|${newSlotId}`)) {
        const isHoliday = NO_LESSON_DATES.includes(dateStr);
        const isFirst = !firstNonHolidayCreated && !isHoliday;
        if (isFirst) firstNonHolidayCreated = true;
        const fields: Record<string, any> = {
          Type: isFirst ? 'Rescheduled' : 'Regular',
          Student: [studentId],
          Slot: [newSlotId],
          Date: dateStr,
          Status: isHoliday ? 'Cancelled' : 'Scheduled',
        };
        if (isHoliday) fields['Notes'] = 'Public Holiday';
        if (isFirst) fields['Notes'] = `Switched from ${oldSlotName} to ${newSlotName} (first lesson after switch)`;
        await airtableRequest('Lessons', '', { method: 'POST', body: JSON.stringify({ fields }) });
        results.created++;
      }
      d = addDays(d, 7);
    }
  } catch (err: any) {
    results.errors.push(`Create step: ${err.message}`);
  }

  // ── C. Update Enrollment to new slot ───────────────────────────────────────
  try {
    const enrollments = await airtableRequestAll('Enrollments',
      `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Slot`
    );
    const enrollment = enrollments.records.find((r: any) =>
      r.fields['Student']?.[0] === studentId && r.fields['Slot']?.[0] === oldSlotId
    );
    if (enrollment) {
      await airtableRequest('Enrollments', `/${enrollment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { Slot: [newSlotId] } }),
      });
      results.enrollmentUpdated = true;
    }
  } catch (err: any) {
    results.errors.push(`Enrollment step: ${err.message}`);
  }

  return NextResponse.json({
    success: results.errors.length === 0,
    studentName,
    oldSlotName,
    newSlotName,
    switchDate,
    ...results,
  });
}
