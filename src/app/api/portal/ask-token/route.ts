// GET /api/portal/ask-token — mints the short-lived signed identity token the
// /app/ask client rides in its /api/chat POST body (`portalToken`), so the Fly
// bot — which streams browser→bot directly and can never see the portal
// session — knows WHICH student is asking. Identified students get the
// 60/SGT-day student quota instead of the anonymous 20/day, and the bot's own
// Questions row links their Student record (Adrian: "we should be able to
// recognize our own students").
//
// Token contract lives in lib/ask-token.ts (mirrored bot-side as
// lib/ask-token.js); signed with BOT_INTERNAL_SECRET, TTL 60 min. The client
// refreshes it at ~50 min and degrades to anonymous when this route fails —
// a missing token must never block asking.
//
// Also probed by /api/health-check: anonymous GET must 401.
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { botLevelForAccount } from '@/lib/chat-solver';
import { signAskToken } from '@/lib/ask-token';
import type { PortalAccount } from '@/lib/portal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('airtable_student_id, display_name, level, subjects')
    .eq('id', user.id)
    .maybeSingle<Pick<PortalAccount, 'airtable_student_id' | 'display_name' | 'level' | 'subjects'>>();
  // DELIBERATELY tuition-only (2026-08-28, stranger-accounts build): the token's
  // sid goes to the BOT, which links it as an Airtable Students record on its
  // Questions row — a stranger's acct:<uuid> identity would make that write
  // fail and lose the log row. Strangers therefore ask on the anonymous path
  // (the client's documented fallback), while the website's own
  // /api/portal/ask-log still records who asked by name. Once the bot's
  // ask-token consumer learns to skip the Student link for acct: sids, swap
  // this gate to portalIdentity() and strangers get the student quota too.
  if (!account?.airtable_student_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!secret) {
    // Preview/local env without the bot secret: the client falls back to
    // anonymous asking, so this is a degrade, not an outage.
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  // First name only (same derivation as the Ask page greeting) — the token is
  // browser-held, so it carries no more than the page already shows.
  const firstName = (account.display_name || '').trim().split(/\s+/)[0] || null;
  const token = signAskToken(
    {
      sid: account.airtable_student_id,
      name: firstName,
      // 'EM'|'AM'|'JC'|'S1'|'S2', or null for dual/unknown — same rule the Ask
      // page uses for the body's `level` field (bot router decides on null).
      lvl: botLevelForAccount(account.level, account.subjects),
    },
    secret,
  );
  return NextResponse.json({ token });
}
