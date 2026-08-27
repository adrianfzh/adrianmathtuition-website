// HitPay v1 payment-confirmation webhook verification.
//
// When a payment completes, HitPay POSTs application/x-www-form-urlencoded
// fields to the payment request's webhook URL:
//
//   payment_id, payment_request_id, phone, amount, currency, status,
//   reference_number, hmac
//
// The `hmac` field authenticates the payload. Per HitPay's OFFICIAL scheme
// (verified 2026-08-28 against hit-pay/php-sdk `Client::generateSignatureArray`
// and cal.com's production hitpay webhook — both identical):
//
//   1. take every posted field EXCEPT `hmac`;
//   2. render each as `${key}${value}` — key concatenated DIRECTLY with value,
//      NO `=` sign and NO separator between pairs;
//   3. sort the pairs by key (byte order; all HitPay keys are ASCII);
//   4. HMAC-SHA256 the joined string, keyed with the account's webhook Salt
//      (dashboard → API Keys), hex-encoded lowercase.
//
// Note: an earlier internal spec described this as a "key=value" concatenation;
// the official SDK uses `${key}${value}` with no equals sign, which is what is
// implemented here. If a real webhook ever fails verification once keys are
// live, `hitpayCanonicalPayload` below is the ONLY place to adjust — the whole
// canonicalisation is deliberately that one small pure function.
//
// (HitPay ALSO has a newer "Events" webhook system that signs the raw JSON body
// via a `Hitpay-Signature` header — that is a different contract and is NOT
// what this module verifies. This module is for the per-payment-request
// `webhook` URL confirmation POST.)
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * The canonical string HitPay signs: all non-hmac fields as `${key}${value}`,
 * sorted by key, concatenated with no separator.
 *
 * Pure and tiny on purpose — if HitPay's live behaviour ever differs from the
 * SDK (see header comment), this is the single point of change.
 */
export function hitpayCanonicalPayload(fields: Record<string, string>): string {
  return Object.keys(fields)
    .filter((key) => key !== 'hmac')
    .sort() // UTF-16 code-unit order == byte order for HitPay's ASCII keys (PHP ksort equivalent)
    .map((key) => `${key}${fields[key]}`)
    .join('');
}

/** HMAC-SHA256 hex of the canonical payload, keyed with the webhook salt. */
export function computeHitPayHmac(fields: Record<string, string>, salt: string): string {
  return createHmac('sha256', salt).update(hitpayCanonicalPayload(fields), 'utf8').digest('hex');
}

/**
 * True iff `fields.hmac` matches the HMAC we compute over the other fields
 * with `salt`. Constant-time compare; case-insensitive on the hex digits
 * (HitPay sends lowercase, but don't fail an uppercased relay).
 */
export function verifyHitPayHmac(fields: Record<string, string>, salt: string): boolean {
  const received = fields['hmac'];
  if (!salt || typeof received !== 'string' || received.length === 0) return false;
  const expected = computeHitPayHmac(fields, salt);
  const a = Buffer.from(received.toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The documented v1 confirmation fields, camel-cased, plus the raw field map
 *  (verification must run over EVERYTHING HitPay posted, not a fixed list —
 *  a field we don't know about still participates in the signature). */
export interface HitPayWebhookPayload {
  paymentId: string;
  paymentRequestId: string;
  phone: string;
  amount: string; // decimal string as sent, e.g. "29.00" — never parseFloat for money display
  currency: string; // e.g. "sgd"
  status: string; // "completed" | "failed" | "pending"
  referenceNumber: string;
  hmac: string;
  /** Every string field as received (repeats collapsed to the LAST value,
   *  matching PHP's $_POST semantics — HitPay's reference implementation). */
  raw: Record<string, string>;
}

/**
 * Flatten a parsed form body (FormData or URLSearchParams — both iterate as
 * [key, value] pairs) into the typed payload. Non-string entries (File parts)
 * are ignored; HitPay sends urlencoded strings only.
 */
export function parseHitPayWebhook(
  form: Iterable<[string, FormDataEntryValue | string]>
): HitPayWebhookPayload {
  const raw: Record<string, string> = {};
  for (const [key, value] of form) {
    if (typeof value === 'string') raw[key] = value; // last occurrence wins
  }
  return {
    paymentId: raw['payment_id'] ?? '',
    paymentRequestId: raw['payment_request_id'] ?? '',
    phone: raw['phone'] ?? '',
    amount: raw['amount'] ?? '',
    currency: raw['currency'] ?? '',
    status: raw['status'] ?? '',
    referenceNumber: raw['reference_number'] ?? '',
    hmac: raw['hmac'] ?? '',
    raw,
  };
}
