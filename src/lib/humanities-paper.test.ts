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
