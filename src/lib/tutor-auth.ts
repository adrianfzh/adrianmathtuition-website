// 🧑‍🏫 Tutor portal — who is signed in (server only). The rules are in lib/tutor-portal.ts.
//
// Tutors are NOT Supabase Auth users and NOT portal students: their session is our own
// signed httpOnly cookie, so a tutor can never reach /app or /admin, and a student or
// Adrian's admin cookie never counts as a tutor. Every tutor route calls currentTutor()
// and filters every query by the id it returns — never by an id from the request.
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { TUTOR_SESSION_COOKIE, TUTOR_SESSION_DAYS, verifyTutorSession } from '@/lib/tutor-portal';

export interface TutorAccount {
  id: string;
  email: string;
  display_name: string;
  monthly_paper_cap: number;
  active: boolean;
}

/** A dedicated secret is preferred; SIGNUP_SECRET is the existing fallback (the admin session uses it too, under another label). */
export function tutorSecret(): string | null {
  return process.env.TUTOR_SESSION_SECRET || process.env.SIGNUP_SECRET || null;
}

export async function currentTutor(): Promise<TutorAccount | null> {
  const jar = await cookies();
  const id = verifyTutorSession(jar.get(TUTOR_SESSION_COOKIE)?.value, tutorSecret());
  if (!id) return null;
  const { data } = await getSupabaseAdmin()
    .from('tutor_accounts')
    .select('id, email, display_name, monthly_paper_cap, active')
    .eq('id', id)
    .maybeSingle();
  const t = data as TutorAccount | null;
  return t && t.active ? t : null;
}

export const tutorCookie = (value: string) => ({
  name: TUTOR_SESSION_COOKIE,
  value,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: TUTOR_SESSION_DAYS * 86_400,
});
export const clearedTutorCookie = { ...tutorCookie(''), maxAge: 0 };
