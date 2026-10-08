import { describe, it, expect } from 'vitest';
import { invoiceReadyValues, paymentReceivedValues, shortDue } from './wa-notify';
import { verifyViewToken } from './view-token';

const SECRET = 'test-signup-secret';
const NOW = Date.UTC(2026, 9, 8, 2, 0, 0);
const INV = { id: 'recABC12345678901', studentName: 'Marcus Tan', month: 'November 2026', finalAmount: 480, dueDate: '2026-11-07', paymentRef: 'MARCUS TAN – NOVEMBER 2026' };

describe('the WhatsApp "invoice ready" message', () => {
  it('gives the six values in the template\'s order, money to the cent', () => {
    const v = invoiceReadyValues(INV, SECRET, NOW)!;
    expect(v.slice(0, 5)).toEqual(['November 2026', 'Marcus Tan', '480.00', '7 Nov', 'MARCUS TAN – NOVEMBER 2026']);
    expect(invoiceReadyValues({ ...INV, finalAmount: 412.5 }, SECRET, NOW)![2]).toBe('412.50');
  });

  it('the last value is a private link that opens THIS invoice and nothing else', () => {
    const v = invoiceReadyValues(INV, SECRET, NOW)!;
    expect(verifyViewToken(v[5], SECRET, NOW)).toEqual({ kind: 'invoice', id: INV.id });
  });

  it('says nothing for a $0 or credit invoice, or when a value is missing', () => {
    expect(invoiceReadyValues({ ...INV, finalAmount: 0 }, SECRET, NOW)).toBeNull();
    expect(invoiceReadyValues({ ...INV, finalAmount: -50 }, SECRET, NOW)).toBeNull();
    expect(invoiceReadyValues({ ...INV, dueDate: '' }, SECRET, NOW)).toBeNull();
    expect(invoiceReadyValues({ ...INV, studentName: '' }, SECRET, NOW)).toBeNull();
    expect(invoiceReadyValues({ ...INV, id: 'nope' }, SECRET, NOW)).toBeNull();
    expect(invoiceReadyValues(INV, '', NOW)).toBeNull();
  });

  it('writes the due date the short way', () => {
    expect(shortDue('2026-11-07')).toBe('7 Nov');
    expect(shortDue('2026-12-31')).toBe('31 Dec');
    expect(shortDue('7 November')).toBe('7 November');
    expect(shortDue(undefined)).toBe('');
  });
});

describe('the WhatsApp "payment received" message', () => {
  const P = { studentName: 'Marcus Tan', month: 'November 2026', finalAmount: 480, paymentAmount: 480, isFullPayment: true };

  it('gives amount, student, month for an invoice paid in full', () => {
    expect(paymentReceivedValues(P)).toEqual(['480.00', 'Marcus Tan', 'November 2026']);
    // No amount passed (the "mark fully paid" button) → the invoice's own amount.
    expect(paymentReceivedValues({ ...P, paymentAmount: undefined })).toEqual(['480.00', 'Marcus Tan', 'November 2026']);
  });

  it('says nothing for a part payment — "no further action is needed" would be untrue', () => {
    expect(paymentReceivedValues({ ...P, isFullPayment: false, paymentAmount: 200 })).toBeNull();
    expect(paymentReceivedValues({ ...P, isFullPayment: undefined })).toBeNull();
  });

  it('says nothing for a correction or a payment with credit — the e-mail explains those', () => {
    expect(paymentReceivedValues({ ...P, correction: true })).toBeNull();
    expect(paymentReceivedValues({ ...P, isOverpayment: true })).toBeNull();
  });

  it('reads true/false sent as words the same way', () => {
    expect(paymentReceivedValues({ ...P, isFullPayment: 'true' })).toEqual(['480.00', 'Marcus Tan', 'November 2026']);
    expect(paymentReceivedValues({ ...P, isFullPayment: 'false' })).toBeNull();
    expect(paymentReceivedValues({ ...P, isOverpayment: 'true' })).toBeNull();
    expect(paymentReceivedValues({ ...P, correction: 'false' })).toEqual(['480.00', 'Marcus Tan', 'November 2026']);
  });

  it('says nothing without an amount or a name', () => {
    expect(paymentReceivedValues({ ...P, paymentAmount: 0, finalAmount: 0 })).toBeNull();
    expect(paymentReceivedValues({ ...P, studentName: '' })).toBeNull();
  });
});
