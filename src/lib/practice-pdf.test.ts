import { describe, it, expect } from 'vitest';
import { buildPracticePdfHtml, practicePdfFilename, KATEX_CSS_URL } from './practice-pdf';
import type { PracticePaper } from './practice-pdf';

const paper: PracticePaper = {
  name: 'Xinmin 2021 Prelim P2',
  date: '2026-08-13',
  practice: [
    {
      for: '3',
      id: '11111111-1111-4111-8111-111111111111',
      question: 'Solve $x^2 - 5x + 6 = 0$.',
      answer: '$x = 2$ or $x = 3$',
      topic: 'Quadratic Equations',
      origin: 'Methodist 2023',
      note: 'Same factorisation slip as your Q3.',
    },
    {
      for: '7b',
      id: null,
      question: 'Find the median from the graph.',
      answer: '',
      topic: null,
      origin: null,
      note: null,
    },
  ],
};

describe('buildPracticePdfHtml', () => {
  const html = buildPracticePdfHtml(paper, 'Kieran');

  it('renders $…$ spans as KaTeX and keeps the stylesheet pinned', () => {
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('x^2 - 5x'); // TeX source replaced by markup
    expect(html).toContain(KATEX_CSS_URL);
    expect(KATEX_CSS_URL).toMatch(/katex@0\.16\.\d+\//); // same minor as package.json
  });

  it('numbers questions and captions them with the paper question + topic', () => {
    expect(html).toContain('<span class="q-num">1.</span>');
    expect(html).toContain('<span class="q-num">2.</span>');
    expect(html).toContain('For Q3 · Quadratic Equations');
    expect(html).toContain('For Q7b'); // no topic → no dangling separator
    expect(html).not.toContain('For Q7b ·');
  });

  it('collects only non-empty answers at the back, keyed to sheet numbering', () => {
    expect(html).toContain('<h2>Answers</h2>');
    expect(html).toContain('(for Q3)');
    expect(html).not.toContain('(for Q7b)'); // empty answer stays off the sheet
  });

  it('drops the answers page entirely when no item carries an answer', () => {
    const none = buildPracticePdfHtml({
      ...paper,
      practice: paper.practice.map(p => ({ ...p, answer: '' })),
    });
    expect(none).not.toContain('<h2>Answers</h2>');
  });

  it('escapes prose everywhere it prints student- or model-authored text', () => {
    const hostile = buildPracticePdfHtml(
      {
        name: 'Paper <script>alert(1)</script>',
        date: '2026-08-13',
        practice: [
          {
            for: '<b>1</b>',
            id: null,
            question: 'Evil <img src=x onerror=alert(1)> question',
            answer: '<script>steal()</script>',
            topic: '<i>Topic</i>',
            origin: null,
            note: '<style>*{}</style>',
          },
        ],
      },
      '<script>who</script>',
    );
    expect(hostile).not.toContain('<script>');
    expect(hostile).not.toContain('<img src=x');
    expect(hostile).not.toContain('<i>Topic</i>');
    expect(hostile).not.toContain('<style>*{}</style>');
  });

  it('omits the student line when no name is passed', () => {
    expect(buildPracticePdfHtml(paper)).not.toContain('class="who"');
    expect(html).toContain('For Kieran');
  });
});

describe('practicePdfFilename', () => {
  it('keeps word characters and drops filename-hostile ones', () => {
    expect(practicePdfFilename('Xinmin 2021 Prelim P2')).toBe('Practice - Xinmin 2021 Prelim P2.pdf');
    expect(practicePdfFilename('AM: "Vectors" / §7?')).toBe('Practice - AM Vectors 7.pdf');
    expect(practicePdfFilename('///')).toBe('Practice - worksheet.pdf');
  });
});
