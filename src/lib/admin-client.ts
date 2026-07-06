'use client';
// Client-side admin session helpers — phase 2 of the signed-session upgrade.
//
// Admin pages no longer store the raw ADMIN_PASSWORD in a JS-readable cookie.
// Auth is a signed httpOnly `admin_session` cookie (see lib/admin-session.ts),
// set by POST /api/admin/session and sent automatically on same-origin
// fetches — so page code needs no Authorization headers.
//
// Standard page pattern:
//   useEffect(() => { ensureAdminSession().then(ok => setAuthed(ok)); }, []);
//   // login form submit:
//   const ok = await loginAdminSession(password);

const LEGACY_PW_COOKIES = ['admin_pw', 'schedule_pw', 'progress_pw'];

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

/** Raw password from a legacy plaintext cookie, if any (bootstrap only). */
export function getLegacyPwCookie(): string {
  for (const name of LEGACY_PW_COOKIES) {
    const v = getCookie(name);
    if (v) return v;
  }
  return '';
}

/** Expire every legacy plaintext-password cookie. */
export function expireLegacyPwCookies(): void {
  if (typeof document === 'undefined') return;
  for (const name of LEGACY_PW_COOKIES) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
  }
}

/**
 * Log in: POST the password to /api/admin/session. On success the server sets
 * the signed httpOnly session cookie and any legacy plaintext cookies are
 * expired. Returns true when the password was accepted.
 */
export async function loginAdminSession(password: string): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return false;
    expireLegacyPwCookies();
    return true;
  } catch {
    return false;
  }
}

/**
 * True when a signed admin session exists. If not, silently upgrades a legacy
 * plaintext password cookie (admin_pw / schedule_pw / progress_pw) by POSTing
 * it to /api/admin/session, then expires the plaintext cookies.
 */
export async function ensureAdminSession(): Promise<boolean> {
  try {
    const s = await fetch('/api/admin/session');
    if ((await s.json()).authed) return true;
  } catch {
    /* fall through to legacy bootstrap */
  }
  const pw = getLegacyPwCookie();
  if (!pw) return false;
  return loginAdminSession(pw);
}
