// Structured science twins — the automatic gates, the verdict rule and the queue order (14 Oct 2026, SPEC-TWINS §11b).
import { describe, it, expect } from 'vitest';
import { gateStructured, verdictOk, queueFromUnits, seedUsable, flatParts, partsForBank, wholeScheme, stwinItem } from './sci-stwin.mjs';

const seed = {
  question_text: 'A boy rides an e-scooter at a uniform speed of 6.0 m/s for 10 s, then brakes uniformly to rest in 2.2 s.',
  parts: [
    { label: 'a', text: 'Calculate the deceleration of the e-scooter.', marks: 2, solution: '$a = (0 - 6)/2.2$ (M1)\n2.73 m/s² (A1)' },
    { label: 'b', text: 'Determine whether the e-scooter stops within 10 m of the point where the brakes are applied.', marks: 2, solution: '½ × 6 × 2.2 = 6.6 m (C1)\nyes (B1)' },
  ],
};
const structure = { leaves: [{ label: 'a', marks: 2 }, { label: 'b', marks: 2 }], total: 4 };
const twin = () => ({
  stem: 'A delivery robot moves along a corridor at 1.5 m/s. It detects a closed door and slows down at a steady rate, stopping 3.0 s later.',
  parts: [
    { label: 'a', text: 'Find the size of the robot\'s deceleration while it slows down.', marks: 2, answer: '0.50 m/s²',
      solution: '$a = \\frac{v - u}{t} = \\frac{0 - 1.5}{3.0}$ (M1)\nDeceleration = 0.50 m/s² (A1)\n**Answer:** 0.50 m/s²' },
    { label: 'b', text: 'The door was 2.0 m ahead when the robot began to slow down. Show whether the robot stops before reaching the door.', marks: 2, answer: 'stops after 2.25 m, so it reaches the door',
      solution: 'Distance = area under the speed–time graph = ½ × 1.5 × 3.0 = 2.25 m (M1)\n2.25 m > 2.0 m, so it does not stop before the door (A1)\n**Answer:** it travels 2.25 m, so it reaches the door\nAccept: 2.3 m' },
  ],
  needs_figure: false,
});
const gate = (q) => gateStructured(q, { src: seed, corpus: [], key: 'PHY', structure });

describe('gateStructured', () => {
  it('passes a clean twin with the seed\'s parts and marks', () => {
    const g = gate(twin());
    expect(g.problems).toEqual([]);
    expect(g.total_marks).toBe(4);
  });
  it('refuses a part whose marks differ from the seed', () => {
    const q = twin(); q.parts[1].marks = 3;
    expect(gate(q).problems.join(' ')).toMatch(/\(b\) has 3 mark/);
  });
  it('refuses scheme codes that do not add up to the marks', () => {
    const q = twin(); q.parts[0].solution = 'a = 0.5 (M1)\n**Answer:** 0.50 m/s²';
    expect(gate(q).problems.join(' ')).toMatch(/codes add to 1/);
  });
  it('allows more codes than marks only with "Any N of"', () => {
    const q = twin(); q.parts[0].solution = 'p (B1)\nq (B1)\nr (B1)\n**Answer:** p; q';
    expect(gate(q).problems.join(' ')).toMatch(/codes add to 3/);
    q.parts[0].solution = 'Any 2 of:\np (B1)\nq (B1)\nr (B1)\n**Answer:** p; q';
    expect(gate(q).problems.join(' ')).not.toMatch(/codes add/);
  });
  it('wants the Answer line last (Accept lines may follow)', () => {
    const q = twin(); q.parts[0].solution = '**Answer:** 0.5\nworking (M1) (A1)';
    expect(gate(q).problems.join(' ')).toMatch(/must end with/);
  });
  it('refuses parts that cannot be typed, tables and school words', () => {
    const q = twin(); q.parts[0].text = 'Plot a speed-time graph on the grid.';
    expect(gate(q).problems.join(' ')).toMatch(/cannot be answered by typing/);
    const t = twin(); t.stem += '\n| t/s | v |\n| 0 | 1 |';
    expect(gate(t).problems.join(' ')).toMatch(/table/);
    const p = twin(); p.stem += ' (Prelim 2024)';
    expect(gate(p).problems.join(' ')).toMatch(/never read/);
  });
  it('refuses the seed with only the numbers changed', () => {
    const q = { stem: seed.question_text.replace('6.0', '8.0'), parts: seed.parts.map((p) => ({ ...p, answer: 'x', solution: `${p.solution}\n**Answer:** x` })) };
    const probs = gate(q).problems.join(' ');
    expect(probs).toMatch(/too close to the seed|number-swap/);
  });
});

