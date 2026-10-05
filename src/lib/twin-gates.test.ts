import { describe, it, expect } from 'vitest';
import {
  gateMathTwin, mathVerdictOk, mathBlindAgrees, mathVerdictFailures, flatParts, structureOf, plainNumber,
  gateScienceTwin, scienceVerdictOk, scienceVerdictFailures, splitMcq, keyOf, sciQuestionText,
  parseSubmit, flatFigureSpec, rateDecision, orderMathQueue, spreadBySubgroup, interleaveTopics, closest,
  type MathPlan, type MathTwinDraft, type SciTwinDraft,
} from './twin-gates';

// SPEC-TWINS §8 worked example A — the source and its twin.
const SRC = {
  question_text: '',
  parts: [
    { label: 'a', text: 'Express $x^2 - 6x + 7$ in the form $(x + q)^2 + p$.', marks: 2, answer: '(x-3)^2 - 2' },
    { label: 'b', text: 'Explain why the minimum value of $y = x^2 - 6x + 7$ is $p$.', marks: 1, answer: 'shown' },
  ],
};
const PLAN: MathPlan = { source: 's', level: 'EM', marks: 3, difficulty: 'Standard', topics: ['Quadratics'], subgroups: [{ id: 7, name: 'Completing the square', is_primary: true }], structure: structureOf(SRC.parts), has_figure: false };
const TWIN: MathTwinDraft = {
  stem: 'The curve $y = x^2 + 10x + 19$ is to be written in a new form.',
  parts: [
    { label: '(a)', text: 'Find the constants $a$ and $b$ such that $y = (x + a)^2 + b$.', marks: 2, answer: 'a = 5, b = -6' },
    { label: '(b)', text: 'State, with a reason, the least value of $y$.', marks: 1, answer: '-6' },
  ],
  total_marks: 3, topics: ['Quadratics'], needs_figure: false,
  solution: '$y = (x + 5)^2 - 25 + 19$\n$= (x + 5)^2 - 6$\n**Answer:** $a = 5$, $b = -6$\n$(x+5)^2 \\ge 0$, so the least value is $-6$.\n**Answer:** $-6$',
};
const srcText = 'Express x^2 - 6x + 7 in the form (x + q)^2 + p [2]\nExplain why the minimum value of y = x^2 - 6x + 7 is p [1]';

describe('gateMathTwin (twin.mjs check, ported)', () => {
  it('passes a real twin', () => {
    const g = gateMathTwin(TWIN, { plan: PLAN, srcText, corpus: [] });
    expect(g.problems).toEqual([]);
    expect(g.pass).toBe(true);
  });
  it('refuses a changed structure, wrong marks and wrong topics', () => {
    const bad = { ...TWIN, parts: [{ ...TWIN.parts![0], marks: 3 }], topics: ['Algebra'] };
    const g = gateMathTwin(bad, { plan: PLAN, srcText, corpus: [] });
    expect(g.pass).toBe(false);
    expect(g.problems.join(' ')).toMatch(/structure differs/);
    expect(g.problems.join(' ')).toMatch(/topics/);
  });
  it('refuses a number swap of a bank question', () => {
    const corpus = [{ id: 'x', ref: 'School 2022', text: 'The curve y = x^2 + 8x + 11 is to be written in a new form.\n(a) Find the constants a and b such that y = (x + a)^2 + b. [2]\n(b) State, with a reason, the least value of y. [1]' }];
    const g = gateMathTwin(TWIN, { plan: PLAN, srcText, corpus });
    expect(g.pass).toBe(false);
    expect(g.problems.join(' ')).toMatch(/too close|number swap/);
  });
  it('wants the bold Answer line and screens model names', () => {
    const g = gateMathTwin({ ...TWIN, solution: `${TWIN.solution!.replace(/\*\*Answer:\*\*/g, 'So')} Written by Claude.` }, { plan: PLAN, srcText, corpus: [] });
    expect(g.problems.join(' ')).toMatch(/Answer/);
    expect(g.problems.join(' ')).toMatch(/never read/);
  });
  it('a figure source needs a figured twin', () => {
    const g = gateMathTwin(TWIN, { plan: { ...PLAN, has_figure: true }, srcText, corpus: [] });
    expect(g.problems.join(' ')).toMatch(/needs_figure=false/);
  });
});

