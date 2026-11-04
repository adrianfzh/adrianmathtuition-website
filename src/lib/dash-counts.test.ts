import { describe, it, expect } from 'vitest';
import { countBotAsks, countHandins, countPractice, isHandin, isRealStudent, subjectLabel, subjectLine, PREVIEW_STUDENT_IDS, type HandinRow } from './dash-counts';

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
    expect(countHandins([], [], 7, NOW)).toEqual({ today: 0, perDay: [0, 0, 0, 0, 0, 0, 0], total: 0, studentsToday: 0, bySubject: {} });
  });

  it('counts the week per subject, in the tile words', () => {
    const out = countHandins([
      { ...row('1', '2026-10-09T01:00:00Z'), subject: 'E Math' },
      { ...row('2', '2026-10-08T01:00:00Z'), subject: 'Chemistry' },
      { ...row('3', '2026-10-07T01:00:00Z'), subject: 'E Math' },
      { ...row('4', '2026-10-07T01:00:00Z'), subject: null },
      { ...row('5', '2026-10-01T01:00:00Z'), subject: 'Physics' }, // outside the week
    ], [], 7, NOW);
    expect(out.bySubject).toEqual({ 'E Math': 2, Chem: 1, Other: 1 });
    expect(subjectLine(out.bySubject)).toBe('E Math 2 · Chem 1 · Other 1');
  });
});

describe('countBotAsks', () => {
  it('counts every answer by Singapore day, per subject, leaving out the admin chat and the preview student', () => {
    const out = countBotAsks([
      { at: '2026-10-09T01:00:00Z', chatId: '123', subject: 'Math' },
      { at: '2026-10-09T01:10:00Z', chatId: '123', subject: 'Math' },
      { at: '2026-10-09T02:00:00Z', chatId: 'web-abc', subject: 'Chemistry' },   // a web visitor, no student
      { at: '2026-10-08T02:00:00Z', chatId: 'portal-1', who: 'recB', subject: 'Physics' },
      { at: '2026-10-09T02:00:00Z', chatId: '999', subject: 'Math' },             // the admin's own chat
      { at: '2026-10-09T02:00:00Z', chatId: 'web-x', who: PREVIEW, subject: 'Math' },
    ], ['999'], 7, NOW);
    expect(out.perDay).toEqual([0, 0, 0, 0, 0, 1, 3]);
    expect(out.today).toBe(3);
    expect(out.studentsToday).toBe(2); // two chats
    expect(out.bySubject).toEqual({ Maths: 2, Chem: 1, Phys: 1 });
    expect(subjectLine(out.bySubject)).toBe('Maths 2 · Chem 1 · Phys 1');
  });
});

describe('subjectLabel + subjectLine', () => {
  it('one short word per subject whatever the source stores', () => {
    expect(['EM', 'E Math', 'AM', 'JC', 'JC2', 'S2', 'Math', 'Chemistry', 'physics', 'Biology', 'English', 'science', '', null].map(subjectLabel))
      .toEqual(['E Math', 'E Math', 'A Math', 'H2 Math', 'H2 Math', 'Sec 2', 'Maths', 'Chem', 'Phys', 'Bio', 'English', 'Science', 'Other', 'Other']);
  });
  it('the four biggest, the rest as one count, biggest first', () => {
    expect(subjectLine({ Bio: 1, Chem: 3, 'E Math': 9, Phys: 2, 'A Math': 4, 'H2 Math': 2 })).toBe('E Math 9 · A Math 4 · Chem 3 · H2 Math 2 · 3 more');
    expect(subjectLine({})).toBe('');
    expect(subjectLine({ Maths: 0 })).toBe('');
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
