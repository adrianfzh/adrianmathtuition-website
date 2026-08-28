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
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { createSupabaseServer } from './supabase-server';
import { airtableRequest } from './airtable';

/**
 * What the portal actually needs from a session: the auth user's uuid (every
 * portal_accounts row is keyed on it) and the email when the token carries
 * one. Deliberately NOT the full supabase User — the fast path below builds
 * this from locally-verified JWT claims without asking the Auth server.
 */
export interface SessionUser {
  id: string;
  email?: string;
}

// ── Local JWT verification (2026-08-29, "is the lagginess addressed?") ───────
//
// auth.getUser() round-trips to the Supabase Auth server on EVERY /app
// request — measured as most of the ~300-400ms warm TTFB before any byte.
// The project signs access tokens with an asymmetric ES256 key (verified
// against /auth/v1/.well-known/jwks.json), so the signature can be checked
// locally: jose's createRemoteJWKSet fetches the public keys once per warm
// lambda and caches them (~10 min), making steady-state verification pure
// CPU. Trade-off, accepted deliberately: a revoked session (sign-out
// elsewhere, password change) stays usable until the access token expires
// (≤1h) — the standard JWT trade, and account DELETION is still immediate
// because sessionAccount() re-reads portal_accounts on every request.
// Anything that fails the fast path (expired token that needs a refresh,
// JWKS hiccup, key rotation) falls back to the full getUser() round-trip, so
// the fast path can only ever save time, never admit a token getUser would
// reject... except within the ≤1h revocation window above.
const jwksUrl = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL is not set');
  return url.replace(/\/$/, '');
};
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(`${jwksUrl()}/auth/v1/.well-known/jwks.json`));
  return _jwks;
}

/**
 * Verified JWT claims → the session user, or null when the claims aren't a
 * real signed-in person (missing sub, or a non-user token like the anon key,
 * whose role is "anon"). Pure — exported for the unit test.
 */
export function claimsToSessionUser(payload: JWTPayload): SessionUser | null {
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  if (payload.role !== 'authenticated') return null;
  const email = (payload as { email?: unknown }).email;
  return { id: payload.sub, email: typeof email === 'string' && email ? email : undefined };
}

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
  /** Offboarding (2026-08-28): non-null once Adrian deactivates the account
   *  (POST /api/admin/passes {action:'deactivate'}). A deactivated ex-tuition
   *  account is no longer tuition-free (lib/portal-passes.isTuitionAccount)
   *  and falls through to the S$29 pass gate — but portalIdentity below keeps
   *  returning their Airtable rec id, so their history stays theirs. */
  deactivated_at: string | null;
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
 * non-empty identity. The stranger predicate is the complement of "has a
 * linked Airtable record" (trimmed-empty counts as stranger) — NOT of
 * portal-passes' isTuitionAccount, which since the offboarding build
 * (2026-08-28) also goes false for DEACTIVATED tuition accounts: identity
 * deliberately ignores deactivated_at, so an offboarded ex-student keeps their
 * `rec…` id (marked papers, notebook, attempts stay theirs) while the pass
 * gate makes them pay like a stranger. Callers that GENUINELY need the
 * Airtable record (lesson reads, invoice links) must keep using
 * `airtable_student_id` and guard the stranger marker themselves.
 */
export function portalIdentity(
  account: { id: string; airtable_student_id?: string | null },
): string {
  const airtableId = account.airtable_student_id;
  return airtableId && airtableId.trim() !== '' ? airtableId : `acct:${account.id}`;
}

// The validated session user, or null — ONE auth check per request.
// Fast path: read the cookie session locally (getSession does no network) and
// verify the access token's ES256 signature + expiry + issuer ourselves — see
// the header of this block. getSession() alone must NEVER be trusted (it only
// parses the cookie); it is safe here strictly because jwtVerify stands
// between it and the caller. Every miss falls back to getUser(), which also
// performs the token refresh when the access token has expired.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServer();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (token) {
      const { payload } = await jwtVerify(token, getJwks(), {
        issuer: `${jwksUrl()}/auth/v1`,
      });
      const user = claimsToSessionUser(payload);
      if (user) return user;
    }
  } catch { /* expired/rotated/unreachable — take the validated slow path */ }
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? undefined } : null;
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
  // An Auth user whose portal_accounts row is gone (deleted account, stale
  // cookie from an old build) must NOT bounce to plain /login — its
  // auto-redirect sees the session and sends them straight back here, a
  // visible /app ↔ /login flicker loop (Adrian hit it, 2026-08-29).
  // ?stale=1 tells /login to sign the dead session out first.
  if (!account) redirect('/login?stale=1');
  return account;
}

// currentAccount() + the student's Airtable Students record. Kept for callers
// that need the Airtable fields; prefer currentAccount() when they don't.
// Redirect behaviour is identical to currentAccount().
export const currentStudent = cache(async () => {
  const user = await requireAuth();
  const account = await sessionAccount();
  if (!account) redirect('/login?stale=1');

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
