import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// POST /api/admin-schedule/attendance
// Body: { studentId, slotId, date, status: 'Scheduled' | 'Absent' }
// Creates a lesson record if none exists for student+slot+date, or patches the Status.
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { studentId: string; slotId: string; date: string; status: 'Completed' | 'Absent' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { studentId, slotId, date, status } = body;
  if (!studentId || !slotId || !date || !status) {
    return NextResponse.json({ error: 'Missing fields: studentId, slotId, date, status' }, { status: 400 });
  }
  if (status !== 'Completed' && status !== 'Absent') {
    return NextResponse.json({ error: 'status must be "Completed" or "Absent"' }, { status: 400 });
  }

  try {
    // Check for an existing lesson record for this student + slot + date.
    // NOTE: ARRAYJOIN({Slot}) and ARRAYJOIN({Student}) return display names,
    // not record IDs — so we filter by Date only in Airtable and match
    // Slot + Student in JS.
    const existing = await airtableRequestAll(
      'Lessons',
      `?filterByFormula=${encodeURIComponent(`{Date}='${date}'`)}&fields[]=Status&fields[]=Date&fields[]=Slot&fields[]=Student&fields[]=Type&fields[]=Notes`
    );
    const matchedRecords = existing.records.filter(
      (r: any) => r.fields['Slot']?.[0] === slotId && r.fields['Student']?.[0] === studentId
    );

    let record: any;
    if (matchedRecords.length > 0) {
      // Patch existing record
      const id = matchedRecords[0].id;
      record = await airtableRequest('Lessons', `/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { Status: status } }),
      });
    } else {
      // Create new lesson record
      record = await airtableRequest('Lessons', '', {
        method: 'POST',
        body: JSON.stringify({
          fields: {
            Date: date,
            Slot: [slotId],
            Student: [studentId],
            Type: 'Regular',
            Status: status,
          },
        }),
      });
    }

    return NextResponse.json({
      id: record.id,
      date: record.fields['Date'] ?? date,
      slotId: record.fields['Slot']?.[0] ?? slotId,
      studentId: record.fields['Student']?.[0] ?? studentId,
      type: record.fields['Type'] ?? 'Regular',
      status: record.fields['Status'] ?? status,
      notes: record.fields['Notes'] ?? '',
    });
  } catch (err: any) {
    console.error('[attendance] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
