import { describe, it, expect } from 'vitest';
import {
  ladderSteps, ladderSlice, ladderLength, ladderMarkdown, parseLadderMeta, ladderAssisted, ladderAssistLine,
} from './proof-ladder';

const TRIG = [
  'LHS $= (\\cosec\\theta - \\cot\\theta)^2$ [M1 for expanding]',
  '$= \\left(\\dfrac{1 - \\cos\\theta}{\\sin\\theta}\\right)^2$',
  '$= \\dfrac{(1-\\cos\\theta)^2}{1 - \\cos^2\\theta}$',
  '$= \\dfrac{1-\\cos\\theta}{1+\\cos\\theta}$ = RHS',
  '',
  'Alternatively: start from the RHS and multiply top and bottom by $1 - \\cos\\theta$.',
  '',
  'Mark scheme: M1 A1 A1 A1',
].join('\n');

describe('ladderSteps', () => {
  it('takes the main working only — no alternative, no scheme, mark notes stripped', () => {
    const s = ladderSteps({ solution: TRIG });
    expect(s.map(x => x.text)).toEqual([
      'LHS $= (\\cosec\\theta - \\cot\\theta)^2$',
      '$= \\left(\\dfrac{1 - \\cos\\theta}{\\sin\\theta}\\right)^2$',
      '$= \\dfrac{(1-\\cos\\theta)^2}{1 - \\cos^2\\theta}$',
      '$= \\dfrac{1-\\cos\\theta}{1+\\cos\\theta}$ = RHS',
    ]);
    expect(JSON.stringify(s)).not.toMatch(/Alternativ|Mark scheme|M1/);
  });

  it('uses the per-part working on a multi-part row and heads each with its label', () => {
    const s = ladderSteps({
      solution: 'combined text that must be ignored',
      parts: [
        { label: 'a', solution: 'First line.\nSecond line.' },
        { label: 'b', subparts: [{ label: 'i', solution: 'Sub line.' }] },
      ],
    });
    expect(s).toEqual([
      { kind: 'label', text: '(a)' }, { kind: 'step', text: 'First line.' }, { kind: 'step', text: 'Second line.' },
      { kind: 'label', text: '(b)(i)' }, { kind: 'step', text: 'Sub line.' },
    ]);
  });

  it('puts the bank answer last and never ends on a label', () => {
    const s = ladderSteps({ solution: '(a) x = 2\n(b)', answer: 'x = 2' });
    expect(s[s.length - 1]).toEqual({ kind: 'answer', text: 'x = 2' });
    expect(s.filter(x => x.kind === 'label')).toHaveLength(1);
  });

  it('a proof has no Answer line — the bank stores the word "Proof"', () => {
    expect(ladderSteps({ solution: 'LHS = RHS', answer: 'Proof' }).some(s => s.kind === 'answer')).toBe(false);
    expect(ladderSteps({ solution: 'x = 2', answer: 'Shown.' }).some(s => s.kind === 'answer')).toBe(false);
  });

  it('fractions read full-size on the ladder', () => {
    expect(ladderMarkdown([{ kind: 'step', text: '$= \\frac{1}{2}$' }])).toBe('$= \\dfrac{1}{2}$');
  });

  it('a check line is quiet', () => {
    const s = ladderSteps({ solution: 'x = 3\nCheck: 3 + 1 = 4 ✓' });
    expect(s[1]).toEqual({ kind: 'quiet', text: 'Check: 3 + 1 = 4 ✓' });
  });

  it('is empty with no working', () => {
    expect(ladderSteps({ solution: '   ' })).toEqual([]);
  });
});

describe('ladderSlice', () => {
  const steps = ladderSteps({ solution: '(a) one\ntwo\n(b) three', answer: '3' });
  it('counts lines, not labels, and carries the label with its line', () => {
    expect(ladderLength(steps)).toBe(4);
    const one = ladderSlice(steps, 1);
    expect(one.steps).toEqual([{ kind: 'label', text: '(a)' }, { kind: 'step', text: 'one' }]);
    expect(one).toMatchObject({ revealed: 1, total: 4, done: false });
  });
  it('clamps and reports done', () => {
    expect(ladderSlice(steps, 99)).toMatchObject({ revealed: 4, done: true });
    expect(ladderSlice(steps, -2)).toMatchObject({ revealed: 0, steps: [] });
    expect(ladderSlice(steps, Number.NaN).revealed).toBe(0);
  });
  it('renders labels bold and the answer as an Answer line', () => {
    const md = ladderMarkdown(ladderSlice(steps, 4).steps);
    expect(md).toContain('**(a)**');
    expect(md).toContain('**Answer:** 3');
  });
});

describe('ladder meta', () => {
  it('parses what the client sends and rejects junk', () => {
    expect(parseLadderMeta({ revealed: 2, total: 5 })).toEqual({ revealed: 2, total: 5 });
    expect(parseLadderMeta({ revealed: 0, total: 5 })).toBeNull();
    expect(parseLadderMeta({ revealed: 'x' })).toBeNull();
    expect(parseLadderMeta(null)).toBeNull();
  });
  it('an assisted pass says so in one line', () => {
    expect(ladderAssisted(null)).toBe(false);
    expect(ladderAssistLine({ revealed: 1, total: 4 })).toBe('You used 1 step. Try one like it without them.');
    expect(ladderAssistLine({ revealed: 3, total: 4 })).toMatch(/^You used 3 steps/);
  });
});
