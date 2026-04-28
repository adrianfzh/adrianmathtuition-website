import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// GET /api/admin-schedule/absent-lessons?studentId=recXXX
// Returns ALL of the student's Absent lessons up to and including today,
// newest first. Lessons already linked to a makeup (Rescheduled Lesson ID
// non-empty) are excluded in JS so we don't show already-handled ones.
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });

  const today = localToday();

  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(
      `AND(FIND('${studentId}',ARRAYJOIN({Student}))>0,{Date}<='${today}',{Status}='Absent')`
    )}&sort[0][field]=Date&sort[0][direction]=desc` +
    `&fields[]=Date&fields[]=Slot&fields[]=Rescheduled+Lesson+ID`
  );

  // Exclude lessons already linked to a makeup
  const lessons = data.records
    .filter(r => {
      const linked: string[] | undefined = r.fields['Rescheduled Lesson ID'];
      return !linked || linked.length === 0 || linked.every((id: string) => !id);
    })
    .map(r => ({
      id: r.id,
      date: r.fields['Date'] ?? '',
      slotId: (r.fields['Slot'] as string[] | undefined)?.[0] ?? null,
    }));

  return NextResponse.json({ lessons });
}
