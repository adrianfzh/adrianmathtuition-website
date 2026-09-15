import { describe, it, expect } from 'vitest';
import {
  upcomingOptionalMonths, weekdayDatesInMonth, slotDayIndex, slotLabel,
  monthChoices, changesForMonths, validateChanges, type MonthView, type DateEntry,
  optoutDatesByStudent,
} from './holiday-optout';

const d = (date: string, state: DateEntry['state'], slotId = 'recSlot123456789'): DateEntry =>
  ({ date, slotId, slotLabel: 'Sun 9-11am', state });

const month = (year: number, m: number, label: string, dates: DateEntry[]): MonthView =>
  ({ year, month: m, label, dates });

describe('upcomingOptionalMonths', () => {
  it('offers Nov and Dec when asked in September — October is advance-billed since 15 Sep 2026', () => {
    expect(upcomingOptionalMonths(new Date('2026-09-15T00:00:00Z')).map((m) => m.label))
      .toEqual(['November 2026', 'December 2026']);
  });

  it('never offers the current month — it is already underway', () => {
    expect(upcomingOptionalMonths(new Date('2026-10-20T00:00:00Z')).map((m) => m.label))
      .toEqual(['November 2026', 'December 2026']);
  });

  it('rolls across the year boundary', () => {
    expect(upcomingOptionalMonths(new Date('2026-12-05T00:00:00Z')).map((m) => m.label))
      .toEqual(['November 2027', 'December 2027']);
  });
});

