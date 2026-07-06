// Auth helpers for /app/* pages and /api/portal/* routes.
import { redirect } from 'next/navigation';
import { createSupabaseServer } from './supabase-server';
import { airtableRequest } from './airtable';

// Returns the authenticated Supabase user or redirects to /login.
// getUser() validates the JWT against the Supabase Auth server (unlike
// getSession(), which only trusts the cookie) — always use this on the server.
export async function requireAuth() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user;
}

export interface PortalAccount {
  id: string;
  airtable_student_id: string;
  email: string;
  display_name: string | null;
  level: string | null;
  telegram_chat_id: number | null;
  prefs: Record<string, unknown>;
  created_at: string;
  last_seen_at: string | null;
}

// The logged-in student's portal_accounts row + their Airtable Students record.
// Redirects to /login when there's no session or no linked account (an Auth
// user without a portal_accounts row shouldn't exist — treat as unauthenticated).
export async function currentStudent() {
  const user = await requireAuth();
  const supabase = await createSupabaseServer();
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('*')
    .eq('id', user.id)
    .single<PortalAccount>();
  if (!account) redirect('/login');

  const airtableRecord = (await airtableRequest(
    'Students',
    `/${account.airtable_student_id}`
  )) as { id: string; fields: Record<string, unknown> };

  return { user, account, airtableRecord };
}
