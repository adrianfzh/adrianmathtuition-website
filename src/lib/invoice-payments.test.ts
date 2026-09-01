import { describe, it, expect } from 'vitest';
import {
  computePerMonthPayments, monthSortKey, invoiceOutstanding, isSettled,
  paymentState, matchesPaymentFilter, otherMonthsOpen, type PaymentInvoiceInput,
} from './invoice-payments';

// Minimal factory — only the fields computePerMonthPayments reads.
function inv(p: Partial<PaymentInvoiceInput> & { month: string }): PaymentInvoiceInput {
  return {
    id: p.id ?? p.month,
    month: p.month,
    finalAmount: p.finalAmount ?? 0,
    amountPaid: p.amountPaid ?? 0,
    isPaid: p.isPaid ?? false,
    status: p.status ?? 'Sent',
    invoiceType: p.invoiceType ?? 'Regular',
    lineItemsExtra: p.lineItemsExtra,
    pdfUrl: p.pdfUrl,
  };
}

describe('monthSortKey — chronological ordering of "Month YYYY" labels', () => {
  it('orders across a year boundary', () => {
    expect(monthSortKey('December 2026')).toBeLessThan(monthSortKey('January 2027'));
  });
  it('is case-insensitive and whitespace-tolerant', () => {
    expect(monthSortKey('  june 2026 ')).toBe(monthSortKey('June 2026'));
  });
  it('returns -1 for unparseable / empty labels', () => {
    expect(monthSortKey(null)).toBe(-1);
    expect(monthSortKey('Smarch 2026')).toBe(-1);
    expect(monthSortKey('')).toBe(-1);
  });
});

describe('computePerMonthPayments — pooled payment allocation', () => {
  it('a fully-paid single month reads as paid, nothing outstanding', () => {
    const r = computePerMonthPayments([inv({ month: 'June 2026', finalAmount: 300, amountPaid: 300 })]);
    expect(r.totalCharged).toBe(300);
    expect(r.totalPaid).toBe(300);
    expect(r.outstanding).toBe(0);
    expect(r.credit).toBe(0);
    expect(r.months[0].status).toBe('paid');
  });

  it('a partial payment leaves the remainder open', () => {
    const r = computePerMonthPayments([inv({ month: 'June 2026', finalAmount: 300, amountPaid: 100 })]);
    expect(r.months[0].open).toBe(200);
    expect(r.months[0].status).toBe('partial');
    expect(r.outstanding).toBe(200);
  });

  it('pools payments and applies them OLDEST month first', () => {
    // Parent overpaid June; May is unpaid. The pool should cover May before June.
    const r = computePerMonthPayments([
      inv({ month: 'June 2026', finalAmount: 300, amountPaid: 600 }),
      inv({ month: 'May 2026', finalAmount: 300, amountPaid: 0 }),
    ]);
    const may = r.months.find(m => m.month === 'May 2026')!;
    const june = r.months.find(m => m.month === 'June 2026')!;
    expect(r.months[0].month).toBe('May 2026'); // chronological order in output
    expect(may.paid).toBe(300);   // oldest gets funded first
    expect(june.paid).toBe(300);
    expect(r.outstanding).toBe(0);
    expect(r.credit).toBe(0);
  });

  it('payments beyond all charges become advance credit, never negative outstanding', () => {
    const r = computePerMonthPayments([inv({ month: 'June 2026', finalAmount: 300, amountPaid: 500 })]);
    expect(r.outstanding).toBe(0);
    expect(r.credit).toBe(200);
    expect(r.months[0].open).toBe(0);
  });

  it('VOIDED invoices are excluded from charges and totals', () => {
    const r = computePerMonthPayments([
      inv({ month: 'June 2026', finalAmount: 300, amountPaid: 0, status: 'Voided' }),
    ]);
    expect(r.totalCharged).toBe(0);
    expect(r.months.length).toBe(0);
    expect(r.outstanding).toBe(0);
  });

  it('excludes the carried "Outstanding balance" lump line from the month charge (no double-count)', () => {
    // finalAmount 500 = 300 own-month + 200 carried-forward balance line.
    const lineItemsExtra = JSON.stringify([{ description: 'Outstanding balance (May 2026)', amount: 200 }]);
    const r = computePerMonthPayments([
      inv({ month: 'June 2026', finalAmount: 500, amountPaid: 0, lineItemsExtra }),
    ]);
    expect(r.months[0].charge).toBe(300); // 500 − 200 lump
    expect(r.totalCharged).toBe(300);
  });

  it('a $0 month reads as nil, not open', () => {
    const r = computePerMonthPayments([inv({ month: 'June 2026', finalAmount: 0, amountPaid: 0 })]);
    expect(r.months[0].status).toBe('nil');
    expect(r.outstanding).toBe(0);
  });

  it('handles null finalAmount / amountPaid as zero', () => {
    const r = computePerMonthPayments([inv({ month: 'June 2026', finalAmount: null, amountPaid: null })]);
    expect(r.totalCharged).toBe(0);
    expect(r.totalPaid).toBe(0);
  });

  it('accepts lineItemsExtra as a parsed ARRAY (how /api/admin-invoices serves it) — lump still stripped', () => {
    const r = computePerMonthPayments([
      inv({ month: 'June 2026', finalAmount: 500, lineItemsExtra: [{ description: 'Outstanding balance (May 2026)', amount: 200 }] }),
    ]);
    expect(r.months[0].charge).toBe(300);
  });

  it('strips rows flagged previousBalance even without the "Outstanding balance" wording', () => {
    const r = computePerMonthPayments([
      inv({ month: 'July 2026', finalAmount: 660, lineItemsExtra: [{ description: 'June 2026', amount: 300, previousBalance: true }] }),
    ]);
    expect(r.months[0].charge).toBe(360);
  });
});

