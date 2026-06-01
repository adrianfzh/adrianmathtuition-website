// POST /api/admin-schedule/add-weekly-slot
// Adds a recurring weekly slot for a student (e.g. a second weekly lesson):
//   1. Create an Active Enrollment (rate copied from an existing enrollment
//      unless explicitly provided).
//   2. Generate Regular lessons 9 weeks ahead (the bot's weekly cron extends
//      them after that). Mirrors what signup does for a new student.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';
import { generateRegularLessonsForSlot, DEFAULT_WEEKS_AHEAD } from '@/lib/lesson-generation';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { studentId: string; slotId: string; startDate?: string; ratePerLesson?: number; rateType?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { studentId, slotId } = body;
  const startDate = body.startDate || localToday();
  if (!studentId || !slotId) {
    return NextResponse.json({ error: 'studentId and slotId are required' }, { status: 400 });
  }

  try {
    // Existing active enrollments for this student (for dedup + rate fallback)
    const enrollData = await airtableRequestAll(
      'Enrollments',
      `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Slot&fields[]=Rate Per Lesson&fields[]=Rate Type`
    );
    const studentEnrollments = enrollData.records.filter((r: any) => r.fields['Student']?.[0] === studentId);

    // Duplicate guard — don't create a second enrollment in the same slot
    if (studentEnrollments.some((r: any) => r.fields['Slot']?.[0] === slotId)) {
      return NextResponse.json({ error: 'Student already has an active enrollment in this slot' }, { status: 409 });
    }

    // Rate: use provided values, else copy from an existing enrollment
    let ratePerLesson = body.ratePerLesson;
    let rateType = body.rateType;
    if (ratePerLesson == null) {
      const src = studentEnrollments.find((r: any) => (r.fields['Rate Per Lesson'] ?? 0) > 0);
      ratePerLesson = src?.fields['Rate Per Lesson'] ?? undefined;
      rateType = rateType ?? src?.fields['Rate Type'];
    }

    // 1. Create the enrollment
    const enrollment = await airtableRequest('Enrollments', '', {
      method: 'POST',
      body: JSON.stringify({ fields: {
        Student: [studentId],
        Slot: [slotId],
        Status: 'Active',
        'Start Date': startDate,
        ...(ratePerLesson != null ? { 'Rate Per Lesson': ratePerLesson } : {}),
        ...(rateType ? { 'Rate Type': rateType } : {}),
      }}),
    });

    // 2. Generate the recurring lessons
    const { created, dates } = await generateRegularLessonsForSlot({
      studentId, slotId, startDate, weeksAhead: DEFAULT_WEEKS_AHEAD,
    });

    return NextResponse.json({ success: true, enrollmentId: enrollment.id, lessonsCreated: created, dates });
  } catch (err: any) {
    console.error('[add-weekly-slot] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
