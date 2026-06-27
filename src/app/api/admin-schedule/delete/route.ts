import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    lessonId: string;
    action: 'delete' | 'absent';
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { lessonId, action, reason } = body;

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
    const lessonType: string = lessonFields['Type'] ?? 'Regular';
    const existingNotes: string = lessonFields['Notes'] ?? '';

    // 2. Perform action
    if (action === 'delete') {
      // If this is a Rescheduled lesson, find its SOURCE lesson BEFORE deleting —
      // once the lesson is gone Airtable auto-clears the link from the source, so
      // searching afterwards finds nothing. Also: a linked-record field can't be
      // filtered by record id in a formula (ARRAYJOIN returns the linked record's
      // DISPLAY NAME, not recXXX — see CLAUDE.md), so fetch candidates and match
      // the record id in JS.
      let sourceToRestore: any = null;
      if (lessonType === 'Rescheduled') {
        try {
          const candidates = await airtableRequestAll(
            'Lessons',
            `?filterByFormula=${encodeURIComponent(`NOT({Rescheduled Lesson ID}='')`)}&fields[]=Status&fields[]=Date&fields[]=Rescheduled Lesson ID`
          );
          sourceToRestore = candidates.records.find(
            (r: any) => (r.fields['Rescheduled Lesson ID'] || []).includes(lessonId)
          ) || null;
        } catch (findErr) {
          console.error('[delete] Find source lesson error (non-fatal):', findErr);
        }
      }

      await airtableRequest('Lessons', `/${lessonId}`, { method: 'DELETE' });

      // Restore the source: 'Absent' for past lessons (it was absent and needed a
      // makeup), 'Scheduled' for future lessons (it was just being moved).
      if (sourceToRestore) {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const restoreStatus = (sourceToRestore.fields['Date'] ?? '') < today ? 'Absent' : 'Scheduled';
          await airtableRequest('Lessons', `/${sourceToRestore.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ fields: { Status: restoreStatus, 'Rescheduled Lesson ID': [] } }),
          });
        } catch (restoreErr) {
          console.error('[delete] Restore source lesson error (non-fatal):', restoreErr);
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

    return NextResponse.json({ success: true, action });
  } catch (err: any) {
    console.error('[delete] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
