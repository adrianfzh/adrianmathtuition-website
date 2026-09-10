import { describe, expect, it } from 'vitest';
import { examCountdownNoticeDue, examCountdownOn, mergePrefs, readPrefsPatch, saveAnswersOn } from './portal-prefs';

describe('readPrefsPatch', () => {
  it('accepts a whitelisted boolean', () => {
    expect(readPrefsPatch({ ask_signal: true })).toEqual({ patch: { ask_signal: true } });
    expect(readPrefsPatch({ ask_signal: false })).toEqual({ patch: { ask_signal: false } });
  });
  it('refuses unknown keys, non-booleans, empties and non-objects', () => {
    expect(readPrefsPatch({ theme: 'dark' })).toEqual({ error: 'unknown pref: theme' });
    expect(readPrefsPatch({ ask_signal: 'yes' })).toEqual({ error: 'ask_signal must be true or false' });
    expect(readPrefsPatch({})).toEqual({ error: 'prefs is empty' });
    expect(readPrefsPatch(null)).toEqual({ error: 'prefs must be an object' });
    expect(readPrefsPatch([true])).toEqual({ error: 'prefs must be an object' });
    expect(readPrefsPatch('ask_signal')).toEqual({ error: 'prefs must be an object' });
  });
});

describe('mergePrefs', () => {
  it('lays the patch over what is stored and keeps other keys', () => {
    expect(mergePrefs({ other: 1, ask_signal: false }, { ask_signal: true })).toEqual({ other: 1, ask_signal: true });
  });
  it('treats a null or malformed stored value as empty', () => {
    expect(mergePrefs(null, { ask_signal: true })).toEqual({ ask_signal: true });
    expect(mergePrefs('junk', { ask_signal: true })).toEqual({ ask_signal: true });
    expect(mergePrefs([1], { ask_signal: true })).toEqual({ ask_signal: true });
  });
});

describe('exam countdown prefs', () => {
  it('accepts both countdown keys', () => {
    expect(readPrefsPatch({ exam_countdown: true, exam_countdown_notice_seen: true }))
      .toEqual({ patch: { exam_countdown: true, exam_countdown_notice_seen: true } });
  });
  it('is on only for an explicit true', () => {
    expect(examCountdownOn({ exam_countdown: true })).toBe(true);
    expect(examCountdownOn({ exam_countdown: false })).toBe(false);
    expect(examCountdownOn({})).toBe(false);
    expect(examCountdownOn(null)).toBe(false);
  });
  it('the one-time notice is due until the switch is touched or the notice dismissed', () => {
    expect(examCountdownNoticeDue({})).toBe(true);
    expect(examCountdownNoticeDue(null)).toBe(true);
    expect(examCountdownNoticeDue({ ask_signal: true })).toBe(true);
    expect(examCountdownNoticeDue({ exam_countdown_notice_seen: true })).toBe(false);
    expect(examCountdownNoticeDue({ exam_countdown: true })).toBe(false);
    // an explicit off is a decision — no nagging
    expect(examCountdownNoticeDue({ exam_countdown: false })).toBe(false);
  });
});

describe('save answers pref', () => {
  it('is whitelisted and on only for an explicit true', () => {
    expect(readPrefsPatch({ save_answers: true })).toEqual({ patch: { save_answers: true } });
    expect(saveAnswersOn({ save_answers: true })).toBe(true);
    expect(saveAnswersOn({ save_answers: 'yes' })).toBe(false);
    expect(saveAnswersOn({})).toBe(false);
  });
});
