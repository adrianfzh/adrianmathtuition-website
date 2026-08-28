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

describe('buildPracticePdfHtml — brand header', () => {
  const html = buildPracticePdfHtml(paper, 'Kieran');

  it('prints the house-style brand line above the paper title', () => {
    expect(html).toContain('<div class="brand">ADRIAN&rsquo;S MATH TUITION</div>');
    expect(html.indexOf('class="brand"')).toBeLessThan(html.indexOf('class="title"'));
  });

  it('styles the brand line navy, letterspaced, over the house orange rule', () => {
    expect(html).toContain('color: #1c3a5e');
    expect(html).toContain('letter-spacing: .3em');
    expect(html).toContain('border-bottom: 1.1pt solid #843C0C');
  });
});

describe('buildPracticePdfHtml — marks bracket', () => {
  const bankId = '11111111-1111-4111-8111-111111111111'; // paper.practice[0].id

  it('prints [n] for a bank pick with a mapped positive mark', () => {
    const html = buildPracticePdfHtml(paper, 'Kieran', { [bankId]: 3 });
    expect(html).toContain('<span class="q-mk">[3]</span>');
  });

  it('never brackets a generated item, even when its (null) id could somehow map', () => {
    const html = buildPracticePdfHtml(paper, 'Kieran', { [bankId]: 3 });
    // Q3 (bank pick) gets exactly one bracket; Q7b (generated, id null) gets none.
    expect(html.match(/class="q-mk"/g)).toHaveLength(1);
  });

  it('omits the bracket for a bank pick missing from the marks map', () => {
    const html = buildPracticePdfHtml(paper, 'Kieran', {});
    expect(html).not.toContain('class="q-mk"');
  });

  it('omits the bracket when the mapped total_marks is 0', () => {
    const html = buildPracticePdfHtml(paper, 'Kieran', { [bankId]: 0 });
    expect(html).not.toContain('class="q-mk"');
  });

  it('omits the bracket entirely when no marks map is passed', () => {
    expect(buildPracticePdfHtml(paper, 'Kieran')).not.toContain('class="q-mk"');
  });
});

describe('buildPracticePdfHtml — page breaks and working space', () => {
  const html = buildPracticePdfHtml(paper, 'Kieran');

  it('keeps a whole question block — head, stem, note and space — off a page break', () => {
    expect(html).toContain('.q { margin-bottom: 2mm; break-inside: avoid; page-break-inside: avoid; }');
  });

  it('gives each question a ~68mm working-space band', () => {
    expect(html).toContain('.space { height: 68mm; }');
  });
});

describe('practicePdfFilename', () => {
  it('keeps word characters and drops filename-hostile ones', () => {
    expect(practicePdfFilename('Xinmin 2021 Prelim P2')).toBe('Practice - Xinmin 2021 Prelim P2.pdf');
    expect(practicePdfFilename('AM: "Vectors" / §7?')).toBe('Practice - AM Vectors 7.pdf');
    expect(practicePdfFilename('///')).toBe('Practice - worksheet.pdf');
  });
});
