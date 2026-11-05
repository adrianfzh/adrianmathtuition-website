// POST /api/tutor/login { email, password } — 🧑‍🏫 tutor portal sign-in (lib/tutor-auth.ts).
// One answer for every failure, so the door never says which emails exist.
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { cleanEmail, signTutorSession, verifyPassword } from '@/lib/tutor-portal';
import { tutorCookie, tutorSecret } from '@/lib/tutor-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO = () => NextResponse.json({ error: 'That email and password do not match.' }, { status: 401 });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { email?: unknown; password?: unknown };
  const email = cleanEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const secret = tutorSecret();
  if (!secret) return NextResponse.json({ error: 'Sign-in is unavailable.' }, { status: 503 });
  if (!email || !password) return NO();
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('tutor_accounts').select('id, password_hash, active').eq('email', email).maybeSingle();
  const t = data as { id: string; password_hash: string | null; active: boolean } | null;
  // Run the hash either way so a missing account answers as slowly as a wrong password.
  const ok = verifyPassword(password, t?.password_hash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  if (!t || !t.active || !ok) return NO();
  await sb.from('tutor_accounts').update({ last_login_at: new Date().toISOString() }).eq('id', t.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(tutorCookie(signTutorSession(t.id, secret)));
  return res;
}
