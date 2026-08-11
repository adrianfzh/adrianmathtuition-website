import { describe, it, expect } from 'vitest';
import {
  checkProposal,
  checkBatch,
  buildUpdates,
  unjustifiedNumbers,
  numbersIn,
  partLabels,
  normalise,
} from './qb-answer-check';

const row = (solution: string, extra: Partial<{ question_text: string; answer: string | null }> = {}) => ({
  id: 'r1',
  solution,
  question_text: extra.question_text,
  answer: extra.answer ?? null,
});

describe('numbersIn', () => {
  it('pulls numbers out of LaTeX', () => {
    expect(numbersIn('$\\dfrac{8e-1}{8}$')).toEqual(['8', '1', '8']);
  });
  it('strips thousands separators', () => {
    expect(numbersIn('$4,500$')).toEqual(['4500']);
  });
  it('returns nothing for prose', () => {
    expect(numbersIn('estimate is unreliable')).toEqual([]);
  });
});

describe('unjustifiedNumbers', () => {
  it('accepts a literal match', () => {
    expect(unjustifiedNumbers('$x = 24$', 'Least value of $n$ is $24$.')).toEqual([]);
  });

  // Real shape from the bank: solutions end "= 2.3465 \approx 2.35".
  it('accepts a decimal rounding of a value in the solution', () => {
    expect(unjustifiedNumbers('$t = 2.35$ s', 'Solving (GC): $t=2.3465$')).toEqual([]);
  });

  it('accepts a significant-figure rounding', () => {
    expect(unjustifiedNumbers('$0.386$ (3 s.f.)', 'gives $0.38596$ and 3 s.f. is required')).toEqual(
      [],
    );
  });

  it('flags a number that appears nowhere', () => {
    expect(unjustifiedNumbers('$x = 42$', 'Least value of $n$ is $24$.')).toEqual(['42']);
  });

  it('flags an invented decimal', () => {
    expect(unjustifiedNumbers('$t = 9.99$', 'Solving: $t=2.3465$')).toEqual(['9.99']);
  });
});

describe('partLabels', () => {
  it('finds alpha and roman labels', () => {
    expect(partLabels('(a) shown; (ii) $x=2$')).toEqual(['(a)', '(ii)']);
  });
});

describe('normalise', () => {
  it('collapses whitespace so reflowed evidence still matches', () => {
    expect(normalise('a\n  b   c')).toBe('a b c');
  });
  it('folds unicode minus to ascii', () => {
    expect(normalise('x = −3')).toBe('x = -3');
  });
});

describe('checkProposal', () => {
  const solution =
    '(a) Expanding gives $(x-5)^2 = 0$ (shown)\n(b) $3x^2 - 5x - 2 = 0$\n$x = 24$ or $x = 2$ (rejected)';

  it('accepts a well-formed multi-part answer with a proof part', () => {
    const r = checkProposal(
      { id: 'r1', answer: '(a) shown; (b) $x = 24$', evidence: '$x = 24$ or $x = 2$ (rejected)' },
      row(solution),
    );
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('accepts a prose answer and marks it for an eyeball', () => {
    const sol = 'Since $y = 5$ is outside the data range, estimate is unreliable.';
    const r = checkProposal(
      { id: 'r1', answer: 'estimate is unreliable', evidence: 'estimate is unreliable.' },
      row(sol),
    );
    expect(r.ok).toBe(true);
    expect(r.prose).toBe(true);
  });

  it('holds an answer containing a number absent from the solution', () => {
    const r = checkProposal(
      { id: 'r1', answer: '(b) $x = 99$', evidence: '$x = 24$ or $x = 2$ (rejected)' },
      row(solution),
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('number_not_in_solution');
  });

  it('holds a fabricated evidence slice', () => {
    const r = checkProposal(
      { id: 'r1', answer: '(b) $x = 24$', evidence: 'By inspection the answer is 24' },
      row(solution),
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('evidence_not_in_solution');
  });

  it('holds when evidence is missing entirely', () => {
    const r = checkProposal({ id: 'r1', answer: '(b) $x = 24$' }, row(solution));
    expect(r.reasons).toContain('missing_evidence');
  });

  it('holds a stale proposal for a row that already has an answer', () => {
    const r = checkProposal(
      { id: 'r1', answer: '(b) $x = 24$', evidence: '$x = 24$ or $x = 2$ (rejected)' },
      row(solution, { answer: '(a) shown; (b) 24' }),
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('already_answered');
  });

  it('holds an answer that is really a copy of the working', () => {
    const long = 'x'.repeat(400);
    const r = checkProposal({ id: 'r1', answer: long, evidence: 'anything' }, row(solution));
    expect(r.reasons).toContain('too_long');
  });

  it('holds a part label the source never uses', () => {
    const r = checkProposal(
      { id: 'r1', answer: '(c) $x = 24$', evidence: '$x = 24$ or $x = 2$ (rejected)' },
      row(solution),
    );
    expect(r.reasons).toContain('part_label_unknown');
  });

  it('holds a proposal whose row was not supplied', () => {
    const r = checkProposal({ id: 'ghost', answer: '1', evidence: '1' }, undefined);
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(['missing_row']);
  });
});

describe('checkBatch + buildUpdates', () => {
  const rows = [
    { id: 'a', solution: 'final answer is $12$', answer: null },
    { id: 'b', solution: 'final answer is $7$', answer: null },
  ];
  const proposals = [
    { id: 'a', answer: '$12$', evidence: 'final answer is $12$' },
    { id: 'b', answer: '$8$', evidence: 'final answer is $7$' }, // 8 is not in the solution
  ];

  it('separates accepted from held and counts reasons', () => {
    const rep = checkBatch(proposals, rows);
    expect(rep.total).toBe(2);
    expect(rep.accepted.map((r) => r.id)).toEqual(['a']);
    expect(rep.held.map((r) => r.id)).toEqual(['b']);
    expect(rep.byReason.number_not_in_solution).toBe(1);
  });

  it('emits UPDATEs only for accepted rows, always with the empty-guard', () => {
    const rep = checkBatch(proposals, rows);
    const sql = buildUpdates(rep, proposals);
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain("WHERE id = 'a'");
    expect(sql[0]).toContain("AND (answer IS NULL OR answer = '')");
  });

  it('escapes single quotes in answers', () => {
    const rep = checkBatch(
      [{ id: 'a', answer: "it's $12$", evidence: 'final answer is $12$' }],
      rows,
    );
    const sql = buildUpdates(rep, [{ id: 'a', answer: "it's $12$", evidence: 'final answer is $12$' }]);
    expect(sql[0]).toContain("it''s");
  });
});
