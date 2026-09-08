// /api/portal/telegram-link — in-app Telegram linking (8 Sep 2026).
//
//   GET            (student session)  → { url } — a signed t.me deep link, fresh
//                                        on every call (lib/telegram-link.ts).
//   GET ?check=1   (student session)  → { linked } — the card polls this after
//                                        the tap and disappears once true.
//   POST           (the Fly bot, Bearer BOT_INTERNAL_SECRET) { token, chatId }
//                  → binds portal_accounts.telegram_chat_id and, for a tuition
//                    account whose Airtable `Student Telegram ID` is still
//                    empty, that field too — so the bot's own /menu identity
//                    lookup (Airtable-keyed) recognises the chat as well.
//                    409 when the account is already linked to ANOTHER chat
//                    (unlink in Settings first — a leaked link must not
//                    silently re-point someone's notifications); 410 expired.
// Anonymous GET/POST → 401 (health-check probes the POST).
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { safeEqual } from '@/lib/safe-equal';
import { airtableRequest } from '@/lib/airtable';
import { signTelegramLinkToken, verifyTelegramLinkToken, telegramDeepLink, TELEGRAM_LINK_TTL_SECONDS } from '@/lib/telegram-link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase.from('portal_accounts')
    .select('id, telegram_chat_id').eq('id', user.id).maybeSingle<{ id: string; telegram_chat_id: number | null }>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (req.nextUrl.searchParams.get('check')) {
    return NextResponse.json({ linked: !!account.telegram_chat_id });
  }
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!secret) return NextResponse.json({ error: 'Telegram linking is not set up yet — message Adrian.' }, { status: 503 });
  const token = signTelegramLinkToken(account.id, secret);
  return NextResponse.json({ url: telegramDeepLink(token), expiresInSec: TELEGRAM_LINK_TTL_SECONDS });
}

export async function POST(req: NextRequest) {
  const secret = process.env.BOT_INTERNAL_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const chatId = Number(body.chatId);
  if (!Number.isSafeInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId must be a positive integer' }, { status: 400 });
  const v = verifyTelegramLinkToken(body.token, secret);
  if (!v) return NextResponse.json({ error: 'expired' }, { status: 410 });

  const sb = createServiceClient();
  const { data: acct, error } = await sb.from('portal_accounts')
    .select('id, airtable_student_id, display_name, level, telegram_chat_id')
    .eq('id', v.uid)
    .maybeSingle<{ id: string; airtable_student_id: string; display_name: string | null; level: string | null; telegram_chat_id: number | null }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!acct) return NextResponse.json({ error: 'no such account' }, { status: 404 });
  if (acct.telegram_chat_id && Number(acct.telegram_chat_id) !== chatId) {
    return NextResponse.json({ error: 'linked-elsewhere' }, { status: 409 });
  }
  if (!acct.telegram_chat_id) {
    const { error: upErr } = await sb.from('portal_accounts').update({ telegram_chat_id: chatId }).eq('id', acct.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Airtable side — only when the student's field is EMPTY; a different id
  // already there (a parent's phone, an old account) is Adrian's to change.
  let airtable: 'set' | 'same' | 'kept' | 'none' | 'failed' = 'none';
  const rec = acct.airtable_student_id;
  if (rec && rec.startsWith('rec')) {
    try {
      const student = await airtableRequest('Students', `/${rec}`);
      const cur = String(student?.fields?.['Student Telegram ID'] ?? '').trim();
      if (!cur) {
        await airtableRequest('Students', `/${rec}`, { method: 'PATCH', body: JSON.stringify({ fields: { 'Student Telegram ID': String(chatId) } }) });
        airtable = 'set';
      } else airtable = cur === String(chatId) ? 'same' : 'kept';
    } catch (e) {
      console.warn('[telegram-link] Airtable update failed:', (e as Error).message);
      airtable = 'failed';
    }
  }
  return NextResponse.json({ ok: true, name: acct.display_name, level: acct.level, tuition: !!rec, airtable });
}
