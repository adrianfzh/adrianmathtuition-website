// POST /api/tutor/logout — clears the 🧑‍🏫 tutor session cookie.
import { NextResponse } from 'next/server';
import { clearedTutorCookie } from '@/lib/tutor-auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearedTutorCookie);
  return res;
}
