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

import { monthSortKey } from './invoice-consolidate';
export { monthSortKey };

export interface PaymentInvoiceInput {
  id: string;
  month: string;            // "June 2026"
  finalAmount: number | null;
  amountPaid: number | null;
  isPaid: boolean;
  status: string;           // Draft / Sent / Paid / Voided …
  invoiceType: string;      // Regular / Revision Sprint / Adjustment …
  lineItemsExtra?: string | any[];  // JSON string (Airtable) or parsed array (/api/admin-invoices)
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

/** Sum the carried prior-balance lump lines in Line Items Extra: old-style
 *  "Outstanding balance …" text rows, plus anything flagged previousBalance
 *  (the consolidated-rendering rows — render-time only today, but stripping
 *  them is correct if one ever reaches a stored record). */
function lumpTotal(lineItemsExtra?: string | any[]): number {
  let items: any[] = [];
  if (Array.isArray(lineItemsExtra)) items = lineItemsExtra;
  else { try { items = JSON.parse(lineItemsExtra || '[]'); } catch { items = []; } }
  return items
    .filter((it) => it?.previousBalance === true ||
      /outstanding balance/i.test((it?.description || it?.label || '').toString()))
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

// ── Single-invoice paid/outstanding predicates ────────────────────────────────
// THE definitions the admin invoices page uses (it used to carry ~5 divergent
// inline copies). Rules unified 2026-09-02:
//   • The {Is Paid} CHECKBOX is authoritative "settled" — checked wins even if
//     Amount Paid is short (a deliberately forgiven remainder is not owed).
//   • Fully-covered-by-payments (within half a cent) also counts as settled.
//   • Only SENT invoices can be "unpaid"/"partial" — drafts aren't owed yet.

const EPSILON = 0.005; // half a cent — float-dust tolerance, same as computePerMonthPayments

export interface PayableInvoice {
  status?: string;
  isPaid?: boolean;
  finalAmount?: number | null;
  amountPaid?: number | null;
}

/** What one invoice still owes. 0 unless it is Sent and not settled. */
export function invoiceOutstanding(inv: PayableInvoice): number {
  if (inv.status !== 'Sent' || inv.isPaid) return 0;
  return Math.max(0, (inv.finalAmount || 0) - (inv.amountPaid || 0));
}

/** Settled = Is Paid checked, or payments cover the final amount. */
export function isSettled(inv: PayableInvoice): boolean {
  return inv.isPaid === true || (inv.finalAmount || 0) - (inv.amountPaid || 0) <= EPSILON;
}

/** Badge state for one invoice, regardless of its status. */
export function paymentState(inv: PayableInvoice): 'paid' | 'partial' | 'unpaid' {
  if (isSettled(inv)) return 'paid';
  return (inv.amountPaid || 0) > EPSILON ? 'partial' : 'unpaid';
}

/** The dashboard payment-filter dropdown. Unknown filter values (e.g. 'all') match everything. */
export function matchesPaymentFilter(inv: PayableInvoice, filter: string): boolean {
  if (filter === 'paid') return isSettled(inv);
  if (filter === 'partial' || filter === 'unpaid') {
    return inv.status === 'Sent' && paymentState(inv) === filter;
  }
  return true;
}

// ── Other open months for one student's invoice card ─────────────────────────
// Feed it ALL of the student's invoices (current month included — the pooled
// oldest-first allocation needs every month to attribute payments correctly),
// and the month of the card being rendered; that month is excluded from the
// RESULT only. Built on computePerMonthPayments so a month whose balance was
// carried forward into a later invoice's Final Amount is stripped back to its
// own charge and payments settle oldest-first — the same maths as the
// "Outstanding by student" banner, so the two figures always agree.
export function otherMonthsOpen(
  invoices: PaymentInvoiceInput[],
  excludeMonth: string,
): { total: number; entries: { month: string; amount: number }[] } {
  const summary = computePerMonthPayments(invoices);
  const entries = summary.months
    .filter((m) => m.month !== excludeMonth && m.open > EPSILON)
    .map((m) => ({ month: m.month, amount: Math.round(m.open * 100) / 100 }))
    .reverse(); // newest first, matching the card badge
  const total = Math.round(entries.reduce((s, e) => s + e.amount, 0) * 100) / 100;
  return { total, entries };
}