describe('maths blind + moderator', () => {
  const flat = flatParts(TWIN.parts);
  const verdict = { parts: [{ label: '(a)', agree: true }, { label: '(b)', agree: true }], all_agree: true, same_skill: true, same_method: true, reads_as_source: false, score: 4 };
  it('mathVerdictOk mirrors twin.mjs', () => {
    expect(mathVerdictOk(verdict)).toBe(true);
    expect(mathVerdictOk({ ...verdict, score: 3 })).toBe(false);
    expect(mathVerdictOk({ ...verdict, reads_as_source: true })).toBe(false);
    expect(mathVerdictFailures({ ...verdict, all_agree: false })).toContain('moderator: all_agree is not true');
  });
  it('every key part needs a blind answer the checker agreed', () => {
    expect(mathBlindAgrees(flat, null, { '(a)': 'a=5, b=-6', '(b)': '-6' }, verdict).ok).toBe(true);
    expect(mathBlindAgrees(flat, null, { a: 'a=5, b=-6', b: '-6' }, verdict).ok).toBe(true);
    expect(mathBlindAgrees(flat, null, { '(a)': 'a=5, b=-6' }, verdict).problems[0]).toMatch(/no answer for \(b\)/);
    expect(mathBlindAgrees(flat, null, { '(a)': 'x', '(b)': '-6' }, { ...verdict, parts: [{ label: '(a)', agree: false }, { label: '(b)', agree: true }] }).ok).toBe(false);
  });
  it('two plain numbers must agree to 3 s.f. even when the checker says agree', () => {
    const r = mathBlindAgrees(flat, null, { '(a)': 'a=5, b=-6', '(b)': '-7' }, verdict);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/key -6/);
    expect(mathBlindAgrees([{ label: '(a)', text: 't', marks: 1, answer: '6.708' }], null, { '(a)': '6.71' }, { parts: [{ label: '(a)', agree: true }] }).ok).toBe(true);
  });
  it('a single-part question uses "single"', () => {
    expect(mathBlindAgrees([], '12 cm', { single: '12 cm' }, { parts: [{ label: 'single', agree: true }] }).ok).toBe(true);
  });
  it('plainNumber reads only plain decimals', () => {
    expect(plainNumber('x = 3.5')).toBe(3.5);
    expect(plainNumber('12 cm')).toBe(12);
    expect(plainNumber('$-6$')).toBe(-6);
    expect(plainNumber('3\\sqrt{5}')).toBe(null);
    expect(plainNumber('x = 2 or x = 3')).toBe(null);
  });
});

// science — sci-twin.mjs gateQuestion's rules
const SEED = 'A trolley of mass 2 kg is pushed with a force of 10 N. What is its acceleration?\nA) 0.2 m/s²\nB) 5 m/s²\nC) 12 m/s²\nD) 20 m/s²';
const SCI: SciTwinDraft = {
  stem: 'A crate rests on a rough floor. A worker pulls it with a horizontal force of 60 N and friction of 15 N acts on it. The crate has a mass of 9 kg. What is the acceleration of the crate?',
  options: { A: '1.7 m/s²', B: '5.0 m/s²', C: '6.7 m/s²', D: '8.3 m/s²' },
  answer: 'B',
  solution: '**Key idea:** the resultant force gives the acceleration.\nResultant force = 60 − 15 = 45 N\na = 45 ÷ 9 = 5.0 m/s²\n**Answer: B**\n**Why not the others**\n- **A:** uses the friction alone: 15 ÷ 9.\n- **C:** ignores friction: 60 ÷ 9.\n- **D:** adds friction: 75 ÷ 9.',
};
describe('gateScienceTwin', () => {
  it('passes a well-formed Challenge MCQ', () => {
    const g = gateScienceTwin(SCI, { srcText: SEED, corpus: [], key: 'PHY' });
    expect(g.problems).toEqual([]);
  });
  it('catches out-of-syllabus words, a wrong Answer line and a model name', () => {
    const g = gateScienceTwin({ ...SCI, stem: `${SCI.stem} Use momentum.`, solution: SCI.solution!.replace('**Answer: B**', '**Answer: C**') + ' (Opus)' }, { srcText: SEED, corpus: [], key: 'PHY' });
    const all = g.problems.join(' | ');
    expect(all).toMatch(/syllabus scope/);
    expect(all).toMatch(/Answer C but the key is B/);
    expect(all).toMatch(/never read/);
  });
  it('catches reused seed options', () => {
    const g = gateScienceTwin({ ...SCI, options: { A: '0.2 m/s²', B: '5 m/s²', C: '12 m/s²', D: '9 m/s²' } }, { srcText: SEED, corpus: [], key: 'PHY' });
    expect(g.problems.join(' ')).toMatch(/seed's options reappear/);
  });
  it('splitMcq / keyOf / sciQuestionText', () => {
    expect(splitMcq(SEED).options.D).toBe('20 m/s²');
    expect(keyOf('**(B)**')).toBe('B');
    expect(sciQuestionText(SCI)).toMatch(/\nD\) 8.3 m\/s²$/);
  });
  it('the blind letter must equal the key, every checker point true', () => {
    const v = { key_correct: true, blind_agrees: true, one_defensible_answer: true, in_syllabus: true, original: true, reads_as_source: false, same_skill: true, work_score: 4, is_challenge: true, distractors_real: true, house_style: true, why_not_honest: true, student_safe: true, score: 4 };
    expect(scienceVerdictOk(v, 'b', 'B')).toBe(true);
    expect(scienceVerdictOk(v, 'C', 'B')).toBe(false);
    expect(scienceVerdictOk({ ...v, work_score: 3 }, 'B', 'B')).toBe(false);
    expect(scienceVerdictFailures({ ...v, house_style: false }, 'C', 'B')).toEqual(['blind solver chose C, the key is B', 'checker: house_style is not true']);
  });
});

