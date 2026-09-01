import { describe, it, expect } from 'vitest';
import { formatDueDate, formatMoney, amountDueHtml, paymentHtml } from './invoice-email-format';

describe('formatDueDate', () => {
  it('renders ISO as a human date, en-SG order', () => {
    expect(formatDueDate('2026-09-15')).toBe('15 September 2026');
  });
  it('passes empty through', () => {
    expect(formatDueDate('')).toBe('');
  });
  it('returns malformed input unchanged rather than "Invalid Date"', () => {
    expect(formatDueDate('soon')).toBe('soon');
  });
  // The regression: the live regular + amended templates interpolated the raw
  // field. A parent must never see an ISO date.
  it('never emits ISO shape', () => {
    expect(formatDueDate('2026-09-15')).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('formatMoney', () => {
  it('always two decimals ("$137.5" shipped from the regular template)', () => {
    expect(formatMoney(137.5)).toBe('137.50');
    expect(formatMoney(420)).toBe('420.00');
  });
});

describe('amountDueHtml', () => {
  it('positive: amount + formatted due date', () => {
    const h = amountDueHtml(560, '2026-09-15');
    expect(h).toContain('$560.00');
    expect(h).toContain('15 September 2026');
  });
  it('zero: no due-by clause, says no payment needed', () => {
    const h = amountDueHtml(0, '2026-09-15');
    expect(h).toContain('$0.00');
    expect(h).toContain('no payment needed');
    expect(h).not.toContain('due by');
  });
});

describe('paymentHtml', () => {
  it('positive: PayNow number + reference', () => {
    const h = paymentHtml(560, 'INV-2026-09-042');
    expect(h).toContain('91397985');
    expect(h).toContain('INV-2026-09-042');
  });
  // The regression: Jeanette Tan's $0 Sep 2026 invoice told her to PayNow $0.00.
  it('zero: no PayNow instructions at all', () => {
    const h = paymentHtml(0, 'INV-2026-09-042');
    expect(h).not.toContain('PayNow');
    expect(h).not.toContain('91397985');
    expect(h).toContain('No payment is needed');
  });
});
