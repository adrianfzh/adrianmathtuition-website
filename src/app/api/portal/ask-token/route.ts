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
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';
import { requireActiveAccess } from '@/lib/portal-passes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id, display_name, level, subjects, deactivated_at')
    .eq('id', user.id)
    .maybeSingle<Pick<PortalAccount, 'id' | 'airtable_student_id' | 'display_name' | 'level' | 'subjects' | 'deactivated_at'>>();
  // An Auth user without a portal_accounts row shouldn't exist — treat as
  // unauthenticated (same stance as lib/portal-auth.currentAccount).
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // ALL active accounts get an identified token now (2026-08-28, stranger Ask
  // quota — this replaces the earlier tuition-only gate): sid is the ONE
  // portal identity, rec… for tuition students, acct:<uuid> for strangers.
  // The bot's ask-token consumer is learning acct: sids in a parallel change
  // and FAILS OPEN — on an older bot an acct: token verifies but degrades to
  // the anonymous path (no Student link, anonymous quota) instead of erroring,
  // so the two deploys can land in either order. Pass gate: tuition accounts
  // short-circuit free; a stranger (or deactivated ex-student) without an
  // active pass gets the 402 and the client degrades to anonymous asking —
  // the token must never hand the paid 60/day student quota past the paywall.
  const access = await requireActiveAccess(account);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

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
      sid: portalIdentity(account),
      name: firstName,
      // 'EM'|'AM'|'JC'|'S1'|'S2', or null for dual/unknown — same rule the Ask
      // page uses for the body's `level` field (bot router decides on null).
      lvl: botLevelForAccount(account.level, account.subjects),
    },
    secret,
  );
  return NextResponse.json({ token });
}
