import { describe, it, expect } from 'vitest';
import { teacherVerdict, markerStats, readTeacherMark, ourRange, pct, type TrackRow } from './humanities-tracking';

const row = (o: Partial<TrackRow>): TrackRow => ({
  id: 'x', created_at: '2026-10-15T00:00:00Z', student_name: null, subject: 'social-studies', skill: 'comparison',
  status: 'marked', level_lo: 3, level_hi: 3, levels_max: 4, reads: [{}, {}], marks: 6, points: false,
  teacher_mark: null, teacher_total: null, ...o,
});

describe('teacherVerdict', () => {
  it('inside our range, or which way we were off', () => {
    // comparison 6 marks, Level 3 = 5 marks
    expect(teacherVerdict(row({ teacher_mark: 5, teacher_total: 6 }))?.verdict).toBe('inside');
    expect(teacherVerdict(row({ teacher_mark: 3, teacher_total: 6 }))).toEqual({ verdict: 'we-high', gap: 2 });
    expect(teacherVerdict(row({ teacher_mark: 6, teacher_total: 6 }))?.verdict).toBe('we-low');
  });
  it('scales a teacher total that differs from ours', () => {
    expect(teacherVerdict(row({ teacher_mark: 10, teacher_total: 12 }))?.verdict).toBe('inside');
  });
  it('a point-marked answer holds marks in the level fields', () => {
    const r = row({ skill: 'geo_explain', points: true, level_lo: 2, level_hi: 3, marks: 4 });
    expect(ourRange(r)).toEqual([2, 3, 4]);
    expect(teacherVerdict({ ...r, teacher_mark: 3, teacher_total: 4 })?.verdict).toBe('inside');
  });
  it('nothing to say without a teacher mark or a read', () => {
    expect(teacherVerdict(row({}))).toBeNull();
    expect(teacherVerdict(row({ level_lo: null, teacher_mark: 4 }))).toBeNull();
  });
});

describe('markerStats', () => {
  it('counts agreement, held, failed and the teacher checks', () => {
    const s = markerStats([
      row({}), row({ reads: [{}, {}, {}] }), row({ status: 'held', reads: [{}, {}, {}] }), row({ status: 'failed', level_lo: null, level_hi: null }),
      row({ teacher_mark: 5, teacher_total: 6 }), row({ teacher_mark: 2, teacher_total: 6 }),
    ]);
    expect(s).toMatchObject({ answers: 6, read: 5, agreedFirst: 3, held: 1, failed: 1, teacher: 2, inside: 1, weHigh: 1, weLow: 0 });
    expect(pct(s.agreedFirst, s.read)).toBe('60%');
    expect(pct(0, 0)).toBe('—');
  });
});

describe('readTeacherMark', () => {
  it('takes a mark within its total', () => {
    expect(readTeacherMark('4', '6')).toEqual({ mark: 4, total: 6 });
    expect(readTeacherMark(4.5, 6)).toEqual({ mark: 4.5, total: 6 });
    expect(readTeacherMark(7, 6)).toBeNull();
    expect(readTeacherMark('a', 6)).toBeNull();
  });
});
