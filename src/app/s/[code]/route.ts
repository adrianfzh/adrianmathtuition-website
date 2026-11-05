// /s/<code> — the link in a "common trap" Short's YouTube description (5 Nov 2026,
// SPEC-CLIP-PIPELINE.md §10, lib/short-links.ts). Counts the visit (no personal data), remembers
// the Short in a 90-day cookie for a later sign-up, and sends the visitor on with UTM tags.
// Counting never blocks the visit: if the table is missing or the database is slow, the visitor
// still goes straight on. ?probe=1 (the health check) is never counted.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { shortByCode, shortLinkTarget, looksLikeBot, refererHost, SHORT_LINK_COOKIE } from '@/lib/short-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const short = shortByCode(code);
  const res = NextResponse.redirect(new URL(shortLinkTarget(code), req.url), 302);
  if (!short) return res;
  if (req.nextUrl.searchParams.get('probe') !== '1') {
    try {
      await Promise.race([
        getSupabaseAdmin().from('short_link_clicks').insert({
          code: short.code,
          from_host: refererHost(req.headers.get('referer')),
          likely_bot: looksLikeBot(req.headers.get('user-agent')),
        }),
        new Promise(r => setTimeout(r, 1500)),
      ]);
    } catch { /* counting is best-effort */ }
  }
  res.cookies.set(SHORT_LINK_COOKIE, short.code, { maxAge: 90 * 24 * 3600, path: '/', sameSite: 'lax', httpOnly: true, secure: true });
  return res;
}
