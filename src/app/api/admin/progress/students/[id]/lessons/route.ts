import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// GET /api/admin/progress/students/[id]/lessons
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const filter = encodeURIComponent(`{Student}='${id}'`);
  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${filter}&sort[0][field]=Date&sort[0][direction]=desc`
  );

  const lessons = data.records.map((r: any) => ({
    id: r.id,
    date: r.fields['Date'] ?? '',
    status: r.fields['Status'] ?? '',
    type: r.fields['Type'] ?? '',
    topicsCovered: r.fields['Topics Covered'] ?? '',
    homeworkAssigned: r.fields['Homework Assigned'] ?? '',
    homeworkCompletion: r.fields['Homework Completion'] ?? 'Not Set',
    masteryRatings: r.fields['Mastery Ratings'] ?? '',
    mood: r.fields['Mood'] ?? '',
    lessonNotes: r.fields['Lesson Notes'] ?? '',
    progressLogged: r.fields['Progress Logged'] ?? false,
  }));

  return NextResponse.json({ lessons });
}
