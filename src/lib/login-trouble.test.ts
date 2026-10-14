import { describe, expect, it } from 'vitest';
import {
  ANON_IDENTITY, HANDIN_LOGGED_OUT_KIND, HEALTH_PROBE_HEADER, HEALTH_PROBE_VALUE, LOGIN_FAILED_KIND, accessTokenFromAuthCookies, classifyLoginFailure,
  cookieReader, deviceFamily, failedLoginAccounts, isHealthProbe, failedLoginLabel, normaliseEmail, reasonWords, troubleLine, troubleLines,
} from './login-trouble';

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const TOKEN = 'aaa.bbb.ccc';

describe('classifyLoginFailure', () => {
  it('wrong password when the email has an account', () => {
    expect(classifyLoginFailure({ code: 'invalid_credentials', status: 400 }, { deactivated_at: null })).toBe('wrong_password');
  });
  it('no such account when it does not', () => {
    expect(classifyLoginFailure({ code: 'invalid_credentials', status: 400 }, null)).toBe('no_account');
  });
  it('deactivated beats wrong password', () => {
    expect(classifyLoginFailure({ code: 'invalid_credentials', status: 400 }, { deactivated_at: '2026-09-01T00:00:00Z' })).toBe('deactivated');
    expect(classifyLoginFailure({ code: 'user_banned', status: 400 }, null)).toBe('deactivated');
  });
  it('too many tries on 429 or a rate-limit code', () => {
    expect(classifyLoginFailure({ code: 'over_request_rate_limit', status: 429 }, { deactivated_at: null })).toBe('too_many_tries');
    expect(classifyLoginFailure({ status: 429 }, null)).toBe('too_many_tries');
  });
  it('anything else is other', () => {
    expect(classifyLoginFailure({ code: 'email_not_confirmed', status: 403 }, null)).toBe('other');
    expect(classifyLoginFailure({}, null)).toBe('other');
  });
});

