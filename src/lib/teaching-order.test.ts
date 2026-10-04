import { describe, expect, it } from 'vitest';
import {
  TEACHING_ORDER, chooseNext, courseFor, covers, examSeason, nextSetPapers, setLevelFor, studentYear, topicsInOrder,
  type CoverageEvent, type ExamLike,
} from './teaching-order';
import { A_MATH_EXAM_TOPICS, E_MATH_EXAM_TOPICS, JC_TOPICS, S1_EXAM_TOPICS, S2_EXAM_TOPICS } from './canonical-topics';

const NOW = new Date('2026-10-05T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const EM = TEACHING_ORDER.EM;
const AM = TEACHING_ORDER.AM;

describe('the order file', () => {
  it('every step is a canonical topic of its course', () => {
    const lists = {
      EM: E_MATH_EXAM_TOPICS, AM: A_MATH_EXAM_TOPICS, H2: JC_TOPICS, S1: S1_EXAM_TOPICS, S2: S2_EXAM_TOPICS,
    } as const;
    for (const [course, steps] of Object.entries(TEACHING_ORDER)) {
      const names = new Set(lists[course as keyof typeof lists].flatMap((c) => c.topics));
      for (const st of steps) expect(names.has(st.t), `${course}: ${st.t}`).toBe(true);
    }
  });
  it('levels map to courses and years', () => {
    expect(courseFor('EM', 'Sec 3')).toBe('EM');
    expect(courseFor('EM', 'Sec 2')).toBe('S2');
    expect(courseFor('AM', 'Sec 4')).toBe('AM');
    expect(courseFor('H2', 'JC1')).toBe('H2');
    expect(studentYear('Sec 3')).toBe(3);
    expect(studentYear('Sec 5')).toBe(4);
    expect(studentYear('JC2')).toBe(2);
  });
});

describe('chooseNext', () => {
  it("Adrian's example: Sec 3 E Math finished trigonometric ratios → sine rule and cosine rule", () => {
    const events: CoverageEvent[] = [{ topic: 'Trigonometry', skill: 'Right-Angled Triangle Trigonometry', at: ago(6), source: 'material' }];
    const n = chooseNext({ order: EM, year: 3, events, now: NOW })!;
    expect(n.label).toBe('Sine rule and cosine rule');
    expect(n.after).toBe('Trigonometric ratios');
    expect(n.why).toMatch(/Comes after Trigonometric ratios/);
  });

  it('skips what is already covered', () => {
    const events: CoverageEvent[] = [
      { topic: 'Trigonometry', skill: 'Right-Angled Triangle Trigonometry', at: ago(6), source: 'lesson' },
      { topic: 'Trigonometry', skill: 'Sine Rule', at: ago(60), source: 'material' },
    ];
    expect(chooseNext({ order: EM, year: 3, events, now: NOW })!.label).toBe('Area of a triangle (½ab sin C)');
  });

  it('a topic-only lesson log covers that topic up to the student year', () => {
    const e: CoverageEvent = { topic: 'Trigonometry', at: ago(2), source: 'lesson' };
    const threeD = EM.find((s) => s.label?.startsWith('3D'))!;
    expect(covers(e, threeD, 3)).toBe(false);
    expect(covers(e, threeD, 4)).toBe(true);
    expect(chooseNext({ order: EM, year: 3, events: [e], now: NOW })!.label).toBe('Circular Measure');
  });

  it('the newest lesson wins; several sources within a few days anchor at the furthest', () => {
    const events: CoverageEvent[] = [
      { topic: 'Surds', at: ago(40), source: 'lesson' },
      { topic: 'Logarithms', at: ago(3), source: 'lesson' },
      { topic: 'Indices', at: ago(1), source: 'material' },
    ];
    expect(chooseNext({ order: AM, year: 3, events, now: NOW })!.label).toBe('Coordinate Geometry');
  });

  it('a Slow last lesson keeps the same step', () => {
    const events: CoverageEvent[] = [{ topic: 'Logarithms', at: ago(3), source: 'lesson' }];
    const n = chooseNext({ order: AM, year: 3, events, now: NOW, lastMastery: 'Slow' })!;
    expect(n.label).toBe('Logarithms');
    expect(n.why).toMatch(/Slow/);
  });

  it('no teaching record: starts after how far school tested this year', () => {
    const events: CoverageEvent[] = [
      { topic: 'Differentiation (Techniques)', at: ago(30), source: 'exam' },
      { topic: 'Surds', at: ago(200), source: 'exam' },
    ];
    const n = chooseNext({ order: AM, year: 4, events, now: NOW })!;
    expect(n.label).toBe('Differentiation (Tangents and Normals)');
    expect(n.why).toMatch(/school's tests/);
  });

  it('no record: their weakest recent topic comes before the start of the year', () => {
    const n = chooseNext({ order: AM, year: 4, events: [], now: NOW, weak: ['Not A Topic', 'Linear Law'] })!;
    expect(n.label).toBe('Linear Law');
    expect(n.why).toMatch(/loses most marks on Linear Law/);
  });

  it('nothing at all: the first open step of their year', () => {
    expect(chooseNext({ order: AM, year: 4, events: [], now: NOW })!.label).toBe('Circles');
    expect(chooseNext({ order: EM, year: 3, events: [], now: NOW })!.label).toBe('Algebra (Inequalities)');
  });

  it('old coverage does not count', () => {
    const events: CoverageEvent[] = [{ topic: 'Quadratic Functions', at: ago(400), source: 'lesson' }];
    expect(chooseNext({ order: AM, year: 3, events, now: NOW })!.label).toBe('Quadratic Functions');
  });
});

describe('exam season', () => {
  const ex = (o: Partial<ExamLike>): ExamLike => ({ id: 'x', label: 'EOY', subject: 'A Math', paper: null, date: '2026-10-13', daysLeft: 8, testedTopics: [], ...o });
  it('the nearest exam inside three weeks, P1 and P2 merged', () => {
    const s = examSeason([
      ex({ id: 'b', paper: 'P2', date: '2026-10-14', daysLeft: 9, testedTopics: ['Kinematics', 'Surds'] }),
      ex({ id: 'a', paper: 'P1', testedTopics: ['Surds', 'Logarithms'] }),
      ex({ id: 'c', subject: 'E Math', date: '2026-10-20', daysLeft: 15 }),
    ])!;
    expect(s.id).toBe('a');
    expect(s.papers).toEqual(['P1', 'P2']);
    expect(s.testedTopics).toEqual(['Surds', 'Logarithms', 'Kinematics']);
  });
  it('nothing inside the window = no exam season', () => {
    expect(examSeason([ex({ daysLeft: 30 })])).toBeNull();
    expect(examSeason([ex({ daysLeft: -1 })])).toBeNull();
  });
  it('the next Set not yet given', () => {
    const avail = [{ set: 1, paper: 'P1' as const }, { set: 1, paper: 'P2' as const }, { set: 2, paper: 'P1' as const }, { set: 2, paper: 'P2' as const }];
    expect(nextSetPapers(avail, [])).toEqual(avail.slice(0, 2));
    expect(nextSetPapers(avail, [{ set: 1, paper: 'P1' }])).toEqual([{ set: 1, paper: 'P2' }]);
    expect(nextSetPapers(avail, avail.slice(0, 2))).toEqual(avail.slice(2));
    expect(nextSetPapers(avail, avail)).toEqual([]);
  });
  it('subjects to Set levels; topics in teaching order', () => {
    expect(setLevelFor('A Math', 'Sec 4')).toBe('AM');
    expect(setLevelFor('E Math', 'Sec 3')).toBe('EM');
    expect(setLevelFor('Math', 'Sec 2')).toBeNull();
    expect(setLevelFor('H2 Math', 'JC2')).toBeNull();
    expect(topicsInOrder(AM, ['Kinematics', 'Surds', 'Made Up'])).toEqual(['Surds', 'Kinematics', 'Made Up']);
  });
});
