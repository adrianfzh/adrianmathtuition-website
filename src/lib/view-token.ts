// The private link behind a "View" button in a WhatsApp message the business
// starts (Adrian, 8 Oct 2026: "yes" — private links, 60 days, no parent login).
// Bot repo: lib/whatsapp-templates.js; docs/COMMANDS.md §WhatsApp.
//
// Like the link in a "track your parcel" SMS: only the person who was sent the
// message holds it, it opens ONE thing (that invoice, that marked paper, that
// progress note) and it stops working after 60 days. There is no parent login,
// so the token is the only proof — it says "the holder was sent a message about
// this record", nothing more. Same shape and secret as lib/holiday-optout-token.ts.
//
// ⚠ READ-ONLY. A link previewer or a security scanner opens the URL before a
// human does; /v/<token> must never change anything.
//
// Token (URL-safe, no padding):  <kind><rec>.<exp36>.<sig22>
//   kind  = i (invoice) | p (marked paper) | n (progress note)
//   rec   = the record id the link opens
//   sig22 = base64url(HMAC-SHA256(SIGNUP_SECRET, 'view:' + kind + rec + '.' + exp36))[0..21]
// The kind is inside the signature, so an invoice link cannot be turned into a
// paper link by editing one letter.
//
// Pure, injectable clock; verify never throws — junk returns null.
import { createHmac, timingSafeEqual } from 'crypto';

export const VIEW_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60;

export type ViewKind = 'invoice' | 'paper' | 'note';
const LETTER: Record<ViewKind, string> = { invoice: 'i', paper: 'p', note: 'n' };
const KIND: Record<string, ViewKind> = { i: 'invoice', p: 'paper', n: 'note' };

const PURPOSE = 'view:';
const SIG_LEN = 22;
// An Airtable record id (invoices) or a uuid (papers, notes).
const ID_RE = /^(rec[A-Za-z0-9]{14}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

function sig(secret: string, body: string): string {
  return createHmac('sha256', secret).update(`${PURPOSE}${body}`).digest('base64url').slice(0, SIG_LEN);
}

export function signViewToken(kind: ViewKind, id: string, secret: string, nowMs: number = Date.now()): string {
  const rec = String(id ?? '').trim();
  if (!LETTER[kind] || !ID_RE.test(rec) || !secret) throw new Error('signViewToken: kind, record id and secret are required');
  const exp = (Math.floor(nowMs / 1000) + VIEW_TOKEN_TTL_SECONDS).toString(36);
  const body = `${LETTER[kind]}${rec}.${exp}`;
  return `${body}.${sig(secret, body)}`;
}

/** What the token opens, or null — expired, tampered, or nonsense. */
export function verifyViewToken(token: unknown, secret: string, nowMs: number = Date.now()): { kind: ViewKind; id: string } | null {
  if (typeof token !== 'string' || !secret || token.length > 120) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const [head, exp36, given] = parts;
  const kind = KIND[head[0]];
  const id = head.slice(1);
  if (!kind || !ID_RE.test(id) || !/^[0-9a-z]{1,10}$/.test(exp36) || given.length !== SIG_LEN) return null;

  const want = sig(secret, `${head}.${exp36}`);
  const a = Buffer.from(given), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const exp = parseInt(exp36, 36);
  if (!Number.isFinite(exp) || exp <= Math.floor(nowMs / 1000)) return null;
  return { kind, id };
}

/** The address a WhatsApp button opens. The template holds everything up to /v/; the token is its one blank. */
export function viewLink(token: string, origin = 'https://www.adrianmathtuition.com'): string {
  return `${origin.replace(/\/$/, '')}/v/${token}`;
}
