// Admin session login/logout.
// POST { password } → sets httpOnly signed admin_session cookie (30 days).
// DELETE → clears it.
// Pages should use this instead of storing the raw password in a cookie.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { signAdminSession, ADMIN_SESSION_COOKIE, ADMIN_SESSION_DAYS } from '@/lib/admin-session';

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return NextResponse.json({ error: 'ADMIN_PASSWORD not configured' }, { status: 500 });

  const a = Buffer.from(String(password ?? ''));
  const b = Buffer.from(expected);
  const okPw = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!okPw) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, signAdminSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}

// GET → { authed } — lets pages check the session without a password.
export async function GET(req: NextRequest) {
  const { verifyAdminSession } = await import('@/lib/admin-session');
  return NextResponse.json({ authed: verifyAdminSession(req.cookies.get(ADMIN_SESSION_COOKIE)?.value) });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
