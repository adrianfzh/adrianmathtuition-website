import { describe, it, expect } from 'vitest';
import { buildProfile, forecastPaper, backtest, canonicalTopic, type ProfilePaper, type TargetPaper } from './score-forecast';

const paper = (id: string, date: string, qs: [string, number, number][]): ProfilePaper =>
  ({ id, date, questions: qs.map(([t, a, m]) => ({ topics: [t], awarded: a, max: m })) });

describe('buildProfile', () => {
  it('rates each topic by marks won, shrinking thin topics towards the overall rate', () => {
    const prof = buildProfile([paper('p1', '2026-09-10', [['Vectors', 8, 10], ['Surds', 10, 10], ['Indices', 0, 2]])], '2026-09-17');
    expect(prof.get('Vectors')!.rate).toBeGreaterThan(0.78);
    expect(prof.get('Vectors')!.rate).toBeLessThan(0.82);
    // Indices: 0/2 is thin evidence — shrunk a long way towards ~0.82 overall, not 0.
    expect(prof.get('Indices')!.rate).toBeGreaterThan(0.5);
  });
  it('weights recent papers more than old ones', () => {
    const prof = buildProfile([paper('old', '2026-03-01', [['Vectors', 2, 10]]), paper('new', '2026-09-15', [['Vectors', 10, 10]])], '2026-09-17');
    expect(prof.get('Vectors')!.rate).toBeGreaterThan(0.85);
  });
});

describe('forecastPaper', () => {
  const target: TargetPaper = { key: 'gce 2025 em p1', label: 'GCE 2025 P1', total: 20, questions: [
    { number: '1', topics: ['Vectors'], marks: 10 }, { number: '2', topics: ['Surds'], marks: 6 }, { number: '3', topics: ['Matrices'], marks: 4 },
  ] };
  it('expects marks by topic rate, calls unseen topics unknown, ranks the losses', () => {
    const prof = buildProfile([paper('p1', '2026-09-10', [['Vectors', 12, 20], ['Surds', 20, 20]])], '2026-09-17');
    const f = forecastPaper(prof, target);
    expect(f.unknownMarks).toBe(4);
    expect(f.expected).toBeGreaterThan(12); expect(f.expected).toBeLessThan(19);
    expect(f.low).toBeLessThanOrEqual(f.expected); expect(f.high).toBeGreaterThanOrEqual(f.expected);
    expect(f.losses[0].topic).toBe('Vectors');
    expect(f.coverage).toBeCloseTo(0.8, 2);
  });
});

describe('backtest', () => {
  it('predicts each sat paper from the others and reports the error', () => {
    const t: TargetPaper = { key: 'k', label: 'K', total: 10, questions: [{ number: '1', topics: ['Vectors'], marks: 10 }] };
    const r = backtest([{ studentId: 's', papers: [
      { ...paper('a', '2026-09-01', [['Vectors', 8, 10]]), gceKey: 'k', actual: 8, total: 10 },
      { ...paper('b', '2026-09-10', [['Vectors', 9, 10]]) },
    ] }], new Map([['k', t]]), '2026-09-17');
    expect(r.summary.n).toBe(1);
    expect(r.cases[0].forecast.expected).toBeGreaterThan(8);
    expect(r.summary.meanAbsError).toBeLessThan(2);
  });
});

describe('canonicalTopic', () => {
  it('maps the marker\'s words to the bank\'s names, by level', () => {
    expect(canonicalTopic('Partial fractions — repeated linear factor', 'AM')).toBe('Partial Fractions');
    expect(canonicalTopic('Differentiation — stationary points and their nature', 'AM')).toBe('Differentiation (Maximum and Minimum)');
    expect(canonicalTopic('EM: Mensuration', 'EM')).toBe('Mensuration');
    expect(canonicalTopic('Set notation and Venn diagrams', 'EM')).toBe('Sets');
    expect(canonicalTopic('Simple and compound interest', 'EM')).toBe('Financial Math (Interest)');
    expect(canonicalTopic('Quadratic functions — completing the square', 'AM')).toBe('Quadratic Functions');
    expect(canonicalTopic(null, 'EM')).toBeNull();
  });
});

describe('improvement trend and careless (17 Sep 2026)', () => {
  it('a rising student is forecast above their average', () => {
    const rising = [paper('a', '2026-06-01', [['Vectors', 5, 10]]), paper('b', '2026-07-15', [['Vectors', 7, 10]]), paper('c', '2026-09-10', [['Vectors', 9, 10]])];
    const prof = buildProfile(rising, '2026-09-17');
    expect(prof.meta!.trendPer30d).toBeGreaterThan(0.02);
    expect(prof.get('Vectors')!.rate).toBeGreaterThan(0.75);
  });
  it('careless slips are charged once per paper, not hidden inside the topic rate', () => {
    const p: ProfilePaper = { id: 'p', date: '2026-09-10', questions: [{ topics: ['Vectors'], awarded: 8, max: 10, carelessLost: 2 }] };
    const prof = buildProfile([p], '2026-09-17');
    expect(prof.get('Vectors')!.rate).toBeGreaterThan(0.9);   // concept: the 2 lost were slips
    const f = forecastPaper(prof, { key: 'k', label: 'K', total: 90, questions: [{ number: '1', topics: ['Vectors'], marks: 90 }] });
    expect(f.carelessExpected).toBeCloseTo(90 * 0.15, 0);       // capped at 15 %
    expect(f.expected).toBeLessThan(90);
  });
});
