import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { signAskToken, verifyAskToken, ASK_TOKEN_TTL_SECONDS } from './ask-token';

const SECRET = 'test-secret-shared';

// The SAME constant lives in the bot repo's test/ask-token.test.js — it pins
// the two implementations to byte-identical output. If either impl changes
// shape (key order, encoding, hash input), its fixture test breaks first.
const CROSS_IMPL_FIXTURE =
  'eyJzaWQiOiJyZWNBQkNERUYxMjM0NTY3IiwibmFtZSI6IkFsZXgiLCJsdmwiOiJBTSIsImV4cCI6NDEwMjQ0NDgwMH0.unKrgKXyl5icjCYLRKtwd2rirlvCekcvcWrSh1OagVY';

describe('signAskToken / verifyAskToken round-trip', () => {
  it('signs and verifies with the same secret', () => {
    const now = Date.UTC(2026, 7, 28, 4, 0, 0);
    const token = signAskToken({ sid: 'recStudent1', name: 'Wei Jie', lvl: 'EM' }, SECRET, now);
    const payload = verifyAskToken(token, SECRET, now);
    expect(payload).toEqual({
      sid: 'recStudent1',
      name: 'Wei Jie',
      lvl: 'EM',
      exp: Math.floor(now / 1000) + ASK_TOKEN_TTL_SECONDS,
    });
  });

  it('null name/lvl survive the round-trip as null', () => {
    const token = signAskToken({ sid: 'recStudent2' }, SECRET);
    const payload = verifyAskToken(token, SECRET);
    expect(payload?.sid).toBe('recStudent2');
    expect(payload?.name).toBeNull();
    expect(payload?.lvl).toBeNull();
  });

  it('TTL is 60 minutes', () => {
    expect(ASK_TOKEN_TTL_SECONDS).toBe(3600);
  });

  it('matches the bot impl byte-for-byte (cross-impl fixture)', () => {
    // exp 4102444800 = 2100-01-01: mint the same payload by picking nowMs so
    // that floor(now/1000) + TTL lands exactly on the fixture's exp.
    const nowMs = (4102444800 - ASK_TOKEN_TTL_SECONDS) * 1000;
    const token = signAskToken({ sid: 'recABCDEF1234567', name: 'Alex', lvl: 'AM' }, SECRET, nowMs);
    expect(token).toBe(CROSS_IMPL_FIXTURE);
    expect(verifyAskToken(CROSS_IMPL_FIXTURE, SECRET)?.sid).toBe('recABCDEF1234567');
  });

  it('throws when sid or secret is missing (mint side is trusted code)', () => {
    expect(() => signAskToken({ sid: '' }, SECRET)).toThrow();
    expect(() => signAskToken({ sid: 'recX' }, '')).toThrow();
  });
});

describe('verifyAskToken rejections (all null, never a throw)', () => {
  const now = Date.UTC(2026, 7, 28, 4, 0, 0);
  const good = signAskToken({ sid: 'recStudent3', name: 'Mei', lvl: 'JC' }, SECRET, now);

  it('expired token', () => {
    expect(verifyAskToken(good, SECRET, now + (ASK_TOKEN_TTL_SECONDS + 1) * 1000)).toBeNull();
    // exp == now is also expired (strict >)
    expect(verifyAskToken(good, SECRET, now + ASK_TOKEN_TTL_SECONDS * 1000)).toBeNull();
    // one second before expiry still verifies
    expect(verifyAskToken(good, SECRET, now + (ASK_TOKEN_TTL_SECONDS - 1) * 1000)).not.toBeNull();
  });

  it('tampered payload (signature no longer matches)', () => {
    const [p, sig] = good.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), sid: 'recVillain' }),
    ).toString('base64url');
    expect(verifyAskToken(`${forged}.${sig}`, SECRET, now)).toBeNull();
  });

  it('tampered signature', () => {
    const flipped = good.slice(0, -1) + (good.endsWith('A') ? 'B' : 'A');
    expect(verifyAskToken(flipped, SECRET, now)).toBeNull();
  });

  it('wrong secret', () => {
    expect(verifyAskToken(good, 'some-other-secret', now)).toBeNull();
  });

  it('malformed input', () => {
    expect(verifyAskToken('', SECRET, now)).toBeNull();
    expect(verifyAskToken('no-dot-here', SECRET, now)).toBeNull();
    expect(verifyAskToken('.only-sig', SECRET, now)).toBeNull();
    expect(verifyAskToken('only-payload.', SECRET, now)).toBeNull();
    expect(verifyAskToken('a.b.c', SECRET, now)).toBeNull();
    expect(verifyAskToken(null, SECRET, now)).toBeNull();
    expect(verifyAskToken(12345, SECRET, now)).toBeNull();
    expect(verifyAskToken('x'.repeat(3000), SECRET, now)).toBeNull();
    expect(verifyAskToken(good, '', now)).toBeNull();
  });

  it('valid signature over junk payloads is still rejected', () => {
    const signed = (raw: string) => {
      const p = Buffer.from(raw).toString('base64url');
      return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}`;
    };
    expect(verifyAskToken(signed('not json'), SECRET, now)).toBeNull();
    expect(verifyAskToken(signed('[1,2]'), SECRET, now)).toBeNull();
    expect(verifyAskToken(signed('{"name":"x","exp":4102444800}'), SECRET, now)).toBeNull(); // no sid
    expect(verifyAskToken(signed('{"sid":"recX"}'), SECRET, now)).toBeNull(); // no exp
    expect(verifyAskToken(signed('{"sid":"recX","exp":"soon"}'), SECRET, now)).toBeNull(); // exp not a number
  });
});
