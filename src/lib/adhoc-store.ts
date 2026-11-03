// The Airtable half of lib/adhoc-billing.ts — used by the student page's
// ad-hoc button (/api/admin/bill-adhoc) and by the 14th's run, which bills the
// next month's BOOKED ad-hoc lessons ahead (3 Nov 2026, Chantal).
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { billingMonthOf } from '@/lib/lesson-generation';
import { adhocRowDescription, adhocInvoiceNote, type BillableAdhoc, type LessonRow } from '@/lib/adhoc-billing';

/** Every Ad-hoc and Rescheduled lesson (any student — matched in JS; the
 *  Student link cannot be filtered by id). Rescheduled rows walk back to their
 *  ad-hoc origin, so both types come together. */
export async function fetchAdhocRows(): Promise<LessonRow[]> {
  const filter = encodeURIComponent(`OR({Type}='Ad-hoc',{Type}='Rescheduled')`);
  const data = await airtableRequestAll('Lessons',
    `?filterByFormula=${filter}&fields[]=Student&fields[]=Date&fields[]=Type&fields[]=Status&fields[]=Charge Override&fields[]=Source Invoice&fields[]=Makeup For`);
  return data.records || [];
}

/**
 * ONE Draft 'Adhoc' invoice for these lessons (a line per lesson at its
 * charge), then each lesson stamped with Source Invoice + Billing Month — the
 * stamp is what stops a second bill. Callers refuse lessons with no charge.
 */
export async function draftAdhocInvoice(
  studentId: string, lessons: BillableAdhoc[],
  opts: { issueISO: string; dueISO: string; monthLabel?: string },
): Promise<{ id: string; total: number; month: string }> {
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
  const month = opts.monthLabel || billingMonthOf(lessons[lessons.length - 1].date);

  const inv = await airtableRequest('Invoices', '', {
    method: 'POST',
    body: JSON.stringify({
      typecast: true, // create the 'Adhoc' Invoice Type option on first write
      fields: {
        Student: [studentId],
        Month: month,
        'Invoice Type': 'Adhoc',
        Status: 'Draft',
        'Lessons Count': lessons.length,
        'Line Items': JSON.stringify(lineItems),
        'Final Amount': total,
        'Issue Date': opts.issueISO,
        'Due Date': opts.dueISO,
        // Prints on the parent's PDF ({{AUTO_NOTES}}) — parent-facing words only.
        'Auto Notes': adhocInvoiceNote(lessons.map(l => l.date)),
      },
    }),
  });

  for (const r of lessons) {
    try {
      await airtableRequest('Lessons', `/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { 'Source Invoice': [inv.id], 'Billing Month': month } }),
      });
    } catch (e) { console.error('[adhoc-store] link lesson failed (non-fatal)', r.id, e); }
  }
  return { id: inv.id, total, month };
}
