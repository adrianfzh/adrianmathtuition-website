import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// GET /api/admin-schedule/absent-lessons?studentId=recXXX
// Returns the student's unlinked Absent lessons, newest first.
// "Unlinked" = no Rescheduled Lesson ID set yet (not already made up).
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });

  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(
      `AND(FIND('${studentId}',ARRAYJOIN({Student}))>0,{Status}='Absent')`
    )}&sort[0][field]=Date&sort[0][direction]=desc` +
    `&fields[]=Date&fields[]=Slot&fields[]=Rescheduled Lesson ID`
  );

  // Only return lessons that haven't already been linked to a makeup
  const lessons = data.records
    .filter(r => !r.fields['Rescheduled Lesson ID']?.length)
    .map(r => ({
      id: r.id,
      date: r.fields['Date'] ?? '',
      slotId: (r.fields['Slot'] as string[] | undefined)?.[0] ?? null,
    }));

  return NextResponse.json({ lessons });
}
