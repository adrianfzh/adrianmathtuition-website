import { describe, expect, it } from 'vitest';
import { sayAs, SG_SAY } from './sg-say.mjs';

describe('sayAs', () => {
  it('swaps a Singapore place for how it sounds', () =>
    expect(sayAs('near her block in Tampines.')).toBe('near her block in Tam-pin-niss.'));
  it('matches two-word names whole, before their parts', () =>
    expect(sayAs('We walked along Bukit Timah Road')).toBe('We walked along Boo-kit Tee-mah Road'));
  it('keeps a capital at the start of a sentence', () =>
    expect(sayAs('Kaya toast is sweet.')).toBe('Kai-ya toast is sweet.'));
  it('leaves other words alone, and parts of words', () =>
    expect(sayAs('The kayak was bedded down')).toBe('The kayak was bedded down'));
  it('every entry has a respelling', () =>
    expect(Object.values(SG_SAY).every(v => typeof v === 'string' && v.length > 1)).toBe(true));
});
