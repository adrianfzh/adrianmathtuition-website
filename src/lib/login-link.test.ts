import { describe, it, expect } from 'vitest';
import { signLoginLink, verifyLoginLink, loginLinkUrl, LOGIN_LINK_TTL_SECONDS } from './login-link';

const S = 'test-secret';
const H = 'a'.repeat(56);
const T0 = Date.UTC(2026, 9, 16, 12, 0, 0);

describe('login link token', () => {
  it('round-trips the hash', () => {
    expect(verifyLoginLink(signLoginLink(H, S, T0), S, T0)).toEqual({ hash: H });
  });
  it('dies after 15 minutes', () => {
    const t = signLoginLink(H, S, T0);
    expect(verifyLoginLink(t, S, T0 + (LOGIN_LINK_TTL_SECONDS - 1) * 1000)).not.toBeNull();
    expect(verifyLoginLink(t, S, T0 + LOGIN_LINK_TTL_SECONDS * 1000)).toBeNull();
  });
  it('refuses another secret, a changed hash, a changed expiry, junk', () => {
    const t = signLoginLink(H, S, T0);
    expect(verifyLoginLink(t, 'other', T0)).toBeNull();
    const [e, h, g] = t.split('_');
    expect(verifyLoginLink(`${e}_${'b'.repeat(56)}_${g}`, S, T0)).toBeNull();
    expect(verifyLoginLink(`${(parseInt(e, 36) + 999).toString(36)}_${h}_${g}`, S, T0)).toBeNull();
    for (const j of [null, undefined, 42, '', 'a_b', 'x'.repeat(300)]) expect(verifyLoginLink(j, S, T0)).toBeNull();
  });
  it('refuses to sign without a hash or secret', () => {
    expect(() => signLoginLink('', S)).toThrow();
    expect(() => signLoginLink(H, '')).toThrow();
  });
  it('builds the page url', () => {
    expect(loginLinkUrl('https://www.adrianmathtuition.com/', 'abc_def')).toBe('https://www.adrianmathtuition.com/login/link?t=abc_def');
  });
});
