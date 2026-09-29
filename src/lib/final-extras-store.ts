// The Airtable half of lib/graduation.ts — used by cron/end-enrollments (an
// enrollment's End Date passed) and by Discontinue. Fail-soft: callers log the
// error and carry on; a failure here must never strand an enrollment half-ended.
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { addDaysISO, sgtTodayISO } from '@/lib/sgt';
import {
  GRADUATED, INACTIVE, finalExtras, finalExtrasMonth, finalExtrasNote, invoicedDates,
  leavingStatus, mapExtraLesson, type ExtraLessonRow,
} from '@/lib/graduation';

export interface FinalBill {
  invoiceId: string | null;
  month: string;
  dates: string[];
  amount: number;
  /** Past extras still at 'Scheduled' — not billed, listed for Adrian. */
  unmarked: string[];
}

/** Additional lessons from 120 days before `endISO` to it — one fetch, matched in JS. */
export async function fetchExtrasPool(endISO: string): Promise<ExtraLessonRow[]> {
  const from = addDaysISO(endISO, -120);
  const formula = `AND({Type}='Additional',{Date}>='${from}',{Date}<='${endISO}')`;
  const q = `?filterByFormula=${encodeURIComponent(formula)}&fields[]=Date&fields[]=Student&fields[]=Status&fields[]=Is Revision Makeup&fields[]=Notes`;
  const withBilled = await airtableRequestAll('Lessons', q + '&fields[]=Billed')
    .catch(() => airtableRequestAll('Lessons', q));   // Billed field missing → the date guard still holds
  return (withBilled.records || []).map(mapExtraLesson);
}

async function studentInvoices(studentId: string): Promise<{ fields: Record<string, unknown> }[]> {
  const formula = `IS_AFTER({Issue Date},'${addDaysISO(sgtTodayISO(), -400)}')`;
  const data = await airtableRequestAll('Invoices',
    `?filterByFormula=${encodeURIComponent(formula)}&fields[]=Student&fields[]=Status&fields[]=Line Items&fields[]=Line Items Extra`);
  return (data.records || []).filter((r: any) => r.fields['Student']?.[0] === studentId);
}

/**
 * Draft ONE 'Adjustment' invoice for the leaver's Completed, un-billed
 * Additional lessons up to `endISO`, at `ratePerLesson`, and mark each lesson
 * Billed. Nothing to bill → invoiceId null (the unmarked list may still be set).
 */
export async function draftFinalExtrasInvoice(
  studentId: string, endISO: string, ratePerLesson: number, pool?: ExtraLessonRow[],
): Promise<FinalBill> {
  const lessons = pool ?? await fetchExtrasPool(endISO);
  const invoiced = invoicedDates(await studentInvoices(studentId));
  const { bill, unmarked } = finalExtras(lessons, studentId, endISO, invoiced);
  const result: FinalBill = { invoiceId: null, month: '', dates: bill.map((l) => l.date), amount: 0, unmarked: unmarked.map((l) => l.date) };
  if (!bill.length || !(ratePerLesson > 0)) return result;

  const month = finalExtrasMonth(result.dates);
  const lineItems = bill.map((l) => ({ date: l.date, day: '', type: 'Additional', description: `Additional Lesson — ${month}`, rate: ratePerLesson }));
  const amount = Math.round(ratePerLesson * bill.length * 100) / 100;
  const today = sgtTodayISO();
  const inv = await airtableRequest('Invoices', '', {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        Student: [studentId],
        Month: month,
        'Invoice Type': 'Adjustment',
        Status: 'Draft',
        'Lessons Count': bill.length,
        'Rate Per Lesson': ratePerLesson,
        'Line Items': JSON.stringify(lineItems),
        'Base Amount': amount,
        'Final Amount': amount,
        'Issue Date': today,
        'Due Date': addDaysISO(today, 14),
        // Prints on the parent's PDF — and is how the send cron recognises it.
        'Auto Notes': finalExtrasNote(result.dates),
      },
    }),
  });
  for (const l of bill) {
    await airtableRequest('Lessons', `/${l.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Billed: true, 'Billing Month': month } }),
    }).catch((e) => console.error('[final-extras] mark billed failed (non-fatal)', l.id, e));
  }
  return { ...result, invoiceId: inv.id, month, amount };
}

/**
 * Set a leaver's Students.Status — 'Graduated' or 'Inactive' by leavingStatus().
 * 'Graduated' is a new select option: if the base does not have it yet the write
 * falls back to 'Inactive', and the caller says so.
 */
export async function setLeavingStatus(
  studentId: string, level: string | null, endISO: string | null, extraFields: Record<string, unknown> = {},
): Promise<{ status: string; fellBack: boolean }> {
  const want = leavingStatus(level, endISO);
  try {
    await airtableRequest('Students', `/${studentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { ...extraFields, Status: want }, typecast: true }),
    });
    return { status: want, fellBack: false };
  } catch (e) {
    if (want !== GRADUATED || !/INVALID_MULTIPLE_CHOICE|select option/i.test((e as Error).message || '')) throw e;
    await airtableRequest('Students', `/${studentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { ...extraFields, Status: INACTIVE } }),
    });
    return { status: INACTIVE, fellBack: true };
  }
}
