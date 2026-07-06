import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// GET /api/admin/progress/students/[id]/previous-lesson?before=YYYY-MM-DD
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const before = searchParams.get('before') || new Date().toISOString().split('T')[0];

  const filter = encodeURIComponent(
    `AND(FIND('${id}', ARRAYJOIN({Student}))>0, {Date}<'${before}', {Status}='Completed')`
  );
  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${filter}&sort[0][field]=Date&sort[0][direction]=desc&pageSize=1`
  );

  if (!data.records.length) return NextResponse.json({ lesson: null });

  const r = data.records[0];
  return NextResponse.json({
    lesson: {
      id: r.id,
      date: r.fields['Date'] ?? '',
      homeworkAssigned: r.fields['Homework Assigned'] ?? '',
      homeworkCompletion: r.fields['Homework Completion'] ?? 'Not Set',
      topicsCovered: r.fields['Topics Covered'] ?? '',
      masteryRatings: r.fields['Mastery Ratings'] ?? '',
      mood: r.fields['Mood'] ?? '',
      lessonNotes: r.fields['Lesson Notes'] ?? '',
    },
  });
}
