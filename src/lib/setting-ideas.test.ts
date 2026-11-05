import { describe, expect, it } from 'vitest';
import { countLine, ideaCardEdit, isIdeaStatus, sortIdeas } from './setting-ideas';

describe('setting ideas', () => {
  it('knows only the three statuses', () => {
    expect(isIdeaStatus('approved')).toBe(true);
    expect(isIdeaStatus('done')).toBe(false);
    expect(isIdeaStatus(undefined)).toBe(false);
  });
  it('sorts new first, then most students, then most recent', () => {
    const rows = [
      { id: 1, status: 'approved' as const, student_count: 9, last_asked_at: '2026-11-05' },
      { id: 2, status: 'new' as const, student_count: 1, last_asked_at: '2026-11-05' },
      { id: 3, status: 'new' as const, student_count: 4, last_asked_at: '2026-11-01' },
      { id: 4, status: 'declined' as const, student_count: 20, last_asked_at: '2026-11-05' },
    ];
    expect(sortIdeas(rows).map((r) => r.id)).toEqual([3, 2, 1, 4]);
  });
  it('says students, and asks only when there are more asks', () => {
    expect(countLine({ student_count: 1, ask_count: 1 })).toBe('1 student');
    expect(countLine({ student_count: 2, ask_count: 3 })).toBe('2 students · 3 asks');
  });
  it('the Telegram card after a website decision: decision line and no buttons; Undo brings the buttons back', () => {
    const row = { id: 7, name: 'answers in Chinese', status: 'approved' as const, ask_count: 3, student_count: 2, first_who: 'Amy', first_words: 'send me answers in Chinese' };
    const a = ideaCardEdit(row);
    expect(a.text).toMatch(/"answers in Chinese"[\s\S]*Students asking: 2 \(3 asks\)[\s\S]*👍 Added to the to-build list/);
    expect(a.reply_markup.inline_keyboard).toEqual([]);
    expect(ideaCardEdit({ ...row, status: 'declined' }).text).toMatch(/👎 Declined/);
    const back = ideaCardEdit({ ...row, status: 'new' });
    expect(back.reply_markup.inline_keyboard[0].map((b) => b.callback_data)).toEqual(['sg_ok:7', 'sg_no:7']);
    expect(back.text).not.toMatch(/Declined|Added to/);
  });
});

