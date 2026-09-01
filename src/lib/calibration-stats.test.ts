import { describe, it, expect } from 'vitest';
import {
  absDelta, signedDelta, isWithinGate, weekStartUtc, weeklyTrend, verdictCounts,
  subjectStats, calibrationStats, gateFor,
  GATE_THRESHOLD_MARKS, GATE_MIN_PAPERS, GATE_MIN_WITHIN_SHARE, TREND_WEEKS, GATE_TARGET_LINE,
  type CalibrationRow, type CalibrationQuestion,
} from './calibration-stats';

// A Wednesday, mid-week, so the week maths has to do real work.
const NOW = new Date('2026-09-02T09:30:00Z');

let seq = 0;
function row(over: Partial<CalibrationRow> = {}): CalibrationRow {
  seq++;
  return {
    id: `row-${seq}`,
    created_at: '2026-09-01T02:00:00Z',
    run_id: null,
    subject: 'math',
    paper_name: `Paper ${seq}`,
    truth_source: 'teacher',
    truth_label: 'Adrian',
    model: 'opus',
    prompt_version: 'v1',
    truth_awarded: 60,
    truth_max: 90,
    ai_awarded: 61,
    ai_max: 90,
    questions_total: 10,
    questions_agree: 8,
    per_question: [],
    notes: null,
    ...over,
  };
}

function q(verdict: string, over: Partial<CalibrationQuestion> = {}): CalibrationQuestion {
  return { question: '1', label: null, truth_awarded: 2, truth_max: 3, ai_awarded: 2, ai_max: 3, delta: 0, verdict, ...over };
}

describe('deltas and the per-paper gate', () => {
  it('signed delta is AI − truth: positive means the AI over-awarded', () => {
    expect(signedDelta(row({ truth_awarded: 60, ai_awarded: 63 }))).toBe(3);
    expect(signedDelta(row({ truth_awarded: 60, ai_awarded: 57 }))).toBe(-3);
  });

  it('absDelta honours the generated column when present and recomputes when absent', () => {
    expect(absDelta(row({ truth_awarded: 60, ai_awarded: 57 }))).toBe(3);
    // A row fetched with the generated column wins over the marks (it IS the
    // same number in Postgres; this just proves which one is read).
    expect(absDelta(row({ truth_awarded: 60, ai_awarded: 57, abs_delta: 4 }))).toBe(4);
    expect(absDelta(row({ truth_awarded: 60, ai_awarded: 57, abs_delta: null }))).toBe(3);
  });

  it('within gate means |Δ| ≤ 2 — exactly 2 is in, 3 is out', () => {
    expect(GATE_THRESHOLD_MARKS).toBe(2);
    expect(isWithinGate(row({ truth_awarded: 60, ai_awarded: 62 }))).toBe(true);
    expect(isWithinGate(row({ truth_awarded: 60, ai_awarded: 58 }))).toBe(true);
    expect(isWithinGate(row({ truth_awarded: 60, ai_awarded: 63 }))).toBe(false);
    expect(isWithinGate(row({ truth_awarded: 60, ai_awarded: 63 }), 3)).toBe(true);
  });
});

