import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DURATIONS,
  MOCK_COVER_INSTRUCTIONS,
  MOCK_COVER_INSTRUCTIONS_H2,
  MOCK_LEVELS,
  MOCK_TOTAL_TOLERANCE,
  answerMarkdown,
  assembleMockFromCandidates,
  blueprintKeyFor,
  mockCover,
  mockCoverInstructions,
  mockTitle,
  paperCodeFull,
  paperDuration,
  questionMarkdown,
  rankWeakTopics,
  sectionHeadings,
  sgtStartOfWeekIso,
  shapeFromTitle,
  shapeLabel,
  subjectCode,
  subjectName,
  toPaperShape,
  type MockSlotInput,
  type QbPrintRow,
} from './print-paper';
import { mulberry32, targetMarks, type Candidate, type PaperDef } from './prelim-builder';
import type { TopicMastery } from './mastery';

const blueprint: { papers: Record<string, PaperDef> } = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'data', 'paper-blueprints.json'), 'utf8')
);

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

describe('blueprintKeyFor', () => {
  it('maps JC1/JC2 to the JC blueprint family and leaves AM/EM alone', () => {
    expect(blueprintKeyFor('JC1', 'P1')).toBe('JC-P1');
    expect(blueprintKeyFor('JC1', 'P2')).toBe('JC-P2');
    expect(blueprintKeyFor('JC2', 'P1')).toBe('JC-P1');
    expect(blueprintKeyFor('JC2', 'P2')).toBe('JC-P2');
    expect(blueprintKeyFor('AM', 'P1')).toBe('AM-P1');
    expect(blueprintKeyFor('EM', 'P2')).toBe('EM-P2');
  });

  it('resolves a real blueprint entry for EVERY mock level (the enablement gate)', () => {
    for (const level of MOCK_LEVELS) {
      for (const paper of ['P1', 'P2']) {
        expect(blueprint.papers[blueprintKeyFor(level, paper)], `${level} ${paper}`).toBeTruthy();
      }
    }
    expect(blueprint.papers[blueprintKeyFor('JC2', 'P1')].total_marks).toBe(100);
  });

  it('prefixes GCE- for the national-exam shape, on every family', () => {
    expect(blueprintKeyFor('AM', 'P1', 'gce')).toBe('GCE-AM-P1');
    expect(blueprintKeyFor('AM', 'P2', 'gce')).toBe('GCE-AM-P2');
    expect(blueprintKeyFor('EM', 'P1', 'gce')).toBe('GCE-EM-P1');
    expect(blueprintKeyFor('EM', 'P2', 'gce')).toBe('GCE-EM-P2');
    // student levels collapse to the JC family before the prefix goes on
    expect(blueprintKeyFor('JC1', 'P1', 'gce')).toBe('GCE-JC-P1');
    expect(blueprintKeyFor('JC2', 'P2', 'gce')).toBe('GCE-JC-P2');
    // an explicit 'prelim' is exactly the default
    expect(blueprintKeyFor('AM', 'P1', 'prelim')).toBe('AM-P1');
  });

  it('resolves a real blueprint entry for every mock level in the GCE shape too', () => {
    for (const level of MOCK_LEVELS) {
      for (const paper of ['P1', 'P2']) {
        expect(
          blueprint.papers[blueprintKeyFor(level, paper, 'gce')],
          `${level} ${paper} gce`
        ).toBeTruthy();
      }
    }
  });
});

