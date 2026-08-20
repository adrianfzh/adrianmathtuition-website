import { describe, it, expect } from 'vitest';
import {
  classifyLevelString,
  detectBankLevel,
  extractDroppedForMapping,
  buildMapperPrompt,
  parseMapperResponse,
  type SubgroupCandidate,
  type DroppedForMapping,
} from './revise-map';

// Every string in the classify tests below is a REAL `level_detected` value
// observed in paper_marking_runs on 2026-08-21 — the noise is the point.

describe('classifyLevelString', () => {
  it('recognises Additional Mathematics in its many spellings', () => {
    expect(classifyLevelString('Sec 4 O-Level Additional Mathematics')).toBe('AM');
    expect(classifyLevelString('Sec 4 A-Math (O-Level)')).toBe('AM');
    expect(classifyLevelString('Sec 4 Add Maths')).toBe('AM');
    expect(classifyLevelString('O-Level Additional Mathematics (4049)')).toBe('AM');
    expect(classifyLevelString('O-Level A-Math')).toBe('AM');
  });

  it('subject markers outrank JC/H2 markers in combined hedge labels', () => {
    // The marker hedging "could be JC, could be AM" on an O-Level paper.
    expect(classifyLevelString('A-Level H2 / JC1 (or Additional Maths)')).toBe('AM');
    expect(classifyLevelString('A-Level / H2 (or Sec 4 Additional Maths)')).toBe('AM');
    expect(classifyLevelString('A-Level H2 / A-Maths differentiation')).toBe('AM');
  });

  it('recognises Elementary Mathematics', () => {
    expect(classifyLevelString('O-Level Elementary Mathematics')).toBe('EM');
    expect(classifyLevelString('Secondary 3/4 (O-Level E-Maths)')).toBe('EM');
  });

  it('a label naming BOTH subjects casts no vote', () => {
    expect(classifyLevelString('O-Level Additional/Elementary Mathematics')).toBeNull();
    expect(classifyLevelString('Secondary 3/4 (O-Level Additional/E-Maths)')).toBeNull();
  });

  it('recognises JC only without a subject marker', () => {
    expect(classifyLevelString('A-Level H2 Mathematics')).toBe('JC');
    expect(classifyLevelString('JC1 Calculus')).toBe('JC');
    expect(classifyLevelString('H2 Maths')).toBe('JC');
  });

  it('lower-secondary levels', () => {
    expect(classifyLevelString('Sec 1 Mathematics')).toBe('S1');
    expect(classifyLevelString('Secondary 2 Express')).toBe('S2');
  });

  it('subject-free labels cast no vote', () => {
    expect(classifyLevelString('O-Level')).toBeNull();
    expect(classifyLevelString('O-Level / IGCSE')).toBeNull();
    expect(classifyLevelString('Secondary 4 Mathematics')).toBeNull();
    // "Sec 3/4" must not match the Sec-1–2 patterns via its digits
    expect(classifyLevelString('Secondary 3/4 (O-Level)')).toBeNull();
  });
});

function runWith(levels: (string | undefined)[], markings?: unknown[]) {
  return {
    results: levels.map((level_detected, i) => ({
      question_number: String(i + 1),
      marking_output: { meta: level_detected ? { level_detected } : {} },
      marking: markings?.[i] ?? { total_max: 5, total_awarded: 5, parts: [] },
    })),
  };
}

describe('detectBankLevel', () => {
  it('majority-votes a noisy AM paper to AM', () => {
    // Shape of run c0073dbf: mostly AM labels with JC hedges sprinkled in.
    const run = runWith([
      'O-Level Additional Mathematics',
      'A-Level H2 / JC1 Calculus',
      'O-Level / Sec 4 Additional Mathematics',
      'A-Level H2',
      'Secondary 3/4 O-Level Additional Mathematics',
      'Sec 4 Additional Mathematics',
    ]);
    expect(detectBankLevel(run)).toBe('AM');
  });

  it('votes an EM paper to EM even with subject-free labels', () => {
    const run = runWith([
      'O-Level',
      'O-Level Elementary Mathematics',
      'Secondary 3/4 (O-Level E-Maths)',
      'O-Level Additional/Elementary Mathematics', // no vote
      'Secondary 4 Mathematics',
    ]);
    expect(detectBankLevel(run)).toBe('EM');
  });

  it('a tie is undetectable — no mapping beats a wrong one', () => {
    const run = runWith(['O-Level Additional Mathematics', 'A-Level H2 Mathematics']);
    expect(detectBankLevel(run)).toBeNull();
  });

  it('no classifiable labels → null', () => {
    expect(detectBankLevel(runWith(['O-Level', undefined]))).toBeNull();
    expect(detectBankLevel({})).toBeNull();
    expect(detectBankLevel(null)).toBeNull();
  });
});

const droppedRun = {
  results: [
    {
      question_number: '3',
      marking_output: { meta: { topic_detected: 'Surds' } },
      marking: {
        total_max: 4,
        total_awarded: 2,
        parts: [
          { label: 'a', max: 2, awarded: 2, error_summary: 'no errors' },
          { label: 'b', max: 2, awarded: 0, error_summary: 'rationalised with the wrong conjugate', study_note: 'Multiply by the conjugate of the DENOMINATOR.' },
        ],
      },
    },
    {
      question_number: '5',
      marking_output: { meta: { topic_detected: 'Linear law / logarithms' } },
      marking: {
        total_max: 6,
        total_awarded: 1,
        parts: [{ label: '', max: 6, awarded: 1, error_summary: 'plotted lg y against x instead of lg x' }],
      },
    },
    {
      question_number: '7',
      marking_output: { meta: { topic_detected: 'Binomial Theorem' } },
      marking: { total_max: 5, total_awarded: 5, parts: [] }, // full marks — not dropped
    },
  ],
};