describe('subjectStats', () => {
  it('an empty subject is all zeros/nulls with the gate not met and 10 papers short', () => {
    const s = subjectStats([], 'physics', NOW);
    expect(s.papers).toBe(0);
    expect(s.withinGateShare).toBeNull();
    expect(s.meanAbsDelta).toBeNull();
    expect(s.questionAgreement).toBeNull();
    expect(s.overShare).toBeNull();
    expect(s.underShare).toBeNull();
    expect(s.latestPromptVersion).toBeNull();
    expect(s.gate).toEqual({ threshold: 2, minPapers: 10, minWithinShare: 0.9, met: false, papersShort: 10 });
    expect(s.trend).toHaveLength(TREND_WEEKS);
    expect(s.trend.every(p => p.papers === 0 && p.meanAbsDelta === null)).toBe(true);
  });

  it('withinGateShare and meanAbsDelta are over the subject’s papers only', () => {
    const rows = [
      row({ subject: 'math', truth_awarded: 60, ai_awarded: 62 }), // |Δ| 2, in
      row({ subject: 'math', truth_awarded: 60, ai_awarded: 56 }), // |Δ| 4, out
      row({ subject: 'math', truth_awarded: 60, ai_awarded: 60 }), // |Δ| 0, in
      row({ subject: 'physics', truth_awarded: 60, ai_awarded: 40 }), // someone else's 20
    ];
    const s = subjectStats(rows, 'math', NOW);
    expect(s.papers).toBe(3);
    expect(s.withinGate).toBe(2);
    expect(s.withinGateShare).toBeCloseTo(2 / 3);
    expect(s.meanAbsDelta).toBeCloseTo(2);
  });

  it('question agreement is Σagree/Σtotal, weighted by paper size — not a mean of ratios', () => {
    const rows = [
      row({ questions_total: 40, questions_agree: 40 }), // 100% on a big paper
      row({ questions_total: 4, questions_agree: 0 }),   // 0% on a tiny one
    ];
    // Mean of ratios would say 50%; weighted says 40/44.
    expect(subjectStats(rows, 'math', NOW).questionAgreement).toBeCloseTo(40 / 44);
  });

  it('over/under shares come from per_question verdicts and tolerate rows without any', () => {
    const rows = [
      row({ per_question: [q('agree'), q('over'), q('over'), q('under'), q('missing')] }),
      row({ per_question: null }),
      row({ per_question: [q('agree'), q('extra'), q('nonsense')] }), // unknown verdict skipped
    ];
    const s = subjectStats(rows, 'math', NOW);
    expect(s.verdicts).toEqual({ agree: 2, over: 2, under: 1, missing: 1, extra: 1 });
    expect(s.overShare).toBeCloseTo(2 / 7);
    expect(s.underShare).toBeCloseTo(1 / 7);
  });

  it('latest prompt version is the NEWEST row’s, whatever order the rows arrive in, skipping nulls', () => {
    const rows = [
      row({ created_at: '2026-08-01T00:00:00Z', prompt_version: 'v1', model: 'sonnet' }),
      row({ created_at: '2026-09-01T00:00:00Z', prompt_version: null, model: 'opus' }),
      row({ created_at: '2026-08-20T00:00:00Z', prompt_version: 'v3', model: 'opus' }),
    ];
    const s = subjectStats(rows, 'math', NOW);
    expect(s.latestPromptVersion).toBe('v3');
    expect(s.latestModel).toBe('opus');
    expect(s.latestAt).toBe('2026-09-01T00:00:00Z');
  });
});

describe('the gate — 10-paper minimum from SPEC-SUBJECTS / SPEC-SCIENCE-MARKING', () => {
  it('constants match the spec: ±2 marks, 10–15 hand-marked scripts (floor 10), 90% within', () => {
    expect(GATE_MIN_PAPERS).toBe(10);
    expect(GATE_MIN_WITHIN_SHARE).toBe(0.9);
    expect(GATE_TARGET_LINE).toContain('dual-rater');
  });

  it('nine perfect papers do not meet the gate — the sample is too small', () => {
    const rows = Array.from({ length: 9 }, () => row({ truth_awarded: 50, ai_awarded: 50 }));
    const s = subjectStats(rows, 'math', NOW);
    expect(s.withinGateShare).toBe(1);
    expect(s.gate.met).toBe(false);
    expect(s.gate.papersShort).toBe(1);
  });

  it('ten papers with nine within ±2 meets it; eight within does not', () => {
    const nine = [
      ...Array.from({ length: 9 }, () => row({ truth_awarded: 50, ai_awarded: 51 })),
      row({ truth_awarded: 50, ai_awarded: 60 }),
    ];
    expect(subjectStats(nine, 'math', NOW).gate.met).toBe(true);
    const eight = [
      ...Array.from({ length: 8 }, () => row({ truth_awarded: 50, ai_awarded: 49 })),
      row({ truth_awarded: 50, ai_awarded: 60 }),
      row({ truth_awarded: 50, ai_awarded: 40 }),
    ];
    const s = subjectStats(eight, 'math', NOW);
    expect(s.withinGateShare).toBeCloseTo(0.8);
    expect(s.gate.met).toBe(false);
    expect(s.gate.papersShort).toBe(0);
    expect(gateFor(0, null).met).toBe(false);
  });
});

