import { describe, expect, it } from 'vitest';
import { OPEN_GROUPS, groupHeading, groupMistakes, attachQuestions, familyOf, familySubjects, isPaperGroup, notebookSubject, questionNumbersIn, splitBySubject, splitCards, splitFold } from './notebook-groups';
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

describe('splitBySubject — one tab per subject (30 Sep 2026)', () => {
  it('maths first, then sciences; placeholders open no tab; default = newest live sighting', () => {
    const { subjects, defaultSubject } = splitBySubject([
      row({ id: 'p', subject: 'Physics', evidence: [paper('r1', 'Phy P2', '2026-09-20T00:00:00Z')] }),
      row({ id: 'a', subject: 'AM', evidence: [paper('r2', 'Prelim P1', '2026-09-12T00:00:00Z')] }),
      row({ id: 'e', subject: 'E Math', state: 'fixed', evidence: [paper('r3', 'WA2', '2026-09-25T00:00:00Z')] }),
      row({ id: 'x', subject: null, seen_count: 0, evidence: [] }),
    ]);
    expect(subjects.map(s => s.subject)).toEqual(['A Math', 'E Math', 'Physics']);
    expect(defaultSubject).toBe('Physics'); // the E Math one is fixed
  });
  it('normalises the subject names', () => {
    expect(notebookSubject('EM')).toBe('E Math');
    expect(notebookSubject('chemistry')).toBe('Chemistry');
    expect(notebookSubject(null)).toBe('Other');
  });
});


describe('attachQuestions — one card per lost-marks question (1 Oct 2026)', () => {
  it('reads the question numbers off an entry\'s label', () => {
    expect(questionNumbersIn('Q6(a)(ii), Q3(b), Q10(c)(iii)1., Q6(b)')).toEqual(['6', '3', '10']);
    expect(questionNumbersIn(null)).toEqual([]);
  });
  it('attaches entries to the paper\'s dropped questions, keeps the paper\'s order, leaves the rest loose', () => {
    const rows = [
      row({ id: 'a', title: 'Sign slip in Vectors', evidence: [paper('run-a', 'Prelim P1', '2026-09-12T00:00:00Z', 'Q3, Q7(a)')] }),
      row({ id: 'b', title: 'Units in Kinematics', evidence: [paper('run-a', 'Prelim P1', '2026-09-12T00:00:00Z', 'Q7(b)')] }),
      row({ id: 'c', title: 'On a deleted paper', evidence: [paper('run-gone', 'Old', '2026-09-01T00:00:00Z', 'Q1')] }),
      row({ id: 'd', title: 'Named a question the paper did not drop', evidence: [paper('run-a', 'Prelim P1', '2026-09-12T00:00:00Z', 'Q12')] }),
    ];
    const g = groupMistakes(rows);
    const [pa, gone] = attachQuestions(g.groups, [{ id: 'run-a', dropped: [{ questionNumber: '7' }, { questionNumber: '3' }, { questionNumber: '9' }] }]);
    expect(pa.cards.map(c => c.questionNumber)).toEqual(['7', '3', '9']);
    expect(pa.cards[0].entries.map(e => e.id).sort()).toEqual(['a', 'b']);
    expect(pa.cards[1].entries.map(e => e.id)).toEqual(['a']);
    expect(pa.cards[2].entries).toEqual([]);
    expect(pa.loose.map(e => e.id)).toEqual(['d']);
    expect(gone.cards).toEqual([]);
    expect(gone.loose.map(e => e.id)).toEqual(['c']);
  });
  it('folds after three cards', () => {
    const cards = ['1', '2', '3', '4', '5'].map(n => ({ key: `r:${n}`, runId: 'r', questionNumber: n, entries: [] }));
    const { open, more } = splitCards(cards);
    expect(open.map(c => c.questionNumber)).toEqual(['1', '2', '3']);
    expect(more.map(c => c.questionNumber)).toEqual(['4', '5']);
  });
});

describe('familySubjects — two Notebooks, one per family (1 Oct 2026)', () => {
  const rows = ['E Math', 'A Math', 'Physics', 'Biology', 'Other'];
  it('maths: the maths subjects with a mistake, in tab order', () => {
    expect(familySubjects(rows, 'math', null)).toEqual(['A Math', 'E Math', 'Other']);
    expect(familyOf('Chemistry')).toBe('science');
    expect(familyOf('H2 Math')).toBe('math');
  });
  it('science: the sciences the student takes, even one with nothing on it; no choice yet → the ones with a mistake', () => {
    expect(familySubjects(rows, 'science', ['Physics', 'Chemistry'])).toEqual(['Physics', 'Chemistry']);
    expect(familySubjects(rows, 'science', null)).toEqual(['Physics', 'Biology']);
    expect(familySubjects(rows, 'science', [])).toEqual(['Physics', 'Biology']);
  });
});
