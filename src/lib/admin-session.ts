// Signed admin session tokens — replaces storing the raw ADMIN_PASSWORD in a
// JS-readable cookie. The token carries no secret material: `${expiry}.${hmac}`,
// verified server-side with a keyed HMAC and a timing-safe compare. Delivered
// as an httpOnly cookie so page JavaScript can never read it (XSS-proof), and
// all sessions can be revoked at once by rotating the secret.
import crypto from 'crypto';

export const ADMIN_SESSION_COOKIE = 'admin_session';
export const ADMIN_SESSION_DAYS = 30;

function secret(): string {
  // Dedicated secret preferred; SIGNUP_SECRET is an acceptable existing fallback
  // (rotating either invalidates all admin sessions — that's a feature).
  const s = process.env.ADMIN_SESSION_SECRET || process.env.SIGNUP_SECRET;
  if (!s) throw new Error('ADMIN_SESSION_SECRET / SIGNUP_SECRET not set');
  return s;
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function signAdminSession(): string {
  const expires = Date.now() + ADMIN_SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `admin.${expires}`;
  return `${expires}.${hmac(payload)}`;
}

export function verifyAdminSession(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expires = Number(token.slice(0, dot));
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = hmac(`admin.${expires}`);
  const given = token.slice(dot + 1);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
