import { describe, it, expect } from 'vitest';
import { bookletItems, solutionsBookletHtml, type BookletMarking } from './solutions-booklet-html';

const mo = (over: Partial<BookletMarking> = {}): BookletMarking => ({
  question: { number: 'Q5(a)' },
  correct: { full_solution_latex: '$V = \\text{half a cylinder}$' },
  marks: { awarded: 1, max: 7 },
  student_final_answer: { matches_correct: false },
  ...over,
});

describe('bookletItems — which questions get a worked solution', () => {
  it('includes a question that lost marks and has a solution', () => {
    const items = bookletItems([{ question_number: 'Q5(a)', marking_output: mo() }]);
    expect(items).toHaveLength(1);
    expect(items[0].qNum).toBe('5(a)');
    expect(items[0].awarded).toBe(1);
    expect(items[0].max).toBe(7);
    expect(items[0].steps.length).toBeGreaterThan(0);
  });

  it('leaves out a full-marks question — restating correct working is noise', () => {
    const full = mo({ marks: { awarded: 7, max: 7 }, student_final_answer: {} });
    expect(bookletItems([{ question_number: 'Q1', marking_output: full }])).toHaveLength(0);
  });

  // The transcript's own gate: absent is not wrong. But marks lost with the flag
  // absent (a "show that" part, no single final answer) still belongs here.
  it('includes marks-lost questions even when matches_correct is absent', () => {
    const showThat = mo({ student_final_answer: {} });
    expect(bookletItems([{ question_number: 'Q2', marking_output: showThat }])).toHaveLength(1);
  });

  it('includes a wrong answer even when the marks fields are missing', () => {
    const noMarks = mo({ marks: null });
    const items = bookletItems([{ question_number: 'Q3', marking_output: noMarks }]);
    expect(items).toHaveLength(1);
    expect(items[0].awarded).toBeNull();
  });

  it('skips a losing question with no solution text — nothing to print', () => {
    const bare = mo({ correct: {} });
    expect(bookletItems([{ question_number: 'Q4', marking_output: bare }])).toHaveLength(0);
  });

  it('survives null marking_output and empty input', () => {
    expect(bookletItems([{ question_number: 'Q1', marking_output: null }])).toHaveLength(0);
    expect(bookletItems([])).toHaveLength(0);
  });

  // SOLUTION_STEP_RE, via the shared repair+align pipeline: a literal \n splits
  // steps, but `\neq` opens a command and must never be torn (the `6>0\neq 0` bug).
  it('splits steps on \\n without tearing \\neq', () => {
    const two = mo({ correct: { full_solution_latex: '$\\text{Sub } x=2$\\n$6>0\\neq 0$' } });
    const items = bookletItems([{ question_number: 'Q6', marking_output: two }]);
    expect(items[0].steps).toHaveLength(2);
    expect(items[0].steps[1]).toContain('\\neq 0');
  });

  it('merges consecutive equation steps into one aligned block (transcript pipeline)', () => {
    const chain = mo({ correct: { full_solution_latex: '$x = 4 + 1$\n$x = 5$' } });
    const items = bookletItems([{ question_number: 'Q7', marking_output: chain }]);
    expect(items[0].steps).toHaveLength(1);
    expect(items[0].steps[0]).toContain('\\begin{aligned}');
  });

  it('renders ≥2 usable cases as branches, 1 case falls back to linear steps', () => {
    const branches = {
      before_latex: '$\\tan x(\\tan x + 2) = 0$',
      cases: [
        { case: 'tan x = 0', steps_latex: '$x = 0, 180$' },
        { case: 'tan x = -2', steps_latex: '$x = 116.6$' },
      ],
    };
    const split = mo({ correct: { full_solution_latex: '$x = 0, 116.6, 180$', solution_branches: branches } });
    const items = bookletItems([{ question_number: 'Q8', marking_output: split }]);
    expect(items[0].branches?.cases).toHaveLength(2);
    expect(items[0].steps).toHaveLength(0);

    const one = mo({ correct: { full_solution_latex: '$x = 5$', solution_branches: { cases: [branches.cases[0]] } } });
    const single = bookletItems([{ question_number: 'Q9', marking_output: one }]);
    expect(single[0].branches).toBeNull();
    expect(single[0].steps).toHaveLength(1);
  });
});

describe('solutionsBookletHtml', () => {
  const input = {
    paperName: 'CHIJ Prelim P2',
    studentName: 'Eva',
    items: bookletItems([{ question_number: 'Q5(a)', marking_output: mo() }]),
  };

  it('is a full document with the KaTeX contract the renderer waits on', () => {
    const html = solutionsBookletHtml(input);
    expect(html).toContain('katex@0.16.9');
    expect(html).toContain('auto-render.min.js');
    expect(html).toContain('__katexRendered');
    expect(html).toContain('Worked solutions');
    expect(html).toContain('Q5(a)');
    expect(html).toContain('1 / 7');
    expect(html).toContain('Eva');
  });

  // `$\frac{dv}{dx}<0$` must not open a tag — same rule as every typeset surface.
  it('escapes < in the maths so it cannot open a tag', () => {
    const lt = mo({ correct: { full_solution_latex: '$\\frac{dv}{dx}<0$' } });
    const html = solutionsBookletHtml({ items: bookletItems([{ question_number: 'Q1', marking_output: lt }]) });
    expect(html).toContain('&lt;0');
    expect(html).not.toContain('{dx}<0');
  });
});
