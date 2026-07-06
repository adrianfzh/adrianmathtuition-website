// GET /api/admin-invoices/deferred-pending
// Returns invoice records carrying an unapplied deferred adjustment
// (Deferred Amount != 0 AND NOT Deferred Applied). Used to show a prominent
// "Pending adjustments" banner on the invoices page so the admin can't miss
// a credit/charge that will auto-apply to a future month's invoice.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // NOTE: use truthiness ({Deferred Amount}), NOT `!=0`. In Airtable a BLANK
  // currency field is "not equal to 0" (BLANK()!=0 → TRUE), so `!=0` matched
  // every invoice with an empty Deferred Amount and flooded the banner with
  // +$0.00 rows. Truthiness is falsy for both 0 and blank — only real,
  // non-zero deferrals match.
  const formula = encodeURIComponent(`AND({Deferred Amount}, NOT({Deferred Applied}))`);
  const invoices = await airtableRequestAll('Invoices',
    `?filterByFormula=${formula}&fields[]=Student&fields[]=Month&fields[]=Deferred Amount&fields[]=Deferred Note&fields[]=Deferred To Month`
  );

  if (!invoices.records.length) return NextResponse.json({ pending: [] });

  // Resolve student names (fetch all to avoid RECORD_ID filter truncation)
  const studentsData = await airtableRequestAll('Students', `?fields[]=Student Name`);
  const nameById: Record<string, string> = Object.fromEntries(
    studentsData.records.map((r: any) => [r.id, r.fields['Student Name'] || r.id])
  );

  const pending = invoices.records.map((r: any) => {
    const sid = r.fields['Student']?.[0] || '';
    return {
      id: r.id,
      studentId: sid,
      studentName: nameById[sid] || 'Unknown',
      carrierMonth: r.fields['Month'] || '',
      amount: r.fields['Deferred Amount'] || 0,
      note: r.fields['Deferred Note'] || '',
      targetMonth: r.fields['Deferred To Month'] || '',
    };
  });

  return NextResponse.json({ pending });
}