describe('parseSubmit', () => {
  const seed = '0f158773-dbe9-412c-83c6-d7471b1c6951';
  it('takes the natural cloud shape; top-level fields win', () => {
    const r = parseSubmit({ bank: 'science', seed_id: seed, question: 'stem text', options: { A: '1' }, answer: 'A', solution: 's', gate_record: { blind_answer: 'A', checker: { score: 4 } } });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.sci).toEqual({ stem: 'stem text', options: { A: '1' }, answer: 'A', solution: 's' }); expect(r.value.gate.blind_answer).toBe('A'); }
  });
  it('a maths question object; blind answers from blind.answers', () => {
    const r = parseSubmit({ bank: 'maths', seed_id: seed, question: { stem: 'x', parts: [] }, gate_record: { blind: { answers: { single: '3' } }, verdict: { score: 5 } } });
    expect(r.ok && r.value.gate.blind_answer).toEqual({ single: '3' });
  });
  it('refuses a bad bank, a bad seed, and a real submit without the gate record; dry needs none', () => {
    expect(parseSubmit({ bank: 'english', seed_id: seed, question: 'x' }).ok).toBe(false);
    expect(parseSubmit({ bank: 'maths', seed_id: 'nope', question: 'x' }).ok).toBe(false);
    expect(parseSubmit({ bank: 'maths', seed_id: seed, question: 'x' }).ok).toBe(false);
    expect(parseSubmit({ bank: 'maths', seed_id: seed, question: 'x', dry: true }).ok).toBe(true);
    expect(parseSubmit({ bank: 'maths', seed_id: seed, question: 'x', dry: true, figure_spec: 'svg' }).ok).toBe(false);
  });
  it('flatFigureSpec flattens {family, spec}', () => {
    expect(flatFigureSpec({ family: 'number-line', spec: { min: 0 } })).toEqual({ min: 0, family: 'number-line' });
    expect(flatFigureSpec({ family: 'number-line', min: 0 })).toEqual({ family: 'number-line', min: 0 });
  });
});

describe('rate + queue order', () => {
  it('rateDecision', () => {
    expect(rateDecision({ calls: 10, submits: 5 }, true).allowed).toBe(true);
    expect(rateDecision({ calls: 601, submits: 5 }, false).allowed).toBe(false);
    expect(rateDecision({ calls: 200, submits: 121 }, true).allowed).toBe(false);
    expect(rateDecision({ calls: 200, submits: 121 }, false).allowed).toBe(true);
  });
  it('orderMathQueue: full sub-skills out, focus first, one per sub-skill per round', () => {
    const rows = [
      { source_id: 'a1', level: 'EM', subgroup_id: 1, draws_90d: 9 }, { source_id: 'a2', level: 'EM', subgroup_id: 1, draws_90d: 1 },
      { source_id: 'b1', level: 'EM', subgroup_id: 2, draws_90d: 3 },
      { source_id: 'c1', level: 'S3_EM', subgroup_id: 3, draws_90d: 0 },
      { source_id: 'd1', level: 'EM', subgroup_id: 4, draws_90d: 50 },
    ];
    const r = orderMathQueue(rows, new Map([[4, 5]]), { level: 'EM', limit: 10, focus: new Set([3]) });
    expect(r.picked.map((x) => x.source_id)).toEqual(['c1', 'a1', 'b1', 'a2']);
    expect(r.picked[0].focus).toBe(true);
    expect(orderMathQueue(rows, new Map(), { level: 'EM', limit: 10, focus: new Set([3]), focusOnly: true }).picked.map((x) => x.source_id)).toEqual(['c1']);
  });
  it('spreadBySubgroup + interleaveTopics', () => {
    const s = spreadBySubgroup([{ source_id: '1', subgroup_id: 1 }, { source_id: '2', subgroup_id: 1 }, { source_id: '3', subgroup_id: 2 }]);
    expect(s.map((x) => x.source_id)).toEqual(['1', '3', '2']);
    expect(interleaveTopics([[{ source_id: 'a' }, { source_id: 'b' }], [{ source_id: 'a' }, { source_id: 'c' }]], 3).map((x) => x.source_id)).toEqual(['a', 'b', 'c']);
  });
  it('closest ranks by trigram overlap', () => {
    const c = closest('the cat sat on the mat today', [{ id: '1', ref: 'x', text: 'a dog ran' }, { id: '2', ref: 'y', text: 'the cat sat on the mat' }], 1);
    expect(c[0].id).toBe('2');
  });
});
