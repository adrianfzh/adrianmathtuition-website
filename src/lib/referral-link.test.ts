import { describe, it, expect } from 'vitest';
import { parseReferrerMarker, appendReferrerMarker, referralPathFor, REC_ID_RE } from './referral-link';

const ID = 'rec4rVqT4eDcBRmeM'; // shape of a real Airtable rec id (17 chars)

describe('referral link marker', () => {
  it('round-trips a name through append → parse', () => {
    const stored = appendReferrerMarker('Kiara Tan', ID);
    expect(stored).toBe(`Kiara Tan [${ID}]`);
    expect(parseReferrerMarker(stored)).toEqual({ name: 'Kiara Tan', recId: ID });
  });

  it('a plain typed name (pre-link rows) parses with recId null — fuzzy fallback path', () => {
    expect(parseReferrerMarker('Abel Tan')).toEqual({ name: 'Abel Tan', recId: null });
    expect(parseReferrerMarker('')).toEqual({ name: '', recId: null });
    expect(parseReferrerMarker(null)).toEqual({ name: '', recId: null });
  });

  it('never double-markers on re-append (last id wins)', () => {
    const once = appendReferrerMarker('Kiara Tan', ID);
    const twice = appendReferrerMarker(once, 'recAAAAAAAAAAAAAA');
    expect(twice).toBe('Kiara Tan [recAAAAAAAAAAAAAA]');
  });

  it('rejects malformed ids rather than storing garbage', () => {
    expect(appendReferrerMarker('Kiara Tan', 'rec123')).toBe('Kiara Tan');
    expect(appendReferrerMarker('Kiara Tan', 'DROP TABLE')).toBe('Kiara Tan');
    expect(REC_ID_RE.test('rec4rVqT4eDcBRmeM')).toBe(true);
    expect(REC_ID_RE.test('rec4rVqT4eDcBRme')).toBe(false); // 16 chars
  });

  it('a link-only signup (no typed name) still stores a parseable marker', () => {
    const stored = appendReferrerMarker('', ID);
    expect(parseReferrerMarker(stored)).toEqual({ name: '', recId: ID });
  });

  it('names that merely LOOK like they contain brackets are untouched', () => {
    expect(parseReferrerMarker('Tan [Ah] Kow')).toEqual({ name: 'Tan [Ah] Kow', recId: null });
  });

  it('builds the shareable path', () => {
    expect(referralPathFor(ID)).toBe(`/r/${ID}`);
  });
});
