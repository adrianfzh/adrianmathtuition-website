import { describe, it, expect } from 'vitest';
import { questionStructured, questionMarkdown, solutionMarkdown, splitInlineParts, totalMarksOf, normaliseImagePath } from './bank-question-markdown';
import { partImagePaths, inlineImagePaths } from './bank-question-markdown';

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

describe('totalMarksOf', () => {
  it('sums part and sub-part marks for rows whose total_marks column is null', () => {
    const { parts } = questionStructured({
      question_text: null,
      parts: [
        { label: 'a', text: 'First.', marks: 2 },
        { label: 'b', text: '', marks: 5, subparts: [
          { label: 'i', text: 'One.', marks: 2 },
          { label: 'ii', text: 'Two.', marks: 3 },
        ] },
      ],
    });
    // (b)'s parent 5 is a repeat of its sub-parts' total and is nulled by
    // structuredPart — the sum must count each leaf exactly once.
    expect(totalMarksOf(parts)).toBe(7);
  });

  it('derives marks from inline [n] tags too', () => {
    const { parts } = questionStructured({ question_text: '(a) First. [2]\n(b) Second. [3]', parts: null });
    expect(totalMarksOf(parts)).toBe(5);
  });

  it('returns null (never a 0-marks chip) when no part carries marks', () => {
    const { parts } = questionStructured({ question_text: '(a) Show this.\n(b) Hence that.', parts: null });
    expect(totalMarksOf(parts)).toBeNull();
    expect(totalMarksOf([])).toBeNull();
  });
});

// ── Solution-image gate (2026-09-03) ────────────────────────────────────────
// A watermarked solution scan must never render. The gate is built elsewhere
// (lib/solution-image-gate.ts); these pin the pure half — one spelling per
// path, and the renderer honouring the gate at every solution-image site.
const BUCKET = 'https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/';

describe('normaliseImagePath', () => {
  it('reduces every spelling of a bucket object to one bucket-relative path', () => {
    expect(normaliseImagePath(`${BUCKET}abc123.png`)).toBe('abc123.png');
    expect(normaliseImagePath(`${BUCKET}2025/em/abc123.png?width=400`)).toBe('2025/em/abc123.png');
    expect(normaliseImagePath('question_images/abc123.png')).toBe('abc123.png');
    expect(normaliseImagePath('/abc123.png')).toBe('abc123.png');
    expect(normaliseImagePath('abc123.png')).toBe('abc123.png');
    expect(normaliseImagePath('  abc123.png ')).toBe('abc123.png');
  });

  it('keeps sub-folders and strips a doubled prefix', () => {
    expect(normaliseImagePath('thumbs/abc123.jpg')).toBe('thumbs/abc123.jpg');
    expect(normaliseImagePath('question_images/thumbs/abc123.jpg')).toBe('thumbs/abc123.jpg');
    expect(normaliseImagePath('question_images/question_images/abc123.png')).toBe('abc123.png');
    expect(normaliseImagePath(`${BUCKET}question_images/abc123.png`)).toBe('abc123.png');
  });

  it('keeps the decoded pathname of a URL outside the bucket (it can never match a bucket path)', () => {
    expect(normaliseImagePath('https://blob.vercel-storage.com/x/sol%20a.png')).toBe('x/sol a.png');
  });

  it('is idempotent', () => {
    for (const s of ['abc123.png', 'question_images/a/b.png', '/a.png', `${BUCKET}c.png`]) {
      expect(normaliseImagePath(normaliseImagePath(s))).toBe(normaliseImagePath(s));
    }
  });
});

