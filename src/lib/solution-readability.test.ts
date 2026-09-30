import { describe, it, expect } from 'vitest';
import { stepLines, solutionLines, solutionView, readableSolutionText, withPartAnswers, labelKey, stripMarkNotes, splitRelations, stepRows, leadIn, alignView } from './solution-readability';

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

describe('equations lined up on "=" (30 Sep 2026)', () => {
  it('splits a top-level chain, ignoring "=" inside brackets and refusing inequalities', () => {
    expect(splitRelations('R = \\sqrt{4} = 2')).toEqual({ terms: ['R', '\\sqrt{4}', '2'], rels: ['=', '='] });
    expect(splitRelations('f\\left(x = 1\\right) + 2')).toBeNull();
    expect(splitRelations('0 \\le x = 2')).toBeNull();
    expect(splitRelations('a < b')).toBeNull();
    expect(splitRelations('y \\approx 3.2')).toEqual({ terms: ['y', '3.2'], rels: ['\\approx'] });
  });
  it('turns an equations-only step into rows, keeping "or" cases side by side and asides as notes', () => {
    const rows = stepRows('Then $2x = \\frac{\\pi}{12}$ or $\\frac{19\\pi}{12}$, so $x = \\frac{\\pi}{24}$ (acute).')!;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ lead: 'Then', lhs: '2x', rel: '=' });
    expect(rows[0].rhs).toContain('\\text{or}');
    expect(rows[1]).toMatchObject({ lead: 'so', lhs: 'x', note: 'acute' });
  });
  it('leaves a sentence alone', () => {
    expect(stepRows('cosine is positive in the first quadrant, so $x = 1$')).toBeNull();
    expect(stepRows('$x = 2$ is not a solution')).toBeNull();
  });
  it('puts a short lead-in on its own line', () => {
    expect(leadIn('End values: at $x = 0$, $y = 1$')).toEqual(['End values:', 'at $x = 0$, $y = 1$']);
    expect(leadIn('Check: $x = 1$')).toBeNull();
    expect(leadIn('$2x = 285^\\circ$: fine')).toBeNull();
  });
  it('merges consecutive equation steps into one block; a lone equation stays a line', () => {
    const v = alignView(solutionLines('(a) $R = \\sqrt{4} = 2$. Hence $f(x) = 2\\cos x$.\n(b) $x = 3$.'));
    expect(v.map((l) => l.kind)).toEqual(['label', 'align', 'label', 'step']);
    const block = v[1] as { kind: 'align'; rows: unknown[] };
    expect(block.rows).toHaveLength(3);
  });
  it('keeps the rest of a split check quiet', () => {
    const v = solutionLines('$x = 1$. Check: $x = 1$ works; $x = 2$ fails.');
    expect(v.map((l) => l.kind)).toEqual(['step', 'quiet', 'quiet']);
  });
});
