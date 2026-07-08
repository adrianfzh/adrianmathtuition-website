// Kiosk device authorisation.
// POST { password } → timing-safe compare to ADMIN_PASSWORD; on match set the
//   signed httpOnly kiosk_session cookie (~180 days). Mismatch → 401.
// GET ?auth=check → { ok: true } if the device already carries a valid kiosk
//   session, else 401. Lets the page skip the setup screen on a known iPad.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  signKioskSession,
  verifyKioskSession,
  KIOSK_SESSION_COOKIE,
  KIOSK_SESSION_DAYS,
} from '@/lib/kiosk-session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return NextResponse.json({ error: 'ADMIN_PASSWORD not configured' }, { status: 500 });

  const a = Buffer.from(String(password ?? ''));
  const b = Buffer.from(expected);
  const okPw = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!okPw) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(KIOSK_SESSION_COOKIE, signKioskSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: KIOSK_SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}

export async function GET(req: NextRequest) {
  const ok = verifyKioskSession(req.cookies.get(KIOSK_SESSION_COOKIE)?.value);
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true });
}
