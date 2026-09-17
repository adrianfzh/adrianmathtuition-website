import { describe, it, expect } from 'vitest';
import { unseenByStudent, unseenLabel, isPracticeAgainName, notLookedAt } from './unseen-handins';

const row = (o: Partial<{ id: string; student_id: string | null; paper_name: string; created_at: string; admin_viewed_at: string | null; portal_submission: unknown; checked_at: string | null; released_at: string | null; superseded_by: string | null; released_via: string | null }>) => ({
  id: o.id ?? 'r', student_id: o.student_id === undefined ? 'recA' : o.student_id, paper_name: o.paper_name ?? 'em tys 2022 p1',
  created_at: o.created_at ?? '2026-09-17T10:00:00Z', admin_viewed_at: o.admin_viewed_at ?? null, portal_submission: o.portal_submission === undefined ? true : o.portal_submission,
  checked_at: o.checked_at ?? null, released_at: o.released_at === undefined ? '2026-09-17T11:00:00Z' : o.released_at,
  superseded_by: o.superseded_by ?? null, released_via: o.released_via === undefined ? 'auto:telegram' : o.released_via,
});

describe('unseenByStudent', () => {
  it('counts app hand-ins Adrian has not opened, papers and Practice Again apart, newest first', () => {
    const m = unseenByStudent([
      row({ id: '1', created_at: '2026-09-15T00:00:00Z' }),
      row({ id: '2', paper_name: 'EMATH Practice Again 2', created_at: '2026-09-16T00:00:00Z' }),
      row({ id: '3', paper_name: 'am 2023 p2', created_at: '2026-09-17T00:00:00Z' }),
    ]);
    const a = m.get('recA')!;
    expect(a.papers).toBe(2); expect(a.practiceAgain).toBe(1);
    expect(a.latest).toBe('2026-09-17T00:00:00Z');
    expect(a.names).toEqual(['am 2023 p2', 'EMATH Practice Again 2', 'em tys 2022 p1']);
  });
  it('a run Adrian opened or ticked, a paper he uploaded and released himself, an untagged run, an unreleased run or a superseded marking does not count', () => {
    const m = unseenByStudent([
      row({ id: '1', admin_viewed_at: '2026-09-17T01:00:00Z' }),
      row({ id: '2', portal_submission: null, released_via: 'telegram' }),
      row({ id: '3', student_id: null }),
      row({ id: '4', checked_at: '2026-09-17T02:00:00Z' }),
      row({ id: '5', released_at: null }),
      row({ id: '6', superseded_by: 'other' }),
    ]);
    expect(m.size).toBe(0);
  });
  it('notLookedAt is the one rule: a system release counts even without the app flag, a ticked one never does', () => {
    expect(notLookedAt(row({ portal_submission: null, released_via: 'auto:handin' }))).toBe(true);
    expect(notLookedAt(row({ checked_at: '2026-09-17T02:00:00Z' }))).toBe(false);
    expect(notLookedAt(null)).toBe(false);
  });
  it('label', () => {
    expect(unseenLabel({ papers: 2, practiceAgain: 1, latest: null, names: [] })).toBe('2 papers · 1 Practice Again not looked at');
    expect(unseenLabel({ papers: 1, practiceAgain: 0, latest: null, names: [] })).toBe('1 paper not looked at');
    expect(unseenLabel({ papers: 0, practiceAgain: 0, latest: null, names: [] })).toBe('');
    expect(isPracticeAgainName('Practice Again — E Math · 2022 · Paper 1')).toBe(true);
  });
});
