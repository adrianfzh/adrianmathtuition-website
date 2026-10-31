// POST /api/app/session/refresh { refreshToken } → { accessToken, refreshToken, expiresAt }
// The Notebook app's access key lasts an hour; it swaps the long-lived one for a fresh
// pair here (SPEC-STUDENT-APP.md §0c). A refused swap = the app shows Sign in again.
import { NextResponse } from 'next/server';
import { anonClient } from '@/lib/app-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as { refreshToken?: unknown }));
  const refresh_token = typeof body.refreshToken === 'string' ? body.refreshToken : '';
  if (!refresh_token) return NextResponse.json({ error: 'refreshToken required' }, { status: 400 });
  const { data, error } = await anonClient().auth.refreshSession({ refresh_token });
  if (error || !data.session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  return NextResponse.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
  });
}
