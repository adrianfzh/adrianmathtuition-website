import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// GET /api/admin-schedule/absent-lessons?studentId=recXXX
// Returns the student's past lessons that still need a makeup, newest first.
// Covers two cases:
//   1. Status='Absent'  — standard absent lesson, no makeup yet
//   2. Status='Scheduled' + past date — lesson whose makeup was previously
//      deleted; the delete route incorrectly restored the status to 'Scheduled'
//      instead of 'Absent' (now fixed in the delete route going forward).
// Either way, lessons already linked to a makeup (Rescheduled Lesson ID set)
// are excluded.
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
      `AND(FIND('${studentId}',ARRAYJOIN({Student}))>0,{Date}<'${today}',OR({Status}='Absent',{Status}='Scheduled'))`
    )}&sort[0][field]=Date&sort[0][direction]=desc` +
    `&fields[]=Date&fields[]=Slot&fields[]=Status&fields[]=Rescheduled+Lesson+ID`
  );

  // Exclude lessons already linked to a makeup (Rescheduled Lesson ID is non-empty)
  const lessons = data.records
    .filter(r => {
      const linked: string[] | undefined = r.fields['Rescheduled Lesson ID'];
      return !linked || linked.length === 0 || linked.every(id => !id);
    })
    .map(r => ({
      id: r.id,
      date: r.fields['Date'] ?? '',
      slotId: (r.fields['Slot'] as string[] | undefined)?.[0] ?? null,
      status: r.fields['Status'] ?? '',
    }));

  return NextResponse.json({ lessons });
}
