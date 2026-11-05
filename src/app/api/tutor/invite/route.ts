// 🧑‍🏫 Accepting an invite. Adrian makes the account on /admin/tutors and sends the tutor
// the one-time link /tutor/invite/<token>; only the token's sha256 is stored.
//   GET  ?token=…              → { email, name } while the invite is good
//   POST { token, password }   → sets the password, spends the invite, signs in
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { hashPassword, hashToken, MIN_PASSWORD, signTutorSession } from '@/lib/tutor-portal';
import { tutorCookie, tutorSecret } from '@/lib/tutor-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function findInvite(token: unknown) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const { data } = await getSupabaseAdmin().from('tutor_accounts')
    .select('id, email, display_name, invite_expires_at, active')
    .eq('invite_token_hash', hashToken(token)).maybeSingle();
  const t = data as { id: string; email: string; display_name: string; invite_expires_at: string | null; active: boolean } | null;
  if (!t || !t.active || !t.invite_expires_at || Date.parse(t.invite_expires_at) < Date.now()) return null;
  return t;
}

const GONE = () => NextResponse.json({ error: 'This link has expired or was already used. Ask for a new one.' }, { status: 404 });

export async function GET(req: Request) {
  const t = await findInvite(new URL(req.url).searchParams.get('token'));
  if (!t) return GONE();
  return NextResponse.json({ email: t.email, name: t.display_name });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { token?: unknown; password?: unknown };
  const t = await findInvite(body.token);
  if (!t) return GONE();
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < MIN_PASSWORD) return NextResponse.json({ error: `Use at least ${MIN_PASSWORD} characters.` }, { status: 400 });
  const secret = tutorSecret();
  if (!secret) return NextResponse.json({ error: 'Sign-in is unavailable.' }, { status: 503 });
  const { error } = await getSupabaseAdmin().from('tutor_accounts')
    .update({ password_hash: hashPassword(password), invite_token_hash: null, invite_expires_at: null, last_login_at: new Date().toISOString() })
    .eq('id', t.id);
  if (error) return NextResponse.json({ error: 'Could not save — try again.' }, { status: 500 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(tutorCookie(signTutorSession(t.id, secret)));
  return res;
}