describe('paper shape', () => {
  it('narrows an untrusted value — only the literal "gce" is the national shape', () => {
    expect(toPaperShape('gce')).toBe('gce');
    expect(toPaperShape('prelim')).toBe('prelim');
    expect(toPaperShape('GCE')).toBe('prelim');
    expect(toPaperShape(undefined)).toBe('prelim');
    expect(toPaperShape(null)).toBe('prelim');
    expect(toPaperShape(1)).toBe('prelim');
  });

  it('labels the shape by the level a student sits (JC reads A-Level)', () => {
    expect(shapeLabel('AM', 'prelim')).toBe('School prelim format');
    expect(shapeLabel('JC2', 'prelim')).toBe('School prelim format');
    expect(shapeLabel('AM', 'gce')).toBe('O-Level format');
    expect(shapeLabel('EM', 'gce')).toBe('O-Level format');
    expect(shapeLabel('JC1', 'gce')).toBe('A-Level format');
    expect(shapeLabel('JC2', 'gce')).toBe('A-Level format');
    expect(shapeLabel('JC', 'gce')).toBe('A-Level format');
  });

  it('round-trips the shape through the stored title (the only carrier there is)', () => {
    // portal_generated_papers has no request-details column, so the title is
    // what /pdf reads back. A prelim title stays byte-identical to the old one.
    expect(mockTitle('AM', 'P1')).toBe('A Math mock Paper 1');
    expect(mockTitle('EM', 'P2')).toBe('E Math mock Paper 2');
    expect(mockTitle('JC2', 'P1')).toBe('H2 Mathematics mock Paper 1');
    expect(mockTitle('AM', 'P1', 'gce')).toBe('A Math mock Paper 1 · O-Level format');
    expect(mockTitle('JC1', 'P2', 'gce')).toBe('H2 Mathematics mock Paper 2 · A-Level format');
    for (const level of MOCK_LEVELS) {
      for (const paper of ['P1', 'P2']) {
        expect(shapeFromTitle(mockTitle(level, paper, 'gce'))).toBe('gce');
        expect(shapeFromTitle(mockTitle(level, paper))).toBe('prelim');
      }
    }
    // an old row, and a student-typed title that merely mentions a level
    expect(shapeFromTitle('A Math mock Paper 1')).toBe('prelim');
    expect(shapeFromTitle('O-Level revision')).toBe('prelim');
  });

  it('says so on the cover only for a GCE-shaped paper', () => {
    const gce = mockCover('AM', 'P1', { printedFor: 'Wei Jie', printedOn: '28 Aug 2026', shape: 'gce' });
    expect(gce.candidateLine).toBe('Printed for Wei Jie · 28 Aug 2026 · O-Level format · AdrianMath');
    const jc = mockCover('JC2', 'P2', { printedOn: '28 Aug 2026', shape: 'gce' });
    expect(jc.candidateLine).toBe('28 Aug 2026 · A-Level format · AdrianMath');
    expect(jc.duration).toBe('3 hours');
  });
});

