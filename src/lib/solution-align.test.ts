import { describe, it, expect } from 'vitest';
import { groupAlignedSteps, alignMarkingSolutions, splitAtRelation } from './solution-align';

describe('splitAtRelation', () => {
  it('splits at the first top-level equals', () => {
    expect(splitAtRelation('x = 3')).toEqual({ lhs: 'x', rhs: '3', rel: '=' });
    expect(splitAtRelation('\\frac{a}{b} = c = d')).toEqual({ lhs: '\\frac{a}{b}', rhs: 'c = d', rel: '=' });
  });
  it('ignores equals inside braces and compound relations', () => {
    expect(splitAtRelation('\\sqrt{x=1}')).toBeNull();
    expect(splitAtRelation('x <= 3')).toBeNull();
    expect(splitAtRelation('x != 3')).toBeNull();
  });
  it('an equals in position 0 is a continuation, not a compound', () => {
    expect(splitAtRelation('= 3')).toEqual({ lhs: '', rhs: '3', rel: '=' });
  });
  it('inequalities are relations too (Kayla Q1, 2026-08-29)', () => {
    expect(splitAtRelation('4x < 20')).toEqual({ lhs: '4x', rhs: '20', rel: '<' });
    expect(splitAtRelation('x > -2')).toEqual({ lhs: 'x', rhs: '-2', rel: '>' });
    expect(splitAtRelation('x \\le 5')).toEqual({ lhs: 'x', rhs: '5', rel: '\\le' });
    expect(splitAtRelation('x \\leq 5')).toEqual({ lhs: 'x', rhs: '5', rel: '\\le' });
    expect(splitAtRelation('x \\geq 5')).toEqual({ lhs: 'x', rhs: '5', rel: '\\ge' });
    expect(splitAtRelation('x ≤ 5')).toEqual({ lhs: 'x', rhs: '5', rel: '\\le' });
    expect(splitAtRelation('x ≥ 5')).toEqual({ lhs: 'x', rhs: '5', rel: '\\ge' });
  });
  it('command names that merely start with \\le / \\ge never split', () => {
    expect(splitAtRelation('\\left(x\\right)')).toBeNull();
    expect(splitAtRelation('x \\gets 3')).toBeNull();
  });
  it('arrows and doubled angle brackets are not relations', () => {
    expect(splitAtRelation('x -> 3')).toBeNull();
    expect(splitAtRelation('a << b')).toBeNull();
  });
});

