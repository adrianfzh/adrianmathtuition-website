// In-app Telegram linking (Adrian, 8 Sep 2026: "put the generation of token in
// the app itself, and when they link, it disappears"). The app mints a signed,
// short-lived link; the student taps it; Telegram opens the bot with
// `/start tg_…`; the bot posts the token + its chat id back to
// POST /api/portal/telegram-link, which binds portal_accounts.telegram_chat_id
// (and Airtable `Student Telegram ID` when that is still empty). No table, no
// pasted chat IDs: the token IS the proof of "this account asked".
//
// Token shape (fits Telegram's 64-char start parameter, alphabet [A-Za-z0-9_-]):
//   tg_<uid22>_<exp36>_<sig16>
//   uid22 = base64url of the 16 account-uuid bytes (fixed width — it may
//           itself contain '_' or '-', so parsing is by position, not split)
//   exp36 = unix seconds, base36 (never contains '_')
//   sig16 = first 16 chars of base64url(HMAC-SHA256(secret, 'tglink:'+uid22+'_'+exp36))
// Secret = BOT_INTERNAL_SECRET, already shared by both deployments (ask-token).
// Pure; injectable clock; tolerant of junk on the verify side (null, never a throw).
import { createHmac, timingSafeEqual } from 'crypto';

export const TELEGRAM_BOT_USERNAME = 'AdrianMathBot';
export const TELEGRAM_LINK_TTL_SECONDS = 60 * 60; // the button re-mints on every tap; an hour is plenty
const PREFIX = 'tg_';
const UID_LEN = 22;
const SIG_LEN = 16;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sig(secret: string, body: string): string {
  return createHmac('sha256', secret).update(`tglink:${body}`).digest('base64url').slice(0, SIG_LEN);
}

export function signTelegramLinkToken(accountId: string, secret: string, nowMs: number = Date.now()): string {
  const uuid = String(accountId ?? '').trim().toLowerCase();
  if (!UUID_RE.test(uuid) || !secret) throw new Error('signTelegramLinkToken: account uuid and secret are required');
  const uid = Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url');
  const exp = (Math.floor(nowMs / 1000) + TELEGRAM_LINK_TTL_SECONDS).toString(36);
  const body = `${uid}_${exp}`;
  return `${PREFIX}${body}_${sig(secret, body)}`;
}

export function verifyTelegramLinkToken(token: unknown, secret: string, nowMs: number = Date.now()): { uid: string } | null {
  if (typeof token !== 'string' || !secret || token.length > 64 || !token.startsWith(PREFIX)) return null;
  const rest = token.slice(PREFIX.length);
  const uid = rest.slice(0, UID_LEN);
  if (uid.length !== UID_LEN || rest[UID_LEN] !== '_') return null;
  const tail = rest.slice(UID_LEN + 1);
  const cut = tail.indexOf('_');
  if (cut <= 0) return null;
  const exp36 = tail.slice(0, cut), given = tail.slice(cut + 1);
  if (!/^[0-9a-z]+$/.test(exp36) || given.length !== SIG_LEN) return null;
  const want = sig(secret, `${uid}_${exp36}`);
  const a = Buffer.from(given), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = parseInt(exp36, 36);
  if (!Number.isFinite(exp) || exp <= Math.floor(nowMs / 1000)) return null;
  const hex = Buffer.from(uid, 'base64url').toString('hex');
  if (hex.length !== 32) return null;
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { uid: uuid };
}

/** The tap target: opens Telegram straight into the bot with the token as the /start payload. */
export function telegramDeepLink(token: string): string {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`;
}

/** What the bot's /start handler sees: '/start tg_…' (with or without @BotName). Pure, mirrored bot-side. */
export function parseStartPayload(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const m = /^\/start(?:@\w+)?\s+(tg_[A-Za-z0-9_-]{20,61})\s*$/.exec(text.trim());
  return m ? m[1] : null;
}