describe('single-invoice predicates — the admin page badges/filters', () => {
  it('invoiceOutstanding: only a Sent, un-settled invoice owes anything', () => {
    expect(invoiceOutstanding({ status: 'Sent', isPaid: false, finalAmount: 300, amountPaid: 100 })).toBe(200);
    expect(invoiceOutstanding({ status: 'Draft', isPaid: false, finalAmount: 300, amountPaid: 0 })).toBe(0);
    expect(invoiceOutstanding({ status: 'Sent', isPaid: true, finalAmount: 300, amountPaid: 0 })).toBe(0);
    expect(invoiceOutstanding({ status: 'Sent', isPaid: false, finalAmount: 300, amountPaid: 400 })).toBe(0); // never negative
  });

  it('the Is Paid checkbox is authoritative: checked + short payment is still settled/paid', () => {
    const forgiven = { status: 'Sent', isPaid: true, finalAmount: 300, amountPaid: 200 };
    expect(isSettled(forgiven)).toBe(true);
    expect(paymentState(forgiven)).toBe('paid');
    expect(matchesPaymentFilter(forgiven, 'paid')).toBe(true);
    expect(matchesPaymentFilter(forgiven, 'partial')).toBe(false);
  });

  it('unchecked but fully covered by payments is also settled (never nagged as partial)', () => {
    const covered = { status: 'Sent', isPaid: false, finalAmount: 300, amountPaid: 300 };
    expect(paymentState(covered)).toBe('paid');
    expect(matchesPaymentFilter(covered, 'paid')).toBe(true);
    expect(matchesPaymentFilter(covered, 'partial')).toBe(false);
  });

  it('partial and unpaid states require Sent status — drafts are not owed yet', () => {
    expect(paymentState({ status: 'Sent', isPaid: false, finalAmount: 300, amountPaid: 100 })).toBe('partial');
    expect(matchesPaymentFilter({ status: 'Sent', isPaid: false, finalAmount: 300, amountPaid: 100 }, 'partial')).toBe(true);
    expect(matchesPaymentFilter({ status: 'Sent', isPaid: false, finalAmount: 300, amountPaid: 0 }, 'unpaid')).toBe(true);
    expect(matchesPaymentFilter({ status: 'Draft', isPaid: false, finalAmount: 300, amountPaid: 0 }, 'unpaid')).toBe(false);
    expect(matchesPaymentFilter({ status: 'Draft', isPaid: false, finalAmount: 300, amountPaid: 0 }, 'paid')).toBe(false);
  });

  it("an unknown filter (the dropdown's 'all') matches everything", () => {
    expect(matchesPaymentFilter({ status: 'Draft', isPaid: false, finalAmount: 300, amountPaid: 0 }, 'all')).toBe(true);
  });
});

describe('otherMonthsOpen — the "other months outstanding" card badge', () => {
  // REGRESSION 2026-09-02 (the /admin/invoices double-count). Old carry-forward
  // data: June ($300) is still open in Airtable AND baked into July's stored
  // Final Amount ($660 = $360 own + $300 lump). The page used to sum raw
  // per-invoice outstanding → $960, contradicting the banner's correct $660 on
  // the same screen. A month consolidated into a later invoice must never be
  // counted as outstanding again.
  it('REGRESSION: a month consolidated into a later invoice is NOT counted again', () => {
    const invoices = [
      inv({ id: 'jun', month: 'June 2026', finalAmount: 300 }),
      inv({ id: 'jul', month: 'July 2026', finalAmount: 660,
            lineItemsExtra: JSON.stringify([{ description: 'Outstanding balance — June 2026', amount: 300 }]) }),
      inv({ id: 'aug', month: 'August 2026', finalAmount: 300 }),
    ];
    const r = otherMonthsOpen(invoices, 'August 2026');
    expect(r.total).toBe(660); // NOT 960
    expect(r.entries).toEqual([
      { month: 'July 2026', amount: 360 },  // own-month charge, lump stripped
      { month: 'June 2026', amount: 300 },  // counted once, newest first
    ]);
  });

  it('REGRESSION: paying the carrying invoice settles the consolidated month too', () => {
    // Parent paid July's $660 consolidated total. That covers June's $300 —
    // June must stop showing as outstanding even though its own Amount Paid is 0.
    const invoices = [
      inv({ id: 'jun', month: 'June 2026', finalAmount: 300 }),
      inv({ id: 'jul', month: 'July 2026', finalAmount: 660, amountPaid: 660, isPaid: true,
            lineItemsExtra: JSON.stringify([{ description: 'Outstanding balance — June 2026', amount: 300 }]) }),
    ];
    const r = otherMonthsOpen(invoices, 'August 2026');
    expect(r.total).toBe(0);
    expect(r.entries).toEqual([]);
  });

  it('excludes the current month from the RESULT but includes it in payment allocation', () => {
    // June's $400 payment first funds May ($300), leaving June $200 open.
    const invoices = [
      inv({ id: 'may', month: 'May 2026', finalAmount: 300 }),
      inv({ id: 'jun', month: 'June 2026', finalAmount: 300, amountPaid: 400 }),
    ];
    const r = otherMonthsOpen(invoices, 'June 2026');
    expect(r.entries).toEqual([]); // May settled by June's pooled payment; June itself excluded
    expect(r.total).toBe(0);
  });
});
