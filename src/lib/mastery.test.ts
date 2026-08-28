import { describe, it, expect } from 'vitest';
import { computeMastery, EVIDENCE_MIN, type MasteryEntry } from './mastery';
import type { StudentPaper, StudentQuestion } from './portal-marking';

const NOW = new Date('2026-08-23T12:00:00Z');

function q(over: Partial<StudentQuestion>): StudentQuestion {
  return {
    questionNumber: '1', awarded: 0, max: 4, topic: 'Vectors', comment: '',
    slips: [], full: false, prompt: null, schemes: [], solution: null, revise: null, ...over,
  };
}
function paper(daysAgo: number, questions: StudentQuestion[]): StudentPaper {
  const d = new Date(NOW.getTime() - daysAgo * 86400e3).toISOString().slice(0, 10);
  return {
    id: `run-${daysAgo}`, date: d, name: 'P', awarded: 0, max: 0, pct: null,
    questions, dropped: [], pdfUrl: null, fullPdfUrl: null, pages: [], practice: [], practiceDocxUrl: null,
  };
}
function attempt(daysAgo: number, verdict: 'correct' | 'wrong', confident = false) {
  return { at: new Date(NOW.getTime() - daysAgo * 86400e3).toISOString(), verdict, confident };
}
function entry(topic: string, attempts: unknown[]): MasteryEntry {
  return { topic, attempts };
}

describe('computeMastery', () => {
  it('paper-only topic scores its percentage', () => {
    const m = computeMastery([paper(1, [q({ awarded: 2, max: 4 })])], [], NOW);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ topic: 'Vectors', score: 50, state: 'weak' });
  });

  it('correct notebook attempts pull the score up; wrong pull it down', () => {
    const papers = [paper(5, [q({ awarded: 2, max: 4 })])];
    const up = computeMastery(papers, [entry('Vectors', [attempt(0, 'correct'), attempt(0, 'correct')])], NOW);
    const down = computeMastery(papers, [entry('Vectors', [attempt(0, 'wrong'), attempt(0, 'wrong')])], NOW);
    expect(up[0].score).toBeGreaterThan(50);
    expect(down[0].score).toBeLessThan(50);
  });

  it('confident-wrong drags harder than unsure-wrong (misconception weight)', () => {
    const papers = [paper(5, [q({ awarded: 3, max: 4 })])];
    const unsure = computeMastery(papers, [entry('Vectors', [attempt(0, 'wrong', false)])], NOW);
    const sure = computeMastery(papers, [entry('Vectors', [attempt(0, 'wrong', true)])], NOW);
    expect(sure[0].score).toBeLessThan(unsure[0].score);
  });

  it("today's attempt outweighs a 90-day-old paper question mark-for-mark", () => {
    // Old 4-mark zero (decayed to ~1.4 marks of weight) vs fresh 2-mark correct.
    const m = computeMastery(
      [paper(90, [q({ awarded: 0, max: 4 })])],
      [entry('Vectors', [attempt(0, 'correct'), attempt(0, 'correct')])],
      NOW,
    );
    expect(m[0].score).toBeGreaterThan(50);
  });

  it(`hides topics with under ${EVIDENCE_MIN} marks of evidence`, () => {
    const m = computeMastery([paper(1, [q({ awarded: 1, max: 2, topic: 'Thin' })])], [], NOW);
    expect(m).toHaveLength(0);
  });

  it('recent wins flip the trend arrow up', () => {
    const m = computeMastery(
      [paper(60, [q({ awarded: 1, max: 6 })])],
      [entry('Vectors', [attempt(1, 'correct'), attempt(2, 'correct'), attempt(3, 'correct')])],
      NOW,
    );
    expect(m[0].delta).toBe('up');
  });

  it('no arrow without evidence on both sides of the recency cut', () => {
    const m = computeMastery([paper(1, [q({ awarded: 4, max: 4 })])], [], NOW);
    expect(m[0].delta).toBeNull();
  });

  it('sorts weakest topic first', () => {
    const m = computeMastery(
      [paper(1, [q({ awarded: 4, max: 4, topic: 'Strong' }), q({ questionNumber: '2', awarded: 0, max: 4, topic: 'Weak' })])],
      [], NOW,
    );
    expect(m.map(t => t.topic)).toEqual(['Weak', 'Strong']);
  });

  it('ignores malformed attempts instead of crashing', () => {
    const m = computeMastery(
      [paper(1, [q({ awarded: 2, max: 4 })])],
      [entry('Vectors', [null, {}, { at: 42, verdict: 'correct' }, { at: 'x', verdict: 'maybe' }])],
      NOW,
    );
    expect(m[0].score).toBe(50);
  });
});
