// Ask-identity token — the ONE rule for how the portal proves "this /api/chat
// call is a signed-in student" to the Fly bot. Mirrors the bot's
// lib/ask-token.js (dual pure impl, like solution-rollup): the Ask tab streams
// browser→bot directly over CORS, so the bot can never see the portal session —
// instead /api/portal/ask-token mints this short-lived signed token and the
// client rides it in the POST body as `portalToken`.
//
// Contract (KEEP BOTH IMPLS IDENTICAL — a fixture in both test files pins the
// exact bytes):
//   payload  = base64url(JSON {sid, name, lvl, exp})   — key order sid,name,lvl,exp
//   token    = payload + '.' + base64url(HMAC-SHA256(secret, payload-string))
//   sid      = Airtable Students record id (the identity)
//   name     = student's first name or null (Questions-log Username, nothing more)
//   lvl      = bot level string 'EM'|'AM'|'JC'|'S1'|'S2' or null (system-prompt hint)
//   exp      = unix SECONDS; TTL 60 min; verify requires exp > now
// The HMAC signs the base64url payload STRING (not the JSON), so verification
// never re-encodes JSON and key order only matters at mint time. Secret is
// BOT_INTERNAL_SECRET — already shared by both deployments.
//
// Pure (repo testing policy): no I/O, injectable clock, tolerant of junk input
// on the verify side — anything malformed is null, never a throw, because the
// bot must fail OPEN to anonymous behaviour.
import { createHmac, timingSafeEqual } from 'crypto';

export const ASK_TOKEN_TTL_SECONDS = 60 * 60; // 60 min
const MAX_TOKEN_LENGTH = 2048;

export interface AskTokenPayload {
  sid: string;
  name: string | null;
  lvl: string | null;
  exp: number; // unix seconds
}

export function signAskToken(
  claims: { sid: string; name?: string | null; lvl?: string | null },
  secret: string,
  nowMs: number = Date.now(),
): string {
  const sid = typeof claims.sid === 'string' ? claims.sid.trim() : '';
  if (!sid || !secret) throw new Error('signAskToken: sid and secret are required');
  const payload: AskTokenPayload = {
    sid,
    name: typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 80) : null,
    lvl: typeof claims.lvl === 'string' && claims.lvl.trim() ? claims.lvl.trim().slice(0, 10) : null,
    exp: Math.floor(nowMs / 1000) + ASK_TOKEN_TTL_SECONDS,
  };
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(p).digest('base64url');
  return `${p}.${sig}`;
}

export function verifyAskToken(
  token: unknown,
  secret: string,
  nowMs: number = Date.now(),
): AskTokenPayload | null {
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest('base64url');
  const given = Buffer.from(parts[1]);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const { sid, name, lvl, exp } = payload as Record<string, unknown>;
  if (typeof sid !== 'string' || !sid) return null;
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= Math.floor(nowMs / 1000)) return null;
  return {
    sid,
    name: typeof name === 'string' && name ? name : null,
    lvl: typeof lvl === 'string' && lvl ? lvl : null,
    exp,
  };
}
