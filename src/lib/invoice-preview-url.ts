import crypto from 'crypto';

// Signed, expiring URL for the invoice PDF preview. The preview route normally
// authorizes via the admin Bearer header or the `admin_pw` cookie, but a link
// tapped from a Telegram notification opens in Telegram's in-app browser, which
// has neither — so those taps 401'd. A signature scoped to the single invoice id
// lets the route authorize the tap without exposing admin credentials.
// Mirrors buildRegisterUrl's HMAC-over-SIGNUP_SECRET pattern.

const PREVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function signPreviewInvoice(invoiceId: string, expires: number): string {
  const secret = process.env.SIGNUP_SECRET || '';
  return crypto.createHmac('sha256', secret).update(`preview:${invoiceId}:${expires}`).digest('hex').slice(0, 32);
}

/** True if (id, exp, sig) is a valid, unexpired preview signature. */
export function verifyPreviewInvoice(invoiceId: string, exp: string | null, sig: string | null): boolean {
  if (!process.env.SIGNUP_SECRET || !invoiceId || !exp || !sig) return false;
  const expires = Number(exp);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = signPreviewInvoice(invoiceId, expires);
  // Both are 32-char hex of equal length — timing-safe compare.
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/**
 * Absolute, signed preview URL. Falls back to an unsigned URL (cookie-only auth)
 * if SIGNUP_SECRET is unset so callers still get a working admin-browser link.
 */
export function buildPreviewInvoiceUrl(invoiceId: string, baseUrl: string): string {
  if (!process.env.SIGNUP_SECRET || !invoiceId) {
    return `${baseUrl}/api/preview-invoice?id=${invoiceId}`;
  }
  const expires = Date.now() + PREVIEW_TTL_MS;
  const params = new URLSearchParams({ id: invoiceId, exp: String(expires), sig: signPreviewInvoice(invoiceId, expires) });
  return `${baseUrl}/api/preview-invoice?${params.toString()}`;
}
