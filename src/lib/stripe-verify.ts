// Stripe webhook signature verification — hand-rolled, zero dependencies (no
// stripe npm package; the webhook is the only Stripe surface the site touches
// server-side for now, and the scheme is small enough to own).
//
// Stripe's contract (docs: "Check the webhook signatures"):
//   header `stripe-signature`:  t=<unix seconds>,v1=<hex>[,v1=<hex>…][,v0=…]
//   signed_payload            = `${t}.${rawBody}`           (raw bytes, unmodified)
//   expected                  = HMAC-SHA256(STRIPE_WEBHOOK_SECRET, signed_payload) hex
// Valid when ANY v1 entry equals `expected` (multiple v1s appear while rolling
// the endpoint secret) AND |now − t| ≤ tolerance (replay guard, Stripe default
// 300s). The whsec_… secret string is the HMAC key VERBATIM — no base64
// decode (that's the Svix/Resend scheme, not Stripe's). v0 entries are a
// legacy scheme and are ignored.
//
// Everything here is pure (now injectable) — tested in stripe-verify.test.ts.
import { createHmac, timingSafeEqual } from 'crypto';

export const STRIPE_SIG_TOLERANCE_SECONDS = 300;

/** Parse `t=…,v1=…,v1=…,v0=…` into its parts. Unknown/malformed parts are
 *  ignored; a missing/non-numeric t comes back null. */
export function parseStripeSignatureHeader(header: string): { timestamp: number | null; v1: string[] } {
  let timestamp: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') {
      timestamp = /^\d+$/.test(value) ? Number(value) : null;
    } else if (key === 'v1' && value) {
      v1.push(value);
    }
  }
  return { timestamp, v1 };
}

function constantTimeHexEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a.toLowerCase(), 'utf8');
  const bb = Buffer.from(b.toLowerCase(), 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * True iff `header` proves `rawBody` was signed by `secret` within
 * `toleranceSeconds` of `now`. rawBody must be the request body EXACTLY as
 * received — re-serialised JSON will not verify.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  now: Date = new Date(),
  toleranceSeconds: number = STRIPE_SIG_TOLERANCE_SECONDS,
): boolean {
  if (!secret || !header) return false;
  const { timestamp, v1 } = parseStripeSignatureHeader(header);
  if (timestamp === null || v1.length === 0) return false;

  // Replay guard: |now − t| ≤ tolerance (inclusive), in whole seconds.
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - timestamp);
  if (skew > toleranceSeconds) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  return v1.some((candidate) => constantTimeHexEqual(candidate, expected));
}
