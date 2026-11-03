import { describe, it, expect } from 'vitest';
import { newShortCode, shortenable } from './short-link';

describe('short links', () => {
  it('makes an 8-character code without look-alike letters', () => {
    const code = newShortCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code).toBe('ABCDEFGH');
    expect(newShortCode()).toMatch(/^[A-HJ-NP-Za-km-z2-9]{8}$/);
  });
  it('only shortens our own site', () => {
    expect(shortenable('https://www.adrianmathtuition.com/signup?x=1')).toBe(true);
    expect(shortenable('http://www.adrianmathtuition.com/signup')).toBe(false);
    expect(shortenable('https://evil.example/')).toBe(false);
  });
});
