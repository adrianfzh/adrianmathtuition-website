import { describe, it, expect } from 'vitest';
import { buildPlan, FOCUS_MAX, WARM_EVIDENCE_CEILING, type PlanEntry } from './plan';
import { computeMastery, RECENT_DAYS } from './mastery';
import type { StudentPaper, StudentQuestion } from './portal-marking';

const NOW = new Date('2026-08-23T12:00:00Z');

function q(over: Partial<StudentQuestion>): StudentQuestion {
  return {
    questionNumber: '1', awarded: 0, max: 4, topic: 'Vectors', comment: '',
    slips: [], full: false, prompt: null, schemes: [], solution: null, revise: null, ...over,
  };
}
function paper(daysAgo: number, questions: StudentQuestion[], over: Partial<StudentPaper> = {}): StudentPaper {
  const d = new Date(NOW.getTime() - daysAgo * 86400e3).toISOString().slice(0, 10);
  return {
    id: `run-${daysAgo}`, date: d, name: 'Prelim P1', awarded: 0, max: 0, pct: null,
    questions, dropped: [], pdfUrl: null, fullPdfUrl: null, pages: [], practice: [], practiceDocxUrl: null, ...over,
  };
}
function attempt(daysAgo: number, verdict: 'correct' | 'wrong', confident = false) {
  return { at: new Date(NOW.getTime() - daysAgo * 86400e3).toISOString(), verdict, confident };
}
function entry(topic: string | null, attempts: unknown[], over: Partial<PlanEntry> = {}): PlanEntry {
  return { topic, attempts, questionNumber: '7', paperName: 'Prelim P1', ...over };
}

describe('buildPlan — focus band', () => {
  it('picks the lowest-mastery non-solid topics, weakest first, capped', () => {
    const papers = [paper(3, [
      q({ questionNumber: '1', topic: 'Vectors', awarded: 1, max: 6 }),
      q({ questionNumber: '2', topic: 'Trigonometry', awarded: 3, max: 6 }),
      q({ questionNumber: '3', topic: 'Circles', awarded: 4, max: 6 }),
      q({ questionNumber: '4', topic: 'Integration', awarded: 4.5, max: 6 }),
      q({ questionNumber: '5', topic: 'Surds', awarded: 6, max: 6 }),
    ])];
    const plan = buildPlan(papers, [], NOW);
    expect(plan.focus.map(f => f.topic)).toEqual(['Vectors', 'Trigonometry', 'Circles']);
    expect(plan.focus.length).toBeLessThanOrEqual(FOCUS_MAX);
    // Solid topic (100%) never appears as a focus topic.
    expect(plan.focus.some(f => f.topic === 'Surds')).toBe(false);
    expect(plan.empty).toBe(false);
  });

  it('scores and trends come verbatim from computeMastery (single source)', () => {
    const papers = [paper(3, [q({ awarded: 1, max: 6 })])];
    const entries = [entry('Vectors', [attempt(1, 'wrong'), attempt(0, 'wrong')])];
    const plan = buildPlan(papers, entries, NOW);
    const mastery = computeMastery(papers, entries, NOW);
    expect(plan.focus[0].score).toBe(mastery[0].score);
    expect(plan.focus[0].delta).toBe(mastery[0].delta);
  });

  it('writes the paper evidence in plain words with the last date', () => {
    const papers = [
      paper(10, [q({ awarded: 2, max: 6 })], { id: 'a' }),          // lost 4 of 6
      paper(2, [q({ awarded: 3, max: 8 })], { id: 'b' }),           // lost 5 of 8
    ];
    const plan = buildPlan(papers, [], NOW);
    // 2026-08-21 = 2 days before NOW
    expect(plan.focus[0].evidence).toBe('Lost 9 of 14 marks across 2 papers, last on 21 Aug.');
  });

  it('mentions wrong notebook re-attempts alongside the papers', () => {
    const papers = [paper(5, [q({ awarded: 2, max: 6 })])];
    const entries = [entry('Vectors', [attempt(1, 'wrong'), attempt(1, 'correct')])];
    const plan = buildPlan(papers, entries, NOW);
    expect(plan.focus[0].evidence).toContain('got 1 of 2 notebook re-attempts wrong');
  });

  it('links each focus topic to its practice deep-link', () => {
    const plan = buildPlan([paper(1, [q({ awarded: 0, max: 6, topic: 'Trigonometry (Equations)' })])], [], NOW);
    expect(plan.focus[0].practiceHref).toBe(
      `/app/practice?topic=${encodeURIComponent('Trigonometry (Equations)')}`,
    );
  });
});

