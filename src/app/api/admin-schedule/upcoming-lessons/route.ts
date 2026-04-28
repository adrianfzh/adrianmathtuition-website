import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// GET /api/admin-schedule/upcoming-lessons?studentId=recXXX
// Returns the student's upcoming Scheduled lessons (today onwards), soonest first.
// Used by the "Rescheduled" flow in the Add Lesson modal.
//
// NOTE: ARRAYJOIN({Student}) returns display names not record IDs, so we
// filter by Status + Date in Airtable and match studentId in JS.
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
      `AND({Status}='Scheduled',{Date}>='${today}')`
    )}&sort[0][field]=Date&sort[0][direction]=asc` +
    `&fields[]=Date&fields[]=Slot&fields[]=Student`
  );

  const lessons = data.records
    .filter(r => r.fields['Student']?.[0] === studentId)
    .map(r => ({
      id: r.id,
      date: r.fields['Date'] ?? '',
      slotId: (r.fields['Slot'] as string[] | undefined)?.[0] ?? null,
    }));

  return NextResponse.json({ lessons });
}
