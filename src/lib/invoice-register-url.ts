import crypto from 'crypto';

/**
 * Build a signed per-invoice registration URL.
 * The URL is valid for 30 days; when clicked it mints a fresh 7-day registration token.
 * Returns '' if SIGNUP_SECRET is not configured so callers can safely fall back.
 */
export function buildRegisterUrl(studentId: string): string {
  const secret = process.env.SIGNUP_SECRET;
  if (!secret || !studentId) return '';
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${studentId}:${expires}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  const base = process.env.SITE_BASE_URL || 'https://adrianmathtuition.com';
  const params = new URLSearchParams({ student: studentId, exp: String(expires), sig });
  return `${base}/invoice-register?${params.toString()}`;
}
