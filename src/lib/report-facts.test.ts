import { describe, it, expect } from 'vitest';
import {
  buildReportFacts,
  aggregateTopicBleed,
  renderFactsMarkdown,
  renderFactsForPrompt,
  topicKey,
  type ReportPaper,
} from './report-facts';
import type { DigestLesson } from './progress-digest';

const TODAY = '2026-08-31';

function lesson(over: Partial<DigestLesson> = {}): DigestLesson {
  return {
    id: 'rec1',
    studentId: 'recS',
    date: '2026-08-05',
    status: 'Completed',
    type: 'Regular',
    mastery: '',
    mood: '',
    topics: [],
    lessonNotes: '',
    homeworkAssigned: '',
    homeworkReturned: '',
    homeworkReturnedReason: '',
    progressLogged: true,
    ...over,
  };
}

/** One marked question inside result_json.results[]. */
function q(topic: string | null, awarded: number, max: number) {
  return {
    marking: { total_awarded: awarded, total_max: max },
    marking_output: { meta: topic === null ? {} : { topic_detected: topic } },
  };
}

function paper(over: Partial<ReportPaper> & { questions?: unknown[] } = {}): ReportPaper {
  const { questions, ...rest } = over;
  return {
    id: 'run1',
    date: '2026-08-10',
    name: 'Paper 1',
    totalAwarded: 40,
    totalMax: 50,
    resultJson: { results: questions ?? [] },
    ...rest,
  };
}

describe('topicKey', () => {
  it('folds case, surrounding space and trailing punctuation', () => {
    expect(topicKey('  Differentiation. ')).toBe('differentiation');
    expect(topicKey('Differentiation')).toBe('differentiation');
    expect(topicKey('INTEGRATION,')).toBe('integration');
  });

  it('collapses internal whitespace including non-breaking spaces', () => {
    expect(topicKey('Integration  by parts')).toBe('integration by parts');
  });
});

