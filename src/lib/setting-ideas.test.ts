import { describe, expect, it } from 'vitest';
import { countLine, isIdeaStatus, sortIdeas } from './setting-ideas';

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
});
