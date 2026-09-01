// The admin session cookie is the security boundary for every /admin page and
// (via verifyAdminAuth) every admin API route — these tests pin the token
// format, expiry, tampering rejection, and the fail-closed no-secret path.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { signAdminSession, verifyAdminSession, ADMIN_SESSION_DAYS } from './admin-session';

const SECRET = 'test-admin-session-secret';
const ENV_KEYS = ['ADMIN_SESSION_SECRET', 'SIGNUP_SECRET'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Hand-mint a token the way admin-session does, for expiry/secret variations. */
function makeToken(expires: number, secret: string = SECRET): string {
  const sig = crypto.createHmac('sha256', secret).update(`admin.${expires}`).digest('base64url');
  return `${expires}.${sig}`;
}

const future = () => Date.now() + 60 * 60 * 1000;

describe('verifyAdminSession', () => {
  it('accepts a token freshly minted by signAdminSession', () => {
    expect(verifyAdminSession(signAdminSession())).toBe(true);
  });

  it('mints tokens that expire ~ADMIN_SESSION_DAYS out', () => {
    const expires = Number(signAdminSession().split('.')[0]);
    const days = (expires - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(ADMIN_SESSION_DAYS - 1);
    expect(days).toBeLessThan(ADMIN_SESSION_DAYS + 1);
  });

  it('rejects a tampered signature', () => {
    const token = signAdminSession();
    const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(verifyAdminSession(flipped)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    // Unguarded crypto.timingSafeEqual throws on length mismatch — the guard
    // must turn that into a plain reject.
    const token = signAdminSession();
    const dot = token.indexOf('.');
    expect(verifyAdminSession(token.slice(0, dot + 11))).toBe(false);
    expect(verifyAdminSession(token + 'AAAA')).toBe(false);
  });

  it('rejects an expiry extended without re-signing (forged lifetime)', () => {
    const token = signAdminSession();
    const [expires, sig] = token.split('.');
    expect(verifyAdminSession(`${Number(expires) + 1}.${sig}`)).toBe(false);
  });

  it('rejects an expired token even with a valid signature', () => {
    expect(verifyAdminSession(makeToken(Date.now() - 1000))).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    expect(verifyAdminSession(makeToken(future(), 'some-other-secret'))).toBe(false);
  });

  it('rejects missing and malformed tokens', () => {
    expect(verifyAdminSession(undefined)).toBe(false);
    expect(verifyAdminSession(null)).toBe(false);
    expect(verifyAdminSession('')).toBe(false);
    expect(verifyAdminSession('no-dot-at-all')).toBe(false);
    expect(verifyAdminSession('.signature-only')).toBe(false);
    expect(verifyAdminSession('not-a-number.abc')).toBe(false);
    expect(verifyAdminSession(`${future()}.`)).toBe(false);
  });

  it('falls back to SIGNUP_SECRET when ADMIN_SESSION_SECRET is unset', () => {
    delete process.env.ADMIN_SESSION_SECRET;
    process.env.SIGNUP_SECRET = SECRET;
    expect(verifyAdminSession(makeToken(future()))).toBe(true);
  });

  it('prefers ADMIN_SESSION_SECRET over SIGNUP_SECRET when both are set', () => {
    process.env.SIGNUP_SECRET = 'signup-secret';
    expect(verifyAdminSession(makeToken(future(), SECRET))).toBe(true);
    expect(verifyAdminSession(makeToken(future(), 'signup-secret'))).toBe(false);
  });

  it('FAILS CLOSED (false, not throw) when no signing secret is configured', () => {
    const token = makeToken(future());
    delete process.env.ADMIN_SESSION_SECRET;
    expect(verifyAdminSession(token)).toBe(false);
  });
});

describe('signAdminSession', () => {
  it('throws when no signing secret is configured', () => {
    delete process.env.ADMIN_SESSION_SECRET;
    expect(() => signAdminSession()).toThrow();
  });
});
