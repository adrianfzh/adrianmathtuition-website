import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// GET /api/admin/progress/students/[id]/lessons
// One student's lessons, most recent first, over a 6-month window (same window
// as /api/admin/student-profile).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // NOTE: linked-record fields coerce to display names in Airtable formulas,
  // so {Student}='recXXX' matches NOTHING — window-fetch by Date and match the
  // student link in JS (CLAUDE.md Gotchas).
  const windowStart = (() => { const d = new Date(localToday() + 'T00:00:00Z'); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); })();
  const filter = encodeURIComponent(`{Date}>='${windowStart}'`);
  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${filter}&sort[0][field]=Date&sort[0][direction]=desc` +
      `&fields[]=Date&fields[]=Student&fields[]=Status&fields[]=Type&fields[]=Topics Covered` +
      `&fields[]=Homework Assigned&fields[]=Homework Returned&fields[]=Mastery&fields[]=Mood` +
      `&fields[]=Lesson Notes&fields[]=Progress Logged`
  );

  const lessons = data.records
    .filter((r: any) => r.fields['Student']?.[0] === id)
    .map((r: any) => ({
      id: r.id,
      date: r.fields['Date'] ?? '',
      status: r.fields['Status'] ?? '',
      type: r.fields['Type'] ?? '',
      topicsCovered: r.fields['Topics Covered'] ?? '',
      homeworkAssigned: r.fields['Homework Assigned'] ?? '',
      homeworkReturned: r.fields['Homework Returned'] ?? '',
      mastery: r.fields['Mastery'] ?? '',
      mood: r.fields['Mood'] ?? '',
      lessonNotes: r.fields['Lesson Notes'] ?? '',
      progressLogged: r.fields['Progress Logged'] ?? false,
    }));

  return NextResponse.json({ lessons });
}
