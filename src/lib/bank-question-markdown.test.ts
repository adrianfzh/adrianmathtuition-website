import { describe, it, expect } from 'vitest';
import { questionStructured, questionMarkdown, splitInlineParts } from './bank-question-markdown';

// The portal renders questions from questionStructured() in an exam-style grid
// (label / sub-part label / text / marks). These pin the shape the grid relies
// on: a bare "(b)" with sub-parts keeps an empty text so "(b) (i)" share a row,
// marks are numbers (or null), and \( \) delimiters are normalised for KaTeX.

describe('questionStructured', () => {
  it('returns the stem and one entry per part, sub-parts nested', () => {
    const r = questionStructured({
      question_text: 'The first three terms of a GP are $2$, $6$, $18$.',
      parts: [
        { label: 'a', text: 'Find the common ratio.', marks: 1 },
        { label: 'b', subparts: [
          { label: 'i', text: 'Find the 10th term.', marks: 2 },
          { label: 'ii', text: 'Find the sum of the first 10 terms.', marks: 3 },
        ] },
      ],
    });
    expect(r.stem).toBe('The first three terms of a GP are $2$, $6$, $18$.');
    expect(r.parts).toHaveLength(2);
    expect(r.parts[0]).toEqual({ label: 'a', text: 'Find the common ratio.', marks: 1, subparts: [] });
    expect(r.parts[1].label).toBe('b');
    expect(r.parts[1].text).toBe('');          // bare parent → grid puts "(b)" beside "(i)"
    expect(r.parts[1].marks).toBeNull();
    expect(r.parts[1].subparts.map(s => [s.label, s.marks])).toEqual([['i', 2], ['ii', 3]]);
  });

  it('drops a parent total when its sub-parts carry their own marks, keeps it otherwise', () => {
    const r = questionStructured({ parts: [
      { label: 'a', text: 'List the elements in', marks: 2, subparts: [
        { label: 'i', text: '$P \\cup Q$', marks: 1 }, { label: 'ii', text: "$P' \\cap Q$", marks: 1 },
      ] },
      { label: 'b', text: 'Shade', marks: 3, subparts: [
        { label: 'i', text: '$A \\cup B$' }, { label: 'ii', text: '$A \\cap B$' },
      ] },
    ] });
    expect(r.parts[0].marks).toBeNull();
    expect(r.parts[0].subparts.map(s => s.marks)).toEqual([1, 1]);
    expect(r.parts[1].marks).toBe(3);       // sub-parts unmarked → the parent's [3] is the only place to show it
  });

  it('coerces string marks and drops zero/invalid marks', () => {
    const r = questionStructured({
      parts: [
        { label: 'a', text: 'x', marks: '3' as unknown as number },
        { label: 'b', text: 'y', marks: 0 },
        { label: 'c', text: 'z', marks: 'abc' as unknown as number },
      ],
    });
    expect(r.parts.map(p => p.marks)).toEqual([3, null, null]);
  });

  it('normalises \\( \\) delimiters and inlines part images as blocks', () => {
    const r = questionStructured({
      parts: [{ label: 'a', text: 'Solve \\(x^2 = 4\\).', image_url: 'abc123.png', image_url_after: 'def456.png' }],
    });
    const t = r.parts[0].text;
    expect(t.startsWith('<img src="https://')).toBe(true);
    expect(t).toContain('abc123.png');
    expect(t).toContain('Solve $x^2 = 4$.');
    expect(t.trimEnd().endsWith('/>')).toBe(true);
    expect(t).toContain('def456.png');
  });

  it('skips empty parts and tolerates missing parts/stem', () => {
    expect(questionStructured({})).toEqual({ stem: '', parts: [] });
    const r = questionStructured({ question_text: 'Evaluate.', parts: [{}, { label: 'a', text: 'x' }] });
    expect(r.parts).toHaveLength(1);
  });

  it('agrees with the flat markdown form on content', () => {
    const q = {
      question_text: 'Stem.',
      parts: [{ label: 'a', text: 'Part a.', marks: 2, subparts: [{ label: 'i', text: 'Sub i.', marks: 1 }] }],
    };
    const md = questionMarkdown(q);
    expect(md).toContain('**(a)** Part a. _[2m]_');
    expect(md).toContain('**(i)** Sub i. _[1m]_');
    const s = questionStructured(q);
    expect(s.parts[0].text).toBe('Part a.');
    expect(s.parts[0].subparts[0].text).toBe('Sub i.');
  });
});

// Rows with no `parts` array keep their parts inside question_text — the
// parser must lift them out so the grid (label / marks columns) still applies.
describe('splitInlineParts', () => {
  it('lifts "(a) … [1]" lines out of the text, stem first', () => {
    const r = splitInlineParts(
      'In the expansion of \\(\\left(2 - \\frac{1}{3}x\\right)^n\\), there are exactly 7 terms.\n\n' +
      '(a) State the value of \\(n\\). [1]\n\n(b) Find the value of \\(a\\). [5]\n\n' +
      '(c) Using this value of \\(a\\), find the coefficient of \\(x^4\\). [3]',
    );
    expect(r.stem).toBe('In the expansion of \\(\\left(2 - \\frac{1}{3}x\\right)^n\\), there are exactly 7 terms.');
    expect(r.parts.map(p => [p.label, p.text, p.marks])).toEqual([
      ['a', 'State the value of \\(n\\).', 1],
      ['b', 'Find the value of \\(a\\).', 5],
      ['c', 'Using this value of \\(a\\), find the coefficient of \\(x^4\\).', 3],
    ]);
  });

  it('nests roman labels under the open lettered part, incl. "(b)(i)" on one line', () => {
    const r = splitInlineParts('Given $f(x) = 3\\sin x$.\n(a) Express $f(x)$ in R-form. [3]\n(b)(i) Solve $f(x) = 2$. [3]\n(ii) State the maximum. [2 marks]\n(c) Sketch. [2]');
    expect(r.parts.map(p => [p.label, p.marks, (p.subparts || []).map(s => [s.label, s.marks])])).toEqual([
      ['a', 3, []],
      ['b', undefined, [['i', 3], ['ii', 2]]],
      ['c', 2, []],
    ]);
    expect(r.parts[1].text).toBe('');
  });

  it('attaches unlabelled lines to the current part and takes a trailing marks tag from them', () => {
    const r = splitInlineParts('(a) Show that\n$x^2 = 4$.\n[2]\n(b) Hence solve. [1]');
    expect(r.parts[0]).toMatchObject({ label: 'a', text: 'Show that\n\n$x^2 = 4$.', marks: 2 });
    expect(r.parts[1]).toMatchObject({ label: 'b', marks: 1 });
  });

  it('leaves text with no part lines alone', () => {
    expect(splitInlineParts('Solve $(x-1)(x+2) = 0$.')).toEqual({ stem: 'Solve $(x-1)(x+2) = 0$.', parts: [] });
    expect(splitInlineParts(null)).toEqual({ stem: '', parts: [] });
  });

  it('feeds questionStructured only when no authored parts exist', () => {
    const inline = questionStructured({ question_text: 'Stem.\n(a) First. [2]\n(b) Second. [3]', parts: null });
    expect(inline.stem).toBe('Stem.');
    expect(inline.parts.map(p => [p.label, p.marks])).toEqual([['a', 2], ['b', 3]]);
    const authored = questionStructured({ question_text: '(a) looks like a part [9]', parts: [{ label: 'a', text: 'Real part', marks: 1 }] });
    expect(authored.stem).toBe('(a) looks like a part [9]');
    expect(authored.parts.map(p => [p.label, p.marks])).toEqual([['a', 1]]);
  });
});
