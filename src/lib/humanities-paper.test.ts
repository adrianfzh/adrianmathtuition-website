import { describe, it, expect } from 'vitest';
import { paperFor, nextPaper, minutesLabel, clockLabel, PAPER_MINUTES } from './humanities-paper';
import { caseStudies, setsFor } from './humanities-questions';
import { allExamples, examplesByTheme } from './humanities-examples';

describe('the timed paper (A4)', () => {
  it('every pairing is the exam shape: 35 + 15 = 50, seven parts', () => {
    for (const cs of caseStudies()) for (const sr of setsFor('social-studies', 'structured')) {
      const p = paperFor(cs.id, sr.id)!;
      expect(p.total, `${cs.id}+${sr.id}`).toBe(50);
      expect(p.parts.map(x => x.label)).toEqual(['1', '2', '3', '4', '5', '6(a)', '6(b)']);
      expect(p.parts.filter(x => x.section === 'A').reduce((n, x) => n + x.marks, 0)).toBe(35);
      expect(p.parts.slice(5).map(x => x.marks)).toEqual([7, 8]);
    }
    expect(PAPER_MINUTES).toBe(105);
  });

  it('refuses a set that is not a case study, or not structured', () => {
    expect(paperFor('s01', 'r01')).toBeNull();
    expect(paperFor(caseStudies()[0].id, 's01')).toBeNull();
  });

  it('the next paper is the one the student has done least of', () => {
    const first = caseStudies()[0], second = caseStudies()[1];
    expect(nextPaper(new Set())).toEqual({ caseStudyId: first.id, structuredId: 'r01' });
    expect(nextPaper(new Set([first.questions[0].id, 'r01-a']))).toEqual({ caseStudyId: second.id, structuredId: 'r02' });
  });

  it('the words for time', () => {
    expect(minutesLabel(105)).toBe('1 h 45 min');
    expect(minutesLabel(60)).toBe('1 h');
    expect(minutesLabel(52)).toBe('52 min');
    expect(clockLabel(105 * 60)).toBe('1:45:00');
    expect(clockLabel(59)).toBe('0:00:59');
    expect(clockLabel(-61)).toBe('0:01:01');
  });
});

describe('the example bank (A3)', () => {
  it('24 examples, eight for each issue, each short enough to learn', () => {
    expect(allExamples().length).toBe(24);
    expect(new Set(allExamples().map(e => e.id)).size).toBe(24);
    for (const g of examplesByTheme()) expect(g.examples.length, g.theme).toBe(8);
    for (const e of allExamples()) {
      expect(e.what.length, e.id).toBeGreaterThan(0);
      expect(e.what.length, e.id).toBeLessThanOrEqual(3);
      for (const line of [...e.what, e.shows]) expect(line.split(/\s+/).length, `${e.id}: ${line}`).toBeLessThanOrEqual(34);
      expect(e.use.length, e.id).toBeGreaterThan(0);
      expect(JSON.stringify(e)).not.toMatch(/\b(adrian|claude|opus|sonnet|haiku|gemini)\b/i);
    }
  });
});

import { niceAxis, tickLabel, chartData, figureProblem } from './humanities-chart';
describe('Geography figures', () => {
  it('an axis ends on a round number, in four or five even steps', () => {
    expect(niceAxis(8.1)).toEqual({ min: 0, max: 10, ticks: [0, 2.5, 5, 7.5, 10] });
    expect(niceAxis(312).ticks).toEqual([0, 100, 200, 300, 400]);
    expect(niceAxis(27, 24).max).toBe(30);
    expect(niceAxis(12, -8).min).toBe(-10);
    expect(tickLabel(1200)).toBe('1,200');
    expect(tickLabel(-5)).toBe('−5');
  });
  it('a table becomes categories and number series; a figure must fit its kind', () => {
    const t = { caption: 'Fig. 1: x', columns: ['Month', 'Temperature (°C)', 'Rainfall (mm)'], rows: [['Jan', '26', '240'], ['Feb', '27', '160'], ['Mar', '27', '1,180']] };
    expect(chartData(t)!.series[1].values).toEqual([240, 160, 1180]);
    expect(figureProblem(t, 'climate')).toBeNull();
    expect(figureProblem(t, 'bar')).toMatch(/one column/);
    expect(figureProblem({ ...t, rows: [['Jan', 'hot', '1']] }, 'line')).toMatch(/numbers/);
  });
});