describe('groupAlignedSteps', () => {
  it('≈ joins the alignment column (the 5 s.f. final line)', () => {
    const out = groupAlignedSteps('$x = \\frac{9.26}{6.5967}$\n$\\approx 1.4037$');
    expect(out).toContain('&\\approx 1.4037');
    expect(out).toContain('\\begin{aligned}');
  });

  it('merges a run of equation steps into one aligned block', () => {
    const out = groupAlignedSteps('$x + 2 = 5$\n$x = 3$');
    expect(out).toBe('$\\begin{aligned}x + 2 &= 5 \\\\ x &= 3\\end{aligned}$');
  });
  it('a lone equation stays a normal line (it can still word-wrap)', () => {
    expect(groupAlignedSteps('$x = 3$')).toBe('$x = 3$');
  });
  it('prose lines break runs and pass through untouched', () => {
    const out = groupAlignedSteps('$a = 1$\n$b = 2$\nSo the gradient is negative.\n$c = 3$');
    expect(out.split('\n')).toEqual([
      '$\\begin{aligned}a &= 1 \\\\ b &= 2\\end{aligned}$',
      'So the gradient is negative.',
      '$c = 3$',
    ]);
  });
  it('a sentence with maths inside is not an equation step', () => {
    const src = 'At $x = -0.1$ the gradient is positive.\n$y = 2$';
    expect(groupAlignedSteps(src)).toBe(src);
  });
  it('a MIXED \\text{…}+maths left-hand side never joins a block', () => {
    // (A PURE label LHS like $\\text{area} = 12$ DOES join since 30 Aug 2026 —
    // see the mirror suite at the bottom.)
    const src = '$\\text{so } x = 12$\n$x = 3$';
    expect(groupAlignedSteps(src)).toBe(src);
  });
  it('a long equality chain becomes one row per equals sign', () => {
    const out = groupAlignedSteps('$\\lg y = \\lg b^x - \\lg 10^a = x\\lg b - a$\n$x = 1$');
    expect(out).toContain('\\begin{aligned}');
    expect((out.match(/&=/g) || []).length).toBe(3);
  });
  it('literal backslash-n separators split like real newlines', () => {
    const out = groupAlignedSteps('$x + 2 = 5$\\n$x = 3$');
    expect(out).toContain('\\begin{aligned}');
  });
  it('empty and null-ish input survives', () => {
    expect(groupAlignedSteps('')).toBe('');
  });
  it('an inequality chain shares the alignment column (Kayla Q1)', () => {
    const out = groupAlignedSteps('$4x - 5 < 15$\n$4x < 20$\n$x < 5$');
    expect(out).toContain('\\begin{aligned}');
    expect((out.match(/&</g) || []).length).toBe(3);
  });
  it('mixed = and < steps align together', () => {
    const out = groupAlignedSteps('$2x + 3 = 7 - x$\n$3x \\le 4$');
    expect(out).toContain('\\begin{aligned}');
    expect(out).toContain('&\\le 4');
  });
  it('a multi-statement line never chain-splits (Alessi simultaneous eqns, 2026-08-29)', () => {
    const src = '$x = 4, \\; y = -2.5 \\text{ or } x = -5, \\; y = 2$\n$k = 1$';
    const out = groupAlignedSteps(src);
    // one aligned row for the pair line, one for k — never a row per equals
    expect((out.match(/&=/g) || []).length).toBe(2);
    expect(out).toContain('x &= 4, \\; y = -2.5');
  });
  it('commas inside coordinates or intervals still allow the chain split', () => {
    const out = groupAlignedSteps(
      '$\\lg y = \\lg b^x - \\lg 10^a = x\\lg b - a + f(1, 2)$\n$x = 1$',
    );
    expect((out.match(/&=/g) || []).length).toBe(3);   // chain still breaks per equals
  });
  it('a part label inside \\text lifts out as its own heading line', () => {
    const out = groupAlignedSteps('$\\text{(a) } 2y + 1 = 5$\n$y = 2$');
    const lines = out.split('\n');
    expect(lines[0]).toBe('(a)');
    expect(lines[1]).toContain('\\begin{aligned}');
    expect(lines[1]).toContain('2y + 1 &= 5');
  });
  it('a label with trailing words keeps the words as prose in the step', () => {
    const out = groupAlignedSteps('$\\text{(b) When } y = 0$');
    const lines = out.split('\n');
    expect(lines[0]).toBe('(b)');
    expect(lines[1]).toBe('$\\text{When } y = 0$');
  });
  it('a label starts a fresh alignment group', () => {
    const out = groupAlignedSteps('$a = 1$\n$b = 2$\n$\\text{(c) } d = 4$\n$e = 5$');
    const lines = out.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('a &= 1');
    expect(lines[1]).toBe('(c)');
    expect(lines[2]).toContain('d &= 4');
  });
  it('ordinary \\text{…} spans are not part labels', () => {
    const src = '$\\text{area} = 12$\n$\\text{(3 s.f.)}$';
    expect(groupAlignedSteps(src)).toBe(src);
  });
});

describe('alignMarkingSolutions', () => {
  it('rewrites the linear solution and every branch field, on a copy', () => {
    const marking = {
      correct: {
        full_solution_latex: '$x + 2 = 5$\n$x = 3$',
        solution_branches: {
          before_latex: '$(\\tan x - 1)(\\tan x + 2) = 0$',
          cases: [{ case: '$\\tan x = 1$', steps_latex: '$\\tan x = 1$\n$x = 45$' }],
          after_latex: null,
        },
      },
    };
    const out = alignMarkingSolutions(marking);
    expect(out.correct!.full_solution_latex).toContain('\\begin{aligned}');
    expect(out.correct!.solution_branches!.cases![0]!.steps_latex).toContain('\\begin{aligned}');
    expect(out.correct!.solution_branches!.cases![0]!.case).toBe('$\\tan x = 1$');
    expect(marking.correct.full_solution_latex).toBe('$x + 2 = 5$\n$x = 3$');   // input untouched
  });
  it('passes through payloads with no solution', () => {
    expect(alignMarkingSolutions({})).toEqual({});
    expect(alignMarkingSolutions({ correct: null })).toEqual({ correct: null });
  });
});

describe('pure \\text{…} label LHS (mirrors bot pen-math, 30 Aug 2026)', () => {
  it('a named quantity joins the block so its continuations share the equals column', () => {
    const g = groupAlignedSteps(
      '$\\text{Area under curve} = \\int_0^4 (4+3x)^{\\frac{1}{2}}\\,dx$\n$= \\frac{2}{9}(64 - 8)$',
    );
    expect(g).toContain('\\begin{aligned}');
    expect(g).toContain('\\text{Area under curve} &=');
  });
  it('mixed label+maths and sentence-length labels stay excluded', () => {
    const mixed = '$\\text{At } P(4,4): \\frac{dy}{dx} = \\frac{3}{8}$\n$x = 3$';
    expect(groupAlignedSteps(mixed)).toBe(mixed);
    const longLabel = '$\\text{a very long sentence pretending to be a label of a quantity} = 3$\n$x = 3$';
    expect(groupAlignedSteps(longLabel)).toBe(longLabel);
  });
});
