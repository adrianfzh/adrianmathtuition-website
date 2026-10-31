// POST /api/app/session { email, password } → { accessToken, refreshToken, expiresAt, name }
//
// Sign-in for the Notebook iPad app (SPEC-STUDENT-APP.md §0c). The same email + password
// a student uses on the website; the app keeps the two keys it gets back in the iPad's
// keychain and sends the access one with every request (lib/portal-auth bearerAccount).
// Only students with a portal account get in — an Auth user without one is refused.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { anonClient } from '@/lib/app-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as { email?: unknown; password?: unknown }));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });

  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return NextResponse.json({ error: 'That email and password don’t match.' }, { status: 401 });
  }
  const { data: account } = await createServiceClient()
    .from('portal_accounts').select('id, display_name').eq('id', data.user.id).maybeSingle<{ id: string; display_name: string | null }>();
  if (!account) return NextResponse.json({ error: 'No student account for this email.' }, { status: 403 });

  return NextResponse.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
    name: account.display_name || '',
  });
}