describe('small helpers', () => {
  it('device family', () => {
    expect(deviceFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('phone');
    expect(deviceFamily('Mozilla/5.0 (Linux; Android 14) Mobile')).toBe('phone');
    expect(deviceFamily('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('desktop');
    expect(deviceFamily(null)).toBe('desktop');
  });
  it('normaliseEmail', () => {
    expect(normaliseEmail('  A@B.com ')).toBe('a@b.com');
    expect(normaliseEmail('nope')).toBeNull();
    expect(normaliseEmail(42)).toBeNull();
  });
  it('reason words fall back to other', () => {
    expect(reasonWords('wrong_password')).toBe('wrong password');
    expect(reasonWords('weird')).toBe('other problem');
  });
  it('failedLoginLabel', () => {
    expect(failedLoginLabel(0)).toBeNull();
    expect(failedLoginLabel(1)).toBe('Student could not log in (last day)');
    expect(failedLoginLabel(3)).toBe('Students could not log in (last day)');
  });
});

describe('accessTokenFromAuthCookies', () => {
  it('reads a base64 cookie', () => {
    const v = 'base64-' + b64url(JSON.stringify({ access_token: TOKEN, refresh_token: 'r' }));
    expect(accessTokenFromAuthCookies([{ name: 'sb-abcdef-auth-token', value: v }])).toBe(TOKEN);
  });
  it('joins chunked cookies in order', () => {
    const v = 'base64-' + b64url(JSON.stringify({ access_token: TOKEN, refresh_token: 'x'.repeat(50) }));
    const cut = Math.floor(v.length / 2);
    expect(accessTokenFromAuthCookies([
      { name: 'sb-abcdef-auth-token.1', value: v.slice(cut) },
      { name: 'sb-abcdef-auth-token.0', value: v.slice(0, cut) },
    ])).toBe(TOKEN);
  });
  it('reads a plain JSON cookie', () => {
    expect(accessTokenFromAuthCookies([{ name: 'sb-abcdef-auth-token', value: encodeURIComponent(JSON.stringify({ access_token: TOKEN })) }])).toBe(TOKEN);
  });
  it('null when absent or garbage', () => {
    expect(accessTokenFromAuthCookies([{ name: 'other', value: 'x' }])).toBeNull();
    expect(accessTokenFromAuthCookies([{ name: 'sb-abcdef-auth-token', value: 'base64-!!!' }])).toBeNull();
  });
  it('works through cookieReader on a raw header', () => {
    const v = 'base64-' + b64url(JSON.stringify({ access_token: TOKEN }));
    const r = cookieReader(`am_x=1; sb-abcdef-auth-token=${v}`);
    expect(accessTokenFromAuthCookies(r.getAll())).toBe(TOKEN);
    expect(r.get('am_x')?.value).toBe('1');
    expect(r.get('missing')).toBeUndefined();
  });
});

describe('lines for the admin page', () => {
  it('says what happened and when, in Singapore time', () => {
    // 07:40 UTC = 3:40pm SGT
    expect(troubleLine({ kind: LOGIN_FAILED_KIND, created_at: '2026-10-12T07:40:00Z', detail: { reason: 'wrong_password' } }))
      .toBe('Tried to log in, wrong password — 12 Oct 3:40pm');
    expect(troubleLine({ kind: HANDIN_LOGGED_OUT_KIND, created_at: '2026-10-12T07:41:00Z' }))
      .toBe('Opened the hand-in page logged out — 12 Oct 3:41pm');
    expect(troubleLine({ kind: 'tab:view', created_at: '2026-10-12T07:41:00Z' })).toBeNull();
  });
  it('newest first, capped', () => {
    const ev = [
      { kind: HANDIN_LOGGED_OUT_KIND, created_at: '2026-10-10T01:00:00Z' },
      { kind: LOGIN_FAILED_KIND, created_at: '2026-10-12T01:00:00Z', detail: { reason: 'too_many_tries' } },
      { kind: LOGIN_FAILED_KIND, created_at: '2026-10-11T01:00:00Z', detail: { reason: 'wrong_password' } },
    ];
    const lines = troubleLines(ev, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('too many tries');
    expect(lines[1]).toContain('wrong password');
  });
});

describe('failedLoginAccounts', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  it('counts distinct real accounts in the last day, never anon', () => {
    expect(failedLoginAccounts([
      { kind: LOGIN_FAILED_KIND, identity: 'recAAAAAAAAAAAAAA', created_at: '2026-10-12T10:00:00Z' },
      { kind: LOGIN_FAILED_KIND, identity: 'recAAAAAAAAAAAAAA', created_at: '2026-10-12T11:00:00Z' },
      { kind: LOGIN_FAILED_KIND, identity: 'acct:1', created_at: '2026-10-11T13:00:00Z' },
      { kind: LOGIN_FAILED_KIND, identity: ANON_IDENTITY, created_at: '2026-10-12T11:00:00Z' },
      { kind: LOGIN_FAILED_KIND, identity: 'recBBBBBBBBBBBBBB', created_at: '2026-10-10T11:00:00Z' },
      { kind: HANDIN_LOGGED_OUT_KIND, identity: 'recCCCCCCCCCCCCCC', created_at: '2026-10-12T11:00:00Z' },
    ], now)).toBe(2);
  });
});

describe('isHealthProbe — the site\'s own 6-hourly check is never login trouble (14 Oct 2026)', () => {
  it('is true only for the probe header with its value', () => {
    expect(isHealthProbe(new Headers({ [HEALTH_PROBE_HEADER]: HEALTH_PROBE_VALUE }))).toBe(true);
    expect(isHealthProbe(new Headers({ [HEALTH_PROBE_HEADER]: '0' }))).toBe(false);
    expect(isHealthProbe(new Headers({ 'user-agent': 'node' }))).toBe(false);
    expect(isHealthProbe(new Headers())).toBe(false);
    expect(isHealthProbe(null)).toBe(false);
  });
});
