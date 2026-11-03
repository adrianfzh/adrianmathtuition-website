// The one place a short link is looked up and forwarded — /j/<code> and, for sign-up links,
// /register/<code> (3 Nov 2026, Adrian: "is it possible to put the word "registration" or
// "signup" in the link? still short links"). PUBLIC and READ-ONLY: link previews fetch it
// before a parent taps it.
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const CODE_RE = /^[A-Za-z0-9]{6,12}$/;
const OURS = 'https://www.adrianmathtuition.com/';

function plainPage(title: string, line: string, status: number): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="font-family: -apple-system, system-ui, sans-serif; max-width: 28rem; margin: 18vh auto; padding: 0 1.25rem; color: #111827; line-height: 1.5;">
<h1 style="font-size: 1.25rem; margin: 0 0 0.75rem;">${title}</h1>
<p style="margin: 0; color: #4b5563;">${line}</p>
</body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

export async function forwardShortLink(code: string): Promise<NextResponse> {
  const gone = () => plainPage('This link no longer works', 'It may have expired. Please message us on WhatsApp and we will send you a new one.', 410);
  if (!CODE_RE.test(code)) return gone();
  const { data, error } = await getSupabaseAdmin().from('short_links').select('url, expires_at').eq('code', code).maybeSingle();
  if (error) return plainPage('Please try again in a moment', 'We could not open this just now. If it keeps happening, message us on WhatsApp.', 503);
  if (!data || Date.parse(data.expires_at) < Date.now() || !String(data.url).startsWith(OURS)) return gone();
  return NextResponse.redirect(data.url, 302);
}
