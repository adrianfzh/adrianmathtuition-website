// Server-side gate for the notes portal (server components only).
//
// The layout renders a login form when this is false; pages check it too so an
// unauthenticated request never reaches Supabase at all.

import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from './admin-session';

export async function isNotesAuthed(): Promise<boolean> {
  const jar = await cookies();
  try {
    return verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE)?.value);
  } catch {
    // Missing ADMIN_SESSION_SECRET / SIGNUP_SECRET — fail closed.
    return false;
  }
}
