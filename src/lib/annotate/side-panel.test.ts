import { describe, it, expect } from 'vitest';
import {
  questionsByPage, markerPrompt, splitByPartLabels, splitFinalAnswer, markerSolutionItem,
  findQuestionPage, sideDiagramKey, firstJson, compareQnum,
} from './side-panel';
import { buildSolutionsHTML } from '@/lib/render-solutions-pdf';

const RJ = {
  results: [
    {
      question_number: '10', photo_index: 0,
      marking: { parts: [{ label: '(a)', scheme: 'B1 M1 A1' }, { label: '(b)', scheme: 'B0' }] },
      marking_output: {
        question: { prompt: 'Given θ acute and cos θ = c, express (a) tan θ, (b) cosec θ in terms of c.' },
        correct: {
          final_answer: '(a) tan θ = √(1−c²)/c; (b) cosec θ = 1/√(1−c²)',
          full_solution_latex: '$\\text{(a)}$\n$\\cos\\theta = c$\n$\\tan\\theta = \\frac{\\sqrt{1-c^2}}{c}$\n$\\text{(b)}$\n$\\csc\\theta = \\frac{1}{\\sqrt{1-c^2}}$',
        },
      },
    },
    { question_number: '11', photo_index: 0, marking_output: { correct: { final_answer: 'x = 99', full_solution_latex: '$x = 99$' } } },
    { question_number: '2', photo_index: 1 },
    { question_number: '10', photo_index: 1 },
  ],
};

describe('questionsByPage', () => {
  it('lists each page\'s questions once, in paper order', () => {
    expect(questionsByPage(RJ)).toEqual({ 0: ['10', '11'], 1: ['2', '10'] });
    expect(questionsByPage(null)).toEqual({});
    expect(compareQnum('2', '10')).toBeLessThan(0);
  });
});

describe('the marker\'s solution, made readable', () => {
  it('splits a one-block solution at its (a) / $\\text{(b)}$ lines', () => {
    expect(splitByPartLabels('$\\text{(a)}$\n$x=1$\n(b)\n$y=2$').map((p) => p.label)).toEqual(['(a)', '(b)']);
    expect(splitByPartLabels('$x=1$\n$y=2$')).toEqual([{ label: null, body: '$x=1$\n$y=2$' }]);
  });
  it('splits the final answer by part', () => {
    expect(splitFinalAnswer('(a) tan θ = 2; (b) cosec θ = 3')).toEqual({ '(a)': 'tan θ = 2', '(b)': 'cosec θ = 3' });
    expect(splitFinalAnswer('x = 99')).toEqual({ '': 'x = 99' });
    expect(splitFinalAnswer('')).toEqual({});
  });
  it('every part closes on its own Answer, codes ride as a small grey tag, the prompt is the stem', () => {
    const it10 = markerSolutionItem(RJ, '10')!;
    expect(it10.questionText).toMatch(/^Given θ acute/);
    expect(it10.parts!.map((p) => [p.label, p.answer, p.codes])).toEqual([
      ['a', 'tan θ = √(1−c²)/c', 'B1 M1 A1'],
      ['b', 'cosec θ = 1/√(1−c²)', 'B0'],
    ]);
    const html = buildSolutionsHTML({ title: 't', items: [it10] });
    expect((html.match(/class="sol-final"/g) || []).length).toBe(2);
    expect(html).toContain('<div class="sol-mk sol-pcodes">B1 M1 A1</div>');
    expect(markerSolutionItem(RJ, '11')!.answer).toBe('x = 99');
    expect(markerSolutionItem(RJ, '99')).toBeNull();
    expect(markerPrompt(RJ, '11')).toBe('');
  });
  it('the panel item carries its figures and an empty diagram slot', () => {
    const html = buildSolutionsHTML({ title: 't', items: [{ ...markerSolutionItem(RJ, '11')!, figureImages: ['/f.png'], diagramSlot: true }], meta: 'Page 1' });
    expect(html).toContain('<li class="sol-q" data-q="11">');
    expect(html).toContain('<img class="sol-fig" src="/f.png"');
    expect(html).toContain('<div class="sol-gen" data-gen="11"></div>');
    expect(html).toContain('Page 1');
  });
});

describe('findQuestionPage', () => {
  const pages = [
    [{ str: 'Answer all the questions', x: 0.1 }, { str: '1', x: 0.08 }],
    [{ str: '9 marks', x: 0.8 }, { str: '10', x: 0.07 }, { str: 'The curve…', x: 0.12 }],
    [{ str: '11 Disinfectant destroys', x: 0.07 }],
  ];
  it('finds the number in the left margin, never a "9 marks" on the right', () => {
    expect(findQuestionPage(pages, '10')).toBe(1);
    expect(findQuestionPage(pages, '11')).toBe(2);
    expect(findQuestionPage(pages, '9')).toBeNull();
    expect(findQuestionPage(pages, '10b')).toBe(1);
    expect(findQuestionPage(pages, '')).toBeNull();
  });
});

describe('helpers', () => {
  it('diagram cache key stays inside the run folder', () => {
    expect(sideDiagramKey('r1', '10(b)')).toBe('runs/r1/side-diagrams/q-10-b');
  });
  it('firstJson reads a fenced or bare object, and nothing else', () => {
    expect(firstJson('sure\n```json\n{"need": true, "family": "triangle"}\n```')).toEqual({ need: true, family: 'triangle' });
    expect(firstJson('{"a": "}"} trailing')).toEqual({ a: '}' });
    expect(firstJson('no json')).toBeNull();
  });
});
