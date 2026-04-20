import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import {
  verifyAdminAuth,
  formatDateSlotLabel,
  notifyLessonChange,
} from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    lessonId: string;
    action: 'delete' | 'absent';
    notify?: boolean;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { lessonId, action, notify = false, reason } = body;

  if (!lessonId || !action) {
    return NextResponse.json({ error: 'lessonId and action are required' }, { status: 400 });
  }
  if (action !== 'delete' && action !== 'absent') {
    return NextResponse.json({ error: 'action must be "delete" or "absent"' }, { status: 400 });
  }

  try {
    // 1. Fetch lesson for context
    const lessonRec = await airtableRequest('Lessons', `/${lessonId}`);
    const lessonFields = lessonRec.fields;
    const studentId: string | undefined = lessonFields['Student']?.[0];
    const slotId: string | undefined = lessonFields['Slot']?.[0];
    const lessonDate: string = lessonFields['Date'] ?? '';
    const lessonType: string = lessonFields['Type'] ?? 'Regular';
    const existingNotes: string = lessonFields['Notes'] ?? '';

    // 2. Perform action
    if (action === 'delete') {
      await airtableRequest('Lessons', `/${lessonId}`, { method: 'DELETE' });

      // If this lesson is a Rescheduled type, unlink the source lesson
      if (lessonType === 'Rescheduled') {
        try {
          const formula = encodeURIComponent(
            `FIND('${lessonId}', ARRAYJOIN({Rescheduled Lesson ID})) > 0`
          );
          const sources = await airtableRequestAll(
            'Lessons',
            `?filterByFormula=${formula}&fields[]=Status&fields[]=Rescheduled+Lesson+ID`
          );
          await Promise.all(
            sources.records.map((r: any) =>
              airtableRequest('Lessons', `/${r.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  fields: {
                    Status: 'Scheduled',
                    'Rescheduled Lesson ID': [],
                  },
                }),
              })
            )
          );
        } catch (unlinkErr) {
          console.error('[delete] Unlink source lesson error (non-fatal):', unlinkErr);
        }
      }
    } else {
      // absent
      const updatedNotes = reason
        ? existingNotes ? `${existingNotes} | ${reason}` : reason
        : existingNotes;
      await airtableRequest('Lessons', `/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            Status: 'Absent',
            Notes: updatedNotes,
          },
        }),
      });
    }

    // 3. Notify
    let notificationsSent = { student: false, parent: false };
    if (notify && studentId) {
      try {
        // Fetch slot for label
        let slotFields: Record<string, any> = {};
        if (slotId) {
          const slotRec = await airtableRequest('Slots', `/${slotId}?fields[]=Time&fields[]=Day`);
          slotFields = slotRec.fields;
        }
        const label = formatDateSlotLabel(lessonDate, slotFields);

        // Fetch student name
        const studentRec = await airtableRequest(
          'Students',
          `/${studentId}?fields[]=Student+Name`
        );
        const studentName: string = studentRec.fields['Student Name'] ?? 'Student';

        let message: string;
        if (action === 'delete') {
          message = `Hi ${studentName}, your ${lessonType.toLowerCase()} lesson on ${label} has been cancelled.`;
        } else {
          message =
            `Hi ${studentName}, your ${lessonType.toLowerCase()} lesson on ${label} has been marked as absent. ` +
            `You can /makeup in the bot.`;
        }

        notificationsSent = await notifyLessonChange(studentId, message);
      } catch (notifyErr) {
        console.error('[delete] Notification error (non-fatal):', notifyErr);
      }
    }

    return NextResponse.json({ success: true, action, notificationsSent });
  } catch (err: any) {
    console.error('[delete] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
