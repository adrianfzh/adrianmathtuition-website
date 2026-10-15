import { describe, it, expect } from 'vitest';
import { parseTranscript, transcribePrompt, UNREADABLE } from './humanities-photo';

describe('parseTranscript', () => {
  it('keeps the words and paragraph breaks', () => {
    const r = parseTranscript('Source A shows the poster.\n\n\n\nIt wants people to vote.\n');
    expect(r).toEqual({ ok: true, text: 'Source A shows the poster.\n\nIt wants people to vote.', unsure: 0 });
  });
  it('refuses a page with no answer', () => {
    expect(parseTranscript(UNREADABLE).ok).toBe(false);
    expect(parseTranscript(' unreadable. ').ok).toBe(false);
    expect(parseTranscript('').ok).toBe(false);
  });
  it('counts unread words, and refuses when most are unread', () => {
    const some = parseTranscript('The government [?] wants residents to vote on the budget.');
    expect(some.ok && some.unsure).toBe(1);
    expect(parseTranscript('[?] [?] [?] the [?] [?] vote').ok).toBe(false);
  });
  it('drops a code fence round the reply', () => {
    const r = parseTranscript('```\nI agree with the statement.\n```');
    expect(r.ok && r.text).toBe('I agree with the statement.');
  });
});

describe('transcribePrompt', () => {
  it('reads a printed question or sources, pictures in words', () => {
    expect(transcribePrompt(1, '', 'question')).toContain('an exam question');
    const s = transcribePrompt(2, '', 'sources');
    expect(s).toContain('2 photos show');
    expect(s).toContain('[Picture:');
  });
  it('names the page count and carries the question', () => {
    const p = transcribePrompt(2, 'How far do the sources agree?');
    expect(p).toContain('2 photos are');
    expect(p).toContain('page after page');
    expect(p).toContain('How far do the sources agree?');
  });
});
