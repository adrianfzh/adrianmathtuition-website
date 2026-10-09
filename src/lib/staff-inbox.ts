// 📥 The staff inbox: routine messages to Adrian, FILED for ☀️ the morning brief (9 Oct 2026,
// Adrian: "2. yes … 3. yes" — the daily cards with buttons and the weekly reports go INTO the
// brief). The bot's half and the whole story: its lib/staff-inbox.js and docs/MORNING-BRIEF.md.
//
// A route that sends him a routine message also calls fileForBrief(): one row in `staff_inbox`
// (migrations/staff_inbox.sql) with the whole message and its own buttons. The brief shows one
// line for it and a 📖 button that returns the full message with those buttons. Filing never
// throws and never delays the send. A family that is later switched off (lib/quiet-messages.ts)
// still files — it only stops sending.
import { getSupabaseAdmin } from '@/lib/supabase';

type Button = { text: string; url?: string; callback_data?: string };

/** The first line a person would read: tags stripped, one line, at most 140 characters. */
export function gistOf(body: string): string {
  const line = String(body || '').replace(/<[^>]+>/g, '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  return line.length <= 140 ? line : `${line.slice(0, 137).replace(/\s+\S*$/, '')}…`;
}

export async function fileForBrief(m: {
  family: string; label: string; body: string; gist?: string;
  buttons?: Button[][]; dmOnly?: boolean; sentAlso?: boolean; html?: boolean;
}): Promise<boolean> {
  try {
    if (!m.body) return false;
    const { error } = await getSupabaseAdmin().from('staff_inbox').insert({
      family: m.family.slice(0, 60), label: m.label.slice(0, 60),
      gist: (m.gist || gistOf(m.body)).slice(0, 200), body: m.body.slice(0, 8000),
      parse_mode: m.html === false ? null : 'HTML',
      reply_markup: m.buttons && m.buttons.length ? { inline_keyboard: m.buttons } : null,
      dm_only: !!m.dmOnly, source: 'website', sent_also: m.sentAlso !== false,
    });
    if (error) { console.warn('[staff-inbox] file failed:', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('[staff-inbox] file failed:', (e as Error).message);
    return false;
  }
}
