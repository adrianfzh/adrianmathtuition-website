import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  hitpayCanonicalPayload,
  computeHitPayHmac,
  verifyHitPayHmac,
  parseHitPayWebhook,
} from './hitpay';

const SALT = 'test-salt-9WFtBundmoZQIRDN';

// A realistic v1 confirmation payload (the documented seven fields).
function fixtureFields(): Record<string, string> {
  return {
    payment_id: '9wfr2hAeQ6bmDFYHRRVoLNQCizq',
    payment_request_id: '9wfqzM6DkFERrBy4EDXfHTLZUpt',
    phone: '',
    amount: '29.00',
    currency: 'SGD',
    status: 'completed',
    reference_number: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  };
}

/** Independent re-implementation of HitPay's PHP sample (generateSignatureArray):
 *  `${key}${value}` per field, ksort, implode(""), hash_hmac sha256 — used to
 *  cross-check the lib "both directions". */
function referenceHmac(fields: Record<string, string>, salt: string): string {
  const src: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) if (k !== 'hmac') src[k] = `${k}${v}`;
  const payload = Object.keys(src).sort().map((k) => src[k]).join('');
  return createHmac('sha256', salt).update(payload, 'utf8').digest('hex');
}

describe('hitpayCanonicalPayload', () => {
  it('sorts keys alphabetically and concatenates key directly with value (no "=", no separator)', () => {
    expect(hitpayCanonicalPayload({ b: '2', a: '1', c: '3' })).toBe('a1b2c3');
  });

  it('excludes the hmac field itself', () => {
    expect(hitpayCanonicalPayload({ a: '1', hmac: 'deadbeef' })).toBe('a1');
  });

  it('keeps empty values in place (HitPay sends phone as an empty string)', () => {
    expect(hitpayCanonicalPayload({ phone: '', amount: '29.00' })).toBe('amount29.00phone');
  });

  it('matches the exact canonical string for the documented field set', () => {
    // Hand-derived: fields sorted → amount, currency, payment_id,
    // payment_request_id, phone, reference_number, status.
    expect(hitpayCanonicalPayload(fixtureFields())).toBe(
      'amount29.00' +
      'currencySGD' +
      'payment_id9wfr2hAeQ6bmDFYHRRVoLNQCizq' +
      'payment_request_id9wfqzM6DkFERrBy4EDXfHTLZUpt' +
      'phone' +
      'reference_number3f2504e0-4f89-41d3-9a0c-0305e82c3301' +
      'statuscompleted'
    );
  });
});

describe('verifyHitPayHmac', () => {
  it('accepts a payload signed by the independent reference implementation', () => {
    const fields = fixtureFields();
    const signed = { ...fields, hmac: referenceHmac(fields, SALT) };
    expect(verifyHitPayHmac(signed, SALT)).toBe(true);
  });

  it('round-trips the other direction: our computeHitPayHmac matches the reference', () => {
    const fields = fixtureFields();
    expect(computeHitPayHmac(fields, SALT)).toBe(referenceHmac(fields, SALT));
  });

  it('rejects a tampered amount (signature no longer matches)', () => {
    const fields = fixtureFields();
    const signed: Record<string, string> = { ...fields, hmac: referenceHmac(fields, SALT) };
    signed.amount = '0.01';
    expect(verifyHitPayHmac(signed, SALT)).toBe(false);
  });

  it('rejects a field ADDED after signing — every non-hmac field participates', () => {
    const fields = fixtureFields();
    const signed = { ...fields, hmac: referenceHmac(fields, SALT), injected: 'x' };
    expect(verifyHitPayHmac(signed, SALT)).toBe(false);
  });

  it('rejects the wrong salt', () => {
    const fields = fixtureFields();
    const signed = { ...fields, hmac: referenceHmac(fields, SALT) };
    expect(verifyHitPayHmac(signed, 'some-other-salt')).toBe(false);
  });

  it('rejects a missing or empty hmac field, and an empty salt', () => {
    expect(verifyHitPayHmac(fixtureFields(), SALT)).toBe(false);
    expect(verifyHitPayHmac({ ...fixtureFields(), hmac: '' }, SALT)).toBe(false);
    const signed = { ...fixtureFields(), hmac: referenceHmac(fixtureFields(), SALT) };
    expect(verifyHitPayHmac(signed, '')).toBe(false);
  });

  it('rejects a truncated / wrong-length hmac without throwing', () => {
    const signed = { ...fixtureFields(), hmac: 'abc123' };
    expect(verifyHitPayHmac(signed, SALT)).toBe(false);
  });

  it('accepts an uppercased hex digest (case-insensitive compare)', () => {
    const fields = fixtureFields();
    const signed = { ...fields, hmac: referenceHmac(fields, SALT).toUpperCase() };
    expect(verifyHitPayHmac(signed, SALT)).toBe(true);
  });
});

describe('parseHitPayWebhook', () => {
  it('reads the documented fields from URLSearchParams (form-encoded body)', () => {
    const fields = fixtureFields();
    const body = new URLSearchParams({ ...fields, hmac: 'ff00' });
    const p = parseHitPayWebhook(body);
    expect(p.paymentId).toBe(fields.payment_id);
    expect(p.paymentRequestId).toBe(fields.payment_request_id);
    expect(p.amount).toBe('29.00');
    expect(p.currency).toBe('SGD');
    expect(p.status).toBe('completed');
    expect(p.referenceNumber).toBe(fields.reference_number);
    expect(p.hmac).toBe('ff00');
    expect(p.phone).toBe('');
  });

  it('keeps unknown extra fields in raw so verification covers them', () => {
    const body = new URLSearchParams({ a: '1', hmac: 'x', future_field: 'y' });
    expect(parseHitPayWebhook(body).raw).toEqual({ a: '1', hmac: 'x', future_field: 'y' });
  });

  it('collapses repeated keys to the LAST value (PHP $_POST semantics)', () => {
    const body = new URLSearchParams('status=pending&status=completed');
    expect(parseHitPayWebhook(body).status).toBe('completed');
  });

  it('missing fields come back as empty strings, never undefined', () => {
    const p = parseHitPayWebhook(new URLSearchParams(''));
    expect(p.paymentId).toBe('');
    expect(p.status).toBe('');
    expect(p.raw).toEqual({});
  });

  it('accepts FormData and ignores non-string (File) entries', () => {
    const fd = new FormData();
    fd.append('status', 'completed');
    fd.append('upload', new Blob(['x']), 'x.bin');
    const p = parseHitPayWebhook(fd as Iterable<[string, FormDataEntryValue]>);
    expect(p.status).toBe('completed');
    expect(Object.keys(p.raw)).toEqual(['status']);
  });

  it('a signed body parsed from its urlencoded form still verifies (end-to-end)', () => {
    const fields = fixtureFields();
    const signed = { ...fields, hmac: referenceHmac(fields, SALT) };
    const wire = new URLSearchParams(signed).toString(); // what HitPay actually sends
    const parsed = parseHitPayWebhook(new URLSearchParams(wire));
    expect(verifyHitPayHmac(parsed.raw, SALT)).toBe(true);
  });
});
