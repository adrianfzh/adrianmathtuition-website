// Login trouble — a trace when a student could not get in (12 Oct 2026, Adrian: "YES").
//
// Why: a student's hand-in never reached the site and nothing was logged. The phone's
// failure report (lib/submit-failure.ts) needs a login, and the Supabase auth audit log
// is empty — so "I could not submit" left no trace at all. Two kinds of row now land in
// portal_event_log (the same ledger, no migration):
//   • 'login_failed'       — a password login on /login that was refused, with the reason
//                            in plain words and the device family (phone / desktop).
//   • 'handin_logged_out'  — someone opened /app/submit (or sent a hand-in) with no live
//                            session; at most one per browser per 10 minutes.
// Identity: the account's portal identity (rec… / acct:…) when the email or a stale
// session cookie belongs to a real account; otherwise the constant ANON_IDENTITY. The
// password and the email of an unknown address are NEVER stored.
// Pure helpers only (tested in login-trouble.test.ts); the writes are in
// login-trouble-server.ts. Rows are kept 90 days (/api/cron/retention).

export const LOGIN_FAILED_KIND = 'login_failed';
export const HANDIN_LOGGED_OUT_KIND = 'handin_logged_out';
export const LOGIN_TROUBLE_KINDS = [LOGIN_FAILED_KIND, HANDIN_LOGGED_OUT_KIND] as const;
/** The identity of a row that belongs to no known account — identifies nobody. */
export const ANON_IDENTITY = 'anon';
/** Login-trouble rows older than this are deleted by the retention cron. */
export const LOGIN_TROUBLE_KEEP_DAYS = 90;
/** One 'handin_logged_out' row per browser per 10 minutes (a cookie of this name). */
export const HANDIN_SEEN_COOKIE = 'am_handin_lo';
export const HANDIN_SEEN_SECONDS = 600;
/**
 * The site's own health check (/api/health-check, every 6 hours) knocks on the hand-in
 * door logged out on purpose, to prove the door is up. It sends this header so that
 * knock is never written down as a student's login trouble (14 Oct 2026). A phone never
 * sends it; at worst a stranger who sends it leaves no trace, which they could already do.
 */
export const HEALTH_PROBE_HEADER = 'x-am-health-probe';
export const HEALTH_PROBE_VALUE = '1';

/** True when the request is the site's own health check, not a visitor. */
export function isHealthProbe(headers: { get(name: string): string | null } | null | undefined): boolean {
  return headers?.get(HEALTH_PROBE_HEADER) === HEALTH_PROBE_VALUE;
}

/** Daily caps — the door has no login, so a script must not be able to flood the table. */
export const ACCOUNT_DAILY_CAP = 30;
export const ANON_DAILY_CAP = 300;

export type LoginFailReason = 'wrong_password' | 'no_account' | 'deactivated' | 'too_many_tries' | 'other';
export type DeviceFamily = 'phone' | 'desktop';

const REASON_WORDS: Record<LoginFailReason, string> = {
  wrong_password: 'wrong password',
  no_account: 'no such account',
  deactivated: 'account deactivated',
  too_many_tries: 'too many tries',
  other: 'other problem',
};

export function reasonWords(reason: unknown): string {
  return typeof reason === 'string' && reason in REASON_WORDS ? REASON_WORDS[reason as LoginFailReason] : REASON_WORDS.other;
}

/**
 * Why a password login failed, from the auth error the browser got and what we know
 * about the email. `account` = the portal account with that email, or null.
 */
export function classifyLoginFailure(
  err: { code?: unknown; status?: unknown },
  account: { deactivated_at: string | null } | null,
): LoginFailReason {
  const code = typeof err.code === 'string' ? err.code : '';
  const status = typeof err.status === 'number' ? err.status : 0;
  if (status === 429 || /rate_limit/.test(code)) return 'too_many_tries';
  if (code === 'user_banned') return 'deactivated';
  if (account?.deactivated_at) return 'deactivated';
  if (code === 'invalid_credentials' || code === 'invalid_grant' || status === 400) {
    return account ? 'wrong_password' : 'no_account';
  }
  return 'other';
}

