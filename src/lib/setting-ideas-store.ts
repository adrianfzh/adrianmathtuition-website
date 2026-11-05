// ⚙️ The setting-ideas store (5 Nov 2026). Server-only, service key. Tables written by the bot
// (bot migration 0020, RLS on, no policies). Rules: lib/setting-ideas.ts.
import { getSupabaseAdmin } from '@/lib/supabase';
import { ideaCardEdit, sortIdeas, type IdeaAsk, type IdeaCardRow, type IdeaRow, type IdeaStatus } from '@/lib/setting-ideas';

const IDEAS = 'setting_suggestions';
const ASKS = 'setting_suggestion_asks';
const COLS = 'id, name, status, ask_count, student_count, first_asked_at, last_asked_at, decided_at, decided_by, admin_note';

/** Every idea with its three most recent asks (the students' own words). */
export async function listIdeas(limit = 200): Promise<IdeaRow[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from(IDEAS).select(COLS).order('last_asked_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  const ideas = (data ?? []) as Omit<IdeaRow, 'asks'>[];
  if (!ideas.length) return [];
  const { data: asks, error: e2 } = await sb.from(ASKS).select('suggestion_id, who, words, created_at')
    .in('suggestion_id', ideas.map((i) => i.id)).order('created_at', { ascending: false }).limit(2000);
  if (e2) throw new Error(e2.message);
  const byIdea = new Map<number, IdeaAsk[]>();
  for (const a of (asks ?? []) as (IdeaAsk & { suggestion_id: number })[]) {
    const list = byIdea.get(a.suggestion_id) ?? [];
    if (list.length < 3) list.push({ who: a.who, words: a.words, created_at: a.created_at });
    byIdea.set(a.suggestion_id, list);
  }
  return sortIdeas(ideas.map((i) => ({ ...i, asks: byIdea.get(i.id) ?? [] })));
}

export async function updateIdea(id: number, patch: { status?: IdeaStatus; admin_note?: string | null }): Promise<boolean> {
  const row: Record<string, unknown> = { ...patch };
  if (patch.status) {
    row.decided_at = patch.status === 'new' ? null : new Date().toISOString();
    row.decided_by = patch.status === 'new' ? null : 'website';
  }
  const { data, error } = await getSupabaseAdmin().from(IDEAS).update(row)
    .eq('id', id).select('id, name, status, ask_count, student_count, first_who, first_words, alert_chat_id, alert_message_id').maybeSingle();
  if (error) throw new Error(error.message);
  if (data && patch.status) await refreshTelegramCard(data as IdeaCardRow & { alert_chat_id: string | null; alert_message_id: number | null });
  return !!data;
}

/**
 * The Telegram card in the students topic follows a decision made here (5 Nov 2026). Best-effort:
 * an old card Telegram will not edit any more (or no card at all) leaves the decision saved anyway.
 */
async function refreshTelegramCard(r: IdeaCardRow & { alert_chat_id: string | null; alert_message_id: number | null }): Promise<boolean> {
  const tok = process.env.TELEGRAM_BOT_TOKEN;
  if (!tok || !r.alert_chat_id || !r.alert_message_id) return false;
  const { text, reply_markup } = ideaCardEdit(r);
  try {
    const res = await fetch(`https://api.telegram.org/bot${tok}/editMessageText`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: r.alert_chat_id, message_id: Number(r.alert_message_id), text, reply_markup }),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    return !!j?.ok || /not modified/i.test(j?.description || '');
  } catch { return false; }
}
