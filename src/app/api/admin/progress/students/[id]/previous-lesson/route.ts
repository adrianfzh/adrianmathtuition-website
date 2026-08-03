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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    return NextResponse.json({ error: 'Invalid before date' }, { status: 400 });
  }

  // NOTE: linked-record fields coerce to display names in Airtable formulas,
  // so FIND('recXXX', ARRAYJOIN({Student})) matches NOTHING — filter by
  // Date/Status only and match the student link in JS (CLAUDE.md Gotchas).
  // 180-day lookback keeps the scan bounded; the strict {Date}<'before' upper
  // bound is deliberate (records ON 'before' must be excluded).
  const windowStart = (() => { const d = new Date(before + 'T00:00:00'); d.setDate(d.getDate() - 180); return d.toISOString().slice(0, 10); })();
  const filter = encodeURIComponent(
    `AND({Date}>='${windowStart}', {Date}<'${before}', {Status}='Completed')`
  );
  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${filter}&sort[0][field]=Date&sort[0][direction]=desc` +
      `&fields[]=Date&fields[]=Student&fields[]=Topics Covered&fields[]=Homework Assigned` +
      `&fields[]=Homework Returned&fields[]=Mastery&fields[]=Mood&fields[]=Lesson Notes`
  );

  const r = data.records.find((rec: any) => rec.fields['Student']?.[0] === id);
  if (!r) return NextResponse.json({ lesson: null });

  return NextResponse.json({
    lesson: {
      id: r.id,
      date: r.fields['Date'] ?? '',
      homeworkAssigned: r.fields['Homework Assigned'] ?? '',
      homeworkReturned: r.fields['Homework Returned'] ?? '',
      topicsCovered: r.fields['Topics Covered'] ?? '',
      mastery: r.fields['Mastery'] ?? '',
      mood: r.fields['Mood'] ?? '',
      lessonNotes: r.fields['Lesson Notes'] ?? '',
    },
  });
}
