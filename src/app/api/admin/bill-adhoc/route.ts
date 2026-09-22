import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { billingMonthOf } from '@/lib/lesson-generation';
import { billableAdhocLessons, adhocRowDescription, adhocInvoiceNote } from '@/lib/adhoc-billing';
import { sgtTodayISO, addDaysISO } from '@/lib/sgt';

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
// we filter by Type in Airtable and match the student id in JS.
//
// A moved ad-hoc lesson (Type 'Rescheduled', 'Makeup For' → the ad-hoc row) is
// billed on the row that happened, at the original's charge — the rules live in
// lib/adhoc-billing.ts (Kevin Seng's 26 → 27 Jul lesson, 22 Sep 2026).

async function unbilled(studentId: string) {
  const filter = encodeURIComponent(`OR({Type}='Ad-hoc',{Type}='Rescheduled')`);
  const data = await airtableRequestAll('Lessons',
    `?filterByFormula=${filter}&fields[]=Student&fields[]=Date&fields[]=Type&fields[]=Status&fields[]=Charge Override&fields[]=Source Invoice&fields[]=Makeup For`);
  return billableAdhocLessons(data.records || [], studentId);
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = new URL(req.url).searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  const items = await unbilled(studentId);
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
  const uncharged = lessons.filter(l => !(l.charge > 0));
  if (uncharged.length) {
    return NextResponse.json({ error: `No charge set on ${uncharged.map(l => fmtDate(l.date)).join(', ')} — set one on the lesson first` }, { status: 400 });
  }

  // One line item per lesson (the email and the records read the dates); the
  // PDF folds them into one row per price — see adhocRowDescription.
  const charges = lessons.map(l => l.charge);
  const lineItems = lessons.map(l => ({
    date: l.date,
    day: '',
    type: 'Ad-hoc',
    description: adhocRowDescription(l.charge, charges),
    rate: l.charge,
    ...(l.movedFromDate ? { movedFrom: l.movedFromDate } : {}),
  }));
  const total = Math.round(lineItems.reduce((s, li) => s + li.rate, 0) * 100) / 100;
  const monthLabel = billingMonthOf(lessons[lessons.length - 1].date);
  const today = sgtTodayISO();
  const due = addDaysISO(today, 14);

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
        // Prints on the parent's PDF ({{AUTO_NOTES}}) — parent-facing words only.
        'Auto Notes': adhocInvoiceNote(lessons.map(l => l.date)),
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