describe('aggregateTopicBleed', () => {
  it('folds spelling variants of one topic into a single row', () => {
    const rows = aggregateTopicBleed([
      paper({ questions: [q('Differentiation', 3, 5), q('differentiation ', 4, 5)] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ topic: 'Differentiation', awarded: 7, max: 10, lost: 3, pct: 70, questions: 2 });
  });

  it('sorts weakest first, breaking ties on marks lost', () => {
    const rows = aggregateTopicBleed([
      paper({ questions: [q('Algebra', 5, 10), q('Vectors', 10, 20), q('Trig', 9, 10)] }),
    ]);
    // Algebra and Vectors both 50%; Vectors lost 10 marks vs Algebra's 5.
    expect(rows.map(r => r.topic)).toEqual(['Vectors', 'Algebra', 'Trig']);
  });

  it('ignores questions with no detected topic or a zero max', () => {
    const rows = aggregateTopicBleed([
      paper({ questions: [q(null, 3, 5), q('', 3, 5), q('Trig', 0, 0), q('Trig', 4, 5)] }),
    ]);
    expect(rows).toEqual([expect.objectContaining({ topic: 'Trig', max: 5, questions: 1 })]);
  });

  it('survives malformed result_json without throwing', () => {
    expect(aggregateTopicBleed([paper({ resultJson: null })])).toEqual([]);
    expect(aggregateTopicBleed([paper({ resultJson: 'queued' })])).toEqual([]);
    expect(aggregateTopicBleed([paper({ resultJson: { results: 'nope' } })])).toEqual([]);
    expect(aggregateTopicBleed([paper({ resultJson: { results: [null, 7, {}] } })])).toEqual([]);
  });

  it('accumulates one topic across several papers', () => {
    const rows = aggregateTopicBleed([
      paper({ id: 'a', questions: [q('Trig', 2, 10)] }),
      paper({ id: 'b', questions: [q('Trig', 8, 10)] }),
    ]);
    expect(rows[0]).toMatchObject({ topic: 'Trig', awarded: 10, max: 20, pct: 50, questions: 2 });
  });
});

describe('buildReportFacts — attendance', () => {
  it('counts Completed as attended and Absent as missed', () => {
    const f = buildReportFacts({
      lessons: [lesson(), lesson({ status: 'Absent' }), lesson()],
      today: TODAY,
    });
    expect(f.attended).toBe(2);
    expect(f.missed).toBe(1);
    expect(f.attendancePct).toBe(67);
  });

  it('excludes Rescheduled from the ratio — it was made up elsewhere', () => {
    const f = buildReportFacts({
      lessons: [lesson(), lesson({ status: 'Rescheduled' })],
      today: TODAY,
    });
    expect(f.moved).toBe(1);
    expect(f.attended).toBe(1);
    expect(f.attendancePct).toBe(100);
  });

  it('counts a past Scheduled lesson as unlogged, never as attended or missed', () => {
    const f = buildReportFacts({
      lessons: [lesson({ status: 'Scheduled', date: '2026-08-04' })],
      today: TODAY,
    });
    expect(f.unlogged).toBe(1);
    expect(f.attended).toBe(0);
    expect(f.missed).toBe(0);
    expect(f.attendancePct).toBeNull();
  });

  it('does not count a future Scheduled lesson as unlogged', () => {
    const f = buildReportFacts({
      lessons: [lesson({ status: 'Scheduled', date: '2026-09-04' })],
      today: TODAY,
    });
    expect(f.unlogged).toBe(0);
  });
});

describe('buildReportFacts — homework and mastery', () => {
  it('rates only fully-returned homework, keeping partial and missed visible', () => {
    const f = buildReportFacts({
      lessons: [
        lesson({ homeworkReturned: 'Yes' }),
        lesson({ homeworkReturned: 'Yes' }),
        lesson({ homeworkReturned: 'Partial' }),
        lesson({ homeworkReturned: 'No' }),
        lesson({ homeworkReturned: '' }),
      ],
      today: TODAY,
    });
    expect(f.homework).toEqual({ returned: 2, partial: 1, missed: 1, rate: 50 });
  });

  it('reports a null homework rate when nothing was ever recorded', () => {
    const f = buildReportFacts({ lessons: [lesson(), lesson()], today: TODAY });
    expect(f.homework.rate).toBeNull();
  });

  it('tallies the mastery mix', () => {
    const f = buildReportFacts({
      lessons: [lesson({ mastery: 'Strong' }), lesson({ mastery: 'Slow' }), lesson({ mastery: 'Slow' }), lesson()],
      today: TODAY,
    });
    expect(f.mastery).toEqual({ strong: 1, ok: 0, slow: 2, logged: 3 });
  });
});

describe('buildReportFacts — topics', () => {
  it('ranks topics by how many lessons touched them, folding variants', () => {
    const f = buildReportFacts({
      lessons: [
        lesson({ topics: ['Differentiation', 'Trigonometry'] }),
        lesson({ topics: ['differentiation'] }),
        lesson({ topics: ['Vectors'] }),
      ],
      today: TODAY,
    });
    expect(f.topics).toEqual([
      { topic: 'Differentiation', lessons: 2 },
      { topic: 'Trigonometry', lessons: 1 },
      { topic: 'Vectors', lessons: 1 },
    ]);
  });

  it('counts a topic once per lesson even when it repeats within that lesson', () => {
    const f = buildReportFacts({
      lessons: [lesson({ topics: ['Trig', 'trig', 'Trig '] })],
      today: TODAY,
    });
    expect(f.topics).toEqual([{ topic: 'Trig', lessons: 1 }]);
  });
});

describe('buildReportFacts — papers', () => {
  it('orders papers oldest-first and reports average and trend', () => {
    const f = buildReportFacts({
      lessons: [],
      papers: [
        paper({ id: 'b', date: '2026-08-20', totalAwarded: 38, totalMax: 50 }), // 76%
        paper({ id: 'a', date: '2026-08-05', totalAwarded: 30, totalMax: 50 }), // 60%
      ],
      today: TODAY,
    });
    expect(f.papers.map(p => p.pct)).toEqual([60, 76]);
    expect(f.paperAverage).toBe(68);
    expect(f.paperTrendPts).toBe(16);
  });

  it('has no trend from a single paper', () => {
    const f = buildReportFacts({ lessons: [], papers: [paper()], today: TODAY });
    expect(f.paperTrendPts).toBeNull();
    expect(f.paperAverage).toBe(80);
  });

  it('drops unscorable papers rather than dividing by zero', () => {
    const f = buildReportFacts({
      lessons: [],
      papers: [paper({ totalAwarded: null, totalMax: null }), paper({ id: 'x', totalMax: 0 })],
      today: TODAY,
    });
    expect(f.papers).toEqual([]);
    expect(f.paperAverage).toBeNull();
  });
});

describe('buildReportFacts — weak and strong topics', () => {
  it('suppresses topics with too few marks to mean anything', () => {
    const f = buildReportFacts({
      lessons: [],
      papers: [paper({ questions: [q('Trig', 0, 2), q('Algebra', 2, 10)] })],
      today: TODAY,
    });
    // Trig scored 0% but on only 2 marks — one slip, not a weakness.
    expect(f.weakTopics.map(t => t.topic)).toEqual(['Algebra']);
  });

  it('caps weak topics at three, worst first', () => {
    const f = buildReportFacts({
      lessons: [],
      papers: [paper({
        questions: [q('A', 1, 10), q('B', 2, 10), q('C', 3, 10), q('D', 4, 10)],
      })],
      today: TODAY,
    });
    expect(f.weakTopics.map(t => t.topic)).toEqual(['A', 'B', 'C']);
  });

  it('lists only genuinely strong topics, best first', () => {
    const f = buildReportFacts({
      lessons: [],
      papers: [paper({ questions: [q('A', 10, 10), q('B', 9, 10), q('C', 8, 10)] })],
      today: TODAY,
    });
    // C is 80% — above the weak ceiling but below the strong floor, so neither.
    expect(f.strongTopics.map(t => t.topic)).toEqual(['A', 'B']);
    expect(f.weakTopics).toEqual([]);
  });
});

describe('buildReportFacts — empty', () => {
  it('flags a period with nothing in it', () => {
    expect(buildReportFacts({ lessons: [], today: TODAY }).empty).toBe(true);
  });

  it('is not empty when only an unmarked lesson exists but a paper was marked', () => {
    const f = buildReportFacts({ lessons: [], papers: [paper()], today: TODAY });
    expect(f.empty).toBe(false);
  });
});

describe('renderFactsMarkdown', () => {
  it('renders only the lines that have data', () => {
    const f = buildReportFacts({
      lessons: [lesson({ topics: ['Trig'], homeworkReturned: 'Yes' }), lesson({ status: 'Absent' })],
      today: TODAY,
    });
    const md = renderFactsMarkdown(f, 'August 2026');
    expect(md).toContain('**August 2026 at a glance**');
    expect(md).toContain('- **Lessons attended:** 1 of 2');
    expect(md).toContain('- **Homework returned:** 1 of 1');
    expect(md).toContain('- **Topics covered:** Trig');
    expect(md).not.toContain('Marked papers');
    expect(md).not.toContain('Focus areas');
  });

  it('never prints a zero-of-zero homework line', () => {
    const f = buildReportFacts({ lessons: [lesson()], today: TODAY });
    expect(renderFactsMarkdown(f, 'August 2026')).not.toContain('Homework');
  });

  it('shows the paper score sequence with a trend arrow', () => {
    const f = buildReportFacts({
      lessons: [],
      papers: [
        paper({ id: 'a', date: '2026-08-01', totalAwarded: 25, totalMax: 50 }),
        paper({ id: 'b', date: '2026-08-20', totalAwarded: 40, totalMax: 50 }),
      ],
      today: TODAY,
    });
    const md = renderFactsMarkdown(f, 'August 2026');
    expect(md).toContain('50% → 80%');
    expect(md).toContain('↑30');
  });

  it('returns an empty string for an empty period', () => {
    expect(renderFactsMarkdown(buildReportFacts({ lessons: [], today: TODAY }), 'August 2026')).toBe('');
  });
});

describe('renderFactsForPrompt', () => {
  it('warns the model off lessons that were never written up', () => {
    const f = buildReportFacts({
      lessons: [lesson(), lesson({ status: 'Scheduled', date: '2026-08-04' })],
      today: TODAY,
    });
    expect(renderFactsForPrompt(f)).toContain('never written up');
  });

  it('says plainly when there is nothing computed', () => {
    expect(renderFactsForPrompt(buildReportFacts({ lessons: [], today: TODAY })))
      .toContain('no computed facts');
  });
});
