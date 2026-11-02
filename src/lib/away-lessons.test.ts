import { describe, it, expect } from 'vitest';
import {
  rangeLabel, awayNote, withAwayNote, hasAwayNote, withoutAwayNote,
  reminderDate, reminderDue, liveRanges, reminderMessage,
} from './away-lessons';

const R = { start: '2026-10-28', end: '2026-11-01', reason: '' };

describe('away lessons', () => {
  it('labels a range the way Adrian writes it', () => {
    expect(rangeLabel(R)).toBe('28 Oct–1 Nov 2026');
    expect(rangeLabel({ start: '2026-08-03', end: '2026-08-09' })).toBe('3–9 Aug 2026');
    expect(rangeLabel({ start: '2026-12-05', end: '2026-12-05' })).toBe('5 Dec 2026');
    expect(rangeLabel({ start: '2026-12-28', end: '2027-01-03' })).toBe('28 Dec 2026–3 Jan 2027');
  });

  it('the note matches the one written by hand on 2 Nov 2026', () => {
    expect(awayNote(R)).toBe('Missed (Adrian): tutor away 28 Oct–1 Nov 2026');
  });

  it('adds the note once and takes only that line out again', () => {
    const once = withAwayNote('Parent asked to swap', R);
    expect(once).toBe('Parent asked to swap\nMissed (Adrian): tutor away 28 Oct–1 Nov 2026');
    expect(withAwayNote(once, R)).toBe(once);
    expect(hasAwayNote(once, R)).toBe(true);
    expect(hasAwayNote(once, { start: '2026-12-01', end: '2026-12-05' })).toBe(false);
    expect(withoutAwayNote(once, R)).toBe('Parent asked to swap');
    expect(withAwayNote('', R)).toBe(awayNote(R));
  });

  it('reminds once, from 14 days before until the period starts', () => {
    expect(reminderDate(R)).toBe('2026-10-14');
    expect(reminderDue(R, '2026-10-13')).toBe(false);
    expect(reminderDue(R, '2026-10-14')).toBe(true);
    expect(reminderDue(R, '2026-10-27')).toBe(true);
    expect(reminderDue(R, '2026-10-28')).toBe(false);
    expect(reminderDue({ ...R, remindedOn: '2026-10-14' }, '2026-10-20')).toBe(false);
  });

  it('only sweeps periods that are not over', () => {
    expect(liveRanges([R, { start: '2026-12-01', end: '2026-12-05', reason: '' }], '2026-11-02').map((r) => r.start)).toEqual(['2026-12-01']);
  });

  it('lists each student once with their dates', () => {
    const msg = reminderMessage({ ...R, reason: 'Japan trip' }, [
      { date: '2026-10-31', time: '9-11am', student: 'Bea' },
      { date: '2026-10-30', time: '5-7pm', student: 'Al' },
      { date: '2026-11-01', time: '9-11am', student: 'Bea' },
    ]);
    expect(msg).toContain('You are away 28 Oct–1 Nov 2026</b> (Japan trip)');
    expect(msg).toContain('2 students, 3 lessons');
    expect(msg).toContain('• Al — Fri 30 Oct 5-7pm');
    expect(msg).toContain('• Bea — Sat 31 Oct 9-11am, Sun 1 Nov 9-11am');
    expect(reminderMessage(R, [])).toContain('no make-ups to arrange');
  });
});
