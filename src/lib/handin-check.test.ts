import { describe, it, expect } from 'vitest';
import { cleanMissing, handinCheckStamp, handinCheckLine } from './handin-check';

const AT = '2026-09-29T16:00:00.000Z';
const joey = [{ q: 1, part: 'a' }, { q: 1, part: 'd' }, { q: 2 }];

describe('handinCheckStamp', () => {
  it('a clean first send records the check that ran', () => {
    expect(handinCheckStamp({ at: AT, preflight: { list: 'bank', key: 'GCE 2024 EM P2', missing: [] } }))
      .toEqual({ checked_at: AT, list: 'bank', key: 'GCE 2024 EM P2', asked: [], missing: [], answer: null });
  });
  it('"I didn\'t do these" records the list the student was shown', () => {
    const s = handinCheckStamp({ at: AT, preflight: null, check: { asked: joey, list: 'bank', key: 'GCE 2024 EM P2' }, answer: 'not-done' });
    expect(s).toMatchObject({ list: 'bank', missing: joey, answer: 'not-done' });
  });
  it('Send anyway is recorded as sent-anyway', () => {
    expect(handinCheckStamp({ at: AT, preflight: null, check: { asked: joey }, answer: 'whatever' })).toMatchObject({ answer: 'sent-anyway', list: 'none' });
  });
  it('asked, then came back with pages: the new check decides what is still missing', () => {
    const s = handinCheckStamp({ at: AT, preflight: { list: 'bank', missing: [{ q: 2 }] }, check: { asked: joey } });
    expect(s).toMatchObject({ answer: 'added', missing: [{ q: 2 }], asked: joey });
  });
  it('nothing ran and nothing was shown → no stamp', () => {
    expect(handinCheckStamp({ at: AT, preflight: null, check: null })).toBeNull();
  });
});

describe('cleanMissing / handinCheckLine', () => {
  it('drops malformed entries and roman numerals', () => {
    expect(cleanMissing([{ q: 1, part: 'a' }, { q: 'x' }, { q: 3, part: 'ii' }, null])).toEqual([{ q: 1, part: 'a' }, { q: 3 }]);
  });
  it('the desk line says which case it is', () => {
    expect(handinCheckLine({ missing: joey, answer: 'sent-anyway' })).toBe('⚠️ Missing at hand-in, sent anyway: Q1(a), Q1(d), Q2');
    expect(handinCheckLine({ missing: joey, answer: 'not-done' })).toBe('✋ Student said not done: Q1(a), Q1(d), Q2');
    expect(handinCheckLine({ missing: [], answer: 'added' })).toBeNull();
  });
});