describe('exam-format facts', () => {
  it('carries the real exam duration for every blueprinted paper', () => {
    expect(DURATIONS['AM-P1']).toBe('2 hours 15 minutes');
    expect(DURATIONS['AM-P2']).toBe('2 hours 15 minutes');
    expect(DURATIONS['EM-P1']).toBe('2 hours 15 minutes');
    expect(DURATIONS['EM-P2']).toBe('2 hours 15 minutes');
    // H2 9758 — both papers 3 hours (blueprint family key 'JC')
    expect(DURATIONS['JC-P1']).toBe('3 hours');
    expect(DURATIONS['JC-P2']).toBe('3 hours');
    expect(paperDuration('AM', 'P1')).toBe('2 hours 15 minutes');
    // student level keys (JC1/JC2) hit the JC entries through blueprintKeyFor —
    // the mapping this pin used to demand of enablement, now live
    expect(paperDuration('JC2', 'P1')).toBe('3 hours');
    expect(paperDuration('JC1', 'P2')).toBe('3 hours');
  });

  it('carries a duration for the GCE shape too — all 12 blueprint keys', () => {
    // A GCE key must answer for itself: a missing row would silently fall the
    // cover back to the '2 hours 15 minutes' default, wrong for H2.
    expect(DURATIONS['GCE-AM-P1']).toBe('2 hours 15 minutes');
    expect(DURATIONS['GCE-AM-P2']).toBe('2 hours 15 minutes');
    expect(DURATIONS['GCE-EM-P1']).toBe('2 hours 15 minutes');
    expect(DURATIONS['GCE-EM-P2']).toBe('2 hours 15 minutes');
    expect(DURATIONS['GCE-JC-P1']).toBe('3 hours');
    expect(DURATIONS['GCE-JC-P2']).toBe('3 hours');
    expect(Object.keys(DURATIONS)).toHaveLength(12);
    expect(paperDuration('AM', 'P2', 'gce')).toBe('2 hours 15 minutes');
    expect(paperDuration('JC2', 'P1', 'gce')).toBe('3 hours');
    // every key in the table is a real blueprint entry, and vice versa
    expect(Object.keys(DURATIONS).sort()).toEqual(Object.keys(blueprint.papers).sort());
  });

  it('derives SEAB subject codes the same way the admin export always has', () => {
    expect(subjectCode('AM')).toBe('4049');
    expect(subjectCode('EM')).toBe('4052');
    expect(subjectName('AM')).toBe('ADDITIONAL MATHEMATICS');
    expect(subjectName('EM')).toBe('MATHEMATICS');
    expect(paperCodeFull('AM', 'P1')).toBe('4049/01');
    expect(paperCodeFull('EM', 'P2')).toBe('4052/02');
    // H2 9758 — student levels AND the admin builder's 'JC' family key
    expect(subjectCode('JC1')).toBe('9758');
    expect(subjectCode('JC2')).toBe('9758');
    expect(subjectCode('JC')).toBe('9758');
    expect(subjectName('JC2')).toBe('MATHEMATICS');
    expect(paperCodeFull('JC1', 'P1')).toBe('9758/01');
    expect(paperCodeFull('JC2', 'P2')).toBe('9758/02');
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

  it('builds the H2 cover block for a JC2 student', () => {
    const c = mockCover('JC2', 'P2', { printedFor: 'Jia En', printedOn: '28 Aug 2026' });
    expect(c.subjectName).toBe('MATHEMATICS');
    expect(c.subjectCode).toBe('9758/02');
    expect(c.paperLabel).toBe('Paper 2');
    expect(c.duration).toBe('3 hours');
  });

  it('picks the graphing-calculator instructions for H2 and scientific for O-Level', () => {
    expect(mockCoverInstructions('JC1')).toBe(MOCK_COVER_INSTRUCTIONS_H2);
    expect(mockCoverInstructions('JC2')).toBe(MOCK_COVER_INSTRUCTIONS_H2);
    expect(mockCoverInstructions('AM')).toBe(MOCK_COVER_INSTRUCTIONS);
    expect(mockCoverInstructions('EM')).toBe(MOCK_COVER_INSTRUCTIONS);
    const h2 = MOCK_COVER_INSTRUCTIONS_H2.join(' ');
    expect(h2).toContain('approved graphing calculator');
    expect(h2).toContain('Unsupported answers from a graphing calculator are allowed');
    expect(h2).not.toContain('scientific calculator');
    expect(MOCK_COVER_INSTRUCTIONS.join(' ')).toContain('approved scientific calculator');
  });
});

describe('sectionHeadings', () => {
  it('derives the two H2 P2 headings, marks summed from the real blueprint (40/60)', () => {
    const jc2 = blueprint.papers[blueprintKeyFor('JC1', 'P2')];
    expect(sectionHeadings(jc2)).toEqual([
      { beforePos: 1, label: 'Section A: Pure Mathematics [40 marks]' },
      { beforePos: jc2.section_boundary, label: 'Section B: Probability and Statistics [60 marks]' },
    ]);
  });

  it('is empty for unsectioned papers and missing blueprints', () => {
    expect(sectionHeadings(blueprint.papers['AM-P1'])).toEqual([]);
    expect(sectionHeadings(blueprint.papers['EM-P2'])).toEqual([]);
    expect(sectionHeadings(blueprint.papers['JC-P1'])).toEqual([]);
    expect(sectionHeadings(null)).toEqual([]);
    expect(sectionHeadings(undefined)).toEqual([]);
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

  it('lands a JC-P2 mock on exactly 100 marks from the real blueprint targets', () => {
    // The enablement path end-to-end minus I/O: blueprintKeyFor('JC2','P2')
    // resolves the real JC blueprint, its standard targets sum to 100, and the
    // slot walk + landTotal ship exactly 100 — every slot filled (a sectioned
    // paper may never run short, or Section B headings would drift).
    const paperDef = blueprint.papers[blueprintKeyFor('JC2', 'P2')];
    const targets = targetMarks(paperDef, { difficulty: 'standard' });
    expect(targets.reduce((a, b) => a + b, 0)).toBe(100);
    for (let seed = 1; seed <= 8; seed++) {
      const slots = paperDef.slots.map((s, i) =>
        slot(s.pos, targets[i], [
          cand(`q${s.pos}a`, targets[i]),
          cand(`q${s.pos}b`, Math.min(s.marks[1], targets[i] + 1)),
        ]),
      );
      const out = assembleMockFromCandidates(slots, paperDef.total_marks, mulberry32(seed));
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.totalMarks).toBe(100);
        expect(out.landed).toBe(true);
        expect(out.refs).toHaveLength(paperDef.slots.length);
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
