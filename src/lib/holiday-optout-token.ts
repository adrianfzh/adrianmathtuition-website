// The signed link behind the parent's "Choose which months to skip" button
// (Adrian, 15 Sep 2026: "can provide a button for them to press? - can allow
// them to select which months?").
//
// The token is the ONLY proof of identity on the public opt-out page: there is
// no parent login. So it says exactly one thing — "the holder was sent this
// student's invoice email" — and the page it unlocks can do exactly one thing:
// skip or restore that student's Oct/Nov/Dec lessons. It carries no name, no
// email and no session.
//
// ⚠ A TOKEN IS NOT A CLICK. Mail scanners, link previewers and corporate
// security gateways FETCH every URL in an email before a human sees it. So the
// GET on this token must only ever READ; the opt-out is applied by a POST the
// page makes after the parent presses Confirm. Never put the action on the GET.
//
// Token shape (URL-safe, no padding):
//   <rec><exp36>.<sig22>
//   rec   = Airtable student record id (recXXXXXXXXXXXXXX)
//   exp36 = unix seconds, base36
//   sig22 = base64url(HMAC-SHA256(secret, 'holidayoptout:' + rec + '.' + exp36))[0..21]
// Secret = SIGNUP_SECRET, the same one behind signup links — no new env var to
// forget to set in Vercel before a send.
//
// Pure, injectable clock, and verify never throws — junk returns null.
import { createHmac, timingSafeEqual } from 'crypto';

/** 120 days: minted 15 Sep, still good if a parent opens the email in January. */
export const OPTOUT_TOKEN_TTL_SECONDS = 120 * 24 * 60 * 60;

const PURPOSE = 'holidayoptout:';
const SIG_LEN = 22;
const REC_RE = /^rec[A-Za-z0-9]{14}$/;

function sig(secret: string, body: string): string {
  return createHmac('sha256', secret).update(`${PURPOSE}${body}`).digest('base64url').slice(0, SIG_LEN);
}

export function signOptoutToken(studentId: string, secret: string, nowMs: number = Date.now()): string {
  const rec = String(studentId ?? '').trim();
  if (!REC_RE.test(rec) || !secret) throw new Error('signOptoutToken: student record id and secret are required');
  const exp = (Math.floor(nowMs / 1000) + OPTOUT_TOKEN_TTL_SECONDS).toString(36);
  const body = `${rec}.${exp}`;
  return `${body}.${sig(secret, body)}`;
}

/** The student id the token stands for, or null — expired, tampered, or nonsense. */
export function verifyOptoutToken(token: unknown, secret: string, nowMs: number = Date.now()): string | null {
  if (typeof token !== 'string' || !secret || token.length > 120) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const [rec, exp36, given] = parts;
  if (!REC_RE.test(rec) || !/^[0-9a-z]{1,10}$/.test(exp36) || given.length !== SIG_LEN) return null;

  const want = sig(secret, `${rec}.${exp36}`);
  const a = Buffer.from(given), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const exp = parseInt(exp36, 36);
  if (!Number.isFinite(exp) || exp <= Math.floor(nowMs / 1000)) return null;
  return rec;
}

/** The tap target in the email. Absolute — it is opened from a mail client, not from the site. */
export function optoutLink(token: string, origin = 'https://www.adrianmathtuition.com'): string {
  return `${origin.replace(/\/$/, '')}/holiday-optout?t=${encodeURIComponent(token)}`;
}
