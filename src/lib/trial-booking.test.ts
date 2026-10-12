import { describe, it, expect } from 'vitest';
import { trialFeeCents, payPageAction, trialCreditLine, refundCheck, TRIAL_PAY_WINDOW_MS, type TrialRow } from './trial-booking';

const base: TrialRow = { id: 'x', status: 'booked', amount_cents: 8000, created_at: '2026-10-12T00:00:00Z', payment_intent: 'pi_1' };
const now = Date.parse('2026-10-12T01:00:00Z');

describe('trialFeeCents', () => {
  it('Secondary is $80, JC is $90', () => {
    expect(trialFeeCents('Sec 1')).toBe(8000);
    expect(trialFeeCents('Sec 4')).toBe(8000);
    expect(trialFeeCents('JC1')).toBe(9000);
    expect(trialFeeCents('jc2')).toBe(9000);
  });
});

describe('payPageAction', () => {
  it('opens checkout only while awaiting payment and inside 48 hours', () => {
    expect(payPageAction({ ...base, status: 'awaiting_payment', payment_intent: null }, now)).toBe('checkout');
    expect(payPageAction({ ...base, status: 'awaiting_payment', payment_intent: null }, now + TRIAL_PAY_WINDOW_MS)).toBe('expired');
    expect(payPageAction(base, now)).toBe('paid');
    expect(payPageAction({ ...base, status: 'expired', payment_intent: null }, now)).toBe('expired');
    expect(payPageAction(null, now)).toBe('missing');
  });
});

describe('trialCreditLine', () => {
  it('takes the paid fee off the first bill as a minus line', () => {
    expect(trialCreditLine(base)).toEqual({ description: 'Trial lesson fee (already paid)', amount: -80 });
    expect(trialCreditLine({ ...base, amount_cents: 9000, status: 'continuing' })!.amount).toBe(-90);
  });
  it('never credits twice, an unpaid booking, or a refunded fee', () => {
    expect(trialCreditLine({ ...base, invoice_id: 'rec1' })).toBeNull();
    expect(trialCreditLine({ ...base, status: 'signed_up' })).toBeNull();
    expect(trialCreditLine({ ...base, payment_intent: null })).toBeNull();
    expect(trialCreditLine({ ...base, refunded_at: '2026-10-13T00:00:00Z' })).toBeNull();
    expect(trialCreditLine({ ...base, status: 'refunded' })).toBeNull();
    expect(trialCreditLine(null)).toBeNull();
  });
});

describe('refundCheck', () => {
  it('allows a refund of a paid, unused fee', () => {
    expect(refundCheck({ ...base, status: 'declined' })).toEqual({ ok: true });
    expect(refundCheck({ ...base, status: 'no_show' })).toEqual({ ok: true });
  });
  it('refuses a second refund, an unpaid booking, or a fee already on the first bill', () => {
    expect(refundCheck({ ...base, status: 'refunded', refunded_at: 'x' }).ok).toBe(false);
    expect(refundCheck({ ...base, payment_intent: null }).ok).toBe(false);
    expect(refundCheck({ ...base, status: 'signed_up', invoice_id: 'rec1' }).ok).toBe(false);
    expect(refundCheck({ ...base, status: 'awaiting_payment' }).ok).toBe(false);
  });
});
