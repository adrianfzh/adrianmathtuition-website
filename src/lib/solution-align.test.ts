import { describe, it, expect } from 'vitest';
import { groupAlignedSteps, alignMarkingSolutions, splitAtRelation } from './solution-align';

describe('splitAtRelation', () => {
  it('splits at the first top-level equals', () => {
    expect(splitAtRelation('x = 3')).toEqual({ lhs: 'x', rhs: '3' });
    expect(splitAtRelation('\\frac{a}{b} = c = d')).toEqual({ lhs: '\\frac{a}{b}', rhs: 'c = d' });
  });
  it('ignores equals inside braces and compound relations', () => {
    expect(splitAtRelation('\\sqrt{x=1}')).toBeNull();
    expect(splitAtRelation('x <= 3')).toBeNull();
    expect(splitAtRelation('x != 3')).toBeNull();
  });
  it('an equals in position 0 is a continuation, not a compound', () => {
    expect(splitAtRelation('= 3')).toEqual({ lhs: '', rhs: '3' });
  });
});

describe('groupAlignedSteps', () => {
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
  it('a \\text{…} left-hand side never joins a block', () => {
    const src = '$\\text{area} = 12$\n$x = 3$';
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