describe('verdictOk', () => {
  const v = { scheme_correct: true, blind_agrees: true, blind_marks: 9, total_marks: 10, scheme_markable: true, one_reading: true, typed_answerable: true,
    self_contained: true, in_syllabus: true, original: true, reads_as_source: false, same_skill: true, same_demand: true, work_score: 3, level_ok: true,
    house_style: true, student_safe: true, score: 4 };
  const blind = { parts: [{ label: 'a', answer: 'x' }] };
  it('passes when every point holds and the blind solve loses at most one mark', () => expect(verdictOk(v, blind, 10)).toBe(true));
  it('fails when the blind solve loses two marks', () => expect(verdictOk({ ...v, blind_marks: 8 }, blind, 10)).toBe(false));
  it('wants full marks from the blind solve on a short question', () => expect(verdictOk({ ...v, blind_marks: 2 }, blind, 3)).toBe(false));
  it('fails on any false point', () => expect(verdictOk({ ...v, same_demand: false }, blind, 10)).toBe(false));
});

describe('queueFromUnits', () => {
  const u = (pool, topic, tier, servable, n) => ({ pool, topic, tier, servable, need: 40 - servable, seeds: Array.from({ length: n }, (_, i) => ({ source_id: `${topic}-${i}`, subgroup_id: i })) });
  it('fills tier 1 before tier 2, topics taking turns', () => {
    const q = queueFromUnits([u('PHY', 'Kinematics', 1, 14, 3), u('BIO', 'Enzymes', 1, 12, 3), u('CS_PHY', 'Forces', 2, 0, 3)], 5);
    expect(q.map((r) => r.source_id)).toEqual(['Kinematics-0', 'Enzymes-0', 'Kinematics-1', 'Enzymes-1', 'Kinematics-2']);
  });
  it('never goes past a topic\'s need', () => {
    const q = queueFromUnits([u('PHY', 'Pressure', 1, 39, 5), u('CS_PHY', 'Forces', 2, 0, 1)], 5);
    expect(q.map((r) => r.source_id)).toEqual(['Pressure-0', 'Forces-0']);
  });
});

describe('seeds and the bank shape', () => {
  const row = { school: 'X', quarantined: false, practice_hidden: false, question_text: 'stem text long enough to count here', solution: 's', answer: null, parts: seed.parts };
  it('takes a typed structured row, not one with a plot part', () => {
    expect(seedUsable(row)).toBe(true);
    expect(seedUsable({ ...row, parts: [...seed.parts, { label: 'c', text: 'Plot the results on the grid.', marks: 2 }] })).toBe(false);
    expect(seedUsable({ ...row, school: 'AdrianMath' })).toBe(false);
  });
  it('flattens sub-parts and builds the scheme', () => {
    const parts = [{ label: 'a', text: 'A', marks: 1, answer: '1', solution: 'x (B1)\n**Answer:** 1' }, { label: 'b', text: 'B', subparts: [{ label: 'i', text: 'Bi', marks: 1, answer: '2', solution: 'y (B1)\n**Answer:** 2' }] }];
    expect(flatParts(parts).map((p) => p.label)).toEqual(['a', 'b.i']);
    expect(partsForBank(parts)[1].subparts[0].marks).toBe(1);
    expect(wholeScheme(parts)).toMatch(/^\(a\) x \(B1\)/);
    expect(stwinItem('CS_PHY', 's1')).toBe('sci-stwin-CS_PHY-s1');
  });
});

describe('a parent part\'s own text', () => {
  it('rides on its first sub-part so the solver and checker see it', () => {
    const parts = [{ label: 'c', text: 'Her results: 0 m/s 4%, 1 m/s 7%.', subparts: [{ label: 'i', text: 'Describe the trend.', marks: 2 }, { label: 'ii', text: 'Name one other factor.', marks: 1 }] }];
    const f = flatParts(parts);
    expect(f[0].lead).toMatch(/Her results/);
    expect(f[1].lead).toBeUndefined();
  });
});

describe('grader notes after the Answer line', () => {
  it('do not count their codes, and "Do not award" is a note', () => {
    const q = twin();
    q.parts[0].solution += '\nAccept: moments about Q: x (C1), y (A1)\nDo not award a mark for a wrong direction.';
    expect(gate(q).problems).toEqual([]);
  });
});
