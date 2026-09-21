import { describe, expect, it } from 'vitest';
import { OPEN_GROUPS, groupHeading, groupMistakes, splitFold } from './notebook-groups';
import type { MistakeRow } from './notebook-mistakes-store';

const paper = (ref: string, paper: string, date: string, label = 'Q3') => ({ kind: 'paper' as const, ref, label, paper, date, clean: false });
const row = (over: Partial<MistakeRow>): MistakeRow => ({
  id: 'm', airtable_student_id: 'rec1', subject: 'AM', title: 'Sign slip in Vectors', error_kind: 'sign', topic: 'Vectors',
  state: 'dark', seen_count: 1, clean_count: 0, came_back: false, evidence: [paper('run-a', 'Prelim P1', '2026-09-12T00:00:00Z')],
  practice_ids: [], last_seen_at: '2026-09-12T00:00:00Z', last_clean_at: null, student_fixed_at: null, created_at: '', updated_at: '', ...over,
} as MistakeRow);

describe('groupMistakes — by the paper each mistake was last seen on (21 Sep 2026)', () => {
  const rows = [
    row({ id: 'a', title: 'Sign slip in Vectors' }),
    row({ id: 'b', title: 'Units in Kinematics', state: 'light', evidence: [paper('run-a', 'Prelim P1', '2026-09-12T00:00:00Z', 'Q7')] }),
    row({ id: 'c', title: 'Chain rule in Differentiation', evidence: [paper('run-b', 'WA2', '2026-08-01T00:00:00Z')] }),
    row({ id: 'd', title: 'Rounding in Trigonometry', evidence: [{ kind: 'attempt', ref: 'att-1', label: 'Trigonometry', paper: null, date: '2026-09-05T00:00:00Z', clean: false }] }),
    row({ id: 'e', title: 'Old one', state: 'fixed', evidence: [paper('run-c', 'MYE', '2026-05-01T00:00:00Z')] }),
    row({ id: 'f', title: 'Placeholder', seen_count: 0, evidence: [] }),
    // Seen on WA2 first, then again on Prelim P1 — it belongs to Prelim P1 now.
    row({ id: 'g', title: 'Bracket in Algebra', evidence: [paper('run-b', 'WA2', '2026-08-01T00:00:00Z'), paper('run-a', 'Prelim P1', '2026-09-12T00:00:00Z', 'Q1')] }),
  ];
  const g = groupMistakes(rows, m => (m.id === 'a' ? [{ id: 'p1', title: 'Vectors practice' }] : []));

  it('newest paper first, practice as its own group, fixed apart, placeholders out', () => {
    expect(g.groups.map(x => x.title)).toEqual(['Prelim P1', 'Practice', 'WA2']);
    expect(g.groups[0].mistakes.map(m => m.id)).toEqual(['g', 'a', 'b']); // still happening first, then by title
    expect(g.groups[2].mistakes.map(m => m.id)).toEqual(['c']);
    expect(g.fixed).toEqual([{ id: 'e', title: 'Old one' }]);
    expect(g.groups.flatMap(x => x.mistakes).some(m => m.id === 'f')).toBe(false);
  });
  it('carries what the card shows', () => {
    const a = g.groups[0].mistakes[1];
    expect(a).toMatchObject({ stateText: 'Still happening', tone: 'rose', live: true, where: 'Q3', practice: [{ id: 'p1', title: 'Vectors practice' }] });
    expect(g.groups[0].mistakes[2]).toMatchObject({ stateText: 'Getting better', tone: 'amber', where: 'Q7' });
  });
  it('heads a group with the paper and the date', () => {
    expect(groupHeading(g.groups[0])).toBe('Prelim P1 · 12 Sep');
  });
  it('folds everything after the first two groups', () => {
    const { open, earlier } = splitFold(g.groups);
    expect(OPEN_GROUPS).toBe(2);
    expect(open.map(x => x.title)).toEqual(['Prelim P1', 'Practice']);
    expect(earlier.map(x => x.title)).toEqual(['WA2']);
  });
});