describe('extractDroppedForMapping', () => {
  it('extracts dropped questions, biggest loss first, skipping full marks', () => {
    const dropped = extractDroppedForMapping(droppedRun);
    expect(dropped.map(d => d.questionNumber)).toEqual(['5', '3']);
    expect(dropped[0].lost).toBe(5);
    expect(dropped[1].topic).toBe('Surds');
  });

  it('collects error summaries AND study notes only from lossy parts', () => {
    const q3 = extractDroppedForMapping(droppedRun).find(d => d.questionNumber === '3')!;
    expect(q3.slips).toEqual([
      'rationalised with the wrong conjugate',
      'Multiply by the conjugate of the DENOMINATOR.',
    ]);
    // part (a) scored full — its "no errors" line must not leak in
    expect(q3.slips.join(' ')).not.toContain('no errors');
  });

  it('caps at 15 questions, keeping the biggest losses', () => {
    const results = Array.from({ length: 20 }, (_, i) => ({
      question_number: String(i + 1),
      marking_output: { meta: {} },
      marking: { total_max: 30, total_awarded: i, parts: [] }, // Q1 loses most
    }));
    const dropped = extractDroppedForMapping({ results });
    expect(dropped).toHaveLength(15);
    expect(dropped[0].questionNumber).toBe('1');
    expect(dropped.map(d => d.questionNumber)).not.toContain('20');
  });

  it('handles junk shapes without throwing', () => {
    expect(extractDroppedForMapping(null)).toEqual([]);
    expect(extractDroppedForMapping({ results: 'nope' })).toEqual([]);
    expect(extractDroppedForMapping({ results: [null, 42, { marking: null }] })).toEqual([]);
  });
});

const candidates: SubgroupCandidate[] = [
  { id: 101, topic: 'Surds', name: 'Rationalising Denominators', description: 'Multiply by the conjugate.' },
  { id: 202, topic: 'Linear Law', name: 'Choosing Axes for Linearisation', description: null },
  { id: 303, topic: 'Logarithms', name: 'Solving Log Equations', description: 'Change of base.' },
];
const dropped: DroppedForMapping[] = [
  { questionNumber: '5', lost: 5, topic: 'Linear law / logarithms', slips: [] },
  { questionNumber: '3', lost: 2, topic: 'Surds', slips: ['wrong conjugate'] },
];

describe('buildMapperPrompt', () => {
  it('includes every question and every candidate line', () => {
    const p = buildMapperPrompt(dropped, candidates);
    expect(p).toContain('Q5 (lost 5 marks)');
    expect(p).toContain('Q3 (lost 2 marks)');
    expect(p).toContain('101 | Surds | Rationalising Denominators — Multiply by the conjugate.');
    expect(p).toContain('202 | Linear Law | Choosing Axes for Linearisation');
    expect(p).toContain('what went wrong: wrong conjugate');
  });
});

describe('parseMapperResponse', () => {
  it('resolves valid picks to full items from the candidate row', () => {
    const items = parseMapperResponse(
      '{"items":[{"for":"5","subgroup_id":202},{"for":"3","subgroup_id":101}]}',
      candidates,
      dropped
    );
    expect(items).toEqual([
      { for: '5', subgroup_id: 202, name: 'Choosing Axes for Linearisation', topic: 'Linear Law' },
      { for: '3', subgroup_id: 101, name: 'Rationalising Denominators', topic: 'Surds' },
    ]);
  });

  it('extracts the JSON out of prose and fences', () => {
    const items = parseMapperResponse(
      'Here you go:\n```json\n{"items":[{"for":"3","subgroup_id":101}]}\n```\nDone.',
      candidates,
      dropped
    );
    expect(items).toHaveLength(1);
  });

  it('drops hallucinated ids, unknown questions, and duplicate answers', () => {
    const items = parseMapperResponse(
      JSON.stringify({
        items: [
          { for: '3', subgroup_id: 999 },   // id not in the list
          { for: '12', subgroup_id: 101 },  // question never asked about
          { for: '5', subgroup_id: 202 },
          { for: '5', subgroup_id: 303 },   // second answer for Q5
        ],
      }),
      candidates,
      dropped
    );
    expect(items).toEqual([
      { for: '5', subgroup_id: 202, name: 'Choosing Axes for Linearisation', topic: 'Linear Law' },
    ]);
  });

  it('accepts Q-prefixed question numbers (models echo the prompt rendering)', () => {
    // Verbatim shape of a real claude-opus-4-8 reply observed 2026-08-21: the
    // prompt shows "Q5 (lost 5 marks)", so the model wrote "for":"Q5" even
    // though instructed to reply with the bare number.
    const items = parseMapperResponse(
      '{"items":[{"for":"Q5","subgroup_id":202},{"for":"Q3","subgroup_id":101}]}',
      candidates,
      dropped
    );
    expect(items.map(i => i.for)).toEqual(['5', '3']);
    // and a Q-prefixed duplicate of a bare answer is still a duplicate
    const dup = parseMapperResponse(
      '{"items":[{"for":"5","subgroup_id":202},{"for":"Q5","subgroup_id":303}]}',
      candidates,
      dropped
    );
    expect(dup).toHaveLength(1);
    expect(dup[0].subgroup_id).toBe(202);
  });

  it('returns [] on garbage', () => {
    expect(parseMapperResponse('I could not decide.', candidates, dropped)).toEqual([]);
    expect(parseMapperResponse('{"items": "none"}', candidates, dropped)).toEqual([]);
    expect(parseMapperResponse('{broken json', candidates, dropped)).toEqual([]);
  });
});
