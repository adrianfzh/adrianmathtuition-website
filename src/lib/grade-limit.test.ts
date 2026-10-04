import { describe, it, expect } from 'vitest';
import { gradeLimit, isCapExempt, DAILY_GRADE_HARD_CAP } from './grade-limit';
import { DAILY_GRADE_CAP } from './practice-grade';

describe('gradeLimit', () => {
  it('lets a student grade under the daily cap', () => {
    expect(gradeLimit({ assignment: null, countToday: DAILY_GRADE_CAP - 1 }).ok).toBe(true);
  });
  it('stops student-started practice at the daily cap with a friendly line', () => {
    const r = gradeLimit({ assignment: null, countToday: DAILY_GRADE_CAP });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Back tomorrow/);
  });
  it('work Adrian sent stays exempt up to the hard cap', () => {
    const sent = { source: 'adrian', status: 'assigned' };
    expect(isCapExempt(sent)).toBe(true);
    expect(gradeLimit({ assignment: sent, countToday: DAILY_GRADE_CAP + 5 }).ok).toBe(true);
    expect(gradeLimit({ assignment: sent, countToday: DAILY_GRADE_HARD_CAP }).ok).toBe(false);
  });
  it('regression (5 Oct 2026): a self-made practice-photo row is NOT exempt', () => {
    const photo = { source: 'practice-photo', status: 'assigned' };
    expect(isCapExempt(photo)).toBe(false);
    expect(gradeLimit({ assignment: photo, countToday: DAILY_GRADE_CAP }).ok).toBe(false);
  });
  it('regression (5 Oct 2026): re-grading an already-marked row counts against the cap', () => {
    const marked = { source: 'adrian', status: 'marked' };
    expect(isCapExempt(marked)).toBe(false);
    expect(gradeLimit({ assignment: marked, countToday: DAILY_GRADE_CAP }).ok).toBe(false);
  });
  it('a found question was never exempt', () => {
    expect(isCapExempt({ source: 'find', status: 'assigned' })).toBe(false);
  });
});

import { hintWriteAllowed, DAILY_HINT_WRITE_CAP } from './grade-limit';
describe('hintWriteAllowed', () => {
  it('allows new hints up to the cap, then stops', () => {
    expect(hintWriteAllowed(DAILY_HINT_WRITE_CAP - 1)).toBe(true);
    expect(hintWriteAllowed(DAILY_HINT_WRITE_CAP)).toBe(false);
  });
});

import { photoReadsAllowed, DAILY_PHOTO_READ_CAP } from './grade-limit';
describe('photoReadsAllowed', () => {
  it('counts a sheet of five photos as five reads', () => {
    expect(photoReadsAllowed(DAILY_PHOTO_READ_CAP - 5, 5)).toBe(true);
    expect(photoReadsAllowed(DAILY_PHOTO_READ_CAP - 4, 5)).toBe(false);
  });
});
