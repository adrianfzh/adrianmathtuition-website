import { describe, it, expect } from 'vitest';
import { signViewToken, verifyViewToken, viewLink, VIEW_TOKEN_TTL_SECONDS } from './view-token';

const SECRET = 'test-signup-secret';
const INV = 'recABC12345678901';
const PAPER = '0b0e7c1e-3a52-4c1e-9d7b-2f6d6a1c9e11';
const NOW = Date.UTC(2026, 9, 8, 2, 0, 0);

describe('view token — the private link behind a WhatsApp "View" button', () => {
  it('round-trips what it opens, for each kind', () => {
    expect(verifyViewToken(signViewToken('invoice', INV, SECRET, NOW), SECRET, NOW)).toEqual({ kind: 'invoice', id: INV });
    expect(verifyViewToken(signViewToken('paper', PAPER, SECRET, NOW), SECRET, NOW)).toEqual({ kind: 'paper', id: PAPER });
    expect(verifyViewToken(signViewToken('note', PAPER, SECRET, NOW), SECRET, NOW)).toEqual({ kind: 'note', id: PAPER });
  });

  it('works for 60 days and then stops', () => {
    const t = signViewToken('invoice', INV, SECRET, NOW);
    const expMs = NOW + VIEW_TOKEN_TTL_SECONDS * 1000;
    expect(VIEW_TOKEN_TTL_SECONDS).toBe(60 * 86_400);
    expect(verifyViewToken(t, SECRET, expMs - 86_400_000)).toEqual({ kind: 'invoice', id: INV });
    expect(verifyViewToken(t, SECRET, expMs + 1000)).toBeNull();
  });

  it('an invoice link cannot be turned into a paper link, or into another invoice', () => {
    const t = signViewToken('invoice', INV, SECRET, NOW);
    expect(verifyViewToken('p' + t.slice(1), SECRET, NOW)).toBeNull();
    expect(verifyViewToken(t.replace(INV, 'recZZZ12345678901'), SECRET, NOW)).toBeNull();
  });

  it('refuses another secret, a longer life, and nonsense — without throwing', () => {
    const t = signViewToken('invoice', INV, SECRET, NOW);
    expect(verifyViewToken(signViewToken('invoice', INV, 'other', NOW), SECRET, NOW)).toBeNull();
    const [head, , s] = t.split('.');
    expect(verifyViewToken(`${head}.zzzzzzz.${s}`, SECRET, NOW)).toBeNull();
    for (const junk of ['', 'abc', 'i.b.c', `x${INV}.abc.${'A'.repeat(22)}`, null, undefined, 42, {}, 'a'.repeat(500)]) {
      expect(verifyViewToken(junk, SECRET, NOW)).toBeNull();
    }
    expect(verifyViewToken(t, '', NOW)).toBeNull();
  });

  it('will not sign for a missing secret or a bad id', () => {
    expect(() => signViewToken('invoice', INV, '', NOW)).toThrow();
    expect(() => signViewToken('invoice', 'not-an-id', SECRET, NOW)).toThrow();
  });

  it('the link is the site, /v/, then the token — the shape the WhatsApp template is approved with', () => {
    const t = signViewToken('invoice', INV, SECRET, NOW);
    expect(viewLink(t)).toBe(`https://www.adrianmathtuition.com/v/${t}`);
    expect(t).toMatch(/^[A-Za-z0-9._-]+$/);   // nothing a URL would need to escape
  });
});
