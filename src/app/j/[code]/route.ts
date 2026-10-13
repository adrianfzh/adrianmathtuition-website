// /j/<code> — a short link the bot sends on WhatsApp in place of a long signed address (13 Oct
// 2026, Adrian: "yes" to a short sign-up link). Looks the code up in Supabase `short_links` and
// forwards; the table only accepts our own site as a target, and this route checks again.
// PUBLIC and READ-ONLY: link previews fetch it before a parent taps it.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const gone = () => plainPage('This link no longer works', 'It may have expired. Please message us on WhatsApp and we will send you a new one.', 410);
  if (!CODE_RE.test(code)) return gone();
  const { data, error } = await getSupabaseAdmin().from('short_links').select('url, expires_at').eq('code', code).maybeSingle();
  if (error) return plainPage('Please try again in a moment', 'We could not open this just now. If it keeps happening, message us on WhatsApp.', 503);
  if (!data || Date.parse(data.expires_at) < Date.now() || !String(data.url).startsWith(OURS)) return gone();
  return NextResponse.redirect(data.url, 302);
}
