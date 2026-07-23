// Admin reschedules are silent. Students are notified via the bot's
// day-before reminder cron. For same-day or next-day reschedules (<24hr
// notice), message the student manually — the cron will not catch them in time.

import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import {
  verifyAdminAuth,
  countLessonsInSlot,
  findStudentSlotConflict,
} from '@/lib/schedule-helpers';
import { billingMonthOf } from '@/lib/lesson-generation';
import { fetchBlockedRecord, findBlock } from '@/lib/blocked-dates';

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
    // Admin override: book into a full slot anyway (client confirms first).
    force?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { lessonId, newDate, newSlotId, notes, force } = body;

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

    // No-op guard: rescheduling onto the lesson's own slot + date would just create
    // a pointless duplicate pair (original marked Rescheduled + identical new lesson).
    if (origSlotId === newSlotId && origDate === newDate) {
      return NextResponse.json(
        { error: 'Same slot and date as the original lesson — nothing to change' },
        { status: 400 }
      );
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

    // 3. Capacity + away-date checks (both skipped when the admin forces an override)
    const { ranges: blockedRanges } = await fetchBlockedRecord();
    const targetBlock = findBlock(blockedRanges, newDate);
    if (!force && targetBlock) {
      return NextResponse.json(
        { error: 'Adrian is away on that date', blocked: true, reason: targetBlock.reason || 'away' },
        { status: 409 }
      );
    }
    const currentCount = await countLessonsInSlot(newSlotId, newDate);
    if (!force && currentCount >= makeupCapacity) {
      return NextResponse.json(
        { error: 'Slot full', currentCount, capacity: makeupCapacity },
        { status: 409 }
      );
    }

    // Double-booking guard — the same student twice in one (date, slot) is
    // physically impossible, so this is a HARD stop that even `force` cannot
    // bypass (force covers capacity/away overrides, not data errors). This is
    // exactly how Adele ended up with two lessons in Sun 26 Jul 9-11am.
    const conflict = await findStudentSlotConflict(origStudentId, newDate, newSlotId);
    if (conflict) {
      return NextResponse.json(
        {
          error: 'This student already has a lesson in that slot on that date — a student can only attend a slot once',
          doubleBooked: true,
          conflictLessonId: conflict.id,
          conflictLessonType: conflict.type,
        },
        { status: 409 }
      );
    }

    // Format original date for the note e.g. "Mon, 4 May 2026"
    const origDateFormatted = origDate
      ? new Date(origDate + 'T00:00:00Z').toLocaleDateString('en-SG', {
          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
        })
      : origDate;

    // 4. Create new lesson. A replacement for an Absent lesson is a makeup —
    // recorded via the 'Is Makeup' checkbox (Type stays 'Rescheduled'). The write
    // is retried without the field if the checkbox doesn't exist in Airtable yet.
    const isMakeup = origFields['Status'] === 'Absent';
    // Auto-note: when the ORIGINAL lesson sits in one of Adrian's away periods,
    // record why it moved — no manual note needed per student.
    const origBlock = findBlock(blockedRanges, origDate);
    let noteText = notes || (origDateFormatted ? `${isMakeup ? 'Makeup for' : 'Rescheduled from'} ${origDateFormatted}` : '');
    if (origBlock) {
      const away = `Adrian away${origBlock.reason ? `: ${origBlock.reason}` : ''}`;
      noteText = noteText ? `${noteText} — ${away}` : away;
    }
    const newFields: Record<string, any> = {
      Student: [origStudentId],
      Slot: [newSlotId],
      Date: newDate,
      Type: 'Rescheduled',
      Status: 'Scheduled',
      Notes: noteText,
      // Carry over the original lesson's billing month so a moved lesson stays
      // owned by the month it was originally scheduled/billed in.
      'Billing Month': origFields['Billing Month'] || billingMonthOf(origDate),
      'Is Makeup': isMakeup,
      // Actor attribution — the bot writes 'Bot (parent)'/'Bot (student)'/
      // 'Bot (admin)' here, so every reschedule records WHO made it.
      'Booked Via': 'Web admin',
    };
    let newLesson;
    // typecast lets new 'Booked Via' select options auto-create; optional
    // fields are dropped one at a time if Airtable doesn't have them yet.
    const createLesson = () => airtableRequest('Lessons', '', { method: 'POST', body: JSON.stringify({ fields: newFields, typecast: true }) });
    try {
      newLesson = await createLesson();
    } catch (e: any) {
      if (!/UNKNOWN_FIELD_NAME|Is Makeup|Booked Via/i.test(e?.message || '')) throw e;
      delete newFields['Booked Via'];
      try {
        newLesson = await createLesson();
      } catch (e2: any) {
        if (!/UNKNOWN_FIELD_NAME|Is Makeup/i.test(e2?.message || '')) throw e2;
        delete newFields['Is Makeup'];
        newLesson = await createLesson();
      }
    }
    const newLessonId: string = newLesson.id;

    // 5. Patch original lesson — only update Status and link, leave Notes untouched
    await airtableRequest('Lessons', `/${lessonId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          Status: 'Rescheduled',
          'Rescheduled Lesson ID': [newLessonId],
        },
      }),
    });

    return NextResponse.json({ success: true, newLessonId });
  } catch (err: any) {
    console.error('[reschedule] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
