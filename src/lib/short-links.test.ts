import { describe, expect, it } from 'vitest';
import { SHORTS, shortByCode, shortLinkTarget, looksLikeBot, refererHost } from './short-links';

describe('short-links', () => {
  it('has 10 Shorts with unique, link-safe codes', () => {
    expect(SHORTS).toHaveLength(10);
    const codes = SHORTS.map(s => s.code);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z0-9]{2,12}$/);
  });
  it('tags a known code and sends an unknown one home untagged', () => {
    expect(shortLinkTarget('perp')).toBe('/?utm_source=youtube&utm_medium=shorts&utm_campaign=common-traps&utm_content=perp');
    expect(shortLinkTarget('PERP')).toContain('utm_content=perp');
    expect(shortLinkTarget('nope')).toBe('/');
    expect(shortLinkTarget('../x')).toBe('/');
    expect(shortLinkTarget('sets', '/signup?x=1')).toBe('/signup?x=1&utm_source=youtube&utm_medium=shorts&utm_campaign=common-traps&utm_content=sets');
    expect(shortByCode('')).toBeNull();
  });
  it('guesses robots and keeps only the referring host', () => {
    expect(looksLikeBot(null)).toBe(true);
    expect(looksLikeBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(looksLikeBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')).toBe(false);
    expect(refererHost('https://m.youtube.com/shorts/abc?x=1')).toBe('m.youtube.com');
    expect(refererHost('not a url')).toBeNull();
  });
});
