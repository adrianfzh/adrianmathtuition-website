// Signed kiosk-device session — authorises a single iPad "print kiosk" so the
// question-bank endpoints are never a public scraping API. Mirrors
// lib/admin-session.ts: the token carries no secret material (`${expiry}.${hmac}`),
// is verified server-side with a keyed HMAC + timing-safe compare, and is
// delivered as an httpOnly cookie (JS can never read it). Adrian authorises the
// device ONCE with the admin password; students then use the kiosk freely.
//
// Long expiry (~180 days) — the iPad stays logged in on the stand. Rotating the
// secret (ADMIN_SESSION_SECRET / SIGNUP_SECRET) revokes every kiosk at once.
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { verifyAdminAuth } from './schedule-helpers';

export const KIOSK_SESSION_COOKIE = 'kiosk_session';
export const KIOSK_SESSION_DAYS = 180;

// Kiosk level tokens (fixed list — the tutor teaches E Math / A Math / H2) mapped
// to the underlying DB keys. `topicsKey` is the subgroups.level value the
// practice_topics RPC expects; `questionLevels` are the practice_questions.level
// values a worksheet may draw from. NOTE the H2 token is `JC2` (UI-facing) but
// subgroups store H2 topics under `JC`, and practice_questions may use JC/JC1/JC2.
export const KIOSK_LEVELS: Record<
  string,
  { label: string; topicsKey: string; questionLevels: string[] }
> = {
  EM: { label: 'E Math', topicsKey: 'EM', questionLevels: ['EM'] },
  AM: { label: 'A Math', topicsKey: 'AM', questionLevels: ['AM'] },
  JC2: { label: 'H2 Math', topicsKey: 'JC', questionLevels: ['JC', 'JC1', 'JC2'] },
};

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET || process.env.SIGNUP_SECRET;
  if (!s) throw new Error('ADMIN_SESSION_SECRET / SIGNUP_SECRET not set');
  return s;
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function signKioskSession(): string {
  const expires = Date.now() + KIOSK_SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${hmac(`kiosk.${expires}`)}`;
}

export function verifyKioskSession(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expires = Number(token.slice(0, dot));
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = hmac(`kiosk.${expires}`);
  const given = token.slice(dot + 1);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// True if the request carries a valid kiosk cookie OR admin auth (Bearer /
// admin_session). Lets Adrian hit the kiosk APIs directly for testing.
export function verifyKioskAuth(req: NextRequest): boolean {
  if (verifyKioskSession(req.cookies.get(KIOSK_SESSION_COOKIE)?.value)) return true;
  return verifyAdminAuth(req);
}
