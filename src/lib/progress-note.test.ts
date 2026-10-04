import { describe, expect, it } from 'vitest';
import { buildProgressFacts, checkNoteNumbers, monthsUpTo, noteDue, parseProgressNote, renderProgressFacts, type NotePaper } from './progress-note';

const NOW = new Date('2026-10-05T04:00:00Z');
const q = (topic: string, awarded: number, max: number) => ({ marking_output: { meta: { topic_detected: topic } }, marking: { total_awarded: awarded, total_max: max } });
const paper = (date: string, results: unknown[], awarded = 50, max = 80): NotePaper => ({ date, name: `P ${date}`, subject: 'A Math', awarded, max, resultJson: { results } });

describe('facts', () => {
  const f = buildProgressFacts({
    now: NOW,
    papers: [
      paper('2026-09-10', [q('trigonometric identities', 2, 8), q('logarithms', 5, 5), q('trigonometric identities — proofs', 1, 4)], 40, 80),
      paper('2026-10-02', [q('trigonometric identities', 5, 8), q('kinematics', 3, 6)], 60, 80),
      paper('2026-05-01', [q('surds', 0, 9)]), // outside the window
      { date: '2026-09-20', name: 'Chem', subject: 'Chemistry', awarded: 10, max: 50, resultJson: {} },
    ],
    mistakes: [
      { subject: 'A Math', topic: 'trigonometric identities', errorKind: 'misread', evidence: [{ date: '2026-09-10', clean: false }, { date: '2026-10-02', clean: false }] },
      { subject: 'A Math', topic: 'kinematics', errorKind: 'concept', evidence: [{ date: '2026-10-02', clean: false }, { date: '2026-10-03', clean: true }] },
    ],
    attempts: [{ at: '2026-09-15T00:00:00Z', verdict: 'correct', topics: ['Logarithms'] }, { at: '2026-09-16T00:00:00Z', verdict: 'wrong', topics: ['Logarithms'] }],
    asks: [{ at: '2026-10-01T00:00:00Z', topic: 'Trigonometry (Identities)' }],
    taught: [{ date: '2026-09-30', topics: ['Kinematics'], how: 'auto' }],
    sheets: [],
    exams: [{ date: '2026-10-20', label: 'EOY', subject: 'A Math', daysLeft: 15 }],
  });

  it('marks lost by canonical topic by month, maths papers in the window only', () => {
    expect(f.months).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(f.papers.map((p) => p.pct)).toEqual([50, 75]);
    const trig = f.topics.find((t) => t.topic === 'Trigonometry (Identities)')!;
    expect(trig.byMonth).toEqual({ '2026-08': 0, '2026-09': 9, '2026-10': 3 });
    expect(trig.lost).toBe(12);
    expect(f.topics.some((t) => t.topic === 'Surds')).toBe(false);
  });
  it('causes from the Notebook, clean evidence left out', () => {
    expect(f.causes).toEqual([
      { kind: 'misread', words: 'misreading the question', n: 2, share: 67 },
      { kind: 'concept', words: 'not knowing the method (concept)', n: 1, share: 33 },
    ]);
    expect(f.practice).toMatchObject({ attempts: 2, correct: 1 });
    expect(f.lastDataAt).toBe('2026-10-02T00:00:00.000Z');
  });
  it('renders the plain lines the note is written from', () => {
    const t = renderProgressFacts(f);
    expect(t).toContain('- Trigonometry (Identities): 0 / 9 / 3 (12 marks over 3 questions)');
    expect(t).toContain('- misreading the question: 2 (67%)');
    expect(t).toContain('Coming exams: A Math EOY 2026-10-20 (15 days).');
  });

  it('a number the facts do not hold is caught', () => {
    const t = renderProgressFacts(f);
    const note = { doing: ['Trigonometry: lost 9 marks in Sep, 3 in Oct.'], why: ['67% of lost questions were misreading.'], next: ['Worked examples on identities, 2 a lesson.'], parent: null };
    expect(checkNoteNumbers(note, t)).toEqual([]);
    expect(checkNoteNumbers({ ...note, why: ['85% were misreading.'] }, t)).toEqual(['85']);
  });
});

describe('note shape and when it is due', () => {
  it('parses and trims', () => {
    expect(parseProgressNote('{"doing":["a"],"why":[],"next":["b"],"parent":" p "}')).toEqual({ doing: ['a'], why: [], next: ['b'], parent: 'p' });
    expect(parseProgressNote({ doing: [], next: ['x'] })).toHaveProperty('error');
    expect(parseProgressNote('nope')).toHaveProperty('error');
  });
  it('due weekly with new data, or before a lesson', () => {
    const d = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
    expect(noteDue({ lastNoteAt: null, lastDataAt: d(1), lessonSoon: false, now: NOW })).toBe(true);
    expect(noteDue({ lastNoteAt: null, lastDataAt: null, lessonSoon: true, now: NOW })).toBe(false);
    expect(noteDue({ lastNoteAt: d(8), lastDataAt: d(1), lessonSoon: false, now: NOW })).toBe(true);
    expect(noteDue({ lastNoteAt: d(8), lastDataAt: d(9), lessonSoon: true, now: NOW })).toBe(false);
    expect(noteDue({ lastNoteAt: d(3), lastDataAt: d(1), lessonSoon: true, now: NOW })).toBe(true);
    expect(noteDue({ lastNoteAt: d(3), lastDataAt: d(1), lessonSoon: false, now: NOW })).toBe(false);
    expect(noteDue({ lastNoteAt: d(1), lastDataAt: d(0.5), lessonSoon: true, now: NOW })).toBe(false);
  });
  it('months', () => {
    expect(monthsUpTo('2026-01-15', 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});
