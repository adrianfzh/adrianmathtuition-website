// verifyAdminAuth is the auth gate on every admin API route (and the
// admin-gated portal routes). A fail-open regression shipped here once — an
// unset ADMIN_PASSWORD returned true and opened every gated route — so the
// fail-closed cases below are the ones that must never go green-to-red silently.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyAdminAuth } from './schedule-helpers';
import { ADMIN_SESSION_COOKIE, signAdminSession } from './admin-session';

const PW = 'test-admin-password';
const SECRET = 'test-session-secret';
const ENV_KEYS = ['ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'SIGNUP_SECRET'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ADMIN_PASSWORD = PW;
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function makeReq(opts: { auth?: string; cookie?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.auth !== undefined) headers.set('authorization', opts.auth);
  if (opts.cookie !== undefined) headers.set('cookie', `${ADMIN_SESSION_COOKIE}=${opts.cookie}`);
  return new NextRequest('http://localhost/api/admin/test', { headers });
}

/** Session token with a chosen expiry, signed with the test secret. */
function makeSessionToken(expires: number, secret: string = SECRET): string {
  const sig = crypto.createHmac('sha256', secret).update(`admin.${expires}`).digest('base64url');
  return `${expires}.${sig}`;
}

describe('verifyAdminAuth — Bearer header path', () => {
  it('accepts the correct Bearer password', () => {
    expect(verifyAdminAuth(makeReq({ auth: `Bearer ${PW}` }))).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyAdminAuth(makeReq({ auth: 'Bearer wrong-password' }))).toBe(false);
  });

  it('rejects a password differing only in the last character', () => {
    expect(verifyAdminAuth(makeReq({ auth: `Bearer ${PW.slice(0, -1)}X` }))).toBe(false);
  });

  it('rejects an empty Authorization header', () => {
    expect(verifyAdminAuth(makeReq({ auth: '' }))).toBe(false);
  });

  it('rejects a missing Authorization header', () => {
    expect(verifyAdminAuth(makeReq())).toBe(false);
  });

  it('rejects the raw password without the Bearer prefix', () => {
    expect(verifyAdminAuth(makeReq({ auth: PW }))).toBe(false);
  });

  it('rejects a lowercase "bearer" scheme (exact-match contract)', () => {
    expect(verifyAdminAuth(makeReq({ auth: `bearer ${PW}` }))).toBe(false);
  });

  it('rejects internal whitespace variants', () => {
    // Leading/trailing header whitespace is trimmed by the HTTP layer itself
    // (Fetch spec), so `Bearer pw ` reaches the compare already clean — only
    // internal whitespace actually exercises the equality check.
    expect(verifyAdminAuth(makeReq({ auth: `Bearer  ${PW}` }))).toBe(false);
    expect(verifyAdminAuth(makeReq({ auth: `Bearer ${PW} x` }))).toBe(false);
  });
});

describe('verifyAdminAuth — fail closed on missing/empty ADMIN_PASSWORD', () => {
  // The historical regression: unset ADMIN_PASSWORD must reject EVERYTHING,
  // including requests that would otherwise be well-formed.
  it('rejects all Bearer shapes when ADMIN_PASSWORD is unset', () => {
    delete process.env.ADMIN_PASSWORD;
    expect(verifyAdminAuth(makeReq({ auth: `Bearer ${PW}` }))).toBe(false);
    expect(verifyAdminAuth(makeReq({ auth: 'Bearer undefined' }))).toBe(false);
    expect(verifyAdminAuth(makeReq({ auth: 'Bearer ' }))).toBe(false);
    expect(verifyAdminAuth(makeReq({ auth: '' }))).toBe(false);
    expect(verifyAdminAuth(makeReq())).toBe(false);
  });

  it('rejects all Bearer shapes when ADMIN_PASSWORD is the empty string', () => {
    process.env.ADMIN_PASSWORD = '';
    expect(verifyAdminAuth(makeReq({ auth: 'Bearer ' }))).toBe(false);
    expect(verifyAdminAuth(makeReq({ auth: 'Bearer' }))).toBe(false);
    expect(verifyAdminAuth(makeReq({ auth: '' }))).toBe(false);
    expect(verifyAdminAuth(makeReq())).toBe(false);
  });

  it('rejects even a VALID session cookie when ADMIN_PASSWORD is unset', () => {
    const cookie = signAdminSession();
    delete process.env.ADMIN_PASSWORD;
    expect(verifyAdminAuth(makeReq({ cookie }))).toBe(false);
  });
});

describe('verifyAdminAuth — session cookie path', () => {
  it('accepts a valid signed session cookie without any Bearer header', () => {
    expect(verifyAdminAuth(makeReq({ cookie: signAdminSession() }))).toBe(true);
  });

  it('rejects a cookie with a tampered signature', () => {
    const token = signAdminSession();
    const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(verifyAdminAuth(makeReq({ cookie: flipped }))).toBe(false);
  });

  it('rejects an expired cookie even with a valid signature', () => {
    expect(verifyAdminAuth(makeReq({ cookie: makeSessionToken(Date.now() - 1000) }))).toBe(false);
  });

  it('rejects a cookie signed with the wrong secret', () => {
    const token = makeSessionToken(Date.now() + 60_000, 'attacker-secret');
    expect(verifyAdminAuth(makeReq({ cookie: token }))).toBe(false);
  });

  it('falls through to a correct Bearer header when the cookie is garbage', () => {
    expect(verifyAdminAuth(makeReq({ cookie: 'garbage', auth: `Bearer ${PW}` }))).toBe(true);
  });

  it('rejects (not 500s) a stale cookie when no session secret is configured', () => {
    const cookie = signAdminSession();
    delete process.env.ADMIN_SESSION_SECRET;
    // Cookie can no longer verify, but the Bearer fallback must still work.
    expect(verifyAdminAuth(makeReq({ cookie }))).toBe(false);
    expect(verifyAdminAuth(makeReq({ cookie, auth: `Bearer ${PW}` }))).toBe(true);
  });
});
