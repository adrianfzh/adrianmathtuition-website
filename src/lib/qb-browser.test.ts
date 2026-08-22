import { describe, it, expect } from 'vitest';
import { compareQnum, excerptText, searchTerms, normalizeForSearch } from './qb-browser';

describe('compareQnum', () => {
  it('sorts numerically, not lexicographically', () => {
    const nums = ['10', '2', '1', '21', '3'];
    nums.sort(compareQnum);
    expect(nums).toEqual(['1', '2', '3', '10', '21']);
  });
  it('bare number precedes its lettered parts; letters order among themselves', () => {
    const nums = ['12b', '12', '12a', '3(b)', '3(a)'];
    nums.sort(compareQnum);
    expect(nums).toEqual(['3(a)', '3(b)', '12', '12a', '12b']);
  });
  it('non-numeric numbers sink to the end without throwing', () => {
    const nums = ['A1', '2', '?', '10'];
    nums.sort(compareQnum);
    expect(nums.slice(0, 2)).toEqual(['2', '10']);
    expect(nums.slice(2).sort()).toEqual(['?', 'A1']);
    expect(() => compareQnum(null, undefined)).not.toThrow();
  });
});

describe('excerptText', () => {
  it('collapses whitespace and cuts on a word boundary with ellipsis', () => {
    const t = excerptText('The  quick\n\nbrown fox '.repeat(30), 50);
    expect(t.endsWith('…')).toBe(true);
    expect(t.length).toBeLessThanOrEqual(52);
    expect(t).not.toMatch(/\n/);
  });
  it('short text passes through untouched', () => {
    expect(excerptText('Solve $x^2 = 4$.')).toBe('Solve $x^2 = 4$.');
  });
});

describe('searchTerms', () => {
  it('splits, dedupes case-insensitively, strips ILIKE metacharacters, caps at 5', () => {
    expect(searchTerms('circle Circle  10% a_b one two three four five six')).toEqual([
      'circle', '10', 'ab', 'one', 'two',
    ]);
  });
  it('empty and junk input give an empty list', () => {
    expect(searchTerms('  a  ')).toEqual([]);
    expect(searchTerms(null)).toEqual([]);
  });
});

describe('normalizeForSearch', () => {
  it('strips LaTeX commands and specials, mirroring the DB column', () => {
    expect(normalizeForSearch('Solve \\frac{2}{x} = $x^2$')).toBe('solve 2 x = x 2');
  });
  it('plain words pass through lowered', () => {
    expect(normalizeForSearch('Circle Properties')).toBe('circle properties');
  });
});
