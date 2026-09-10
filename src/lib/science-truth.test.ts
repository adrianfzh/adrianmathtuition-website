import { describe, it, expect } from 'vitest';
import { parseTeacherTotal, teacherTotalRow, teacherTotalSummary, TEACHER_TOTAL_LABEL } from './science-truth';

describe('parseTeacherTotal', () => {
  it('takes a whole number and defaults the max to ours', () => {
    expect(parseTeacherTotal({ awarded: '52' }, 80)).toEqual({ ok: true, value: { awarded: 52, max: 80 } });
    expect(parseTeacherTotal({ awarded: 52, max: '' }, 80)).toEqual({ ok: true, value: { awarded: 52, max: 80 } });
  });
  it("accepts the teacher's own max within reason and keeps it", () => {
    expect(parseTeacherTotal({ awarded: 60, max: 78 }, 80)).toEqual({ ok: true, value: { awarded: 60, max: 78 } });
  });
  it('refuses a max far from ours — a typo, not a different paper', () => {
    expect(parseTeacherTotal({ awarded: 10, max: 20 }, 80).ok).toBe(false);
    expect(parseTeacherTotal({ awarded: 10, max: 200 }, 80).ok).toBe(false);
  });
  it('refuses junk, negatives, decimals and a mark above the total', () => {
    expect(parseTeacherTotal({ awarded: 'lots' }, 80).ok).toBe(false);
    expect(parseTeacherTotal({ awarded: -1 }, 80).ok).toBe(false);
    expect(parseTeacherTotal({ awarded: 52.5 }, 80).ok).toBe(false);
    expect(parseTeacherTotal({ awarded: 81 }, 80).ok).toBe(false);
    expect(parseTeacherTotal({ awarded: undefined }, 80).ok).toBe(false);
  });
});

describe('teacherTotalRow', () => {
  it('is a calibration_results row with the generated columns left out', () => {
    const row = teacherTotalRow({ runId: 'r1', subject: 'physics', paperName: 'Sec 4 Physics WA2', model: 'claude-opus-5', rulesVersion: 'abc123', aiAwarded: 50, aiMax: 80, truth: { awarded: 52, max: 80 } });
    expect(row).toMatchObject({ run_id: 'r1', subject: 'physics', truth_source: 'teacher', truth_label: TEACHER_TOTAL_LABEL, truth_awarded: 52, truth_max: 80, ai_awarded: 50, ai_max: 80, questions_total: 0, per_question: [] });
    expect('abs_delta' in row).toBe(false);
    expect('within_gate' in row).toBe(false);
  });
  it('never sends a null model — the column is NOT NULL', () => {
    expect(teacherTotalRow({ runId: 'r1', subject: 'biology', paperName: null, model: null, rulesVersion: null, aiAwarded: 1, aiMax: 2, truth: { awarded: 1, max: 2 } }).model).toBe('unknown');
  });
});

describe('teacherTotalSummary', () => {
  it('reads the gate the way the dashboard does (|Δ| ≤ 2)', () => {
    expect(teacherTotalSummary({ awarded: 52, max: 80 }, { awarded: 50, max: 80 })).toMatchObject({ delta: 2, withinGate: true });
    expect(teacherTotalSummary({ awarded: 47, max: 80 }, { awarded: 50, max: 80 })).toMatchObject({ delta: 3, withinGate: false });
  });
});