describe('weekly trend', () => {
  it('weekStartUtc is the Monday 00:00 UTC of the week, Sunday included', () => {
    expect(weekStartUtc(new Date('2026-09-02T09:30:00Z')).toISOString()).toBe('2026-08-31T00:00:00.000Z'); // Wed
    expect(weekStartUtc(new Date('2026-09-06T23:59:59Z')).toISOString()).toBe('2026-08-31T00:00:00.000Z'); // Sun
    expect(weekStartUtc(new Date('2026-09-07T00:00:00Z')).toISOString()).toBe('2026-09-07T00:00:00.000Z'); // Mon
  });

  it('eight buckets, oldest first, current week last, empty weeks null not zero', () => {
    const t = weeklyTrend([], NOW);
    expect(t).toHaveLength(8);
    expect(t[0].weekStart).toBe('2026-07-13');
    expect(t[7].weekStart).toBe('2026-08-31');
    expect(t.every(p => p.meanAbsDelta === null && p.papers === 0)).toBe(true);
  });

  it('papers land in their own week with the mean |Δ| of that week; older rows are outside the window', () => {
    const rows = [
      row({ created_at: '2026-08-31T01:00:00Z', truth_awarded: 50, ai_awarded: 51 }), // this week, |Δ| 1
      row({ created_at: '2026-09-02T08:00:00Z', truth_awarded: 50, ai_awarded: 53 }), // this week, |Δ| 3
      row({ created_at: '2026-08-30T23:00:00Z', truth_awarded: 50, ai_awarded: 45 }), // Sunday → previous week, |Δ| 5
      row({ created_at: '2026-07-12T23:59:59Z', truth_awarded: 50, ai_awarded: 30 }), // just before the window
    ];
    const t = weeklyTrend(rows, NOW);
    expect(t[7]).toEqual({ weekStart: '2026-08-31', papers: 2, meanAbsDelta: 2 });
    expect(t[6]).toEqual({ weekStart: '2026-08-24', papers: 1, meanAbsDelta: 5 });
    expect(t.reduce((n, p) => n + p.papers, 0)).toBe(3);
    // …but the old paper still counts in the headline numbers.
    expect(subjectStats(rows, 'math', NOW).papers).toBe(4);
  });
});

describe('calibrationStats', () => {
  it('always lists the four known subjects in canonical order, then any stranger alphabetically', () => {
    const out = calibrationStats([row({ subject: 'zoology' }), row({ subject: 'art' })], NOW);
    expect(out.subjects.map(s => s.subject)).toEqual(['math', 'physics', 'chemistry', 'biology', 'art', 'zoology']);
    expect(out.papers).toBe(2);
    expect(out.gate.targetLine).toBe(GATE_TARGET_LINE);
  });

  it('keeps subjects apart — physics rows never move the math numbers', () => {
    const rows = [
      row({ subject: 'math', truth_awarded: 50, ai_awarded: 50, questions_total: 5, questions_agree: 5 }),
      row({ subject: 'physics', truth_awarded: 50, ai_awarded: 30, questions_total: 5, questions_agree: 0, per_question: [q('under')] }),
    ];
    const out = calibrationStats(rows, NOW);
    const math = out.subjects.find(s => s.subject === 'math')!;
    const phys = out.subjects.find(s => s.subject === 'physics')!;
    expect(math.meanAbsDelta).toBe(0);
    expect(math.questionAgreement).toBe(1);
    expect(math.underShare).toBeNull();
    expect(phys.meanAbsDelta).toBe(20);
    expect(phys.questionAgreement).toBe(0);
    expect(phys.underShare).toBe(1);
  });

  it('verdictCounts ignores rows with a non-array per_question', () => {
    expect(verdictCounts([row({ per_question: 'oops' as unknown as CalibrationQuestion[] })])).toEqual({ agree: 0, over: 0, under: 0, missing: 0, extra: 0 });
  });
});
