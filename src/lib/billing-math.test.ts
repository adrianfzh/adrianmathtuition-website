import { describe, it, expect } from 'vitest';
import { weekdayLessonDates, firstInvoiceLessonDates, lastDayOfMonthISO, firstOfNextMonthISO } from './billing-math';

const FRI = 5, SUN = 0, TUE = 2;

describe('lastDayOfMonthISO / firstOfNextMonthISO', () => {
  it('handles normal months', () => {
    expect(lastDayOfMonthISO('2026-07-17')).toBe('2026-07-31');
    expect(firstOfNextMonthISO('2026-07-17')).toBe('2026-08-01');
  });
  it('handles December → January rollover', () => {
    expect(lastDayOfMonthISO('2026-12-05')).toBe('2026-12-31');
    expect(firstOfNextMonthISO('2026-12-05')).toBe('2027-01-01');
  });
  it('handles February incl. leap years', () => {
    expect(lastDayOfMonthISO('2026-02-10')).toBe('2026-02-28');
    expect(lastDayOfMonthISO('2028-02-10')).toBe('2028-02-29');
  });
});

describe('weekdayLessonDates', () => {
  // REGRESSION — Kieran Lai, Jul 2026: the bot's registration invoice dropped
  // 31 Jul (a Friday on the month's last day) and billed 2 lessons instead of 3.
  it('includes a lesson falling ON the last day of the period (Kieran Lai bug)', () => {
    expect(weekdayLessonDates('2026-07-17', '2026-07-31', FRI)).toEqual([
      '2026-07-17', '2026-07-24', '2026-07-31',
    ]);
  });

  it('counts full months correctly', () => {
    expect(weekdayLessonDates('2026-07-01', '2026-07-31', FRI)).toEqual([
      '2026-07-03', '2026-07-10', '2026-07-17', '2026-07-24', '2026-07-31',
    ]);
    expect(weekdayLessonDates('2026-08-01', '2026-08-31', FRI)).toEqual([
      '2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28',
    ]);
  });

  it('starts from the start date itself when it matches the weekday', () => {
    // 2026-07-17 IS a Friday — it must be the first lesson, not skipped.
    expect(weekdayLessonDates('2026-07-17', '2026-07-31', FRI)[0]).toBe('2026-07-17');
  });

  it('excludes holiday dates', () => {
    expect(weekdayLessonDates('2026-07-01', '2026-07-31', FRI, ['2026-07-24'])).toEqual([
      '2026-07-03', '2026-07-10', '2026-07-17', '2026-07-31',
    ]);
  });

  it('spans month boundaries when the range does', () => {
    expect(weekdayLessonDates('2026-07-26', '2026-08-09', SUN)).toEqual([
      '2026-07-26', '2026-08-02', '2026-08-09',
    ]);
  });

  it('handles leap-day lessons', () => {
    // 2028-02-29 is a Tuesday.
    expect(weekdayLessonDates('2028-02-01', '2028-02-29', TUE)).toContain('2028-02-29');
  });

  it('returns [] for an empty/invalid range', () => {
    expect(weekdayLessonDates('2026-08-01', '2026-07-01', FRI)).toEqual([]);
    expect(weekdayLessonDates('garbage', '2026-07-31', FRI)).toEqual([]);
  });
});

describe('firstInvoiceLessonDates (signup combined invoice)', () => {
  // REGRESSION — Kieran Lai's actual combined first invoice: signed up 16 Jul
  // (after the Aug batch ran), start 17 Jul, Friday slot → 3 July + 4 August
  // lessons = 7 × $80 = $560.
  it('reproduces Kieran Lai: 3 July + 4 August Fridays', () => {
    const { startMonth, nextMonth } = firstInvoiceLessonDates('2026-07-17', FRI, true);
    expect(startMonth).toEqual(['2026-07-17', '2026-07-24', '2026-07-31']);
    expect(nextMonth).toEqual(['2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28']);
    expect((startMonth.length + nextMonth.length) * 80).toBe(560);
  });

  it('start-month only when the batch has not run yet', () => {
    const { startMonth, nextMonth } = firstInvoiceLessonDates('2026-07-03', FRI, false);
    expect(startMonth).toHaveLength(5);
    expect(nextMonth).toEqual([]);
  });
});
