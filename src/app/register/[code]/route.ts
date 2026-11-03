// /register/<code> — the short sign-up link a parent gets on WhatsApp (3 Nov 2026, Adrian: put
// "registration" or "signup" in the link, still short). Same table and checks as /j/<code>.
import { NextRequest } from 'next/server';
import { forwardShortLink } from '@/lib/short-link-forward';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  return forwardShortLink(code);
}
