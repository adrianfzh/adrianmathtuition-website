import { describe, expect, it } from 'vitest';
import { PORTAL_PREF_KEYS, mergePrefs, readPrefsPatch } from './portal-prefs';

describe('readPrefsPatch', () => {
  it('refuses every key while the whitelist is empty (21 Sep 2026 — the four switches went)', () => {
    expect(PORTAL_PREF_KEYS).toEqual([]);
    expect(readPrefsPatch({ exam_countdown: true })).toEqual({ error: 'unknown pref: exam_countdown' });
    expect(readPrefsPatch({ resurface: true })).toEqual({ error: 'unknown pref: resurface' });
  });
  it('refuses non-objects, empties and non-booleans', () => {
    expect(readPrefsPatch(null)).toEqual({ error: 'prefs must be an object' });
    expect(readPrefsPatch([])).toEqual({ error: 'prefs must be an object' });
    expect(readPrefsPatch({})).toEqual({ error: 'prefs is empty' });
  });
});

describe('mergePrefs', () => {
  it('lays the patch over what is stored and keeps other keys', () => {
    expect(mergePrefs({ a: true, b: false }, { b: true })).toEqual({ a: true, b: true });
  });
  it('treats a null or malformed stored value as empty', () => {
    expect(mergePrefs(null, { a: true })).toEqual({ a: true });
    expect(mergePrefs('junk', { a: true })).toEqual({ a: true });
  });
});
