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
    type: 'Additional' | 'Makeup' | 'Trial' | 'Revision Makeup' | 'Ad-hoc';
    date: string;
    slotId: string;
    studentId?: string;
    trialStudentName?: string;
    notes?: string;
    linkedLessonId?: string;
    chargeOverride?: number;
    // Admin override: book on an away/blocked date anyway (client confirms first).
    force?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, date, slotId, studentId, trialStudentName, notes, linkedLessonId, chargeOverride, force } = body;

  if (!type || !date || !slotId) {
    return NextResponse.json({ error: 'type, date, and slotId are required' }, { status: 400 });
  }
  if ((type === 'Additional' || type === 'Makeup' || type === 'Revision Makeup' || type === 'Ad-hoc') && !studentId) {
    return NextResponse.json({ error: 'studentId is required for this lesson type' }, { status: 400 });
  }
  if (type === 'Trial' && !trialStudentName) {
    return NextResponse.json({ error: 'trialStudentName is required for Trial' }, { status: 400 });
  }
  if (type === 'Ad-hoc' && !(Number(chargeOverride) > 0)) {
    return NextResponse.json({ error: 'chargeOverride (> 0) is required for Ad-hoc lessons' }, { status: 400 });
  }

  try {
    // 0. Away-date gate — no new lessons during Adrian's blocked periods
    // unless the admin explicitly overrides.
    if (!force) {
      const { ranges } = await fetchBlockedRecord();
      const block = findBlock(ranges, date);
      if (block) {
        return NextResponse.json(
          { error: 'Adrian is away on that date', blocked: true, reason: block.reason || 'away' },
          { status: 409 }
        );
      }
    }

    // 1. Fetch target slot + capacity check.
    // Revision makeups skip the capacity check (mirrors the dedicated
    // Attendance-tab / Revision-Sprint-chip reschedule flow, which has none).
    const slotRec = await airtableRequest('Slots', `/${slotId}`);
    const slotFields = slotRec.fields;
    // Ad-hoc = a deliberately-scheduled one-off billable session; skip the makeup
    // capacity check (like Revision Makeup) so it's never blocked by a full slot.
    if (type !== 'Revision Makeup' && type !== 'Ad-hoc') {
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

    // Double-booking guard (all typed lessons with a student — Trial has none):
    // the same student twice in one (date, slot) is physically impossible.
    // HARD stop, not bypassed by `force` (that's for away-date overrides).
    if (studentId) {
      const conflict = await findStudentSlotConflict(studentId, date, slotId);
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
    } else if (type === 'Ad-hoc') {
      // One-off billable session for an unenrolled student. Charge is stored
      // per-lesson (Charge Override). NO Billing Month at creation — billed on
      // demand via /api/admin/bill-adhoc, which sets Billing Month + Source Invoice.
      lessonFields = {
        Student: [studentId!],
        Slot: [slotId],
        Date: date,
        Type: 'Ad-hoc',
        Status: 'Scheduled',
        'Charge Override': Number(chargeOverride),
        Notes: notes || '',
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

    // 3. Create lesson — always typecast (creates the 'Ad-hoc' Type option and
    // 'Booked Via' select options on first write). 'Booked Via' is the actor
    // attribution shared with the bot; dropped if the field doesn't exist yet.
    lessonFields['Booked Via'] = 'Web admin';
    let newLesson;
    try {
      newLesson = await airtableRequest('Lessons', '', {
        method: 'POST',
        body: JSON.stringify({ fields: lessonFields, typecast: true }),
      });
    } catch (e: any) {
      if (!/UNKNOWN_FIELD_NAME|Booked Via/i.test(e?.message || '')) throw e;
      delete lessonFields['Booked Via'];
      newLesson = await airtableRequest('Lessons', '', {
        method: 'POST',
        body: JSON.stringify({ fields: lessonFields, typecast: true }),
      });
    }
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
