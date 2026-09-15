import { describe, it, expect } from 'vitest';
import {
  signOptoutToken, verifyOptoutToken, optoutLink, OPTOUT_TOKEN_TTL_SECONDS,
} from './holiday-optout-token';

const SECRET = 'test-signup-secret';
const STU = 'recABC12345678901';
const NOW = Date.UTC(2026, 8, 15, 2, 0, 0);

describe('holiday opt-out token', () => {
  it('round-trips the student id', () => {
    expect(verifyOptoutToken(signOptoutToken(STU, SECRET, NOW), SECRET, NOW)).toBe(STU);
  });

  it('is still valid the day before it expires, and dead the second after', () => {
    const t = signOptoutToken(STU, SECRET, NOW);
    const expMs = NOW + OPTOUT_TOKEN_TTL_SECONDS * 1000;
    expect(verifyOptoutToken(t, SECRET, expMs - 86_400_000)).toBe(STU);
    expect(verifyOptoutToken(t, SECRET, expMs + 1000)).toBeNull();
  });

  it('lives long enough to cover a September email opened in December', () => {
    const t = signOptoutToken(STU, SECRET, NOW);
    expect(verifyOptoutToken(t, SECRET, Date.UTC(2026, 11, 20))).toBe(STU);
  });

  it('refuses a token signed with a different secret', () => {
    expect(verifyOptoutToken(signOptoutToken(STU, 'other', NOW), SECRET, NOW)).toBeNull();
  });

  it('refuses a swapped student id — the signature covers it', () => {
    const t = signOptoutToken(STU, SECRET, NOW);
    const forged = t.replace(STU, 'recZZZ12345678901');
    expect(verifyOptoutToken(forged, SECRET, NOW)).toBeNull();
  });

  it('refuses an extended expiry — the signature covers that too', () => {
    const [rec, , sig] = signOptoutToken(STU, SECRET, NOW).split('.');
    const far = Math.floor(Date.UTC(2030, 0, 1) / 1000).toString(36);
    expect(verifyOptoutToken(`${rec}.${far}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it('never throws on junk', () => {
    for (const junk of [null, undefined, 42, '', '...', 'a.b.c', {}, 'x'.repeat(500), STU]) {
      expect(verifyOptoutToken(junk as unknown, SECRET, NOW)).toBeNull();
    }
  });

  it('refuses to verify without a secret, even with a real token', () => {
    expect(verifyOptoutToken(signOptoutToken(STU, SECRET, NOW), '', NOW)).toBeNull();
  });

  it('refuses to sign a non-record id', () => {
    for (const bad of ['', 'abc', 'rec123', 'recABC123456789012']) {
      expect(() => signOptoutToken(bad, SECRET, NOW)).toThrow();
    }
  });

  it('builds an absolute www link — the email is opened outside the site', () => {
    const url = optoutLink(signOptoutToken(STU, SECRET, NOW));
    expect(url.startsWith('https://www.adrianmathtuition.com/holiday-optout?t=')).toBe(true);
    // the apex 307-redirects and drops headers; www is the one that works
    expect(url).not.toContain('//adrianmathtuition.com');
  });

  it('survives a trailing space picked up from a mail client', () => {
    expect(verifyOptoutToken(`${signOptoutToken(STU, SECRET, NOW)} `, SECRET, NOW)).toBe(STU);
  });
});
