import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { verifyAdminAuth, localToday, daysAgo, EDIT_WINDOW_DAYS } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

const VALID_HW_RETURNED = ['Yes', 'Partial', 'No'];

// POST /api/admin-schedule/lesson-prev-update
// Patches the Homework Returned field on a previous lesson.
// Enforces 14-day server-side edit window.
// Body: { lessonId: string; homeworkReturned: string }
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { lessonId: string; homeworkReturned: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { lessonId, homeworkReturned } = body;
  if (!lessonId) return NextResponse.json({ error: 'Missing lessonId' }, { status: 400 });
  if (!VALID_HW_RETURNED.includes(homeworkReturned)) {
    return NextResponse.json(
      { error: `homeworkReturned must be one of: ${VALID_HW_RETURNED.join(', ')}` },
      { status: 400 }
    );
  }

  // Verify 14-day edit window
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
    return NextResponse.json({ error: 'Cannot update homework for future lessons' }, { status: 403 });
  }
  if (lessonDate && lessonDate < cutoff) {
    return NextResponse.json(
      { error: `Cannot edit lessons older than ${EDIT_WINDOW_DAYS} days` },
      { status: 403 }
    );
  }

  try {
    const updated = await airtableRequest('Lessons', `/${lessonId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'Homework Returned': homeworkReturned } }),
    });
    return NextResponse.json({ id: updated.id, homeworkReturned: updated.fields['Homework Returned'] ?? homeworkReturned });
  } catch (err: any) {
    console.error('[lesson-prev-update] patch failed:', err);
    return NextResponse.json({ error: err.message || 'Airtable error' }, { status: 500 });
  }
}
