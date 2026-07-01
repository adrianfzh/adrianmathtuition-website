// POST /api/admin-schedule/switch
// Permanently switches a student to a new slot starting from switchDate:
//   A. Delete all future Scheduled lessons on old slot (from switchDate onward)
//   B. Create new weekly lessons on new slot (9-week horizon)
//   C. Proration: charge/credit the difference in remaining lessons this month
//      (new-slot weekday vs old-slot weekday, switchDate→month-end, excl holidays)
//      as a Draft 'Adjustment' invoice.
//   D. Enrollment history: END the old enrollment (Status 'Ended', End Date =
//      day before switch) and CREATE a new Active enrollment on the new slot,
//      carrying over Rate Per Lesson + Rate Type.
// Mirrors the bot's /switch → sw_confirm flow exactly.

import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { generateRegularLessonsForSlot, DEFAULT_WEEKS_AHEAD, NO_LESSON_DATES } from '@/lib/lesson-generation';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// 'YYYY-MM-DD' from a Date using its UTC parts.
function fmtUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
// Count weekly occurrences of `dayName` from `fromDate` to `monthEnd` (inclusive),
// excluding public holidays. Mirrors the bot's countRemainingLessons.
function countRemainingLessons(dayName: string, fromDate: Date, monthEnd: Date): number {
  const target = DAY_NAMES.indexOf(dayName);
  if (target === -1) return 0;
  const d = new Date(fromDate);
  let count = 0;
  while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1);
  while (d <= monthEnd) {
    if (!NO_LESSON_DATES.includes(fmtUTC(d))) count++;
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return count;
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { lessonId?: string; studentId?: string; oldSlotId?: string; newSlotId: string; switchDate: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { lessonId, newSlotId, switchDate } = body;
  if (!newSlotId || !switchDate || (!lessonId && (!body.studentId || !body.oldSlotId))) {
    return NextResponse.json({ error: 'newSlotId, switchDate and (lessonId OR studentId+oldSlotId) required' }, { status: 400 });
  }

  // ── Resolve student + old slot ──────────────────────────────────────────────
  // From the lesson (calendar flow), or directly from the body (profile-page flow).
  let studentId: string;
  let oldSlotId: string;
  if (lessonId) {
    const lesson = await airtableRequest('Lessons', `/${lessonId}`);
    studentId = lesson.fields['Student']?.[0];
    oldSlotId = lesson.fields['Slot']?.[0];
    if (!studentId || !oldSlotId) return NextResponse.json({ error: 'Lesson missing student or slot' }, { status: 400 });
  } else {
    studentId = body.studentId!;
    oldSlotId = body.oldSlotId!;
  }

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

  const results = { cancelled: 0, created: 0, enrollmentUpdated: false, adjustment: 0, adjustmentMonth: '', errors: [] as string[] };

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

  // ── B. Create new weekly lessons on new slot (9-week horizon) ───────────────
  // (was 28 days — too short, so switched students ran out of lessons before
  // the bot's weekly generator extended them. Now matches signup's 9 weeks.)
  try {
    const { created } = await generateRegularLessonsForSlot({
      studentId,
      slotId: newSlotId,
      startDate: switchDate,
      weeksAhead: DEFAULT_WEEKS_AHEAD,
      markFirstAsRescheduled: true,
      firstNote: `Switched from ${oldSlotName} to ${newSlotName} (first lesson after switch). w.e.f ${new Date(switchDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`,
    });
    results.created = created;
  } catch (err: any) {
    results.errors.push(`Create step: ${err.message}`);
  }

  // ── C+D. Proration + enrollment history ─────────────────────────────────────
  try {
    // Old (Active) enrollment for student on the old slot — source of rate + tenure.
    const enrollments = await airtableRequestAll('Enrollments',
      `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Slot&fields[]=Rate Per Lesson&fields[]=Rate Type`
    );
    const enrollment = enrollments.records.find((r: any) =>
      r.fields['Student']?.[0] === studentId && r.fields['Slot']?.[0] === oldSlotId
    );
    const ratePerLesson: number = enrollment?.fields['Rate Per Lesson'] ?? 0;
    const rateType: string = enrollment?.fields['Rate Type'] || '';

    // ── Proration: difference in remaining lessons this month × rate ──────────
    const switchDt = new Date(switchDate + 'T00:00:00Z');
    const monthEnd = new Date(Date.UTC(switchDt.getUTCFullYear(), switchDt.getUTCMonth() + 1, 0));
    const newRemaining = countRemainingLessons(newDayRaw, switchDt, monthEnd);
    const oldRemaining = countRemainingLessons(oldDayRaw, switchDt, monthEnd);
    const adjustment = Math.round((newRemaining - oldRemaining) * ratePerLesson * 100) / 100;
    const monthStr = switchDt.toLocaleDateString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    results.adjustment = adjustment;

    // ── Enrollment history: end old, create new ───────────────────────────────
    if (enrollment) {
      const dayBefore = new Date(switchDt);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      await airtableRequest('Enrollments', `/${enrollment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { Status: 'Ended', 'End Date': fmtUTC(dayBefore) } }),
      });
      await airtableRequest('Enrollments', '', {
        method: 'POST',
        body: JSON.stringify({ fields: {
          Student: [studentId], Slot: [newSlotId],
          'Start Date': switchDate, Status: 'Active',
          'Rate Per Lesson': ratePerLesson,
          ...(rateType ? { 'Rate Type': rateType } : {}),
        }}),
      });
      results.enrollmentUpdated = true;
    }

    // ── Adjustment invoice (only if non-zero) ─────────────────────────────────
    // typecast:true so the 'Adjustment' Invoice Type option is created on write.
    if (adjustment !== 0 && monthStr) {
      await airtableRequest('Invoices', '', {
        method: 'POST',
        body: JSON.stringify({
          typecast: true,
          fields: {
            Student: [studentId],
            Month: monthStr,
            'Invoice Type': 'Adjustment',
            'Adjustment Amount': adjustment,
            'Adjustment Notes': `Slot switch from ${oldSlotName} to ${newSlotName} effective ${switchDate}`,
            Status: 'Draft',
          },
        }),
      });
      results.adjustmentMonth = monthStr;
    }
  } catch (err: any) {
    results.errors.push(`Enrollment/proration step: ${err.message}`);
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
