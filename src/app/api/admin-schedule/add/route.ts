import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import {
  verifyAdminAuth,
  countLessonsInSlot,
} from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    type: 'Additional' | 'Makeup' | 'Trial';
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
  if ((type === 'Additional' || type === 'Makeup') && !studentId) {
    return NextResponse.json({ error: 'studentId is required for Additional and Makeup' }, { status: 400 });
  }
  if (type === 'Trial' && !trialStudentName) {
    return NextResponse.json({ error: 'trialStudentName is required for Trial' }, { status: 400 });
  }

  try {
    // 1. Fetch target slot + capacity check
    const slotRec = await airtableRequest('Slots', `/${slotId}`);
    const slotFields = slotRec.fields;
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
    } else {
      lessonFields = {
        Student: [studentId!],
        Slot: [slotId],
        Date: date,
        Type: type,
        Status: 'Scheduled',
        Notes: notes || '',
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
