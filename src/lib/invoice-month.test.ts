import { describe, it, expect } from 'vitest';
import { getInvoiceMonth } from './invoice-month';

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
