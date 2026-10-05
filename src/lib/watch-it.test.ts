import { describe, expect, it } from 'vitest';
import { subscriptFormulas, areaUnder, buildWatchScript, checkWatchSpec, evalArith, numbersIn, optionText, roadStops, sameNumber, type GraphWatch, type MolesWatch } from './watch-it';
import { validateLessonScript } from './lesson-script';
import kinematics from '../../data/watch-it/kinematics.json';
import chemicalCalculations from '../../data/watch-it/chemical-calculations.json';

const CHEM_SRC = {
  question_text: "CCl$_4$ + 2HF $\\rightarrow$ CF$_2$Cl$_2$ + 2HCl\n\nWhat is the maximum mass of 'CFC 12' that can be made from 10 g of hydrogen fluoride?\n\nA) 20.5 g\nB) 30.3 g\nC) 33.3 g\nD) 60.5 g",
  solution: 'Mr of HF = 1 + 19 = 20\nmol HF = 10 / 20 = 0.5 mol\nmol CF2Cl2 = 0.5 / 2 = 0.25 mol\nMr of CF2Cl2 = 12 + 2(19) + 2(35.5) = 12 + 38 + 71 = 121\nmass = 0.25 x 121 = 30.25 g, i.e. about 30.3 g\n\nAnswer: B.',
  answer: 'B',
};
const CHEM: MolesWatch = {
  kind: 'moles', qid: '19897d88-284a-4bca-847f-c684584ca5ef', topic: 'Chemical Calculations', answer: 'B', answerText: '30.3\\ \\text{g}',
  heading: 'Mass of CFC 12 from 10 g of HF', start: 'mass',
  equation: { lhs: [{ coef: 1, tex: '\\text{CCl}_4' }, { coef: 2, tex: '\\text{HF}' }], rhs: [{ coef: 1, tex: '\\text{CF}_2\\text{Cl}_2' }, { coef: 2, tex: '\\text{HCl}' }] },
  beats: [
    { say: 'Mr of HF is 20.', line: { tex: 'M_r(\\text{HF}) = 1 + 19 = 20', stage: 'mr', check: [{ expr: '1+19', value: 20 }] } },
    { say: '10 over 20 is 0.5 moles.', line: { tex: 'n = \\dfrac{10}{20} = 0.5\\ \\text{mol}', stage: 'moles', check: [{ expr: '10/20', value: 0.5 }] } },
    { say: 'Halve it: 0.25 moles.', ratio: [1, 2], line: { tex: 'n = \\dfrac{0.5}{2} = 0.25\\ \\text{mol}', stage: 'ratio', check: [{ expr: '0.5/2', value: 0.25 }] } },
    { say: '0.25 times 121 is 30.25 grams.', line: { tex: 'm = 0.25 \\times 121 = 30.25\\ \\text{g}', stage: 'mass', check: [{ expr: '0.25*121', value: 30.25 }] } },
  ],
};
const GRAPH_SRC = {
  question_text: 'A ball is released from the top of a tall building. The ball undergoes free fall and took 5.0 s to reach the ground.\n\nWhat is the height of the tall building?\n\nA) 25 m  B) 50 m  C) 125 m  D) 250 m',
  solution: 'In free fall the v-t graph is a straight line of gradient 10 m/s$^2$: $v_1 = 10 \\times 5.0 = 50$ m/s. Height of building $=$ area under the graph $= \\frac{1}{2}(50)(5.0) = 125$ m. Answer: C.',
  answer: 'C',
};
const GRAPH: GraphWatch = {
  kind: 'graph', qid: '2609a9a3-5866-4989-9d99-08bfaefae4a7', topic: 'Kinematics', answer: 'C', answerText: '125\\ \\text{m}',
  heading: 'Free fall for 5.0 s', xLabel: 't / s', yLabel: 'v / (m/s)', points: [[0, 0], [5, 50]],
  pieces: [{ kind: 'segment', from: 0, to: 1 }, { kind: 'area', from: 0, to: 1, label: '$125$ m' }],
  beats: [
    { say: 'A straight line from rest.', piece: [0] },
    { say: 'The area is 125 metres.', piece: [1], line: { tex: 'h = \\tfrac{1}{2}(50)(5.0) = 125\\ \\text{m}', check: [{ expr: '0.5*50*5.0', value: 125 }] } },
  ],
};

describe('evalArith', () => {
  it('does + - * / ^ and brackets', () => {
    expect(evalArith('12+2*19+2*35.5')).toBe(121);
    expect(evalArith('(40+80)/2*3/60')).toBeCloseTo(3);
    expect(evalArith('2^3')).toBe(8);
    expect(evalArith('-4+10')).toBe(6);
  });
  it('refuses anything else', () => {
    expect(evalArith('Math.PI')).toBeNull();
    expect(evalArith('1+')).toBeNull();
    expect(evalArith('')).toBeNull();
  });
});