/** Phone or desktop, from a user-agent string. Tablets count as phones (handheld). */
export function deviceFamily(ua: string | null | undefined): DeviceFamily {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua ?? '') ? 'phone' : 'desktop';
}

/** A plausible email, trimmed and lower-cased; null for anything else. Used only to look an account up. */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(e)) return null;
  return e;
}

/**
 * The access token from Supabase's auth cookie (`sb-<ref>-auth-token`, possibly split into
 * `.0`, `.1` … chunks, possibly `base64-` encoded). Null when absent or unreadable. The
 * caller must still VERIFY its signature before trusting the user id inside.
 */
export function accessTokenFromAuthCookies(cookies: { name: string; value: string }[]): string | null {
  const base = cookies.find(c => /^sb-[a-z0-9]+-auth-token(\.0)?$/i.test(c.name))?.name.replace(/\.0$/, '');
  if (!base) return null;
  let raw = cookies.find(c => c.name === base)?.value ?? '';
  if (!raw) {
    for (let i = 0; ; i++) {
      const part = cookies.find(c => c.name === `${base}.${i}`);
      if (!part) break;
      raw += part.value;
    }
  }
  if (!raw) return null;
  try {
    let json = raw;
    if (json.startsWith('base64-')) {
      const b64 = json.slice(7).replace(/-/g, '+').replace(/_/g, '/');
      json = new TextDecoder().decode(Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), ch => ch.charCodeAt(0)));
    } else if (json.startsWith('%')) {
      json = decodeURIComponent(json);
    }
    const parsed = JSON.parse(json) as unknown;
    const token = Array.isArray(parsed) ? parsed[0] : (parsed as { access_token?: unknown })?.access_token;
    return typeof token === 'string' && token.split('.').length === 3 ? token : null;
  } catch {
    return null;
  }
}

export interface TroubleEvent { kind: string; created_at: string; detail?: unknown; identity?: string }

const DAY_MS = 86_400_000;

/** "12 Oct 3:40pm" in Singapore time. */
export function sgtShort(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' })
    .replace(/\s/g, '').toLowerCase();
  return `${day} ${t}`;
}

/** One plain line for the student's admin page; null for any other kind. */
export function troubleLine(e: TroubleEvent): string | null {
  if (e.kind === LOGIN_FAILED_KIND) {
    const reason = (e.detail as { reason?: unknown } | null | undefined)?.reason;
    return `Tried to log in, ${reasonWords(reason)} — ${sgtShort(e.created_at)}`;
  }
  if (e.kind === HANDIN_LOGGED_OUT_KIND) return `Opened the hand-in page logged out — ${sgtShort(e.created_at)}`;
  return null;
}

/** Newest first, at most `limit` lines. */
export function troubleLines(events: TroubleEvent[], limit = 5): string[] {
  return [...events]
    .filter(e => Number.isFinite(Date.parse(e.created_at)))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map(troubleLine)
    .filter((l): l is string => l !== null)
    .slice(0, limit);
}

/** How many real accounts (not ANON_IDENTITY) had a failed login in the last 24 hours. */
export function failedLoginAccounts(events: TroubleEvent[], now: Date): number {
  const since = now.getTime() - DAY_MS;
  const ids = new Set<string>();
  for (const e of events) {
    if (e.kind !== LOGIN_FAILED_KIND || !e.identity || e.identity === ANON_IDENTITY) continue;
    if (Date.parse(e.created_at) >= since) ids.add(e.identity);
  }
  return ids.size;
}

/** A raw `Cookie:` header as a reader (the hand-in routes read it before the session lookup can clear a dead cookie). */
export function cookieReader(header: string | null | undefined): { getAll(): { name: string; value: string }[]; get(name: string): { value: string } | undefined } {
  const all = (header ?? '').split(';').map(p => p.trim()).filter(Boolean).map(p => {
    const i = p.indexOf('=');
    return i < 0 ? { name: p, value: '' } : { name: p.slice(0, i), value: p.slice(i + 1) };
  });
  return { getAll: () => all, get: (name: string) => all.find(c => c.name === name) };
}

/** The "Needs your look" label for N accounts with a failed login in the last day; null at 0. */
export function failedLoginLabel(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n === 1 ? 'Student could not log in (last day)' : 'Students could not log in (last day)';
}
