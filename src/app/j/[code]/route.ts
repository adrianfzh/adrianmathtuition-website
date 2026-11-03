// /j/<code> — a short link the bot sends on WhatsApp in place of a long signed address (13 Oct
// 2026, Adrian: "yes" to a short sign-up link). Sign-up links use /register/<code> since 3 Nov
// 2026; both forward through lib/short-link-forward.ts.
import { NextRequest } from 'next/server';
import { forwardShortLink } from '@/lib/short-link-forward';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  return forwardShortLink(code);
}
