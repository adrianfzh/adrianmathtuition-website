// Server-side gates for the notes portal (server components only).
//
// Two audiences since 2026-08-14 ("the /notes we did should be released"):
//   isNotesAuthed()  — Adrian's admin cookie. Gates review UI (ReviewBar,
//                      BlockReview, pending badges) and pending-content access.
//   isNotesViewer()  — admin OR a logged-in portal student. Gates whether the
//                      notes shell renders at all; students only ever see
//                      approved sections (the page component checks admin
//                      separately for anything review-related).
//
// The layout renders a login form when the viewer check fails; pages check it
// too so an unauthenticated request never reaches note content at all.

import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from './admin-session';
import { createSupabaseServer } from './supabase-server';
import { getSessionUser } from './portal-auth';

export async function isNotesAuthed(): Promise<boolean> {
  const jar = await cookies();
  try {
    return verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE)?.value);
  } catch {
    // Missing ADMIN_SESSION_SECRET / SIGNUP_SECRET — fail closed.
    return false;
  }
}

// Non-redirecting portal-session check: a validated Supabase user WITH a
// portal_accounts row (an Auth user without one shouldn't exist — fail closed).
// Rides portal-auth's locally-verified fast path (and its per-request cache),
// so /notes stops paying its own Auth-server round-trip per render.
export async function hasPortalSession(): Promise<boolean> {
  try {
    const user = await getSessionUser();
    if (!user) return false;
    const supabase = await createSupabaseServer();
    const { data: account } = await supabase
      .from('portal_accounts')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    return !!account;
  } catch {
    return false;
  }
}

export async function isNotesViewer(): Promise<boolean> {
  return (await isNotesAuthed()) || (await hasPortalSession());
}
