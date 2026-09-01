// Signed admin session tokens — replaces storing the raw ADMIN_PASSWORD in a
// JS-readable cookie. The token carries no secret material: `${expiry}.${hmac}`,
// verified server-side with a keyed HMAC and a timing-safe compare. Delivered
// as an httpOnly cookie so page JavaScript can never read it (XSS-proof), and
// all sessions can be revoked at once by rotating the secret.
import crypto from 'crypto';
import { safeEqual } from '@/lib/safe-equal';

export const ADMIN_SESSION_COOKIE = 'admin_session';
export const ADMIN_SESSION_DAYS = 30;

function secret(): string | null {
  // Dedicated secret preferred; SIGNUP_SECRET is an acceptable existing fallback
  // (rotating either invalidates all admin sessions — that's a feature).
  return process.env.ADMIN_SESSION_SECRET || process.env.SIGNUP_SECRET || null;
}

function hmac(payload: string, s: string): string {
  return crypto.createHmac('sha256', s).update(payload).digest('base64url');
}

export function signAdminSession(): string {
  const s = secret();
  if (!s) throw new Error('ADMIN_SESSION_SECRET / SIGNUP_SECRET not set');
  const expires = Date.now() + ADMIN_SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${hmac(`admin.${expires}`, s)}`;
}

export function verifyAdminSession(token: string | undefined | null): boolean {
  if (!token) return false;
  // No secret configured → no valid token can exist. Reject (route 401s)
  // rather than throw (a 500 on every request carrying a stale cookie);
  // signing still throws, since THAT misconfiguration must surface loudly.
  const s = secret();
  if (!s) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expires = Number(token.slice(0, dot));
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  return safeEqual(hmac(`admin.${expires}`, s), token.slice(dot + 1));
}
