// POST /api/admin-schedule/switch
// Permanently switches a student to a new slot starting from switchDate:
//   A. Delete all future Scheduled lessons on old slot (from switchDate onward)
//   B. Create new weekly lessons on new slot (9-week horizon)
//   C. Proration: reconcile the switch month's ACTUAL lessons against what the
//      issued invoice billed (lib/switch-proration.ts), as a Draft 'Adjustment'
//      invoice. A credit on an already-PAID month defers to the next month so it
//      actually reduces a future payment.
//   D. Enrollment history: END the old enrollment (Status 'Ended', End Date =
//      day before switch) and CREATE a new Active enrollment on the new slot,
//      carrying over Rate Per Lesson + Rate Type.
// Mirrors the bot's /switch → sw_confirm flow exactly.

import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { generateRegularLessonsForSlot, DEFAULT_WEEKS_AHEAD } from '@/lib/lesson-generation';
import { computeSwitchProration } from '@/lib/switch-proration';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// 'YYYY-MM-DD' from a Date using its UTC parts.
function fmtUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
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

  const results = {
    cancelled: 0, created: 0, enrollmentUpdated: false,
    adjustment: 0, adjustmentMonth: '',
    billedLessonCount: 0, correctLessonCount: 0, invoiceWasPaid: false,
    errors: [] as string[],
  };

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
      noteFirstLesson: true,
      // w.e.f = the date the switch is registered (today, SGT), not the first-lesson date.
      firstNote: `Switched from ${oldSlotName} to ${newSlotName} (first lesson after switch). w.e.f ${new Date(Date.now() + 8 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`,
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

    // ── Proration: reconcile the switch month's ACTUAL lessons against what the
    // issued invoice billed (see lib/switch-proration.ts for why forward-only
    // weekday counting was wrong). This runs after steps A+B, so the lesson
    // records already reflect the switch. ──────────────────────────────────────
    const switchDt = new Date(switchDate + 'T00:00:00Z');
    const monthStr = switchDt.toLocaleDateString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const ym = `${switchDt.getUTCFullYear()}-${String(switchDt.getUTCMonth() + 1).padStart(2, '0')}`;

    // The issued switch-month invoice (non-voided, Regular). Base Amount ÷ rate
    // = lessons it charged for. None → nothing to reconcile (future invoice
    // bills the new enrollment correctly), adjustment stays 0.
    const monthInvoices = await airtableRequestAll('Invoices',
      `?filterByFormula=${encodeURIComponent(`AND({Month}='${monthStr}',{Status}!='Voided')`)}&fields[]=Student&fields[]=Base Amount&fields[]=Invoice Type&fields[]=Status&fields[]=Is Paid`
    );
    const issued = monthInvoices.records.find((r: any) =>
      r.fields['Student']?.[0] === studentId &&
      (r.fields['Invoice Type'] == null || r.fields['Invoice Type'] === 'Regular')
    );
    const invoiceBaseAmount: number | null = issued ? (issued.fields['Base Amount'] ?? null) : null;
    const invoiceWasPaid: boolean = !!issued?.fields['Is Paid'];

    // Actual Regular, non-cancelled lessons for this student in the switch month.
    const monthLessons = await airtableRequestAll('Lessons',
      `?filterByFormula=${encodeURIComponent(`AND({Date}>='${ym}-01',{Date}<'${ym}-32',{Type}='Regular',{Status}!='Cancelled',{Status}!='Cancelled - Prorated')`)}&fields[]=Student`
    );
    const correctLessonCount = monthLessons.records.filter((r: any) => r.fields['Student']?.[0] === studentId).length;

    const proration = computeSwitchProration(correctLessonCount, invoiceBaseAmount, ratePerLesson);
    const adjustment = proration.adjustment;
    results.adjustment = adjustment;
    results.billedLessonCount = proration.billedLessonCount;
    results.correctLessonCount = correctLessonCount;
    results.invoiceWasPaid = invoiceWasPaid;

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
    // A credit on an ALREADY-PAID switch month can't reduce that (settled)
    // invoice, so attribute it to the NEXT month where it actually lowers a
    // payment. An extra charge, or any adjustment on an unpaid month, stays on
    // the switch month. typecast:true creates the 'Adjustment' option on write.
    if (adjustment !== 0 && monthStr) {
      const deferCredit = invoiceWasPaid && adjustment < 0;
      const nextMonthDt = new Date(Date.UTC(switchDt.getUTCFullYear(), switchDt.getUTCMonth() + 1, 1));
      const targetMonth = deferCredit
        ? nextMonthDt.toLocaleDateString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        : monthStr;
      const countNote = `${correctLessonCount} lesson${correctLessonCount === 1 ? '' : 's'} after switch vs ${proration.billedLessonCount} billed`;
      const note = `Slot switch from ${oldSlotName} to ${newSlotName} effective ${switchDate} — ${countNote}.`
        + (deferCredit ? ` Credit carried to ${targetMonth} (${monthStr} invoice already paid).` : '');
      await airtableRequest('Invoices', '', {
        method: 'POST',
        body: JSON.stringify({
          typecast: true,
          fields: {
            Student: [studentId],
            Month: targetMonth,
            'Invoice Type': 'Adjustment',
            'Adjustment Amount': adjustment,
            'Adjustment Notes': note,
            Status: 'Draft',
          },
        }),
      });
      results.adjustmentMonth = targetMonth;
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
