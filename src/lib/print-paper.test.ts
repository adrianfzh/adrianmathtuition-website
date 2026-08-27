import { describe, expect, it } from 'vitest';
import {
  DURATIONS,
  MOCK_TOTAL_TOLERANCE,
  answerMarkdown,
  assembleMockFromCandidates,
  mockCover,
  paperCodeFull,
  paperDuration,
  questionMarkdown,
  rankWeakTopics,
  sgtStartOfWeekIso,
  subjectCode,
  subjectName,
  type MockSlotInput,
  type QbPrintRow,
} from './print-paper';
import { mulberry32, type Candidate } from './prelim-builder';
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

describe('exam-format facts', () => {
  it('carries the real O-Level duration for all four mock papers', () => {
    expect(DURATIONS['AM-P1']).toBe('2 hours 15 minutes');
    expect(DURATIONS['AM-P2']).toBe('2 hours 15 minutes');
    expect(DURATIONS['EM-P1']).toBe('2 hours 15 minutes');
    expect(DURATIONS['EM-P2']).toBe('2 hours 15 minutes');
    expect(paperDuration('AM', 'P1')).toBe('2 hours 15 minutes');
    expect(paperDuration('JC2', 'P1')).toBeNull();
  });

  it('derives SEAB subject codes the same way the admin export always has', () => {
    expect(subjectCode('AM')).toBe('4049');
    expect(subjectCode('EM')).toBe('4052');
    expect(subjectName('AM')).toBe('ADDITIONAL MATHEMATICS');
    expect(subjectName('EM')).toBe('MATHEMATICS');
    expect(paperCodeFull('AM', 'P1')).toBe('4049/01');
    expect(paperCodeFull('EM', 'P2')).toBe('4052/02');
  });

  it('builds a complete mock cover block', () => {
    const c = mockCover('AM', 'P1', { printedFor: 'Wei Jie', printedOn: '28 Aug 2026' });
    expect(c.centre).toBe('ADRIAN MATH TUITION');
    expect(c.subjectName).toBe('ADDITIONAL MATHEMATICS');
    expect(c.subjectCode).toBe('4049/01');
    expect(c.paperLabel).toBe('Paper 1');
    expect(c.duration).toBe('2 hours 15 minutes');
    expect(c.materials.length).toBeGreaterThan(0);
    expect(c.candidateLine).toBe('Printed for Wei Jie · 28 Aug 2026 · AdrianMath');
  });
});

describe('assembleMockFromCandidates', () => {
  const cand = (id: string, marks: number, extra: Partial<Candidate> = {}): Candidate => ({
    id,
    total_marks: marks,
    school: null,
    year: 2024,
    difficulty: null,
    has_image: false,
    image_url: null,
    answer: 'x',
    has_solution: false,
    parts_count: 1,
    ...extra,
  });
  const slot = (pos: number, target: number, candidates: Candidate[]): MockSlotInput => ({
    pos,
    topic: `T${pos}`,
    target,
    candidates,
  });

  it('LANDS the paper total via landTotal — every seed, including ones whose first pick misses it', () => {
    // One slot, candidates worth 5 and 8, target total 8. pickForSlot's top-k
    // randomness picks either; a 5-pick only reaches 8 through the landTotal
    // swap (and |5−8| exceeds the tolerance, so without landTotal this would
    // FAIL, not squeak through). Passing on every seed proves the mock path
    // actually lands totals — the v1 route never called landTotal at all.
    for (let seed = 1; seed <= 12; seed++) {
      const out = assembleMockFromCandidates([slot(1, 8, [cand('a', 5), cand('b', 8)])], 8, mulberry32(seed));
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.totalMarks).toBe(8);
        expect(out.landed).toBe(true);
      }
    }
  });

  it('refuses to ship a short paper (fill below ~0.95 of slots is a hard error)', () => {
    const slots: MockSlotInput[] = [];
    for (let i = 1; i <= 20; i++) slots.push(slot(i, 3, i <= 10 ? [cand(`q${i}`, 3)] : []));
    const out = assembleMockFromCandidates(slots, 60, mulberry32(1));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('Only 10 of 20');
  });

  it('tolerates a single unfilled slot on a 26-slot EM-P1 shape when the total still lands', () => {
    const slots: MockSlotInput[] = [];
    for (let i = 1; i <= 25; i++) slots.push(slot(i, 3, [cand(`q${i}`, 3)]));
    slots.push(slot(26, 3, [])); // one empty slot: 25/26 ≥ 0.95
    const out = assembleMockFromCandidates(slots, 75, mulberry32(2));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.refs).toHaveLength(25);
      expect(out.refs.map(r => r.pos)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
      expect(out.totalMarks).toBe(75);
    }
  });

  it('rejects an unlandable total outside the tolerance', () => {
    const out = assembleMockFromCandidates([slot(1, 6, [cand('a', 5)])], 5 + MOCK_TOTAL_TOLERANCE + 1, mulberry32(3));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('landed on 5 marks');
  });

  it('never lets a landTotal swap duplicate a question that another slot picked', () => {
    // Slot 1 sees {a:5, d:6}; slot 2 sees only {d:6}. If slot 1 picks a, slot 2
    // picks d and d also sits in slot 1's alternates — an unguarded landTotal
    // chasing 12 would swap slot 1 onto d too, printing the question twice.
    for (let seed = 1; seed <= 12; seed++) {
      const out = assembleMockFromCandidates(
        [slot(1, 5, [cand('a', 5), cand('d', 6)]), slot(2, 6, [cand('d', 6)])],
        12,
        mulberry32(seed),
      );
      if (out.ok) {
        const ids = out.refs.map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('returns refs that are structurally just {id, pos, marks} — no school/year/answer leaves the assembler', () => {
    const out = assembleMockFromCandidates(
      [slot(1, 5, [cand('a', 5, { school: 'RI', year: 2025, answer: 'secret' })])],
      5,
      mulberry32(4),
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      for (const ref of out.refs) {
        expect(Object.keys(ref).sort()).toEqual(['id', 'marks', 'pos']);
      }
    }
  });
});
