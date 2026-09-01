import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { weekdayLessonDates, firstInvoiceLessonDates, invoiceMonthLessonDates, lastDayOfMonthISO, firstOfNextMonthISO, nextDayISO } from './billing-math';
import { NO_LESSON_DATES } from './holidays';

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

// REGRESSION — reschedule capacity gate: {Date}='2026-07-28' equality matched
// zero Lessons records in Airtable while the half-open range found 8, so
// countLessonsInSlot returned 0 for every date and the 409 "slot full" check
// never fired. All single-day filters must use AND({Date}>='d',{Date}<nextDay).
describe('nextDayISO (exclusive upper bound for Airtable single-day filters)', () => {
  it('increments a normal day', () => {
    expect(nextDayISO('2026-07-28')).toBe('2026-07-29');
  });
  it('rolls over month end', () => {
    expect(nextDayISO('2026-07-31')).toBe('2026-08-01');
  });
  it('rolls over year end', () => {
    expect(nextDayISO('2026-12-31')).toBe('2027-01-01');
  });
  it('handles leap-day boundaries', () => {
    expect(nextDayISO('2028-02-28')).toBe('2028-02-29');
    expect(nextDayISO('2028-02-29')).toBe('2028-03-01');
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

describe('invoiceMonthLessonDates (generate-invoices regular lessons)', () => {
  it('counts a 5-occurrence month whose LAST day is the lesson weekday', () => {
    // July 2026 has five Fridays and ends on one — both the 5-occurrence case
    // and the Kieran Lai month-end case in a single month.
    expect(invoiceMonthLessonDates('2026-07-01', FRI, null, NO_LESSON_DATES)).toEqual([
      '2026-07-03', '2026-07-10', '2026-07-17', '2026-07-24', '2026-07-31',
    ]);
  });

  it('drops CNY dates (Feb 2026: Tue 17th and Wed 18th)', () => {
    const WED = 3;
    expect(invoiceMonthLessonDates('2026-02-01', TUE, null, NO_LESSON_DATES)).toEqual([
      '2026-02-03', '2026-02-10', '2026-02-24',
    ]);
    expect(invoiceMonthLessonDates('2026-02-01', WED, null, NO_LESSON_DATES)).toEqual([
      '2026-02-04', '2026-02-11', '2026-02-25',
    ]);
  });

  it('drops Christmas (Fri 25 Dec 2026)', () => {
    expect(invoiceMonthLessonDates('2026-12-01', FRI, null, NO_LESSON_DATES)).toEqual([
      '2026-12-04', '2026-12-11', '2026-12-18',
    ]);
  });

  it('clamps to the enrollment end date, INCLUSIVE of a lesson on it', () => {
    expect(invoiceMonthLessonDates('2026-07-01', FRI, '2026-07-17')).toEqual([
      '2026-07-03', '2026-07-10', '2026-07-17',
    ]);
    expect(invoiceMonthLessonDates('2026-07-01', FRI, '2026-06-30')).toEqual([]);
    expect(invoiceMonthLessonDates('2026-07-01', FRI, '2027-01-01')).toHaveLength(5);
  });

  it('fails closed on malformed input', () => {
    expect(invoiceMonthLessonDates('garbage', FRI)).toEqual([]);
    // Malformed end date → no lessons (the retired loop's Invalid-Date
    // comparison behaved the same way; never bill past an unknown end).
    expect(invoiceMonthLessonDates('2026-07-01', FRI, 'not-a-date')).toEqual([]);
    expect(invoiceMonthLessonDates('2026-07-01', 7)).toEqual([]);
    expect(invoiceMonthLessonDates('2026-07-01', -1)).toEqual([]);
  });

  it('is timezone-independent (string math, no local Date reads)', () => {
    const origTZ = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Singapore';
      const sgt = invoiceMonthLessonDates('2026-07-01', FRI, '2026-07-24', NO_LESSON_DATES);
      process.env.TZ = 'UTC';
      const utc = invoiceMonthLessonDates('2026-07-01', FRI, '2026-07-24', NO_LESSON_DATES);
      expect(sgt).toEqual(utc);
      expect(sgt[0]).toBe('2026-07-03');
    } finally {
      if (origTZ === undefined) delete process.env.TZ; else process.env.TZ = origTZ;
    }
  });
});

// ── PARITY PIN — retired generate-invoices loop vs invoiceMonthLessonDates ──
// The route's countOccurrencesInMonth built local-midnight Dates and formatted
// them with toISOString(), so its output was only correct while the process
// timezone was UTC (true on Vercel, where every production run happened; in
// SGT the same code emits every date one day early). These tests pin the
// replacement to the retired loop's PRODUCTION behavior: the loop below is a
// verbatim copy (excluded list parameterized instead of closing over
// NO_LESSON_DATES), run with TZ forced to UTC.
describe('invoiceMonthLessonDates — parity with the retired countOccurrencesInMonth', () => {
  const origTZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'UTC'; });
  afterAll(() => {
    if (origTZ === undefined) delete process.env.TZ; else process.env.TZ = origTZ;
  });

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Verbatim from src/app/api/generate-invoices/route.ts as of 2026-09-02.
  function oracleCountOccurrencesInMonth(
    dayName: string,
    invoiceMonth: { firstDay: Date; lastDay: Date },
    endDate: Date | null = null,
    noLessonDates: readonly string[] = NO_LESSON_DATES,
  ) {
    const dayIndices: Record<string, number> = {
      Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
      Thursday: 4, Friday: 5, Saturday: 6,
    };
    const targetDay = dayIndices[dayName];
    if (targetDay === undefined) return [];

    const dates: { date: string; day: string; type: string }[] = [];
    const current = new Date(invoiceMonth.firstDay);
    while (current.getDay() !== targetDay) current.setDate(current.getDate() + 1);
    while (current <= invoiceMonth.lastDay && (!endDate || current <= endDate)) {
      const iso = current.toISOString().split('T')[0];
      if (!noLessonDates.includes(iso)) {
        dates.push({ date: iso, day: dayName, type: 'Regular' });
      }
      current.setDate(current.getDate() + 7);
    }
    return dates;
  }

  // InvoiceMonth Dates exactly as the route constructed them.
  function oracleMonth(year: number, month1to12: number) {
    return {
      firstDay: new Date(year, month1to12 - 1, 1),
      lastDay: new Date(year, month1to12, 0),
    };
  }

  it('TZ pin took effect (the oracle is only meaningful under UTC)', () => {
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(0);
  });

  it('matches on every weekday × month of 2026 + Feb 2027/2028, with and without holidays and end dates', () => {
    const months: [number, number][] = [
      ...Array.from({ length: 12 }, (_, i) => [2026, i + 1] as [number, number]),
      [2027, 2], [2028, 2], // Feb across a non-leap and a leap year
    ];
    const exclusionLists: readonly string[][] = [
      [...NO_LESSON_DATES],
      [], // no holidays at all
    ];
    let compared = 0;
    for (const [year, month] of months) {
      const mm = String(month).padStart(2, '0');
      const monthFirstISO = `${year}-${mm}-01`;
      const endCases: (string | null)[] = [
        null,
        `${year}-${mm}-17`,             // mid-month
        lastDayOfMonthISO(monthFirstISO), // exactly month end
        '2000-01-01',                    // before every month
        '2099-12-31',                    // after every month
      ];
      for (const dayName of DAY_NAMES) {
        const weekday = DAY_NAMES.indexOf(dayName);
        for (const excluded of exclusionLists) {
          for (const endISO of endCases) {
            const oracle = oracleCountOccurrencesInMonth(
              dayName,
              oracleMonth(year, month),
              endISO ? new Date(endISO + 'T00:00:00') : null,
              excluded,
            ).map((li) => li.date);
            const actual = invoiceMonthLessonDates(monthFirstISO, weekday, endISO, excluded);
            expect(actual, `${monthFirstISO} ${dayName} end=${endISO} excl=${excluded.length}`).toEqual(oracle);
            compared++;
          }
        }
      }
    }
    expect(compared).toBe(14 * 7 * 2 * 5);
  });

  it('matches on the named money cases', () => {
    // 5-Friday July 2026 ending on a Friday (the Kieran Lai shape).
    expect(invoiceMonthLessonDates('2026-07-01', FRI, null, NO_LESSON_DATES)).toEqual(
      oracleCountOccurrencesInMonth('Friday', oracleMonth(2026, 7)).map((li) => li.date),
    );
    // CNY month, both affected weekdays.
    for (const dayName of ['Tuesday', 'Wednesday']) {
      expect(invoiceMonthLessonDates('2026-02-01', DAY_NAMES.indexOf(dayName), null, NO_LESSON_DATES)).toEqual(
        oracleCountOccurrencesInMonth(dayName, oracleMonth(2026, 2)).map((li) => li.date),
      );
    }
    // Christmas Friday.
    expect(invoiceMonthLessonDates('2026-12-01', FRI, null, NO_LESSON_DATES)).toEqual(
      oracleCountOccurrencesInMonth('Friday', oracleMonth(2026, 12)).map((li) => li.date),
    );
    // Enrollment ending ON a lesson date stays inclusive in both.
    expect(invoiceMonthLessonDates('2026-07-01', FRI, '2026-07-17', NO_LESSON_DATES)).toEqual(
      oracleCountOccurrencesInMonth('Friday', oracleMonth(2026, 7), new Date('2026-07-17T00:00:00')).map((li) => li.date),
    );
    // Unknown day name → [] in both.
    expect(invoiceMonthLessonDates('2026-07-01', -1)).toEqual(
      oracleCountOccurrencesInMonth('Freitag', oracleMonth(2026, 7)).map((li) => li.date),
    );
  });
});
