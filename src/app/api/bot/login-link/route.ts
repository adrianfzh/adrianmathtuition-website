// POST /api/bot/login-link — the Fly bot's /login command (16 Oct 2026, lib/login-link.ts).
// Auth: Bearer BOT_INTERNAL_SECRET. Body: { chatId }.
// Finds the app account(s) linked to that Telegram chat — portal_accounts.telegram_chat_id,
// else the Airtable `Student Telegram ID` the bot's /register writes — and returns a
// one-time login link for each:
//   200 { accounts: [{ name, url, expiresInMin }] }
//   404 { error: 'not-linked' }      — no app account knows this chat
//   403 { error: 'deactivated' }     — the only account found is switched off
//   429 { error: 'too-many' }        — LOGIN_LINK_MAX_PER_HOUR reached
//   401 / 400 / 500 as usual. Every link made is logged (portal_event_log 'login_link_sent').
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { safeEqual } from '@/lib/safe-equal';
import { botInternalSecret } from '@/lib/bot-secret';
import { airtableRequest } from '@/lib/airtable';
import { portalIdentity } from '@/lib/portal-auth';
import { signLoginLink, loginLinkUrl, LOGIN_LINK_TTL_SECONDS, LOGIN_LINK_MAX_PER_HOUR, LOGIN_LINK_SENT_KIND } from '@/lib/login-link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = 'https://www.adrianmathtuition.com';
type Account = { id: string; airtable_student_id: string | null; display_name: string | null; email: string | null; deactivated_at: string | null };
const COLS = 'id, airtable_student_id, display_name, email, deactivated_at';

export async function POST(req: NextRequest) {
  const secret = botInternalSecret();
  const auth = req.headers.get('authorization') || '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const chatId = Number(body.chatId);
  if (!Number.isSafeInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId must be a positive integer' }, { status: 400 });

  const sb = createServiceClient();
  let { data: accounts, error } = await sb.from('portal_accounts').select(COLS).eq('telegram_chat_id', chatId).returns<Account[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!accounts?.length) {
    // Registered through the bot's /register (Airtable), never linked inside the app.
    try {
      const formula = encodeURIComponent(`{Student Telegram ID}='${chatId}'`);
      const r = await airtableRequest('Students', `?filterByFormula=${formula}&maxRecords=5`);
      const ids = ((r?.records ?? []) as Array<{ id: string }>).map(x => x.id);
      if (ids.length) {
        const q = await sb.from('portal_accounts').select(COLS).in('airtable_student_id', ids).returns<Account[]>();
        accounts = q.data ?? [];
      }
    } catch (e) {
      console.warn('[login-link] Airtable lookup failed:', (e as Error).message);
    }
  }
  if (!accounts?.length) return NextResponse.json({ error: 'not-linked' }, { status: 404 });
  const live = accounts.filter(a => !a.deactivated_at && a.email);
  if (!live.length) return NextResponse.json({ error: 'deactivated' }, { status: 403 });

  const since = new Date(Date.now() - 3600_000).toISOString();
  const out: Array<{ name: string; url: string; expiresInMin: number }> = [];
  for (const a of live) {
    const identity = portalIdentity(a);
    const { count } = await sb.from('portal_event_log').select('id', { count: 'exact', head: true })
      .eq('identity', identity).eq('kind', LOGIN_LINK_SENT_KIND).gte('created_at', since);
    if ((count ?? 0) >= LOGIN_LINK_MAX_PER_HOUR) continue;
    const { data: link, error: le } = await sb.auth.admin.generateLink({ type: 'magiclink', email: a.email! });
    const hashed = link?.properties?.hashed_token;
    if (le || !hashed) {
      console.error('[login-link] generateLink failed:', le?.message);
      continue;
    }
    await sb.from('portal_event_log').insert({ identity, kind: LOGIN_LINK_SENT_KIND, detail: { via: 'telegram' } });
    out.push({ name: a.display_name || 'your account', url: loginLinkUrl(SITE_URL, signLoginLink(hashed, secret)), expiresInMin: LOGIN_LINK_TTL_SECONDS / 60 });
  }
  if (!out.length) return NextResponse.json({ error: 'too-many' }, { status: 429 });
  return NextResponse.json({ accounts: out });
}
