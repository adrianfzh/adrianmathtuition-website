import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import {
  verifyAdminAuth,
  countLessonsInSlot,
} from '@/lib/schedule-helpers';
import { billingMonthOf } from '@/lib/lesson-generation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    type: 'Additional' | 'Makeup' | 'Trial' | 'Revision Makeup';
    date: string;
    slotId: string;
    studentId?: string;
    trialStudentName?: string;
    notes?: string;
    linkedLessonId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, date, slotId, studentId, trialStudentName, notes, linkedLessonId } = body;

  if (!type || !date || !slotId) {
    return NextResponse.json({ error: 'type, date, and slotId are required' }, { status: 400 });
  }
  if ((type === 'Additional' || type === 'Makeup' || type === 'Revision Makeup') && !studentId) {
    return NextResponse.json({ error: 'studentId is required for Additional, Makeup and Revision Makeup' }, { status: 400 });
  }
  if (type === 'Trial' && !trialStudentName) {
    return NextResponse.json({ error: 'trialStudentName is required for Trial' }, { status: 400 });
  }

  try {
    // 1. Fetch target slot + capacity check.
    // Revision makeups skip the capacity check (mirrors the dedicated
    // Attendance-tab / Revision-Sprint-chip reschedule flow, which has none).
    const slotRec = await airtableRequest('Slots', `/${slotId}`);
    const slotFields = slotRec.fields;
    if (type !== 'Revision Makeup') {
      const makeupCapacity: number | null = slotFields['Makeup Capacity'] ?? null;

      if (makeupCapacity == null) {
        return NextResponse.json(
          { error: 'Target slot has no Makeup Capacity set' },
          { status: 400 }
        );
      }

      const currentCount = await countLessonsInSlot(slotId, date);
      if (currentCount >= makeupCapacity) {
        return NextResponse.json(
          { error: 'Slot full', currentCount, capacity: makeupCapacity },
          { status: 409 }
        );
      }
    }

    // 2. Build lesson fields by type
    let lessonFields: Record<string, any>;
    if (type === 'Trial') {
      lessonFields = {
        Slot: [slotId],
        Date: date,
        Type: 'Trial',
        Status: 'Scheduled',
        Notes: `Trial student: ${trialStudentName}${notes ? ' | ' + notes : ''}`,
      };
    } else if (type === 'Revision Makeup') {
      // Makeup for an already-paid June Revision Sprint lesson: real
      // Type='Revision Makeup' + Is Revision Makeup flag → shows the teal
      // 🏖 badge on the schedule and is EXCLUDED from billing (no Billing Month).
      lessonFields = {
        Student: [studentId!],
        Slot: [slotId],
        Date: date,
        Type: 'Revision Makeup',
        Status: 'Scheduled',
        Notes: notes && notes.trim() ? notes : 'Revision makeup',
        'Is Revision Makeup': true,
      };
    } else {
      lessonFields = {
        Student: [studentId!],
        Slot: [slotId],
        Date: date,
        Type: type,
        Status: 'Scheduled',
        Notes: notes || '',
        // Additional/Makeup belong to their own month; revision makeups stay blank
        // (already-paid, excluded from billing).
        ...(/revision makeup/i.test(notes || '') ? {} : { 'Billing Month': billingMonthOf(date) }),
      };
    }

    // 3. Create lesson
    const newLesson = await airtableRequest('Lessons', '', {
      method: 'POST',
      body: JSON.stringify({ fields: lessonFields }),
    });
    const lessonId: string = newLesson.id;

    // 4. For Makeup with linkedLessonId, back-link the absent lesson
    if (type === 'Makeup' && linkedLessonId) {
      try {
        await airtableRequest('Lessons', `/${linkedLessonId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fields: { 'Rescheduled Lesson ID': [lessonId] },
          }),
        });
      } catch (linkErr) {
        console.error('[add] Failed to back-link makeup lesson (non-fatal):', linkErr);
      }
    }

    return NextResponse.json({ success: true, lessonId });
  } catch (err: any) {
    console.error('[add] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
