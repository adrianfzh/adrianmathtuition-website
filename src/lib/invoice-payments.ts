// Per-month payment breakdown for a single student.
//
// The current ("carry-forward") billing model bakes prior unpaid months into a
// later invoice's `Final Amount` as an "Outstanding balance — <month>" lump
// line in `Line Items Extra`, while leaving the prior invoices open. That makes
// any naive "sum the open invoices" double-count. This helper reconstructs the
// TRUE per-month picture:
//   1. own-month charge = Final Amount − Σ(lump lines)   [strip the carried lump]
//   2. pool ALL of the student's payments and re-attribute them oldest-month-first
//      across the own-month charges.
// The result is correct both before AND after the per-month migration (after
// migration there are no lumps, so own-month == Final and the maths is identical).
//
// Pure function — no Airtable calls. Feed it the student's invoice records.

export interface PaymentInvoiceInput {
  id: string;
  month: string;            // "June 2026"
  finalAmount: number | null;
  amountPaid: number | null;
  isPaid: boolean;
  status: string;           // Draft / Sent / Paid / Voided …
  invoiceType: string;      // Regular / Revision Sprint / Adjustment …
  lineItemsExtra?: string;  // JSON string
  pdfUrl?: string;
}

export interface MonthPayment {
  month: string;
  charge: number;                       // own-month total billed (non-voided)
  paid: number;                         // payment allocated to this month
  open: number;                         // charge − paid (≥0)
  status: 'paid' | 'partial' | 'open' | 'nil';
  invoices: { id: string; type: string; pdfUrl: string }[];
}

export interface PaymentSummary {
  months: MonthPayment[];   // chronological (oldest first)
  totalCharged: number;
  totalPaid: number;
  outstanding: number;
  credit: number;           // payments beyond all charges (advance credit)
}

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

/** "June 2026" → year*12 + monthIndex, for chronological sort. -1 if unparseable. */
export function monthSortKey(label: string | undefined | null): number {
  if (!label) return -1;
  const m = String(label).trim().match(/([A-Za-z]+)\s+(\d{4})/);
  if (!m) return -1;
  const idx = MONTHS.indexOf(m[1].toLowerCase());
  if (idx < 0) return -1;
  return parseInt(m[2], 10) * 12 + idx;
}

/** Sum the "Outstanding balance …" lump lines carried in Line Items Extra. */
function lumpTotal(lineItemsExtra?: string): number {
  let items: any[] = [];
  try { items = JSON.parse(lineItemsExtra || '[]'); } catch { items = []; }
  return items
    .filter((it) => /outstanding balance/i.test((it?.description || it?.label || '').toString()))
    .reduce((s, it) => s + (Number(it?.amount) || 0), 0);
}

export function computePerMonthPayments(invoices: PaymentInvoiceInput[]): PaymentSummary {
  // 1. Own-month charge per month + pooled payments (ignore Voided invoices).
  const charge: Record<string, number> = {};
  const byMonth: Record<string, { id: string; type: string; pdfUrl: string }[]> = {};
  let pool = 0;
  let totalCharged = 0;

  for (const inv of invoices) {
    if ((inv.status || '') === 'Voided') continue;
    const own = (inv.finalAmount || 0) - lumpTotal(inv.lineItemsExtra);
    const month = inv.month || 'Unknown';
    charge[month] = (charge[month] || 0) + own;
    totalCharged += own;
    pool += inv.amountPaid || 0;
    (byMonth[month] = byMonth[month] || []).push({ id: inv.id, type: inv.invoiceType || 'Regular', pdfUrl: inv.pdfUrl || '' });
  }
  const totalPaid = pool;

  // 2. Allocate the pooled payments oldest-month-first.
  const orderedMonths = Object.keys(charge).sort((a, b) => monthSortKey(a) - monthSortKey(b));
  const months: MonthPayment[] = [];
  for (const m of orderedMonths) {
    const c = charge[m];
    const applied = Math.min(pool, Math.max(c, 0));
    pool -= applied;
    const open = Math.max(c - applied, 0);
    const status: MonthPayment['status'] =
      c < 0.005 ? 'nil' : open < 0.005 ? 'paid' : applied > 0.005 ? 'partial' : 'open';
    months.push({ month: m, charge: c, paid: applied, open, status, invoices: byMonth[m] });
  }

  const outstanding = months.reduce((s, x) => s + x.open, 0);
  return { months, totalCharged, totalPaid, outstanding, credit: pool };
}
