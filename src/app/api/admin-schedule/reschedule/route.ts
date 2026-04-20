// Admin reschedules are silent. Students are notified via the bot's
// day-before reminder cron. For same-day or next-day reschedules (<24hr
// notice), message the student manually — the cron will not catch them in time.

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
    lessonId: string;
    newDate: string;
    newSlotId: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { lessonId, newDate, newSlotId, notes } = body;

  if (!lessonId || !newDate || !newSlotId) {
    return NextResponse.json(
      { error: 'lessonId, newDate, and newSlotId are required' },
      { status: 400 }
    );
  }

  try {
    // 1. Fetch original lesson
    const origLesson = await airtableRequest('Lessons', `/${lessonId}`);
    const origFields = origLesson.fields;
    const origStudentId: string = origFields['Student']?.[0];
    const origSlotId: string = origFields['Slot']?.[0];
    const origDate: string = origFields['Date'] ?? '';

    if (!origStudentId) {
      return NextResponse.json({ error: 'Original lesson has no student' }, { status: 400 });
    }

    // 2. Fetch target slot
    const targetSlot = await airtableRequest('Slots', `/${newSlotId}`);
    const targetFields = targetSlot.fields;
    const makeupCapacity: number | null = targetFields['Makeup Capacity'] ?? null;

    if (makeupCapacity == null) {
      return NextResponse.json(
        { error: 'Target slot has no Makeup Capacity set' },
        { status: 400 }
      );
    }

    // 3. Capacity check
    const currentCount = await countLessonsInSlot(newSlotId, newDate);
    if (currentCount >= makeupCapacity) {
      return NextResponse.json(
        { error: 'Slot full', currentCount, capacity: makeupCapacity },
        { status: 409 }
      );
    }

    // 4. Create new lesson
    const newLesson = await airtableRequest('Lessons', '', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Student: [origStudentId],
          Slot: [newSlotId],
          Date: newDate,
          Type: 'Rescheduled',
          Status: 'Scheduled',
          Notes: notes || 'Rescheduled by admin',
        },
      }),
    });
    const newLessonId: string = newLesson.id;

    // 5. Patch original lesson
    const existingNotes: string = origFields['Notes'] ?? '';
    await airtableRequest('Lessons', `/${lessonId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          Status: 'Rescheduled',
          'Rescheduled Lesson ID': [newLessonId],
          Notes: existingNotes ? `${existingNotes} | auto-linked` : 'auto-linked',
        },
      }),
    });

    return NextResponse.json({ success: true, newLessonId });
  } catch (err: any) {
    console.error('[reschedule] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
