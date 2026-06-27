// GET /api/admin-invoices/payments-overview
// Per-student TRUE outstanding (own-month charge with the carry-forward lump
// stripped + payments re-attributed oldest-first), for the /admin/invoices
// dashboard "Outstanding by student" panel. Read-only; computes the same view
// as the student profile page, for every family at once.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { computePerMonthPayments } from '@/lib/invoice-payments';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [students, invData] = await Promise.all([
    airtableRequestAll('Students', `?fields[]=Student Name`),
    airtableRequestAll('Invoices',
      `?fields[]=Student&fields[]=Month&fields[]=Final Amount&fields[]=Status&fields[]=Amount Paid&fields[]=Is Paid&fields[]=Invoice Type&fields[]=Line Items Extra&fields[]=PDF URL`),
  ]);
  const nameById: Record<string, string> = Object.fromEntries(
    students.records.map((s: any) => [s.id, s.fields['Student Name'] || '']));

  const byStudent: Record<string, any[]> = {};
  for (const r of invData.records) {
    const sid = r.fields['Student']?.[0];
    if (!sid) continue;
    (byStudent[sid] = byStudent[sid] || []).push(r);
  }

  const families: any[] = [];
  let grandOutstanding = 0;
  for (const sid of Object.keys(byStudent)) {
    const summary = computePerMonthPayments(byStudent[sid].map((r: any) => ({
      id: r.id,
      month: r.fields['Month'] || '',
      finalAmount: r.fields['Final Amount'] ?? null,
      amountPaid: r.fields['Amount Paid'] ?? null,
      isPaid: r.fields['Is Paid'] === true,
      status: r.fields['Status'] || '',
      invoiceType: r.fields['Invoice Type'] || 'Regular',
      lineItemsExtra: r.fields['Line Items Extra'] || '',
      pdfUrl: r.fields['PDF URL'] || '',
    })));
    if (summary.outstanding < 0.005) continue; // only families that owe
    grandOutstanding += summary.outstanding;
    families.push({
      studentId: sid,
      name: nameById[sid] || sid,
      outstanding: summary.outstanding,
      credit: summary.credit,
      openMonths: summary.months
        .filter((m) => m.open > 0.005)
        .map((m) => ({ month: m.month, open: m.open, status: m.status })),
    });
  }
  families.sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));

  return NextResponse.json({
    families,
    grandOutstanding,
    familyCount: families.length,
  });
}
