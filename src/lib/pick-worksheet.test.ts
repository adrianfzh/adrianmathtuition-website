import { describe, it, expect } from 'vitest';
import { fromDetail, ansLine, workingLines, parseIds, questionMarkdown, flatParts, fileStem, isShownAnswer, practiceFolderFor } from './pick-worksheet';

const detail = {
  id: '11111111-1111-1111-1111-111111111111',
  school: 'RI', year: 2021, paper: '1', qnum: '8', level: 'JC2', topics: ['Integration (Area and Volume)'], marks: 11,
  questionMd: 'The curve $G$ has equation $y = \\frac{1}{1+x^2}$. {{IMG:question_images/x.png}}',
  parts: [
    { label: 'i', text: 'Sketch $G$.', marks: 2, answer: '' },
    { label: 'ii', text: 'Find $c$ and $d$.', marks: 4, answer: '$c = 1, d = \\frac{1}{2}$', solution: 'Working.' },
    { label: 'iii', text: 'Show that $\\pi > 3$.', marks: 2, answer: 'Shown' },
    { label: 'iv', text: 'Two sub-parts', marks: 3, subparts: [
      { label: 'a', text: 'First', marks: 1, answer: '7', image_url: 'https://x/figure.png' },
      { label: 'b', text: 'Second', marks: 2, answer: 'Proved' },
    ] },
  ],
  solution: 'Top solution', answer: '', images: ['https://x/stem.png'], solutionImages: [],
};

describe('fromDetail', () => {
  const q = fromDetail(detail);
  it('keeps the parts tree with marks, and drops a parent total that repeats its sub-parts', () => {
    expect(q.parts.map((p) => p.label)).toEqual(['i', 'ii', 'iii', 'iv']);
    expect(q.parts[3].marks).toBeNull();
    expect(q.parts[3].subparts.map((s) => s.marks)).toEqual([1, 2]);
  });
  it('strips {{IMG}} markers from the stem and keeps the resolved image list', () => {
    expect(q.stem).not.toContain('{{IMG');
    expect(q.images).toEqual(['https://x/stem.png']);
    expect(q.parts[3].subparts[0].imagesBefore).toEqual(['https://x/figure.png']);
  });
  it('keys part answers and solutions the readability way', () => {
    expect(q.partAnswers).toEqual({ ii: '$c = 1, d = \\frac{1}{2}$', iii: 'Shown', 'iv.a': '7', 'iv.b': 'Proved' });
    expect(q.partSolutions).toEqual({ ii: 'Working.' });
  });
  it('provenance is admin-only text and never enters the printed markdown', () => {
    expect(q.provenance).toBe('RI 2021 P1 Q8');
    expect(questionMarkdown(q)).not.toContain('RI');
  });
});

describe('ansLine', () => {
  it('is ONE line at the end of the question, (label) answer; …, skipping shown parts', () => {
    expect(ansLine(fromDetail(detail))).toBe('(ii) $c = 1, d = \\frac{1}{2}$; (iv)(a) 7');
  });
  it('falls back to the top-level answer, and prints nothing for a proof', () => {
    expect(ansLine(fromDetail({ id: 'x', parts: [], answer: '$x = 2$' }))).toBe('$x = 2$');
    expect(ansLine(fromDetail({ id: 'x', parts: [], answer: 'Shown' }))).toBe('');
  });
  it('isShownAnswer', () => {
    expect(isShownAnswer('Shown')).toBe(true);
    expect(isShownAnswer('shown: $V = 4$')).toBe(true);
    expect(isShownAnswer('$4$')).toBe(false);
  });
});

describe('questionMarkdown', () => {
  it('labels parts in bold with a trailing [n] the renderer floats right, figures inline', () => {
    const md = questionMarkdown(fromDetail(detail));
    expect(md).toContain('**(ii)** Find $c$ and $d$. [4]');
    expect(md).toContain('![diagram](https://x/figure.png)\n\n**(iv)(a)** First [1]');
    expect(md.startsWith('The curve $G$')).toBe(true);
  });
});

describe('workingLines', () => {
  it('4 lines a mark, one bonus line for a [1], none for an unmarked part', () => {
    expect(workingLines(3)).toBe(12);
    expect(workingLines(1)).toBe(5);
    expect(workingLines(null)).toBe(0);
  });
});

describe('parseIds / flatParts / fileStem', () => {
  it('parses a comma list of uuids in order without duplicates', () => {
    const a = '11111111-1111-1111-1111-111111111111';
    const b = '22222222-2222-2222-2222-222222222222';
    expect(parseIds(`${a}, ${b},${a} nope`)).toEqual([a, b]);
    expect(parseIds(null)).toEqual([]);
  });
  it('flatParts walks depth-first with full labels', () => {
    const f = flatParts(fromDetail(detail).parts).map((x) => x.labels.join('.'));
    expect(f).toEqual(['i', 'ii', 'iii', 'iv', 'iv.a', 'iv.b']);
  });
  it('fileStem strips path characters', () => {
    expect(fileStem('H2: Area / Volume?')).toBe('H2 Area Volume');
  });
});

describe('practiceFolderFor', () => {
  it('maps bank levels onto the Practice shelf folders, most common first', () => {
    expect(practiceFolderFor(['JC2', 'JC1', 'JC2'])).toBe('JC');
    expect(practiceFolderFor(['S3_AM', 'AM_NA'])).toBe('AM');
    expect(practiceFolderFor(['S3_EM', 'EM', 'AM'])).toBe('EM');
    expect(practiceFolderFor(['S2_NA'])).toBe('S2');
    expect(practiceFolderFor(['S1_NT'])).toBe('S1');
    expect(practiceFolderFor([null, 'weird'])).toBeNull();
  });
});
