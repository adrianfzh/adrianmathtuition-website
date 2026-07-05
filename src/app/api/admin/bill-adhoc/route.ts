import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { billingMonthOf } from '@/lib/lesson-generation';

export const runtime = 'nodejs';

function fmtDate(iso: string): string {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

// GET /api/admin/bill-adhoc?studentId=recXXX  → { lessons:[{id,date,charge}], total }
//   (preview the un-billed ad-hoc lessons for a student)
// POST /api/admin/bill-adhoc  { studentId }
//   Gathers the student's Completed, not-yet-billed Ad-hoc lessons (Source Invoice
//   empty), creates ONE Draft 'Adhoc' invoice (a line per session at each lesson's
//   Charge Override), and marks each lesson billed (Source Invoice + Billing Month)
//   so it can't be double-billed. Then the normal Draft -> PDF -> send flow applies.
//
// Linked-record filter caveat: {Student}='recXXX' can't be filtered server-side, so
// we filter by Type+Status in Airtable and match the student id in JS.

async function unbilled(studentId: string) {
  const filter = encodeURIComponent(`AND({Type}='Ad-hoc',{Status}='Completed')`);
  const data = await airtableRequestAll('Lessons',
    `?filterByFormula=${filter}&fields[]=Student&fields[]=Date&fields[]=Charge Override&fields[]=Source Invoice&sort[0][field]=Date&sort[0][direction]=asc`);
  return (data.records || []).filter((r: { fields: Record<string, any> }) =>
    r.fields['Student']?.[0] === studentId && !(r.fields['Source Invoice']?.length));
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = new URL(req.url).searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  const lessons = await unbilled(studentId);
  const items = lessons.map((r: any) => ({ id: r.id, date: r.fields['Date'], charge: Number(r.fields['Charge Override']) || 0 }));
  return NextResponse.json({ lessons: items, total: items.reduce((s, l) => s + l.charge, 0) });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { studentId } = await req.json().catch(() => ({}));
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  const lessons = await unbilled(studentId);
  if (!lessons.length) {
    return NextResponse.json({ error: 'No un-billed completed Ad-hoc lessons for this student' }, { status: 400 });
  }

  const lineItems = lessons.map((r: any) => ({
    date: r.fields['Date'],
    day: '',
    type: 'Ad-hoc',
    description: `Ad-hoc lesson — ${fmtDate(r.fields['Date'])}`,
    rate: Number(r.fields['Charge Override']) || 0,
  }));
  const total = Math.round(lineItems.reduce((s, li) => s + li.rate, 0) * 100) / 100;
  const monthLabel = billingMonthOf(lessons[lessons.length - 1].fields['Date']);
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);

  const inv = await airtableRequest('Invoices', '', {
    method: 'POST',
    body: JSON.stringify({
      typecast: true, // create the 'Adhoc' Invoice Type option on first write
      fields: {
        Student: [studentId],
        Month: monthLabel,
        'Invoice Type': 'Adhoc',
        Status: 'Draft',
        'Lessons Count': lessons.length,
        'Line Items': JSON.stringify(lineItems),
        'Final Amount': total,
        'Issue Date': today,
        'Due Date': due,
        'Auto Notes': `Ad-hoc invoice: ${lessons.length} session(s), generated ${today}.`,
      },
    }),
  });

  // Mark each lesson billed (Source Invoice is the dedup key; Billing Month for records).
  for (const r of lessons) {
    try {
      await airtableRequest('Lessons', `/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { 'Source Invoice': [inv.id], 'Billing Month': monthLabel } }),
      });
    } catch (e) { console.error('[bill-adhoc] link lesson failed (non-fatal)', e); }
  }

  return NextResponse.json({ success: true, invoiceId: inv.id, count: lessons.length, total, month: monthLabel });
}
