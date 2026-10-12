// POST /api/portal/login-event — the login page's trace of a student who could not get in
// (12 Oct 2026, lib/login-trouble.ts). NO login needed — that is the point — so it takes
// only two kinds, writes at most one row per call, is capped per identity per day, and
// always answers { ok: true } (it never tells a visitor whether an email has an account).
//   { kind: 'login_failed', email, code, status } — a refused password login; `code` and
//       `status` are the auth error the browser got. The email is used only to find the
//       account; it is never stored, and neither is anything about a stranger.
//   { kind: 'handin_logged_out' } — /login?next=/app/submit opened with no live session.
//       One row per browser per 10 minutes (a cookie).
// Probed by /api/health-check (`login-event`): an unknown kind must 400.
import { NextRequest, NextResponse } from 'next/server';
import { HANDIN_LOGGED_OUT_KIND, LOGIN_FAILED_KIND } from '@/lib/login-trouble';
import { handinSeenCookie, recordHandinLoggedOut, recordLoginFailed } from '@/lib/login-trouble-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { kind?: unknown; email?: unknown; code?: unknown; status?: unknown } = {};
  try { body = await req.json(); } catch { /* validated below */ }
  const ua = req.headers.get('user-agent');
  if (body.kind === LOGIN_FAILED_KIND) {
    await recordLoginFailed({ email: body.email, code: body.code, status: body.status, ua });
    return NextResponse.json({ ok: true });
  }
  if (body.kind === HANDIN_LOGGED_OUT_KIND) {
    const res = NextResponse.json({ ok: true });
    if (await recordHandinLoggedOut(req.cookies, ua, 'page')) res.cookies.set(handinSeenCookie);
    return res;
  }
  return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
}
