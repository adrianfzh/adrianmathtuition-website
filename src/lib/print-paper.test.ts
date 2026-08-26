import { describe, expect, it } from 'vitest';
import {
  answerMarkdown,
  questionMarkdown,
  rankWeakTopics,
  sgtStartOfWeekIso,
  type QbPrintRow,
} from './print-paper';
import type { TopicMastery } from './mastery';

describe('sgtStartOfWeekIso', () => {
  // 2026-08-26 is a Wednesday. SGT Monday 00:00 that week = Aug 24 00:00 SGT
  // = Aug 23 16:00 UTC.
  it('rolls a mid-week SGT time back to Monday 00:00 SGT', () => {
    expect(sgtStartOfWeekIso(new Date('2026-08-26T07:00:00Z'))).toBe('2026-08-23T16:00:00.000Z');
  });

  // Sunday 23:59 SGT still belongs to the week that began the PREVIOUS Monday.
  it('keeps SGT Sunday night in the outgoing week', () => {
    // 2026-08-30 is a Sunday. 23:59 SGT = 15:59 UTC.
    expect(sgtStartOfWeekIso(new Date('2026-08-30T15:59:00Z'))).toBe('2026-08-23T16:00:00.000Z');
  });

  // Monday 00:30 SGT (Sunday 16:30 UTC) starts the NEW week — the UTC-weekday
  // trap this helper exists to avoid.
  it('flips to the new week at SGT Monday midnight, not UTC midnight', () => {
    expect(sgtStartOfWeekIso(new Date('2026-08-30T16:30:00Z'))).toBe('2026-08-30T16:00:00.000Z');
  });
});

describe('rankWeakTopics', () => {
  const m = (topic: string, state: TopicMastery['state'], score: number): TopicMastery =>
    ({ topic, state, score, evidence: 10, delta: null });

  it('orders weak < shaky < solid, then ascending score, and drops unservable topics', () => {
    const ranked = rankWeakTopics(
      [m('Vectors', 'solid', 40), m('Circles', 'weak', 55), m('Surds', 'weak', 30), m('Logs', 'shaky', 20), m('Ghost', 'weak', 1)],
      new Set(['Vectors', 'Circles', 'Surds', 'Logs']),
      3,
    );
    expect(ranked).toEqual(['Surds', 'Circles', 'Logs']);
  });
});

describe('question/answer markdown', () => {
  const q: QbPrintRow = {
    id: 'q1',
    question_text: 'Solve for $x$.',
    total_marks: 5,
    parts: [
      { label: 'a', text: 'the real case', marks: 2, answer: '$x=3$' },
      { label: 'b', subparts: [{ label: 'i', text: 'the complex case', marks: 3, answer: '$x=3i$' }] },
    ],
    answer: null,
    has_image: false,
    image_url: null,
  };

  it('flattens stem, parts and subparts with mark tags', () => {
    const md = questionMarkdown(q);
    expect(md).toContain('Solve for $x$.');
    expect(md).toContain('(a) the real case  [2]');
    expect(md).toContain('(b)(i) the complex case  [3]');
  });

  it('rolls part answers up when there is no top-level answer', () => {
    expect(answerMarkdown(q)).toBe('(a) $x=3$  (b)(i) $x=3i$');
  });

  it('prefers the top-level answer verbatim', () => {
    expect(answerMarkdown({ ...q, answer: ' $x=\\pm 3$ ' })).toBe('$x=\\pm 3$');
  });
});
