// ─── Prorated-month arrears billing — the pure rules ────────────────────────────
//
// PRORATION_MONTHS (June + Oct–Dec) bill by actual attendance: the invoice is
// built from Completed Regular lessons AFTER the month is taught, in arrears.
// Every other month is projected from weekly slots BEFORE it starts (the 14th
// cron targets getInvoiceMonth() = next month).
//
// That split is why a prorated month needs its own trigger. On the 14th the
// next month has 0 Completed lessons, so the regular cron has nothing to bill —
// and until 2026-09-02 that meant "someone remembers to POST {month} after the
// month ends" (CLAUDE.md Building doctrine, step 4: never "when Adrian
// remembers"). The arrears cron (1st of the month, 9am SGT) runs generation
// for the JUST-ENDED month, only when it was prorated; the arrears send cron
// (2nd, 10am SGT) sends those drafts after Adrian's review — the same
// draft→review→send rhythm as the 14th→15th, one day apart.
//
// Everything date- or money-shaped lives here as pure functions with tests
// (CLAUDE.md testing policy); the routes only call them.

import { MONTH_NAMES } from './invoice-month';
import { firstOfNextMonthISO } from './billing-math';

/** June (holiday month — flexible attendance / revision sprint) + Oct–Dec
 *  (year-end taper). The ONE definition; every route imports it. */
export const PRORATION_MONTHS = [6, 10, 11, 12];

export function isProratedMonth(monthNum: number): boolean {
  return PRORATION_MONTHS.includes(monthNum);
}

export interface ArrearsMonth {
  label: string;   // "October 2026" — must match the Invoices {Month} label exactly
  year: number;
  month: number;   // 1–12
}

/** The month that ended yesterday, judged from an SGT calendar date. Runs on
 *  the 1st (or any later day) of a month resolve to the previous month;
 *  January rolls back into the previous year. */
export function justEndedMonth(todayISO: string): ArrearsMonth {
  const [y, m] = todayISO.split('-').map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return { label: `${MONTH_NAMES[month - 1]} ${year}`, year, month };
}

/** True once todayISO is on or after the first day of the month AFTER
 *  (year, month) — i.e. the whole month has been taught. A prorated month may
 *  only be generated after this, otherwise the draft bills a partial month
 *  (or nothing but Additional lessons — the "additionals-only trap"). */
export function monthHasEnded(todayISO: string, year: number, month: number): boolean {
  return todayISO >= firstOfNextMonthISO(`${year}-${String(month).padStart(2, '0')}-01`);
}

/** Issue/Due dates for an arrears invoice. The pre-month defaults (Issue = 15th
 *  of the run month, Due = 15th of the invoice month) put an arrears invoice's
 *  Due Date in the PAST — so arrears drafts are issued on the scheduled send
 *  day (2nd of the following month) and due on the 15th of that month. */
export function arrearsInvoiceDates(year: number, month: number): { issueISO: string; dueISO: string } {
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  const mm = String(nm).padStart(2, '0');
  return { issueISO: `${ny}-${mm}-02`, dueISO: `${ny}-${mm}-15` };
}

/** Start of the Additional-lesson window for an arrears run = the 15th of the
 *  month TWO before the prorated month. The 14th cron for a prorated target
 *  month creates nothing (see route), so the additionals batch it would have
 *  carried — which starts on the 15th of (M−2), e.g. 15 Aug for October — rides
 *  the arrears invoice instead. Overlaps with the neighbouring runs are
 *  double-bill-safe: the Billed checkbox is the primary guard, the window is
 *  only a fetch optimisation (lib/additional-lessons.ts). */
export function arrearsAdditionalWindowStartISO(year: number, month: number): string {
  const total = year * 12 + (month - 1) - 2;
  const wy = Math.floor(total / 12);
  const wm = (total % 12) + 1;
  return `${wy}-${String(wm).padStart(2, '0')}-15`;
}

/** The moment the arrears send cron fires for (year, month): 10am SGT on the
 *  2nd of the following month (vercel.json `0 2 2 * *` UTC). Drafts that exist
 *  before it are auto-sent (if clean); drafts made after it need a manual send. */
export function arrearsSendAtISO(year: number, month: number): string {
  return `${arrearsInvoiceDates(year, month).issueISO}T02:00:00Z`;
}

export interface ExistingInvoiceSummary {
  lessonsCount: number;
  invoiceType: string;
  status: string;
}

/** The trap alarm. A student is skipped when they already have an invoice for
 *  the month — normally right (the arrears run re-firing, a manual invoice).
 *  But if NONE of their live invoices for the month bills a regular lesson
 *  (an additionals-only invoice, an adjustment, everything Voided), the
 *  Completed lessons the arrears run found are going unbilled and Adrian must
 *  hear about it. A Revision Sprint invoice is the deliberate June exception
 *  (the sprint replaces the regular June invoice). */
export function existingInvoicesMissRegulars(invoices: ExistingInvoiceSummary[]): boolean {
  const live = invoices.filter(i => i.status !== 'Voided');
  if (live.some(i => i.invoiceType === 'Revision Sprint')) return false;
  return !live.some(i => i.lessonsCount > 0);
}
