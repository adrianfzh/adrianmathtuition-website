import { describe, it, expect } from 'vitest';
import {
  cleanSuggestion, isRecentDuplicate, senderFields, suggestionTelegramLine, sortSuggestions,
  isSuggestionStatus, MAX_SUGGESTION_CHARS,
} from './suggestions';

const NOW = Date.parse('2026-10-05T05:00:00Z');
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

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

describe('the duplicate guard (needs no identity)', () => {
  it('drops the same text sent again within a minute', () => {
    expect(isRecentDuplicate('More vectors', [{ text: 'more vectors', created_at: ago(20) }], NOW)).toBe(true);
  });
  it('lets the same text through after a minute, and a different text at once', () => {
    expect(isRecentDuplicate('More vectors', [{ text: 'More vectors', created_at: ago(61) }], NOW)).toBe(false);
    expect(isRecentDuplicate('More trig', [{ text: 'More vectors', created_at: ago(5) }], NOW)).toBe(false);
  });
});

describe('who sent it', () => {
  const who = { accountId: 'a58e1c18-0000-0000-0000-000000000000', identity: 'recX', name: 'Joey Tan' };
  it('anonymous stores nothing about the student', () => {
    expect(senderFields(true, who)).toEqual({ anonymous: true, account_id: null, airtable_student_id: null, student_name: null });
  });
  it('named stores the account, identity and name', () => {
    expect(senderFields(false, who)).toEqual({ anonymous: false, account_id: who.accountId, airtable_student_id: 'recX', student_name: 'Joey Tan' });
  });
});

describe('the Telegram line', () => {
  it('names the student and escapes the text', () => {
    expect(suggestionTelegramLine({ name: 'Joey Tan', anonymous: false, text: 'more <b>proofs</b> & trig' }))
      .toBe('💡 <b>Joey Tan</b> suggests:\nmore &lt;b&gt;proofs&lt;/b&gt; &amp; trig');
  });
  it('says Anonymous and never the name when anonymous', () => {
    const line = suggestionTelegramLine({ name: 'Joey Tan', anonymous: true, text: 'x' });
    expect(line).toBe('💡 <b>Anonymous</b> suggests:\nx');
    expect(line).not.toContain('Joey');
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
