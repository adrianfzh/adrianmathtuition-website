import { describe, it, expect } from 'vitest';
import { getInvoiceMonth, displaySpanMonth } from './invoice-month';

describe('getInvoiceMonth — always the month AFTER today', () => {
  it('mid-year: April → May', () => {
    const r = getInvoiceMonth(new Date(2026, 3, 15)); // 15 Apr 2026
    expect(r.label).toBe('May 2026');
    expect(r.year).toBe(2026);
    expect(r.month).toBe(5);
  });

  it('December rolls over to next January', () => {
    const r = getInvoiceMonth(new Date(2026, 11, 20)); // 20 Dec 2026
    expect(r.label).toBe('January 2027');
    expect(r.year).toBe(2027);
    expect(r.month).toBe(1);
  });

  it('firstDay and lastDay bound the invoice month', () => {
    const r = getInvoiceMonth(new Date(2026, 0, 10)); // 10 Jan → Feb 2026
    expect(r.label).toBe('February 2026');
    expect(r.firstDay.getDate()).toBe(1);
    expect(r.firstDay.getMonth()).toBe(1); // February (0-indexed)
    expect(r.lastDay.getMonth()).toBe(1);  // still February
    expect(r.lastDay.getDate()).toBe(28);  // 2026 is not a leap year
  });

  it('is stable regardless of the day within the month', () => {
    expect(getInvoiceMonth(new Date(2026, 5, 1)).label)
      .toBe(getInvoiceMonth(new Date(2026, 5, 30)).label);
  });
});

describe('displaySpanMonth — combined first invoices show the full period', () => {
  const kieranItems = JSON.stringify([
    { date: '2026-07-17' }, { date: '2026-07-24' }, { date: '2026-07-31' },
    { date: '2026-08-07' }, { date: '2026-08-14' }, { date: '2026-08-21' }, { date: '2026-08-28' },
  ]);

  // REGRESSION — Kieran Lai: invoice filed under "August 2026" but billing July
  // lessons must READ "July–August 2026" (subject, filename, PDF header, PayNow ref).
  it('spans back when line items start before the stored month', () => {
    expect(displaySpanMonth('August 2026', kieranItems)).toBe('July–August 2026');
  });

  it('leaves normal single-month invoices untouched', () => {
    expect(displaySpanMonth('August 2026', JSON.stringify([{ date: '2026-08-07' }]))).toBe('August 2026');
  });

  it('spans across a year boundary', () => {
    expect(displaySpanMonth('January 2027', JSON.stringify([{ date: '2026-12-20' }]))).toBe('December–January 2027');
  });

  it('is safe on missing/garbage line items', () => {
    expect(displaySpanMonth('August 2026', undefined)).toBe('August 2026');
    expect(displaySpanMonth('August 2026', 'not json')).toBe('August 2026');
    expect(displaySpanMonth('August 2026', '[]')).toBe('August 2026');
    expect(displaySpanMonth('', kieranItems)).toBe('');
  });
});
