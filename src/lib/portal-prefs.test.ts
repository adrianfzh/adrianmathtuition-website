import { describe, expect, it } from 'vitest';
import { PORTAL_PREF_KEYS, mergePrefs, readPrefsPatch, scienceChoiceLabel, studentSciences } from './portal-prefs';

describe('readPrefsPatch', () => {
  it('refuses the retired switches (21 Sep 2026 — the four switches went)', () => {
    expect(PORTAL_PREF_KEYS).toEqual(['combined_science']);
    expect(readPrefsPatch({ exam_countdown: true })).toEqual({ error: 'unknown pref: exam_countdown' });
    expect(readPrefsPatch({ resurface: true })).toEqual({ error: 'unknown pref: resurface' });
  });
  it('refuses non-objects, empties and non-booleans', () => {
    expect(readPrefsPatch(null)).toEqual({ error: 'prefs must be an object' });
    expect(readPrefsPatch([])).toEqual({ error: 'prefs must be an object' });
    expect(readPrefsPatch({})).toEqual({ error: 'prefs is empty' });
    expect(readPrefsPatch({ combined_science: 'yes' })).toEqual({ error: 'combined_science must be true or false' });
  });
  it('accepts the sciences a student takes, deduped and in the fixed order', () => {
    expect(readPrefsPatch({ sciences: ['biology', 'physics', 'physics'] })).toEqual({ patch: { sciences: ['physics', 'biology'] } });
    expect(readPrefsPatch({ sciences: [] })).toEqual({ error: 'sciences must name at least one' });
    expect(readPrefsPatch({ sciences: 'physics' })).toEqual({ error: 'sciences must be a list' });
    expect(readPrefsPatch({ sciences: ['physics', 'maths'] })).toEqual({ error: 'sciences: unknown value maths' });
  });
  it('Combined Science is exactly two sciences', () => {
    expect(readPrefsPatch({ sciences: ['physics', 'chemistry'], combined_science: true }))
      .toEqual({ patch: { sciences: ['physics', 'chemistry'], combined_science: true } });
    expect(readPrefsPatch({ sciences: ['physics'], combined_science: true }))
      .toEqual({ error: 'Combined Science is two sciences — pick the two in your paper' });
    expect(readPrefsPatch({ sciences: ['physics', 'chemistry', 'biology'], combined_science: false }))
      .toEqual({ patch: { sciences: ['physics', 'chemistry', 'biology'], combined_science: false } });
  });
});

describe('mergePrefs', () => {
  it('lays the patch over the stored blob and treats a malformed blob as empty', () => {
    expect(mergePrefs({ old: true }, { sciences: ['physics'] })).toEqual({ old: true, sciences: ['physics'] });
    expect(mergePrefs('junk', { combined_science: true })).toEqual({ combined_science: true });
  });
});

describe('studentSciences', () => {
  it('is null until the student has chosen', () => {
    expect(studentSciences(null)).toBeNull();
    expect(studentSciences({})).toBeNull();
    expect(studentSciences({ sciences: [] })).toBeNull();
    expect(studentSciences({ sciences: ['maths'] })).toBeNull();
  });
  it('reads the choice in the fixed order and only counts combined with two sciences', () => {
    expect(studentSciences({ sciences: ['chemistry', 'physics'], combined_science: true }))
      .toEqual({ subjects: ['physics', 'chemistry'], combined: true });
    expect(studentSciences({ sciences: ['chemistry', 'physics', 'biology'], combined_science: true }))
      .toEqual({ subjects: ['physics', 'chemistry', 'biology'], combined: false });
    expect(studentSciences({ sciences: ['biology'] })).toEqual({ subjects: ['biology'], combined: false });
  });
  it('labels the choice', () => {
    expect(scienceChoiceLabel({ subjects: ['physics', 'chemistry'], combined: true })).toBe('Physics · Chemistry — Combined Science');
    expect(scienceChoiceLabel({ subjects: ['physics', 'chemistry', 'biology'], combined: false })).toBe('Physics · Chemistry · Biology');
  });
});
