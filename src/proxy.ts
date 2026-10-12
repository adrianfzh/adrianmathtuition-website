// The project's one proxy (Next 16's name for middleware), 12 Oct 2026 — kept tiny on purpose.
// It runs on the hand-in page ONLY and does one thing: stamps the path on the request as
// `x-portal-path`, so lib/portal-auth can send a logged-out student to
// /login?next=/app/submit. The login page then records the logged-out visit
// (lib/login-trouble.ts, kind 'handin_logged_out') and brings them back after logging in.
// No auth decision is made here.
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  const params = new URLSearchParams(req.nextUrl.search);
  params.delete('_rsc'); // a client navigation's cache key, not part of the page's address
  const q = params.toString();
  headers.set('x-portal-path', `${req.nextUrl.pathname}${q ? `?${q}` : ''}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/app/submit'],
};
