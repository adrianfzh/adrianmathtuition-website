import { describe, expect, it } from 'vitest';
import { buildExamHTML, buildKeyHTML, buildPrelimHTML, type PrelimInput } from './render-prelim';
import { MOCK_COVER_INSTRUCTIONS, mockCover } from './print-paper';

// HTML-level checks of the two layouts (the Puppeteer/pdf-lib halves need a
// browser and are exercised on deploy). The exam-format layer must carry the
// full cover, and the legacy worksheet layout must be untouched.

const input: PrelimInput = {
  title: 'A MATH MOCK PAPER 1',
  subtitle: 'Printed for Wei Jie · 28 Aug 2026 · AdrianMath',
  questions: [
    { pos: 1, marks: 4, text: 'Solve $x^2=4$.', answer: '$x=\\pm 2$' },
    { pos: 2, marks: 86, text: 'Prove everything.', answer: '42' },
  ],
  workingSpace: true,
};

const covered: PrelimInput = {
  ...input,
  instructions: MOCK_COVER_INSTRUCTIONS,
  cover: mockCover('AM', 'P1', { printedFor: 'Wei Jie', printedOn: '28 Aug 2026' }),
};

describe('buildPrelimHTML (worksheet layout, unchanged)', () => {
  it('keeps the header + instructions + same-document answer key', () => {
    const html = buildPrelimHTML(input);
    expect(html).toContain('A MATH MOCK PAPER 1');
    expect(html).toContain('READ THESE INSTRUCTIONS FIRST');
    expect(html).toContain('Total: 90 marks');
    expect(html).toContain('Answer Key');
    expect(html).not.toContain('class="cv-centre"'); // no cover markup on worksheet sheets
    expect(html).not.toContain('END OF PAPER');
  });
});

describe('buildExamHTML (exam format)', () => {
  it('renders the full page-1 cover', () => {
    const html = buildExamHTML(covered);
    expect(html).toContain('ADRIAN MATH TUITION');
    expect(html).toContain('MOCK EXAMINATION');
    expect(html).toContain('CANDIDATE');
    expect(html).toContain('INDEX');
    expect(html).toContain('ADDITIONAL MATHEMATICS');
    expect(html).toContain('4049/01');
    expect(html).toContain('Paper 1');
    expect(html).toContain('2 hours 15 minutes');
    expect(html).toContain('Candidates answer on the Question Paper.');
    expect(html).toContain('READ THESE INSTRUCTIONS FIRST');
    expect(html).toContain('The total of the marks for this paper is 90.');
    expect(html).toContain('Do not turn over this page until you are told to do so.');
    expect(html).toContain('Printed for Wei Jie · 28 Aug 2026 · AdrianMath');
  });

  it('ends with END OF PAPER and keeps the answer key OUT of the exam document', () => {
    const html = buildExamHTML(covered);
    expect(html).toContain('END OF PAPER');
    expect(html).not.toContain('Answer Key');
    expect(html).not.toContain('$x=\\pm 2$'); // no answers anywhere in the exam doc
  });

  it('draws the H2 P2 Section A/B headings immediately before their questions', () => {
    const sectioned: PrelimInput = {
      ...covered,
      cover: mockCover('JC2', 'P2'),
      questions: [
        { pos: 1, marks: 40, text: 'Pure question.', answer: 'a' },
        { pos: 2, marks: 60, text: 'Stats question.', answer: 'b' },
      ],
      sections: [
        { beforePos: 1, label: 'Section A: Pure Mathematics [40 marks]' },
        { beforePos: 2, label: 'Section B: Probability and Statistics [60 marks]' },
      ],
    };
    const html = buildExamHTML(sectioned);
    expect(html).toContain('Section A: Pure Mathematics [40 marks]');
    expect(html).toContain('Section B: Probability and Statistics [60 marks]');
    // ordering: A heading → Q1 → B heading → Q2
    const iA = html.indexOf('Section A');
    const iQ1 = html.indexOf('Pure question.');
    const iB = html.indexOf('Section B');
    const iQ2 = html.indexOf('Stats question.');
    expect(iA).toBeGreaterThan(-1);
    expect(iA).toBeLessThan(iQ1);
    expect(iQ1).toBeLessThan(iB);
    expect(iB).toBeLessThan(iQ2);
    // H2 cover facts ride along
    expect(html).toContain('9758/02');
    expect(html).toContain('3 hours');
  });

  it('draws no section headings when sections are absent (O-Level mocks, topic sheets)', () => {
    // the .section-h CSS rule is always in the stylesheet — the DIV must not be
    expect(buildExamHTML(covered)).not.toContain('class="section-h"');
    expect(buildPrelimHTML(input)).not.toContain('class="section-h"');
  });
});

describe('buildKeyHTML', () => {
  it('is the answer key document', () => {
    const html = buildKeyHTML(covered);
    expect(html).toContain('Answer Key');
    expect(html).toContain('$x=\\pm 2$');
    expect(html).not.toContain('class="cv-warn"');
  });
});