describe('weekdayDatesInMonth', () => {
  it('lists every Sunday in October 2026', () => {
    expect(weekdayDatesInMonth(2026, 10, 0))
      .toEqual(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
  });

  it('drops the public-holiday dates', () => {
    // 25 Dec 2026 is a Friday and sits in NO_LESSON_DATES
    expect(weekdayDatesInMonth(2026, 12, 5)).not.toContain('2026-12-25');
  });
});

describe('slot parsing', () => {
  it('reads a numbered day label', () => {
    expect(slotDayIndex({ Day: '0 Sunday' })).toBe(0);
    expect(slotDayIndex({ Day: 'Wednesday' })).toBe(3);
    expect(slotDayIndex({ Day: 'nonsense' })).toBe(-1);
  });
  it('builds a short label', () => {
    expect(slotLabel({ Day: '0 Sunday', Time: '9-11am' })).toBe('Sun 9-11am');
  });
});

describe('monthChoices — what a parent is actually deciding', () => {
  it('a fully skipped month reads as skipped', () => {
    const [c] = monthChoices([month(2026, 10, 'October 2026', [d('2026-10-04', 'skipped'), d('2026-10-11', 'skipped')])]);
    expect(c).toMatchObject({ skipped: true, partial: false, lessonCount: 2 });
  });

  it('a mixed month is partial, not skipped', () => {
    const [c] = monthChoices([month(2026, 10, 'October 2026', [d('2026-10-04', 'skipped'), d('2026-10-11', 'kept')])]);
    expect(c).toMatchObject({ skipped: false, partial: true });
  });

  it('projected dates count — a lesson not generated yet is still a lesson the parent is paying for', () => {
    const [c] = monthChoices([month(2026, 11, 'November 2026', [d('2026-11-01', 'projected'), d('2026-11-08', 'projected')])]);
    expect(c.lessonCount).toBe(2);
    expect(c.skipped).toBe(false);
  });

  it('locked dates are NOT part of the decision', () => {
    const [c] = monthChoices([month(2026, 10, 'October 2026', [
      d('2026-10-04', 'locked'), d('2026-10-11', 'skipped'), d('2026-10-18', 'skipped'),
    ])]);
    expect(c.lessonCount).toBe(2);
    expect(c.lockedCount).toBe(1);
    expect(c.skipped).toBe(true);   // every date they GOVERN is skipped
  });

  it('a month with nothing but locked dates is not "skipped"', () => {
    const [c] = monthChoices([month(2026, 10, 'October 2026', [d('2026-10-04', 'locked')])]);
    expect(c).toMatchObject({ skipped: false, partial: false, lessonCount: 0 });
  });
});

describe('changesForMonths — the parent answers by month, the writer works by date', () => {
  const oct = month(2026, 10, 'October 2026', [
    d('2026-10-04', 'kept'), d('2026-10-11', 'projected'), d('2026-10-18', 'locked'),
  ]);

  it('expands "skip October" to every date it governs', () => {
    expect(changesForMonths([oct], [{ year: 2026, month: 10, skip: true }]))
      .toEqual([
        { date: '2026-10-04', slotId: 'recSlot123456789', skip: true },
        { date: '2026-10-11', slotId: 'recSlot123456789', skip: true },
      ]);
  });

  it('never touches a locked date — a lesson already taught is not a parent decision', () => {
    const out = changesForMonths([oct], [{ year: 2026, month: 10, skip: true }]);
    expect(out.map((c) => c.date)).not.toContain('2026-10-18');
  });

  it('writes NOTHING when the month is already in the wanted state', () => {
    const done = month(2026, 10, 'October 2026', [d('2026-10-04', 'skipped'), d('2026-10-11', 'skipped')]);
    expect(changesForMonths([done], [{ year: 2026, month: 10, skip: true }])).toEqual([]);
  });

  it('restores only the dates that are actually skipped', () => {
    const mixed = month(2026, 10, 'October 2026', [d('2026-10-04', 'skipped'), d('2026-10-11', 'kept')]);
    expect(changesForMonths([mixed], [{ year: 2026, month: 10, skip: false }]))
      .toEqual([{ date: '2026-10-04', slotId: 'recSlot123456789', skip: false }]);
  });

  it('ignores a month that was never offered — the parent can only answer what we asked', () => {
    expect(changesForMonths([oct], [{ year: 2026, month: 7, skip: true }])).toEqual([]);
  });

  it('handles two slots in one month', () => {
    const two = month(2026, 10, 'October 2026', [
      d('2026-10-04', 'kept', 'recSlotAAAAAAAAAA'), d('2026-10-06', 'kept', 'recSlotBBBBBBBBBB'),
    ]);
    const out = changesForMonths([two], [{ year: 2026, month: 10, skip: true }]);
    expect(out.map((c) => c.slotId)).toEqual(['recSlotAAAAAAAAAA', 'recSlotBBBBBBBBBB']);
  });
});

describe('validateChanges', () => {
  const ok = { date: '2026-11-04', slotId: 'recSlot123456789', skip: true };

  it('accepts a good batch', () => {
    expect(validateChanges([ok])).toBeNull();
  });

  it('refuses a month that is not optional — no skipping March', () => {
    expect(validateChanges([{ ...ok, date: '2026-03-04' }])).toMatch(/not in a year-end optional month/);
  });

  it('refuses junk', () => {
    expect(validateChanges([])).toBeTruthy();
    expect(validateChanges(null)).toBeTruthy();
    expect(validateChanges([{ ...ok, date: 'tomorrow' }])).toBeTruthy();
    expect(validateChanges([{ ...ok, skip: 'yes' as unknown as boolean }])).toBeTruthy();
  });
});

describe('optoutDatesByStudent — the dates the advance generator takes off the projection', () => {
  const rec = (student: string, date: string, status: string, notes: string) => ({ fields: { Student: [student], Date: date, Status: status, Notes: notes } });
  it('keeps only cancelled records carrying the opt-out marker, by student, without duplicates', () => {
    const m = optoutDatesByStudent([
      rec('recA', '2026-11-02', 'Cancelled', 'Holiday opt-out — November 2026 (auto-created)'),
      rec('recA', '2026-11-09', 'Cancelled - Prorated', 'Holiday opt-out — November 2026'),
      rec('recA', '2026-11-09', 'Cancelled', 'Holiday opt-out — November 2026'),
      rec('recA', '2026-11-16', 'Cancelled', 'sick'),
      rec('recA', '2026-11-23', 'Scheduled', 'Holiday opt-out — November 2026'),
      rec('recB', '2026-12-05', 'Cancelled', 'x | Holiday opt-out — December 2026'),
    ]);
    expect(m.get('recA')).toEqual(['2026-11-02', '2026-11-09']);
    expect(m.get('recB')).toEqual(['2026-12-05']);
    expect(m.has('recC')).toBe(false);
    expect(optoutDatesByStudent([]).size).toBe(0);
  });
});
