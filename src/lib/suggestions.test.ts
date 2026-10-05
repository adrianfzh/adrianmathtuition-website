import { describe, it, expect } from 'vitest';
import {
  cleanSuggestion, cleanSubject, suggestionSubjects, underDailyCap, suggestionTelegramLine, sortSuggestions,
  isSuggestionStatus, MAX_SUGGESTION_CHARS, DAILY_SUGGESTION_CAP,
} from './suggestions';

describe('cleanSuggestion', () => {
  it('trims, folds spaces and blank lines', () => {
    expect(cleanSuggestion('  more   vectors\n\n\n\nquestions  ')).toEqual({ ok: true, text: 'more vectors\n\nquestions' });
  });
  it('refuses an empty text', () => {
    expect(cleanSuggestion('   \n ').ok).toBe(false);
    expect(cleanSuggestion(undefined).ok).toBe(false);
  });
  it('refuses a text over the limit instead of cutting it', () => {
    expect(cleanSuggestion('a'.repeat(MAX_SUGGESTION_CHARS)).ok).toBe(true);
    expect(cleanSuggestion('a'.repeat(MAX_SUGGESTION_CHARS + 1)).ok).toBe(false);
  });
});

describe('subject chips', () => {
  it('a Sec 4 student with both maths and two sciences gets all four', () => {
    const acct = { level: 'Sec 4', subjects: ['A Math', 'E Math'], prefs: { sciences: ['chemistry', 'physics'] } };
    expect(suggestionSubjects(acct)).toEqual(['A Math', 'E Math', 'Physics', 'Chemistry']);
  });
  it('a JC student gets H2 Math only', () => {
    expect(suggestionSubjects({ level: 'JC2', subjects: ['Math'], prefs: {} })).toEqual(['H2 Math']);
  });
  it('a subject not offered is dropped, never stored', () => {
    expect(cleanSubject('E Math', ['E Math'])).toBe('E Math');
    expect(cleanSubject('Biology', ['E Math'])).toBeNull();
    expect(cleanSubject('', ['E Math'])).toBeNull();
  });
});

describe('daily cap', () => {
  it(`allows ${DAILY_SUGGESTION_CAP} a day`, () => {
    expect(underDailyCap(DAILY_SUGGESTION_CAP - 1)).toBe(true);
    expect(underDailyCap(DAILY_SUGGESTION_CAP)).toBe(false);
  });
});

describe('the Telegram line', () => {
  it('names the student and the subject, escapes the text', () => {
    expect(suggestionTelegramLine({ name: 'Joey Tan', subject: 'A Math', text: 'more <b>proofs</b> & trig' }))
      .toBe('💡 <b>Joey Tan</b> · A Math suggests:\nmore &lt;b&gt;proofs&lt;/b&gt; &amp; trig');
  });
  it('works with no name and no subject', () => {
    expect(suggestionTelegramLine({ text: 'x' })).toBe('💡 <b>A student</b> suggests:\nx');
  });
});

describe('statuses + order', () => {
  it('knows the four statuses', () => {
    expect(['new', 'planned', 'done', 'no'].every(isSuggestionStatus)).toBe(true);
    expect(isSuggestionStatus('maybe')).toBe(false);
  });
  it('puts new ones first, newest first inside each', () => {
    const rows = [
      { id: 'a', status: 'done', created_at: '2026-10-05T03:00:00Z' },
      { id: 'b', status: 'new', created_at: '2026-10-01T03:00:00Z' },
      { id: 'c', status: 'new', created_at: '2026-10-04T03:00:00Z' },
    ];
    expect(sortSuggestions(rows).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});
