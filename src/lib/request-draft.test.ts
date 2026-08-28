import { describe, expect, it } from 'vitest';
import { findTopicInText, levelKeysForPortalLevel, tierFromText } from './request-draft';

describe('levelKeysForPortalLevel', () => {
  it('maps Sec 3/4 to AM-then-EM', () => {
    expect(levelKeysForPortalLevel('Sec 4')).toEqual(['AM', 'EM']);
    expect(levelKeysForPortalLevel('Sec4')).toEqual(['AM', 'EM']);
    expect(levelKeysForPortalLevel('sec 3')).toEqual(['AM', 'EM']);
  });
  it('maps lower sec and JC', () => {
    expect(levelKeysForPortalLevel('Sec 1')).toEqual(['S1']);
    expect(levelKeysForPortalLevel('S2')).toEqual(['S2']);
    expect(levelKeysForPortalLevel('JC1')).toEqual(['JC2']);
    expect(levelKeysForPortalLevel('jc')).toEqual(['JC2']);
  });
  it('unknown/blank stays manual', () => {
    expect(levelKeysForPortalLevel('')).toEqual([]);
    expect(levelKeysForPortalLevel(null)).toEqual([]);
    expect(levelKeysForPortalLevel('Primary 6')).toEqual([]);
  });
});

describe('findTopicInText', () => {
  const topics = ['Vectors', 'Quadratic Functions', 'Sets', 'Algebra (Expansion)', 'Functions'];
  it('finds a topic named in free text', () => {
    expect(findTopicInText('A worksheet on vectors, exam difficulty', topics)).toBe('Vectors');
  });
  it('prefers the longest match', () => {
    expect(findTopicInText('more quadratic functions please', topics)).toBe('Quadratic Functions');
  });
  it('matches a parenthetical part alone', () => {
    expect(findTopicInText('can I get something on expansion', topics)).toBe('Algebra (Expansion)');
  });
  it('never matches inside a longer word', () => {
    // "worksheets" must not hit the topic "Sets".
    expect(findTopicInText('some worksheets please', topics)).toBeNull();
  });
  it('a short topic still matches as a whole word', () => {
    expect(findTopicInText('sets please', topics)).toBe('Sets');
  });
  it('null on no match', () => {
    expect(findTopicInText('notes on the last lesson', ['Vectors'])).toBeNull();
    expect(findTopicInText('', topics)).toBeNull();
  });
});

describe('tierFromText', () => {
  it('reads difficulty words as the advanced tier', () => {
    expect(tierFromText('worksheet on vectors, exam difficulty')).toBe('advanced');
    expect(tierFromText('harder questions on trig')).toBe('advanced');
    expect(tierFromText('challenging ones please')).toBe('advanced');
  });
  it('defaults to mixed', () => {
    expect(tierFromText('a worksheet on vectors')).toBeNull();
  });
});
