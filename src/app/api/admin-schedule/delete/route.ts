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
      await airtableRequest('Lessons', `/${lessonId}`, { method: 'DELETE' });

      // If this lesson is a Rescheduled type, unlink the source lesson and
      // restore its status: 'Absent' for past lessons (it was absent and needed
      // a makeup), 'Scheduled' for future lessons (it was just being moved).
      if (lessonType === 'Rescheduled') {
        try {
          const formula = encodeURIComponent(
            `FIND('${lessonId}', ARRAYJOIN({Rescheduled Lesson ID})) > 0`
          );
          const sources = await airtableRequestAll(
            'Lessons',
            `?filterByFormula=${formula}&fields[]=Status&fields[]=Date&fields[]=Rescheduled+Lesson+ID`
          );
          const today = new Date().toISOString().slice(0, 10);
          await Promise.all(
            sources.records.map((r: any) => {
              const restoreStatus = (r.fields['Date'] ?? '') < today ? 'Absent' : 'Scheduled';
              return airtableRequest('Lessons', `/${r.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  fields: {
                    Status: restoreStatus,
                    'Rescheduled Lesson ID': [],
                  },
                }),
              });
            })
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

    return NextResponse.json({ success: true, action });
  } catch (err: any) {
    console.error('[delete] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
