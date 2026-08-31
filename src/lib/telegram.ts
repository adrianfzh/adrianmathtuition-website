// ── Student-directed sends ───────────────────────────────────────────────────
// `sendTelegram` / `sendTelegramWithButtons` below always go to Adrian
// (TELEGRAM_CHAT_ID). These two take an explicit chat id so a released marked
// script can reach the student who wrote it. Kept separate on purpose: silently
// re-pointing the admin helpers is how a private ops alert ends up in a
// student's chat.

/** Send to one specific chat. Returns false on any failure — callers decide
 *  whether that's fatal (releasing a script shouldn't fail because a student
 *  blocked the bot). */
export async function sendTelegramTo(chatId: string | number, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[telegram] Missing bot token');
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!res.ok) {
      console.error('[telegram] sendTelegramTo failed:', await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram] sendTelegramTo threw:', (err as Error).message);
    return false;
  }
}

/** Send a document by URL — Telegram fetches it itself, so a Vercel Blob /
 *  Dropbox link goes straight through without us proxying the bytes. */
export async function sendTelegramDocumentTo(
  chatId: string | number,
  documentUrl: string,
  caption?: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[telegram] Missing bot token');
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, document: documentUrl, caption, parse_mode: 'HTML' }),
    });
    if (!res.ok) {
      console.error('[telegram] sendTelegramDocumentTo failed:', await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram] sendTelegramDocumentTo threw:', (err as Error).message);
    return false;
  }
}

// Notification categories — MUST match lib/notify-topics.js in the bot repo, which
// owns the same Airtable Settings row ('telegram_topics'). Adrian, 31 Aug 2026:
// "yes we should do structural, group topics" — a day of ~11 notifications where a
// $280 payment sat between a filing-backfill count and a self-referential health
// check. Each kind gets its own forum thread instead of one flat DM.
export type NotifyCategory = 'alerts' | 'money' | 'students' | 'marking' | 'ops';

let _topicCache: { map: { chatId: string | number; topics: Record<string, number> } | null; at: number } = { map: null, at: 0 };

// FAILS OPEN: no row, bad JSON, Airtable down, unbound category → the plain
// TELEGRAM_CHAT_ID DM, i.e. exactly today's behaviour. A notification is never
// lost to a misconfiguration, which is what lets this roll out one sender at a time.
async function resolveTopic(category?: NotifyCategory): Promise<{ chatId: string | number; threadId?: number } | null> {
  if (!category) return null;
  try {
    if (Date.now() - _topicCache.at >= 60_000) {
      const { airtableRequest } = await import('@/lib/airtable');
      const data = await airtableRequest(
        'Settings',
        `?filterByFormula=${encodeURIComponent(`{Setting Name}='telegram_topics'`)}&maxRecords=1`
      );
      const raw = data.records?.[0]?.fields?.['Value'] ?? null;
      let map = null;
      try {
        const v = JSON.parse(raw);
        if (v?.chat_id !== undefined && v?.chat_id !== null && v.chat_id !== '') {
          const topics: Record<string, number> = {};
          for (const [k, id] of Object.entries(v.topics || {})) {
            if (Number.isInteger(id) && (id as number) > 0) topics[k] = id as number;
          }
          map = { chatId: v.chat_id, topics };
        }
      } catch { /* malformed row → treated as absent */ }
      _topicCache = { map, at: Date.now() };
    }
    const t = _topicCache.map?.topics?.[category];
    if (!_topicCache.map || !t) return null;
    return { chatId: _topicCache.map.chatId, threadId: t };
  } catch {
    return null;                        // never let routing break a notification
  }
}

export async function sendTelegram(text: string, category?: NotifyCategory): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const routed = await resolveTopic(category);
  const chatId = routed?.chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[telegram] Missing bot token or chat ID');
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId, text, parse_mode: 'HTML',
      ...(routed?.threadId ? { message_thread_id: routed.threadId } : {}),
    }),
  });
  if (!res.ok) {
    console.error('[telegram] Send failed:', await res.text());
    return false;
  }
  return true;
}

export async function sendTelegramWithButtons(
  text: string,
  buttons: { text: string; url?: string; callback_data?: string }[][]
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[telegram] Missing bot token or chat ID');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    }),
  });
  if (!res.ok) {
    console.error('[telegram] Send failed:', await res.text());
  }
}

