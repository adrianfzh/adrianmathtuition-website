import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

const EDIT_WINDOW_DAYS = 14;

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  };

  const patchFields: Record<string, any> = {};
  for (const [key, airtableField] of Object.entries(FIELD_MAP)) {
    if (key in fields) patchFields[airtableField] = fields[key];
  }

  if (Object.keys(patchFields).length === 0) {
    return NextResponse.json({ error: 'No recognised fields to update' }, { status: 400 });
  }

  // Mark Progress Logged = true when any meaningful content field is non-empty
  const hasContent = Object.values(patchFields).some(v => typeof v === 'string' && v.trim() !== '');
  if (hasContent) {
    patchFields['Progress Logged'] = true;
  }

  try {
    const updated = await airtableRequest('Lessons', `/${lessonId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: patchFields }),
    });
    return NextResponse.json({ id: updated.id, progressLogged: updated.fields['Progress Logged'] ?? false });
  } catch (err: any) {
    console.error('[lesson-update] patch failed:', err);
    return NextResponse.json({ error: err.message || 'Airtable error' }, { status: 500 });
  }
}
