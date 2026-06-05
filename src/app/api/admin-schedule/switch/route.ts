// POST /api/admin-schedule/switch
// Permanently switches a student to a new slot starting from switchDate:
//   A. Delete all future Scheduled lessons on old slot (from switchDate onward)
//   B. Create new weekly lessons on new slot for 28 days
//   C. Update Enrollment.Slot to new slot
// Mirrors the bot's /switch → sw_confirm flow exactly.

import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { generateRegularLessonsForSlot, DEFAULT_WEEKS_AHEAD } from '@/lib/lesson-generation';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

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
      firstNote: `Switched from ${oldSlotName} to ${newSlotName} (first lesson after switch)`,
    });
    results.created = created;
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
