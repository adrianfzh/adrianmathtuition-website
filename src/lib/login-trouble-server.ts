// The writes behind lib/login-trouble.ts (12 Oct 2026). Best-effort by contract: a failed
// write is logged to the console and never surfaces to the visitor.
import { createServiceClient } from './supabase-server';
import { getSessionUser, portalIdentity, staleTokenUserId } from './portal-auth';
import { sgtDayStart } from './sgt';
import {
  ACCOUNT_DAILY_CAP, ANON_DAILY_CAP, ANON_IDENTITY, HANDIN_LOGGED_OUT_KIND, HANDIN_SEEN_COOKIE,
  HANDIN_SEEN_SECONDS, LOGIN_FAILED_KIND, accessTokenFromAuthCookies, classifyLoginFailure,
  deviceFamily, normaliseEmail,
} from './login-trouble';

type CookieReader = { getAll(): { name: string; value: string }[]; get(name: string): { value: string } | undefined };

async function underCap(identity: string, kind: string): Promise<boolean> {
  const { count } = await createServiceClient().from('portal_event_log')
    .select('id', { count: 'exact', head: true })
    .eq('identity', identity).eq('kind', kind)
    .gte('created_at', sgtDayStart().toISOString());
  return (count ?? 0) < (identity === ANON_IDENTITY ? ANON_DAILY_CAP : ACCOUNT_DAILY_CAP);
}

/** A refused password login. Stores the reason, the device family and the account's identity
 *  when the email belongs to an account — never the password, never an unknown email. */
export async function recordLoginFailed(input: { email: unknown; code: unknown; status: unknown; ua: string | null }): Promise<void> {
  try {
    const svc = createServiceClient();
    const email = normaliseEmail(input.email);
    let account: { id: string; airtable_student_id: string | null; deactivated_at: string | null } | null = null;
    if (email) {
      const { data } = await svc.from('portal_accounts').select('id, airtable_student_id, deactivated_at')
        .eq('email', email).limit(1).maybeSingle();
      account = data ?? null;
    }
    const reason = classifyLoginFailure({ code: input.code, status: input.status }, account);
    const identity = account ? portalIdentity(account) : ANON_IDENTITY;
    if (!(await underCap(identity, LOGIN_FAILED_KIND))) return;
    await svc.from('portal_event_log').insert({
      identity, kind: LOGIN_FAILED_KIND, detail: { reason, device: deviceFamily(input.ua) },
    });
  } catch (e) {
    console.error('[login-trouble] login_failed write failed:', (e as Error).message);
  }
}

/**
 * A visit to the hand-in page, or a hand-in request, with no live session. Returns true when
 * a row was written (the caller then sets HANDIN_SEEN_COOKIE for 10 minutes). Reads the raw
 * cookies FIRST — a session lookup may clear a dead cookie.
 */
export async function recordHandinLoggedOut(cookies: CookieReader, ua: string | null, via: 'page' | 'upload' | 'submit'): Promise<boolean> {
  try {
    if (cookies.get(HANDIN_SEEN_COOKIE)) return false;
    const token = accessTokenFromAuthCookies(cookies.getAll());
    if (via === 'page' && await getSessionUser()) return false; // actually logged in
    const svc = createServiceClient();
    let identity = ANON_IDENTITY;
    const userId = token ? await staleTokenUserId(token) : null;
    if (userId) {
      const { data } = await svc.from('portal_accounts').select('id, airtable_student_id').eq('id', userId).maybeSingle();
      if (data) identity = portalIdentity(data);
    }
    if (!(await underCap(identity, HANDIN_LOGGED_OUT_KIND))) return false;
    await svc.from('portal_event_log').insert({
      identity, kind: HANDIN_LOGGED_OUT_KIND,
      detail: { via, device: deviceFamily(ua), oldSession: identity !== ANON_IDENTITY },
    });
    return true;
  } catch (e) {
    console.error('[login-trouble] handin_logged_out write failed:', (e as Error).message);
    return false;
  }
}

export const handinSeenCookie = { name: HANDIN_SEEN_COOKIE, value: '1', maxAge: HANDIN_SEEN_SECONDS, path: '/', httpOnly: true, sameSite: 'lax' as const, secure: true };
