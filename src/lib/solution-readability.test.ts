import { describe, it, expect } from 'vitest';
import { stepLines, solutionLines, solutionView, readableSolutionText, withPartAnswers, labelKey, stripMarkNotes } from './solution-readability';

// AM Set 1 P2 Q4 as stored (Adrian's screenshot, 30 Sep 2026), shortened.
const Q4 = [
  '(a) $R = \\sqrt{4} = 2$. Comparing coefficients: $R\\cos\\alpha = \\sqrt{3}$ and $R\\sin\\alpha = 1$, so $\\alpha = \\frac{\\pi}{6}$ (acute). Hence $\\mathrm{f}(x) = 2\\cos(2x + \\frac{\\pi}{6})$.',
  '(b) $\\cos(2x + \\frac{\\pi}{6}) = \\frac{1}{\\sqrt{2}}$. Check: $2x = 15^\\circ$: works; $2x = 285^\\circ$: works.',
  'Maximum point: $(\\frac{11\\pi}{12}, 2)$. (At $x = 0$ the value is only $\\sqrt{3}$, so the maximum is not at an endpoint.)',
  'Marks: (a) M1 $R = 2$; A1. (b) M1; A1.',
].join('\n');

describe('stepLines', () => {
  it('breaks at sentence ends outside maths', () => {
    expect(stepLines('$x = 2.5$. Hence $y = 1$. So done')).toEqual(['$x = 2.5$.', 'Hence $y = 1$.', 'So done']);
  });
  it('never breaks inside $…$ or brackets', () => {
    expect(stepLines('$a. B$ and (the next value. Exceeds) end')).toEqual(['$a. B$ and (the next value. Exceeds) end']);
  });
  it('breaks at "; " and after a closing bracket', () => {
    expect(stepLines('$\\alpha$ (acute). Hence $f$; then $g$')).toEqual(['$\\alpha$ (acute).', 'Hence $f$;', 'then $g$']);
  });
  it('leaves e.g. alone and display maths whole', () => {
    expect(stepLines('use e.g. The rule')).toEqual(['use e.g. The rule']);
    expect(stepLines('$$a. B$$')).toEqual(['$$a. B$$']);
  });
});

describe('solutionView', () => {
  const v = solutionView(Q4);
  it('drops the Marks paragraph from the working and keeps it for admin', () => {
    expect(v.main.some((l) => /^Marks/.test(l.text))).toBe(false);
    expect(v.scheme).toMatch(/^Marks:/);
  });
  it('puts part labels on their own line and one step a line', () => {
    expect(v.main[0]).toEqual({ kind: 'label', text: '(a)' });
    expect(v.main[1]).toMatchObject({ kind: 'step', text: '$R = \\sqrt{4} = 2$.' });
    expect(v.main.filter((l) => l.kind === 'label').map((l) => l.text)).toEqual(['(a)', '(b)']);
  });
  it('greys checks and bracketed asides', () => {
    expect(v.main.find((l) => l.text.startsWith('Check'))?.kind).toBe('quiet');
    expect(v.main.find((l) => l.text.startsWith('(At'))?.kind).toBe('quiet');
  });
  it('turns a mark note into codes', () => {
    expect(solutionLines('$x = 3$ [M1 for the method]')).toEqual([{ kind: 'step', text: '$x = 3$', codes: 'M1' }]);
  });
});

describe('part answers', () => {
  it('ends each part with its answer', () => {
    const out = withPartAnswers(solutionView(Q4).main, { a: '$2\\cos(2x+\\frac{\\pi}{6})$', b: '$x = \\frac{\\pi}{24}$' });
    const idx = out.findIndex((l) => l.kind === 'label' && l.text === '(b)');
    expect(out[idx - 1]).toEqual({ kind: 'answer', text: '$2\\cos(2x+\\frac{\\pi}{6})$' });
    expect(out.filter((l) => l.kind === 'answer')).toHaveLength(2);
  });
  it('keys nested labels', () => { expect(labelKey('(b)(ii)')).toBe('b.ii'); });
});

describe('readableSolutionText', () => {
  it('is what the markdown surfaces get', () => {
    const t = readableSolutionText(Q4);
    expect(t).not.toMatch(/Marks:/);
    expect(t.split('\n')[0]).toBe('**(a)**');
    expect(t).toContain('\nHence $\\mathrm{f}(x)');
  });
  it('strips mark notes for students', () => {
    expect(stripMarkNotes('$x = 3$ [M1 for method].')).toBe('$x = 3$.');
  });
});