import { bestFit, pieSlices, pointInPolygon, dotsIn, dotValue, shadeClasses, classOf, isolines, isolineLevels, moreFigureProblem } from './humanities-chart';
import country from '../../data/humanities/geography/country-x.json';
describe('more Geography figures (pie, scatter, wind rose, maps of Country X)', () => {
  const regions = (country as unknown as { regions: { name: string; points: [number, number][] }[] }).regions;
  const names = regions.map(r => r.name);
  const rows = (vals: number[]) => names.map((n, i) => [n, String(vals[i])]);

  it('the best-fit line, pie slices and shade classes', () => {
    expect(bestFit([[0, 1], [1, 3], [2, 5]])).toEqual({ slope: 2, intercept: 1 });
    const s = pieSlices([45, 25, 20, 10]);
    expect(s[0].share).toBeCloseTo(0.45);
    expect(s[3].end).toBeCloseTo(Math.PI * 2);
    const b = shadeClasses([80, 150, 420, 950, 60, 310, 640]);
    expect(b).toEqual([0, 250, 500, 750]);
    expect([60, 310, 640, 950].map(v => classOf(v, b))).toEqual([0, 1, 2, 3]);
  });

  it('Country X: seven regions that share their borders, dots stay inside their region', () => {
    expect(names).toEqual(['North West', 'North', 'North East', 'Central', 'West', 'South', 'South East']);
    // Every corner inside the island is used by at least two regions (no gaps between neighbours).
    const count = new Map<string, number>();
    for (const r of regions) for (const p of r.points) count.set(p.join(), (count.get(p.join()) ?? 0) + 1);
    expect([...count.values()].filter(n => n >= 3).length).toBe(5);
    for (const [k, r] of regions.entries()) {
      const dots = dotsIn(r.points, 20, k + 1);
      expect(dots.length, r.name).toBe(20);
      for (const d of dots) expect(pointInPolygon(d, r.points), r.name).toBe(true);
      expect(dotsIn(r.points, 20, k + 1)).toEqual(dots);
    }
    expect(dotValue(620)).toBe(20);
    expect(dotValue(12)).toBe(1);
  });

  it('isolines: round levels between the lowest and highest value, each traced inside the map', () => {
    const vals = [2600, 2200, 1500, 1900, 2900, 2300, 1400];
    const levels = isolineLevels(vals);
    expect(levels[0]).toBeGreaterThan(1400);
    expect(levels[levels.length - 1]).toBeLessThan(2900);
    expect(levels.length).toBeGreaterThanOrEqual(4);
    const places = regions.map((r, i) => ({ at: [r.points.reduce((s, p) => s + p[0], 0) / r.points.length, r.points.reduce((s, p) => s + p[1], 0) / r.points.length] as [number, number], value: vals[i] }));
    for (const l of isolines(places, levels, 340, 200)) expect(l.segments.length, String(l.level)).toBeGreaterThan(5);
  });

  it('a figure must fit its kind', () => {
    const t = (columns: string[], r: string[][]) => ({ caption: 'Fig. 1: x', columns, rows: r });
    expect(moreFigureProblem(t(['Region', 'People'], rows([1, 2, 3, 4, 5, 6, 7])), 'choropleth', names)).toBeNull();
    expect(moreFigureProblem(t(['Region', 'People'], rows([1, 2, 3, 4, 5, 6, 7]).slice(1)), 'dots', names)).toMatch(/one row for each region/);
    expect(moreFigureProblem(t(['From', 'To', 'n'], [['South', 'Central', '60'], ['North', 'Central', '45']]), 'flows', names)).toBeNull();
    expect(moreFigureProblem(t(['From', 'To', 'n'], [['South', 'Atlantis', '60'], ['North', 'Central', '45']]), 'flows', names)).toMatch(/two regions/);
    expect(moreFigureProblem(t(['Direction', 'Days'], ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map(d => [d, '10'])), 'windrose', names)).toBeNull();
    expect(moreFigureProblem(t(['Direction', 'Days'], [['N', '10'], ['S', '5']]), 'windrose', names)).toMatch(/eight|N, NE/);
    expect(moreFigureProblem(t(['Way', '%'], [['Air', '45'], ['Sea', '55']]), 'pie', names)).toBeNull();
    expect(moreFigureProblem(t(['St', 'km', 'shops'], [['A', '1', '2']]), 'scatter', names)).toMatch(/5 to 14/);
  });
});
