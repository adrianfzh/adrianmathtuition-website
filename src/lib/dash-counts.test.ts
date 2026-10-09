import { describe, it, expect } from 'vitest';
import { countHandins, countPractice, isHandin, isRealStudent, PREVIEW_STUDENT_IDS, type HandinRow } from './dash-counts';

// 9 Oct 2026, 10:00 in Singapore
const NOW = Date.parse('2026-10-09T02:00:00Z');
const PREVIEW = PREVIEW_STUDENT_IDS[0];
const row = (id: string, created_at: string, student_id: string | null = 'recA', paper_name: string | null = 'A Math Paper 1'): HandinRow => ({ id, created_at, student_id, paper_name });

describe('countHandins', () => {
  it('buckets by Singapore day, today last', () => {
    const out = countHandins([
      row('1', '2026-10-08T15:59:00Z'),          // 23:59 on the 8th in Singapore
      row('2', '2026-10-08T16:01:00Z'),          // 00:01 on the 9th
      row('3', '2026-10-09T01:00:00Z', 'recB'),  // 09:00 on the 9th
      row('4', '2026-10-03T03:00:00Z'),          // the first day of the strip
      row('5', '2026-10-02T15:00:00Z'),          // 23:00 on the 2nd — before the strip
    ], [], 7, NOW);
    expect(out.perDay).toEqual([1, 0, 0, 0, 0, 1, 2]);
    expect(out.today).toBe(2);
    expect(out.total).toBe(4);
    expect(out.studentsToday).toBe(2);
  });

  it('leaves out rows with no student, the preview student and bench scripts', () => {
    const out = countHandins([
      row('1', '2026-10-09T01:00:00Z', null),
      row('2', '2026-10-09T01:00:00Z', PREVIEW),
      row('3', '2026-10-09T01:00:00Z', 'recA', 'BENCH · physics · AHS 2025 Prelim'),
      row('4', '2026-10-09T01:00:00Z', 'recA', 'Bedok Secondary Paper 1'),
    ], [], 7, NOW);
    expect(out.today).toBe(1);
  });

  it('a re-mark or a repeat of a paper already counted is not a new hand-in', () => {
    // row 1 came in on the 7th; row 2 replaced it today (row 1 carries superseded_by = '2')
    const rows = [row('1', '2026-10-07T03:00:00Z'), row('2', '2026-10-09T01:00:00Z')];
    const out = countHandins(rows, ['2'], 7, NOW);
    expect(out.today).toBe(0);
    expect(out.perDay).toEqual([0, 0, 0, 0, 1, 0, 0]);
    expect(isHandin(rows[1], new Set(['2']))).toBe(false);
  });

  it('the same row twice counts once; a bad date is dropped', () => {
    const out = countHandins([row('1', '2026-10-09T01:00:00Z'), row('1', '2026-10-09T01:00:00Z'), row('2', 'junk')], [], 7, NOW);
    expect(out.today).toBe(1);
    expect(out.total).toBe(1);
  });

  it('nothing in is all zeros, never a gap', () => {
    expect(countHandins([], [], 7, NOW)).toEqual({ today: 0, perDay: [0, 0, 0, 0, 0, 0, 0], total: 0, studentsToday: 0 });
  });
});

describe('countPractice', () => {
  it('counts one per answer by a real student, by Singapore day', () => {
    const out = countPractice([
      { at: '2026-10-09T01:00:00Z', who: 'recA' },
      { at: '2026-10-09T01:05:00Z', who: 'recA' },
      { at: '2026-10-08T10:00:00Z', who: 'recB' },
    ], 7, NOW);
    expect(out.perDay).toEqual([0, 0, 0, 0, 0, 1, 2]);
    expect(out.today).toBe(2);
    expect(out.studentsToday).toBe(1);
    expect(out.total).toBe(3);
  });

  it('leaves out the preview student, the admin and nobody', () => {
    const out = countPractice([
      { at: '2026-10-09T01:00:00Z', who: PREVIEW },
      { at: '2026-10-09T01:00:00Z', who: 'admin' },
      { at: '2026-10-09T01:00:00Z', who: null },
    ], 7, NOW);
    expect(out.today).toBe(0);
    expect(out.total).toBe(0);
  });
});

describe('isRealStudent', () => {
  it('knows who is not a student', () => {
    expect(isRealStudent('recA')).toBe(true);
    expect(isRealStudent(PREVIEW)).toBe(false);
    expect(isRealStudent('admin')).toBe(false);
    expect(isRealStudent('')).toBe(false);
    expect(isRealStudent(null)).toBe(false);
  });
});
