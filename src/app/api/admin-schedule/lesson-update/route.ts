import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { verifyAdminAuth, localToday, daysAgo, EDIT_WINDOW_DAYS } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// POST /api/admin-schedule/lesson-update
// Body: { lessonId, fields: { topicsCovered?, mastery?, mood?, homeworkAssigned?, lessonNotes? } }
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { lessonId: string; fields: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { lessonId, fields } = body;
  if (!lessonId) return NextResponse.json({ error: 'Missing lessonId' }, { status: 400 });
  if (!fields || typeof fields !== 'object') return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  // Fetch lesson to verify date (auth + edit window)
  let lessonDate: string;
  try {
    // NOTE: Single-record GET endpoint does NOT support fields[] — fetch all fields
    const lesson = await airtableRequest('Lessons', `/${lessonId}`);
    lessonDate = lesson.fields['Date'] ?? '';
  } catch {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
  }

  const today = localToday();
  const cutoff = daysAgo(EDIT_WINDOW_DAYS);

  if (lessonDate && lessonDate > today) {
    return NextResponse.json({ error: 'Cannot log progress for future lessons' }, { status: 403 });
  }
  if (lessonDate && lessonDate < cutoff) {
    return NextResponse.json(
      { error: `Cannot edit lessons older than ${EDIT_WINDOW_DAYS} days` },
      { status: 403 }
    );
  }

  // Map camelCase keys → Airtable field names
  const FIELD_MAP: Record<string, string> = {
    topicsCovered:     'Topics Covered',
    mastery:           'Mastery',
    mood:              'Mood',
    homeworkAssigned:  'Homework Assigned',
    lessonNotes:       'Lesson Notes',
    nextLessonPlan:    'Next Lesson Plan',
  };

  const patchFields: Record<string, any> = {};
  for (const [key, airtableField] of Object.entries(FIELD_MAP)) {
    if (key in fields) patchFields[airtableField] = fields[key];
  }

  if (Object.keys(patchFields).length === 0) {
    return NextResponse.json({ error: 'No recognised fields to update' }, { status: 400 });
  }

  // Mark Progress Logged = true when any meaningful content field is non-empty.
  // 'Next Lesson Plan' is deliberately excluded — it describes the NEXT lesson,
  // so a plan on its own doesn't mean this lesson was written up.
  const hasContent = Object.entries(patchFields).some(
    ([f, v]) => f !== 'Next Lesson Plan' && typeof v === 'string' && v.trim() !== ''
  );
  if (hasContent) {
    patchFields['Progress Logged'] = true;
  }

  try {
    const updated = await patchWithUnknownFieldFallback(lessonId, patchFields);
    return NextResponse.json({
      id: updated.id,
      progressLogged: updated.fields['Progress Logged'] ?? false,
      ...(updated.droppedFields.length ? { droppedFields: updated.droppedFields } : {}),
    });
  } catch (err: any) {
    console.error('[lesson-update] patch failed:', err);
    return NextResponse.json({ error: err.message || 'Airtable error' }, { status: 500 });
  }
}

/**
 * Airtable rejects the ENTIRE patch with 422 UNKNOWN_FIELD_NAME if one field
 * doesn't exist in the base — so a field that hasn't been created yet would
 * take the whole progress log down with it. Strip the named field and retry
 * once, reporting what was dropped rather than silently losing the lesson write.
 */
async function patchWithUnknownFieldFallback(
  lessonId: string,
  patchFields: Record<string, any>
): Promise<{ id: string; fields: Record<string, any>; droppedFields: string[] }> {
  const send = (f: Record<string, any>) =>
    airtableRequest('Lessons', `/${lessonId}`, { method: 'PATCH', body: JSON.stringify({ fields: f }) });

  try {
    const r = await send(patchFields);
    return { ...r, droppedFields: [] };
  } catch (err: any) {
    const msg = String(err?.message ?? '');
    if (!msg.includes('UNKNOWN_FIELD_NAME')) throw err;
    // airtableRequest wraps the RAW response body, so the quotes around the
    // field name arrive backslash-escaped:
    //   ...{"message":"Unknown field name: \"Next Lesson Plan\""}...
    // Match with or without the escape — a regex expecting a bare `"` silently
    // never fires and the fallback looks like it isn't there at all.
    const named = msg.match(/Unknown field name:\s*\\?"([^"\\]+)/)?.[1];
    if (!named || !(named in patchFields)) throw err; // can't tell what to drop
    const retry = { ...patchFields };
    delete retry[named];
    if (!Object.keys(retry).length) throw err;
    console.warn(`[lesson-update] dropped unknown Airtable field "${named}" and retried`);
    return { ...(await send(retry)), droppedFields: [named] };
  }
}