describe('numbersIn', () => {
  it('drops subscripts, powers and formula counts', () => {
    expect(numbersIn('n(\\text{CF}_2\\text{Cl}_2) = 0.25\\ \\text{mol}').map(n => n.value)).toEqual([0.25]);
    expect(numbersIn('a = 10 m/s$^2$').map(n => n.value)).toEqual([10]);
    expect(numbersIn('C2H4 burns, CO₂ forms').map(n => n.value)).toEqual([]);
    expect(numbersIn('24,000 cm³').map(n => n.value)).toEqual([24000]);
  });
});

it('sameNumber honours the written rounding', () => {
  expect(sameNumber(30.25, '30.25', 30.3, '30.3')).toBe(true);
  expect(sameNumber(30.4, '30.4', 30.25, '30.25')).toBe(false);
});

it('optionText finds the lettered option', () => {
  expect(optionText(CHEM_SRC.question_text, 'B')).toBe('30.3 g');
  expect(optionText('**C**  20 m\n**D**  40 m', 'D')).toBe('40 m');
});

describe('checkWatchSpec', () => {
  it('passes the worked examples', () => {
    expect(checkWatchSpec(CHEM, CHEM_SRC)).toEqual([]);
    expect(checkWatchSpec(GRAPH, GRAPH_SRC)).toEqual([]);
  });
  it('refuses the wrong letter', () => {
    expect(checkWatchSpec({ ...CHEM, answer: 'C' }, CHEM_SRC).join()).toMatch(/not the bank's B/);
  });
  it('refuses a number the solution never wrote', () => {
    const bad = { ...CHEM, beats: [...CHEM.beats, { say: 'That is 31 grams.', line: { tex: 'm = 31\\ \\text{g}' } }] };
    expect(checkWatchSpec(bad, CHEM_SRC).join()).toMatch(/31 is not in the question/);
  });
  it('refuses wrong arithmetic', () => {
    const bad = { ...CHEM, beats: [{ say: 'Ten over twenty.', line: { tex: 'n = 0.5', check: [{ expr: '10/20', value: 0.4 }] } }] };
    expect(checkWatchSpec(bad, CHEM_SRC).join()).toMatch(/10\/20 = 0.5, not 0.4/);
  });
  it('refuses an answer value that is not the option', () => {
    expect(checkWatchSpec({ ...GRAPH, answerText: '250\\ \\text{m}' }, GRAPH_SRC).join()).toMatch(/not in option C/);
  });
  it('refuses TeX in a spoken line', () => {
    const bad = { ...GRAPH, beats: [{ say: 'The area is $125$ m.', piece: [0, 1], line: GRAPH.beats[1].line }] };
    expect(checkWatchSpec(bad, GRAPH_SRC).join()).toMatch(/say carries TeX/);
  });
  it('refuses a graph point the question does not give', () => {
    expect(checkWatchSpec({ ...GRAPH, points: [[0, 0], [7, 50]] }, GRAPH_SRC).join()).toMatch(/points\[1\]/);
  });
});

it('areaUnder adds the trapezia', () => {
  expect(areaUnder([[0, 0], [4, 12], [10, 12], [14, 0]], 0, 3)).toBe(120);
});

it('the road map runs mass → moles → moles → mass with the ratio between', () => {
  expect(roadStops(CHEM)).toEqual(['mass', 'moles', 'moles', 'mass']);
  const scene = buildWatchScript(CHEM).scenes[0];
  expect(scene.type).toBe('equation-steps');
});

it('every committed clip builds a script the player accepts', () => {
  const all = { ...kinematics, ...chemicalCalculations } as Record<string, GraphWatch | MolesWatch>;
  for (const [qid, spec] of Object.entries(all)) {
    expect(spec.qid).toBe(qid);
    const v = validateLessonScript(buildWatchScript(spec));
    expect(v.ok ? [] : v.errors).toEqual([]);
  }
});

it('a heading writes formula counts as subscripts and leaves numbers alone', () => {
  expect(subscriptFormulas('Total gas after 90 cm³ NH3 meets 60 cm³ Cl2')).toBe('Total gas after 90 cm³ NH₃ meets 60 cm³ Cl₂');
  expect(subscriptFormulas('Purity of (NH4)2SO4 from 3.4 g, CFC 12')).toBe('Purity of (NH₄)₂SO₄ from 3.4 g, CFC 12');
  expect(subscriptFormulas('Moles of Y in 7.8 g, from the oxide Y2O')).toBe('Moles of Y in 7.8 g, from the oxide Y₂O');
});
