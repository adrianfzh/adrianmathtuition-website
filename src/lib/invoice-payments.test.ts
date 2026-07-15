import { describe, it, expect } from 'vitest';
import { computePerMonthPayments, monthSortKey, type PaymentInvoiceInput } from './invoice-payments';

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
});
