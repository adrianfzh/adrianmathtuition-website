// One-time login links sent by the Telegram bot (Adrian, 16 Oct 2026: "let's do that",
// for a student who cannot get into the app). The student types /login to the bot; the
// bot asks POST /api/bot/login-link for a link; the student taps it, lands on
// /login/link, taps "Log in", and POST /api/portal/login-link signs them in.
//
// The link carries Supabase's own one-time magic-link hash (single use), wrapped with
// OUR expiry and signature so it dies after LOGIN_LINK_TTL_SECONDS whatever the project's
// OTP setting is. Sign-in happens only on the button's POST, never on the GET: Telegram
// and WhatsApp fetch a link to draw its preview, and a GET that signed in would spend
// the one-time hash before the student ever tapped it.
//
// Token: <exp36>_<hash>_<sig16>
//   exp36 = unix seconds, base36   hash = Supabase hashed_token (hex)
//   sig16 = first 16 chars of base64url(HMAC-SHA256(secret, 'loginlink:'+exp36+'_'+hash))
// Secret = BOT_INTERNAL_SECRET (lib/bot-secret.ts). Pure; injectable clock.
import { createHmac, timingSafeEqual } from 'crypto';

export const LOGIN_LINK_TTL_SECONDS = 15 * 60;
/** At most this many links per account per hour — a stolen Telegram cannot spray links. */
export const LOGIN_LINK_MAX_PER_HOUR = 5;
export const LOGIN_LINK_SENT_KIND = 'login_link_sent';
export const LOGIN_LINK_USED_KIND = 'login_link_used';
const SIG_LEN = 16;
const HASH_RE = /^[0-9a-f]{32,128}$/;

function sig(secret: string, body: string): string {
  return createHmac('sha256', secret).update(`loginlink:${body}`).digest('base64url').slice(0, SIG_LEN);
}

export function signLoginLink(hashedToken: string, secret: string, nowMs: number = Date.now()): string {
  const hash = String(hashedToken ?? '').trim().toLowerCase();
  if (!HASH_RE.test(hash) || !secret) throw new Error('signLoginLink: a hashed token and a secret are required');
  const exp = (Math.floor(nowMs / 1000) + LOGIN_LINK_TTL_SECONDS).toString(36);
  const body = `${exp}_${hash}`;
  return `${body}_${sig(secret, body)}`;
}

/** The Supabase hash inside a valid, unexpired token; null for anything else (never throws). */
export function verifyLoginLink(token: unknown, secret: string, nowMs: number = Date.now()): { hash: string } | null {
  if (typeof token !== 'string' || !secret || token.length > 200) return null;
  const parts = token.split('_');
  if (parts.length !== 3) return null;
  const [exp36, hash, given] = parts;
  if (!/^[0-9a-z]+$/.test(exp36) || !HASH_RE.test(hash) || given.length !== SIG_LEN) return null;
  const want = sig(secret, `${exp36}_${hash}`);
  const a = Buffer.from(given), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = parseInt(exp36, 36);
  if (!Number.isFinite(exp) || exp <= Math.floor(nowMs / 1000)) return null;
  return { hash };
}

export function loginLinkUrl(base: string, token: string): string {
  return `${base.replace(/\/$/, '')}/login/link?t=${encodeURIComponent(token)}`;
}

