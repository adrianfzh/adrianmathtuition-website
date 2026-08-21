import { describe, it, expect } from 'vitest';
import { questionStructured, questionMarkdown } from './bank-question-markdown';

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
