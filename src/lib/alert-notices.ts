// src/lib/alert-notices.ts — an alert that fixes itself is DELETED when it is fixed (4 Nov 2026).
//
// Adrian, 4 Nov 2026: "if it's okay, why not just delete the message?" → "Yes, as a rule".
// Any Telegram alert to Adrian about a state that can end by itself (down, stuck, waiting,
// failing) is raised here under ONE key per state ('bot-health', 'health-check',
// 'marking-stall', 'sheet-release:<id>', …). The sent message's id goes into the shared
// Supabase table `alert_notices` (migrations/alert_notices.sql; the bot writes the same table
// from lib/alert-notices.js and its shell callers). When the state ends, clearAlert(key)
// deletes every open message for that key — Telegram lets a bot delete its own message for
// 48 h, so inside 47 h → delete; older, or no id kept → ONE short "… again" line instead.
//
// Never throws. A failed table read never blocks the alert itself (the message is sent,
// only its id is not kept), and never marks anything cleared.
// clearPlan / deleteOutcome / needsAgainLine / repeatDue are pure — alert-notices.test.ts.

import { sendTelegram, type NotifyCategory, type SentMessage } from '@/lib/telegram';

export const DELETE_WINDOW_MS = 47 * 3600 * 1000;

export type AlertRow = { id: number; key?: string; chat_id: string | null; message_id: number | null; sent_at: string };

/** Pure: which open rows can be deleted, which are too old (or have no id) for that. */
export function clearPlan<T extends AlertRow>(rows: T[], nowMs: number): { remove: T[]; stale: T[] } {
  const remove: T[] = []; const stale: T[] = [];
  for (const r of rows || []) {
    const at = Date.parse(r?.sent_at);
    if (r?.chat_id && r?.message_id && Number.isFinite(at) && nowMs - at < DELETE_WINDOW_MS) remove.push(r);
    else stale.push(r);
  }
  return { remove, stale };
}

/** Pure: a deleteMessage answer → did the message go? A message already gone counts as gone. */
export function deleteOutcome(j: { ok?: boolean; description?: string } | null | undefined): boolean {
  if (j?.ok === true) return true;
  return /message to delete not found/i.test(String(j?.description || ''));
}

/** Pure: should the "again" line go? Only when something could not be deleted, and there is a line. */
export function needsAgainLine(staleCount: number, failedCount: number, againText: string | null | undefined): boolean {
  return !!againText && staleCount + failedCount > 0;
}

/** Pure: may a repeat of an open alert go now? (the newest open row is at least `everyMs` old; none open → yes) */
export function repeatDue(rows: AlertRow[] | null, nowMs: number, everyMs: number): boolean {
  if (!rows || !rows.length) return true;
  const newest = Math.max(...rows.map((r) => Date.parse(r.sent_at) || 0));
  return nowMs - newest >= everyMs;
}

function store(): { url: string; headers: Record<string, string> } | null {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return { url: `${url}/rest/v1/alert_notices`, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

/** Open rows for a key, oldest first; null = could not read. */
export async function openAlerts(key: string): Promise<AlertRow[] | null> {
  const s = store();
  if (!s || !key) return null;
  try {
    const r = await fetch(`${s.url}?key=eq.${encodeURIComponent(key)}&cleared_at=is.null&select=id,key,chat_id,message_id,sent_at&order=sent_at.asc`, { headers: s.headers, cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as AlertRow[];
  } catch { return null; }
}

/** The keys of every open alert starting with `prefix`; null = could not read. */
export async function openAlertKeys(prefix: string): Promise<string[] | null> {
  const s = store();
  if (!s || !prefix) return null;
  try {
    const r = await fetch(`${s.url}?key=like.${encodeURIComponent(prefix)}*&cleared_at=is.null&select=key&limit=500`, { headers: s.headers, cache: 'no-store' });
    if (!r.ok) return null;
    return [...new Set(((await r.json()) as { key: string }[]).map((x) => x.key))];
  } catch { return null; }
}

/** true = an alert for this key is open; false = none; null = could not read. */
export async function hasOpenAlert(key: string): Promise<boolean | null> {
  const rows = await openAlerts(key);
  return rows === null ? null : rows.length > 0;
}

async function recordAlert(key: string, m: SentMessage | null, text: string): Promise<void> {
  const s = store();
  if (!s) return;
  try {
    await fetch(s.url, {
      method: 'POST', headers: { ...s.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ key, chat_id: m ? String(m.chat_id) : null, message_id: m?.message_id ?? null, thread_id: m?.thread_id ?? null, text: text.slice(0, 1000) }),
    });
  } catch { /* the alert went out; only its id is lost */ }
}

/**
 * Send an alert and keep its id under `key` (category undefined = Adrian's DM, as sendTelegram). opts:
 *   onlyIfNew   not sent while an alert for this key is open (an unreadable table still sends)
 *   repeatEveryMs  sent only when the newest open alert for this key is at least this old
 *   plain       no HTML parsing (text with < or & in it)
 * Returns true when sent.
 */
export async function raiseAlert(
  key: string, category: NotifyCategory | undefined, text: string,
  opts: { onlyIfNew?: boolean; repeatEveryMs?: number; plain?: boolean } = {},
): Promise<boolean> {
  try {
    if (opts.onlyIfNew || opts.repeatEveryMs) {
      const rows = await openAlerts(key);
      if (rows && opts.onlyIfNew && rows.length) return false;
      if (rows && opts.repeatEveryMs && !repeatDue(rows, Date.now(), opts.repeatEveryMs)) return false;
    }
    let sent: SentMessage | null = null;
    const ok = await sendTelegram(text, category, { plain: opts.plain, onSent: (m) => { sent = m; } });
    if (ok) await recordAlert(key, sent, text);
    return ok;
  } catch { return false; }
}

async function deleteTelegram(chatId: string, messageId: number): Promise<boolean> {
  const tok = process.env.TELEGRAM_BOT_TOKEN;
  if (!tok) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${tok}/deleteMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, message_id: Number(messageId) }),
    });
    return deleteOutcome(await r.json().catch(() => null));
  } catch { return false; }
}

/**
 * The state is over: delete every open message for `key`; when one cannot be deleted (too old,
 * no id, Telegram refused) send `againText` once (null = say nothing). Rows are marked cleared.
 * Returns { open, deleted, told } or null when the table could not be read.
 */
export async function clearAlert(
  key: string, againText: string | null = null, opts: { category?: NotifyCategory } = {},
): Promise<{ open: number; deleted: number; told: boolean } | null> {
  try {
    const rows = await openAlerts(key);
    if (rows === null) return null;
    if (!rows.length) return { open: 0, deleted: 0, told: false };
    const { remove, stale } = clearPlan(rows, Date.now());
    let deleted = 0; let failed = 0;
    for (const r of remove) { if (await deleteTelegram(String(r.chat_id), Number(r.message_id))) deleted++; else failed++; }
    let told = false;
    if (needsAgainLine(stale.length, failed, againText)) told = await sendTelegram(againText as string, opts.category, { plain: true });
    const s = store();
    if (s) {
      await fetch(`${s.url}?id=in.(${rows.map((r) => r.id).join(',')})`, {
        method: 'PATCH', headers: { ...s.headers, Prefer: 'return=minimal' }, body: JSON.stringify({ cleared_at: new Date().toISOString() }),
      }).catch(() => {});
    }
    return { open: rows.length, deleted, told };
  } catch { return null; }
}