describe('solutionMarkdown with a gate', () => {
  const q = {
    answer: '$x = 2$',
    parts: [
      { label: 'a', solution: 'Working for a.', solution_image: 'sol_aaa111.png' },
      { label: 'b', solution: 'Working for b.', solution_image: 'question_images/sol_bbb222.png' },
      { label: 'c', subparts: [{ label: 'i', solution: 'Working for c(i).', solution_image: `${BUCKET}sol_ccc333.png` }] },
    ],
    solution_images: '["sol_top444.png"]',
  };
  const every = ['sol_aaa111.png', 'sol_bbb222.png', 'sol_ccc333.png', 'sol_top444.png'];

  it('renders every image with no gate (unchanged behaviour)', () => {
    const md = solutionMarkdown(q);
    for (const f of every) expect(md).toContain(f);
  });

  it('withholds a blocked part image, renders the others, keeps the working, emits no placeholder', () => {
    const md = solutionMarkdown(q, { blocked: new Set(['sol_bbb222.png']) });
    expect(md).not.toContain('sol_bbb222.png');
    for (const f of every.filter(f => f !== 'sol_bbb222.png')) expect(md).toContain(f);
    expect(md).toContain('**(b)**');
    expect(md).toContain('Working for b.');
    expect(md.split('\n\n').some(block => block.trim() === '')).toBe(false);
  });

  it('matches a blocked path however the row spelt it (prefix, full URL, sub-part, top-level)', () => {
    const md = solutionMarkdown(q, { blocked: new Set(['sol_aaa111.png', 'sol_bbb222.png', 'sol_ccc333.png', 'sol_top444.png']) });
    expect(md).not.toContain('<img');
    expect(md).toContain('**Answer:** $x = 2$');
    expect(md).toContain('**(c)(i)**');
  });

  it('requireClean with an empty clean set renders no image at all', () => {
    const md = solutionMarkdown(q, { blocked: new Set(), requireClean: true, clean: new Set() });
    expect(md).not.toContain('<img');
    expect(md).toContain('**Answer:**');
  });

  it('requireClean renders only the clean set', () => {
    const md = solutionMarkdown(q, { blocked: new Set(), requireClean: true, clean: new Set(['sol_top444.png', 'sol_ccc333.png']) });
    expect(md).toContain('sol_top444.png');
    expect(md).toContain('sol_ccc333.png');
    expect(md).not.toContain('sol_aaa111.png');
    expect(md).not.toContain('sol_bbb222.png');
  });

  it('gates {{IMG:…}} inside solution text too, and leaves question figures alone', () => {
    const withInline = { solution: 'Step one.\n{{IMG:sol_inline555.png}}\nStep two.' };
    expect(solutionMarkdown(withInline)).toContain('sol_inline555.png');
    expect(solutionMarkdown(withInline, { blocked: new Set(['sol_inline555.png']) })).not.toContain('sol_inline555.png');
    // The question side takes no gate: a part figure renders regardless.
    const md = questionMarkdown({ parts: [{ label: 'a', text: 'See the figure.', image_url: 'sol_inline555.png' }] });
    expect(md).toContain('sol_inline555.png');
  });

  // REGRESSION, 4 Sep 2026 — the markdown-image channel. Extraction writes some
  // solution diagrams into the working as `![alt](url)` rather than `{{IMG:…}}`,
  // and the gate never saw them: S2 Broadrick 2024 P2 Q6 `sol_c38db2e41ac6.png`
  // sat on a `held` flag, was correctly withheld from `solution_images[]`, and
  // rendered anyway out of `parts[1].solution`. Found by running the shipped
  // render path over every held flag (solution-image pass, stage-7 unit 8).
  it('gates a markdown ![](…) image inside solution text — every part of the tree', () => {
    // Top-level working and per-part working are never both rendered (a
    // multi-part row carries the same solution twice), so cover both shapes.
    const q = {
      solution: 'Plot it.\n\n![Graph](https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/sol_md777.png)\n\nRead off x.',
      parts: [] as { label: string; solution: string }[],
    };
    const withPart = {
      parts: [{ label: 'b', solution: 'From the sketch:\n![Graph of y](question_images/sol_md888.png "the sketch")' }],
    };
    expect(solutionMarkdown(q)).toContain('sol_md777.png');
    expect(solutionMarkdown(withPart)).toContain('sol_md888.png');
    const gated = solutionMarkdown(q, { blocked: new Set(['sol_md777.png']) });
    const gatedPart = solutionMarkdown(withPart, { blocked: new Set(['sol_md888.png']) });
    expect(gated).not.toContain('sol_md777.png');
    expect(gatedPart).not.toContain('sol_md888.png');
    // The prose around the hole survives, and no placeholder is emitted.
    expect(gated).toContain('Plot it.');
    expect(gated).toContain('Read off x.');
    expect(gatedPart).toContain('From the sketch:');
    expect(gated).not.toContain('![');
    expect(gatedPart).not.toContain('![');
    // Allow-list mode: only a `fixed` path renders.
    const allow = solutionMarkdown(q, { blocked: new Set(), requireClean: true, clean: new Set(['sol_md777.png']) });
    expect(allow).toContain('sol_md777.png');
    expect(solutionMarkdown(withPart, { blocked: new Set(), requireClean: true, clean: new Set(['sol_md777.png']) }))
      .not.toContain('sol_md888.png');
    // A markdown LINK is not an image and must be left alone.
    expect(solutionMarkdown({ solution: 'See [the notes](sol_md999.png).' }, { blocked: new Set(['sol_md999.png']) }))
      .toContain('sol_md999.png');
  });

  it('accepts solution_images as a real array (the jsonb column read directly)', () => {
    expect(solutionMarkdown({ solution_images: ['sol_arr666.png'] })).toContain('sol_arr666.png');
    expect(solutionMarkdown({ solution_images: ['sol_arr666.png'] }, { blocked: new Set(['sol_arr666.png']) })).not.toContain('sol_arr666.png');
  });
});

describe('part-level image slots and inline markers (3 Sep 2026)', () => {
  it('partImagePaths reads a bare path, a JSON-array string, and object entries', () => {
    expect(partImagePaths('sol_a.png')).toEqual(['sol_a.png']);
    expect(partImagePaths('["question_images/a1.png","question_images/a2.png"]')).toEqual(['question_images/a1.png', 'question_images/a2.png']);
    expect(partImagePaths('[{"url":"q12345.png"}]')).toEqual(['q12345.png']);
    expect(partImagePaths('[]')).toEqual([]);
    expect(partImagePaths(null)).toEqual([]);
    expect(partImagePaths('null')).toEqual([]);
  });
  it('inlineImagePaths finds every {{IMG:…}} marker', () => {
    expect(inlineImagePaths('Find x. {{IMG:fig1.png}} Then {{IMG: fig2.png }}.')).toEqual(['fig1.png', 'fig2.png']);
    expect(inlineImagePaths('no markers')).toEqual([]);
    expect(inlineImagePaths(undefined)).toEqual([]);
  });
});
