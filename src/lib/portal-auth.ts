// Auth helpers for /app/* pages and /api/portal/* routes.
//
// Perf (2026-08-28): the session lookups are wrapped in React cache() so ONE
// render pass (the /app layout + the page + any lib they both call) hits the
// Supabase Auth server and the portal_accounts table ONCE, however many
// callers ask. cache() is strictly per-request — nothing persists across
// requests, so there is no staleness: a student who reschedules sees fresh
// data on the very next navigation.
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from './supabase-server';
import { airtableRequest } from './airtable';

export interface PortalAccount {
  id: string;
  airtable_student_id: string;
  email: string;
  display_name: string | null;
  level: string | null;
  subjects: string[] | null;
  telegram_chat_id: number | null;
  prefs: Record<string, unknown>;
  created_at: string;
  last_seen_at: string | null;
}

/**
 * THE portal identity convention (2026-08-28, stranger accounts build).
 *
 * Every Supabase row a portal feature owns (paper_marking_runs.student_id,
 * portal_requests / portal_notes / portal_generation_log /
 * portal_generated_papers / notebook_entries / portal_assignments /
 * student_attempts `airtable_student_id`, portal_push_subscriptions) is keyed
 * on ONE string per student:
 *
 *   - tuition students → their Airtable Students record id (`rec…`), so every
 *     existing row and every admin surface keeps working unchanged;
 *   - self-serve strangers (airtable_student_id = '') → `acct:<account uuid>`.
 *
 * `acct:` can never collide with Airtable's `rec…` ids, and the uuid makes it
 * unique per account. Pure and total: any account row with `id` set gets a
 * non-empty identity. The stranger predicate is EXACTLY the complement of
 * portal-passes' isTuitionAccount (trimmed-empty counts as stranger), so the
 * pass gate and the identity can never disagree about one account. Callers
 * that GENUINELY need the Airtable record (lesson reads, invoice links) must
 * keep using `airtable_student_id` and guard the stranger marker themselves.
 */
export function portalIdentity(
  account: { id: string; airtable_student_id?: string | null },
): string {
  const airtableId = account.airtable_student_id;
  return airtableId && airtableId.trim() !== '' ? airtableId : `acct:${account.id}`;
}

// The validated session user, or null — the ONE getUser() per request.
// getUser() validates the JWT against the Supabase Auth server (unlike
// getSession(), which only trusts the cookie) — always use this on the server.
export const getSessionUser = cache(async () => {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

// The session's portal_accounts row, or null (no session / no linked row).
// Non-redirecting on purpose: the layout badge and the admin-browsable pages
// (plan, practice, print) need "null when anonymous", not a bounce.
export const sessionAccount = cache(async (): Promise<PortalAccount | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServer();
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<PortalAccount>();
  return account ?? null;
});

// Returns the authenticated Supabase user or redirects to /login.
export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

// The logged-in student's portal_accounts row; redirects to /login when
// there's no session or no linked account (an Auth user without a
// portal_accounts row shouldn't exist — treat as unauthenticated). This is
// what /app pages should call — none of them read the Airtable record, so
// they skip currentStudent()'s serial Airtable round-trip.
export async function currentAccount(): Promise<PortalAccount> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const account = await sessionAccount();
  if (!account) redirect('/login');
  return account;
}

// currentAccount() + the student's Airtable Students record. Kept for callers
// that need the Airtable fields; prefer currentAccount() when they don't.
// Redirect behaviour is identical to currentAccount().
export const currentStudent = cache(async () => {
  const user = await requireAuth();
  const account = await sessionAccount();
  if (!account) redirect('/login');

  // Airtable is best-effort: a deleted student record or an Airtable outage
  // must degrade the page (fall back to portal_accounts copies), never 500 it.
  // Stranger accounts (airtable_student_id = '') have no record to fetch — and
  // `/Students/` with an empty id would resolve to the LIST endpoint, so the
  // guard is correctness, not just a saved round-trip.
  let airtableRecord: { id: string; fields: Record<string, unknown> } | null = null;
  if (account.airtable_student_id) {
    try {
      airtableRecord = await airtableRequest('Students', `/${account.airtable_student_id}`);
    } catch { /* degrade gracefully */ }
  }

  return { user, account, airtableRecord };
});
