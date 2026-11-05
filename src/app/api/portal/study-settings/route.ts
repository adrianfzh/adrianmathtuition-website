// GET  /api/portal/study-settings → { telegram, reminder, hintFirst }
// POST /api/portal/study-settings { reminder?: { enabled, time, days }, hintFirst?: boolean } → same
//
// ⏰ The practice reminder + 💡 hint first on /app/settings (5 Nov 2026). The SAME rows the Telegram
// bot's /settings card and typed settings use (lib/study-settings.ts): `practice_reminders` keyed by
// the account's Telegram chat (reminders arrive in Telegram, so no link = no reminder) and
// `answer_prefs` keyed by the Airtable student id (tuition students only, and only once
// hintFirstSettingOpen). The caller is found from the session, never from the request.
// Every change is logged in `settings_events` (by: 'app'), like the bot's.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { ensureTelegramLinked } from '@/lib/telegram-link-state';
import { hintFirstSettingOpen } from '@/lib/portal-beta';
import { lastSentForNewTime, readReminder } from '@/lib/study-settings';

export const dynamic = 'force-dynamic';

type Acct = { id: string; telegram_chat_id: number | null; airtable_student_id: string | null };

async function caller(): Promise<Acct | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const sb = createServiceClient();
  const read = async () => (await sb.from('portal_accounts').select('id, telegram_chat_id, airtable_student_id').eq('id', user.id).maybeSingle()).data as Acct | null;
  let acct = await read();
  if (acct && !acct.telegram_chat_id && (await ensureTelegramLinked({ ...acct, airtable_student_id: acct.airtable_student_id ?? '' })) === 'linked') acct = await read();
  return acct;
}

const studentKey = (a: Acct) => (a.airtable_student_id?.startsWith('rec') ? a.airtable_student_id : null);

async function state(a: Acct) {
  const sb = createServiceClient();
  const chat = a.telegram_chat_id ? String(a.telegram_chat_id) : null;
  const key = studentKey(a);
  const showHint = !!key && (await hintFirstSettingOpen());
  const [rem, pref] = await Promise.all([
    chat ? sb.from('practice_reminders').select('enabled, remind_time, days').eq('chat_id', chat).maybeSingle() : Promise.resolve({ data: null }),
    showHint ? sb.from('answer_prefs').select('hint_first').eq('student_key', key!).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const r = rem.data as { enabled: boolean; remind_time: string; days: number[] } | null;
  return {
    telegram: !!chat,
    reminder: r ? { enabled: r.enabled, time: r.remind_time, days: r.days } : null,
    hintFirst: showHint ? !!(pref.data as { hint_first?: boolean } | null)?.hint_first : null,
  };
}

export async function GET() {
  const a = await caller();
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json(await state(a)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const a = await caller();
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { reminder?: unknown; hintFirst?: unknown };
  const sb = createServiceClient();
  const chat = a.telegram_chat_id ? String(a.telegram_chat_id) : null;
  const key = studentKey(a);
  const now = new Date().toISOString();
  const log = (detail: Record<string, unknown>) =>
    sb.from('settings_events').insert({ chat_id: chat ?? `app:${a.id}`, student_key: key, event: 'setting_changed', detail: { ...detail, by: 'app' } });
  try {
    if (body.reminder !== undefined) {
      if (!chat) return NextResponse.json({ error: 'Reminders come in Telegram — link Telegram first.' }, { status: 400 });
      const r = readReminder(body.reminder);
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
      const { enabled, time, days } = r.ok;
      const { error } = enabled
        ? await sb.from('practice_reminders').upsert({ chat_id: chat, student_key: key, enabled, remind_time: time, days, last_sent_on: lastSentForNewTime(time), updated_at: now }, { onConflict: 'chat_id' })
        : await sb.from('practice_reminders').update({ enabled: false, updated_at: now }).eq('chat_id', chat);
      if (error) throw new Error(error.message);
      await log({ setting: 'practice_reminder', on: enabled, ...(enabled ? { time, days } : {}) });
    }
    if (body.hintFirst !== undefined) {
      if (typeof body.hintFirst !== 'boolean') return NextResponse.json({ error: 'hintFirst must be true or false' }, { status: 400 });
      if (!key || !(await hintFirstSettingOpen())) return NextResponse.json({ error: 'Hint first is not available for this account.' }, { status: 403 });
      const { error } = await sb.from('answer_prefs').upsert({ student_key: key, hint_first: body.hintFirst, set_by: 'student', updated_at: now }, { onConflict: 'student_key' });
      if (error) throw new Error(error.message);
      await log({ setting: 'hint_first', on: body.hintFirst });
    }
    return NextResponse.json(await state(a));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