describe('buildPlan — keep warm band', () => {
  it('lists a fine-score topic whose evidence has decayed toward the floor', () => {
    // 6 marks, 85 days old → decayed weight ≈ 2.24: under the warm ceiling but
    // above STALE_FLOOR, and the score is solid.
    const papers = [
      paper(85, [q({ topic: 'Surds', awarded: 6, max: 6 })], { id: 'old' }),
      paper(2, [q({ topic: 'Vectors', awarded: 1, max: 6 })], { id: 'new' }),
    ];
    const plan = buildPlan(papers, [], NOW);
    expect(plan.keepWarm.map(t => t.topic)).toEqual(['Surds']);
    expect(plan.keepWarm[0].lastTouched).toBe('last touched 12 weeks ago');
    expect(plan.keepWarm[0].practiceHref).toContain('/app/practice?topic=');
    // …and it is not double-listed as a focus topic.
    expect(plan.focus.map(f => f.topic)).toEqual(['Vectors']);
  });

  it('leaves fresh well-evidenced topics out of keep warm', () => {
    const papers = [paper(2, [q({ topic: 'Surds', awarded: 6, max: 6 })])];
    const plan = buildPlan(papers, [], NOW);
    expect(plan.keepWarm).toEqual([]);
  });

  it('never lists a topic in both bands', () => {
    // Weak AND decayed: focus wins, keep warm skips it.
    const papers = [
      paper(80, [q({ topic: 'Vectors', awarded: 1, max: 6 })]),
    ];
    const plan = buildPlan(papers, [], NOW);
    const mastery = computeMastery(papers, [], NOW);
    expect(mastery[0].evidence).toBeLessThanOrEqual(WARM_EVIDENCE_CEILING);
    expect(plan.focus.map(f => f.topic)).toEqual(['Vectors']);
    expect(plan.keepWarm).toEqual([]);
  });
});

describe('buildPlan — wins band', () => {
  it('lists papers handed in inside the window, newest first, with the score', () => {
    const papers = [
      paper(2, [q({ awarded: 3, max: 6 })], { id: 'new', name: 'Mid-year P1', pct: 68 }),
      paper(RECENT_DAYS + 5, [q({ awarded: 3, max: 6 })], { id: 'old', name: 'Ancient P2', pct: 50 }),
    ];
    const plan = buildPlan(papers, [], NOW);
    const paperWins = plan.wins.filter(w => w.kind === 'paper');
    expect(paperWins).toHaveLength(1);
    expect(paperWins[0].label).toBe('Handed in Mid-year P1 — 68%');
    expect(paperWins[0].dateLabel).toBe('21 Aug');
  });

  it('does not stutter when the paper is already named "Handed in …"', () => {
    const papers = [paper(2, [q({ awarded: 3, max: 6 })], { name: 'Handed in 22 Aug', pct: 94 })];
    const plan = buildPlan(papers, [], NOW);
    expect(plan.wins[0].label).toBe('Handed in 22 Aug — 94%');
  });

  it('turns a beaten re-attempt into one win per entry, wrong ones into none', () => {
    const entries = [
      entry('Vectors', [attempt(4, 'correct'), attempt(1, 'correct')]),
      entry('Circles', [attempt(2, 'wrong')], { questionNumber: '3' }),
      entry('Surds', [attempt(RECENT_DAYS + 3, 'correct')], { questionNumber: '9' }),
    ];
    const plan = buildPlan([], entries, NOW);
    const beats = plan.wins.filter(w => w.kind === 'reattempt');
    expect(beats).toHaveLength(1); // streak on one entry = one win; old + wrong = none
    expect(beats[0].label).toBe('Beat Q7 from Prelim P1 (Vectors)');
  });
});

describe('buildPlan — empty state', () => {
  it('flags a student with under EVIDENCE_MIN marks of total evidence', () => {
    const plan = buildPlan([paper(1, [q({ awarded: 1, max: 2 })])], [], NOW);
    expect(plan.empty).toBe(true);
    expect(plan.focus).toEqual([]);
  });

  it('a single 4-mark question is enough to build a plan', () => {
    const plan = buildPlan([paper(1, [q({ awarded: 1, max: 4 })])], [], NOW);
    expect(plan.empty).toBe(false);
    expect(plan.focus).toHaveLength(1);
  });

  it('a handful of notebook attempts also clears the gate', () => {
    const entries = [entry('Vectors', [attempt(1, 'wrong'), attempt(0, 'wrong')])];
    // 2 attempts × weight 2 = 4 marks-equivalent of evidence.
    const plan = buildPlan([], entries, NOW);
    expect(plan.empty).toBe(false);
  });

  it('ignores malformed attempts and topicless questions in the gate', () => {
    const papers = [paper(1, [q({ topic: null, awarded: 0, max: 10 })])];
    const entries = [entry(null, [attempt(0, 'correct')]), entry('Vectors', 'nope' as unknown as unknown[])];
    const plan = buildPlan(papers, entries, NOW);
    expect(plan.empty).toBe(true);
    // …but a beaten topicless entry is still a win — the gate is about
    // evidence for scores, not about celebrating the work.
    expect(plan.wins.filter(w => w.kind === 'reattempt')).toHaveLength(1);
  });
});
