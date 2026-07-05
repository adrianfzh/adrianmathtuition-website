import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// POST /api/admin/student-discontinue  { studentId, effectiveDate }
// Discontinue a student in one atomic action (the manual version of this was
// error-prone — a missed Active enrollment kept the bot's Monday cron generating
// lessons and the invoice generator billing them; see Ze Kai, Jul 2026):
//   1. End ALL Active enrollments (Status='Ended', End Date = day before effectiveDate)
//   2. Delete future Regular lessons (Date >= effectiveDate, Status='Scheduled').
//      Completed/Absent history is kept; Makeup/Rescheduled/etc. are untouched —
//      owed makeups survive discontinuation.
//   3. Set the Students record Status='Inactive'.
//   4. Report (NOT auto-void) any live invoices for the effective month onwards,
//      so the admin can review/void — a sent invoice may need a parent message.
// effectiveDate = the first day with no more regular lessons.

function dayBefore(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function monthKey(label: string): number {
  const m = (label || '').trim().match(/^(\w+)\s+(\d{4})$/);
  if (!m) return 0;
  const idx = MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase());
  return idx < 0 ? 0 : Number(m[2]) * 12 + idx;
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { studentId, effectiveDate } = await req.json().catch(() => ({}));
  if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate || '')) {
    return NextResponse.json({ error: 'studentId and effectiveDate (YYYY-MM-DD) required' }, { status: 400 });
  }

  const result = { enrollmentsEnded: 0, lessonsDeleted: 0, studentInactive: false, invoicesToReview: [] as any[] };

  // 1. End all Active enrollments (linked-record gotcha: filter by Status, match student in JS)
  const enr = await airtableRequestAll('Enrollments', `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Status`);
  const mine = (enr.records || []).filter((r: any) => r.fields['Student']?.[0] === studentId);
  for (const r of mine) {
    await airtableRequest('Enrollments', `/${r.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Status: 'Ended', 'End Date': dayBefore(effectiveDate) } }),
    });
    result.enrollmentsEnded++;
  }

  // 2. Delete future Scheduled Regular lessons
  const lesFormula = encodeURIComponent(`AND({Type}='Regular',{Status}='Scheduled',{Date}>='${effectiveDate}')`);
  const les = await airtableRequestAll('Lessons', `?filterByFormula=${lesFormula}&fields[]=Student&fields[]=Date`);
  const hisLessons = (les.records || []).filter((r: any) => r.fields['Student']?.[0] === studentId);
  for (let i = 0; i < hisLessons.length; i += 10) {
    const qs = hisLessons.slice(i, i + 10).map((r: any) => `records[]=${r.id}`).join('&');
    await airtableRequest('Lessons', `?${qs}`, { method: 'DELETE' });
  }
  result.lessonsDeleted = hisLessons.length;

  // 3. Student -> Inactive
  await airtableRequest('Students', `/${studentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { Status: 'Inactive' } }),
  });
  result.studentInactive = true;

  // 4. Live invoices for effective month onwards -> report for review
  const effKey = monthKey(`${MONTHS[new Date(effectiveDate + 'T00:00:00Z').getUTCMonth()]} ${new Date(effectiveDate + 'T00:00:00Z').getUTCFullYear()}`);
  const inv = await airtableRequestAll('Invoices',
    `?filterByFormula=${encodeURIComponent(`AND({Status}!='Voided',NOT({Is Paid}))`)}&fields[]=Student&fields[]=Month&fields[]=Status&fields[]=Final Amount&fields[]=Invoice Type`);
  result.invoicesToReview = (inv.records || [])
    .filter((r: any) => r.fields['Student']?.[0] === studentId && monthKey(r.fields['Month']) >= effKey)
    .map((r: any) => ({ id: r.id, month: r.fields['Month'], status: r.fields['Status'], amount: r.fields['Final Amount'], type: r.fields['Invoice Type'] }));

  return NextResponse.json({ success: true, ...result });
}
