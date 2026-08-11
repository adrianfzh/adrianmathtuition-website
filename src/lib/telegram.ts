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

export async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[telegram] Missing bot token or chat ID');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    console.error('[telegram] Send failed:', await res.text());
  }
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

