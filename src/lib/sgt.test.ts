import { describe, it, expect } from 'vitest';
import {
  sgtDateISO, sgtTodayISO, sgtDaysAgoISO, addDaysISO,
  sgtDayStart, sgtDayStartISO, sgtClock, sgtMMDD, SGT_OFFSET_MS,
} from './sgt';

// 2026-09-01 23:30Z is 07:30 on Wednesday 2 Sep in Singapore — the window
// (16:00Z–24:00Z) where server-local date components are a day behind.
const LATE_UTC = Date.UTC(2026, 8, 1, 23, 30);
const LAST_MINUTE_SGT = Date.UTC(2026, 8, 1, 15, 59); // 23:59 SGT on 1 Sep
const MIDNIGHT_SGT = Date.UTC(2026, 8, 1, 16, 0);     // 00:00 SGT on 2 Sep

describe('sgtDateISO / sgtTodayISO', () => {
  it('rolls the date over at 16:00Z, not at midnight UTC', () => {
    expect(sgtDateISO(LATE_UTC)).toBe('2026-09-02');
    expect(sgtDateISO(LAST_MINUTE_SGT)).toBe('2026-09-01');
    expect(sgtDateISO(MIDNIGHT_SGT)).toBe('2026-09-02');
  });
  it('accepts a Date as well as epoch ms', () => {
    expect(sgtTodayISO(new Date(LATE_UTC))).toBe('2026-09-02');
    expect(sgtTodayISO(LATE_UTC)).toBe(sgtDateISO(LATE_UTC));
  });
  it('defaults to now', () => {
    expect(sgtTodayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('sgtDaysAgoISO', () => {
  it('counts Singapore calendar days, across month ends', () => {
    expect(sgtDaysAgoISO(1, LATE_UTC)).toBe('2026-09-01');
    expect(sgtDaysAgoISO(2, LATE_UTC)).toBe('2026-08-31');
    expect(sgtDaysAgoISO(0, LATE_UTC)).toBe('2026-09-02');
  });
  it('negative n looks ahead (tomorrow)', () => {
    expect(sgtDaysAgoISO(-1, LATE_UTC)).toBe('2026-09-03');
  });
});

describe('addDaysISO', () => {
  it('is pure calendar arithmetic (2026 is not a leap year)', () => {
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('sgtDayStart', () => {
  it('is 16:00Z the evening before', () => {
    expect(sgtDayStart('2026-09-02').toISOString()).toBe('2026-09-01T16:00:00.000Z');
    expect(sgtDayStartISO('2026-09-02')).toBe('2026-09-01T16:00:00.000Z');
  });
  it('takes an instant too, and picks that instant\'s Singapore day', () => {
    expect(sgtDayStart(LATE_UTC).toISOString()).toBe('2026-09-01T16:00:00.000Z');
    expect(sgtDayStart(LAST_MINUTE_SGT).toISOString()).toBe('2026-08-31T16:00:00.000Z');
    expect(sgtDayStartISO(new Date(MIDNIGHT_SGT))).toBe('2026-09-01T16:00:00.000Z');
  });
  it('sits exactly SGT_OFFSET_MS before the UTC midnight of the same label', () => {
    expect(Date.parse('2026-09-02T00:00:00Z') - sgtDayStart('2026-09-02').getTime()).toBe(SGT_OFFSET_MS);
  });
  it('defaults to the start of today in Singapore', () => {
    const start = sgtDayStart();
    expect(start.getTime()).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - start.getTime()).toBeLessThan(86_400_000);
    expect(sgtDateISO(start)).toBe(sgtTodayISO());
  });
});

describe('sgtClock', () => {
  it('reads Singapore wall-clock components', () => {
    expect(sgtClock(LATE_UTC)).toEqual({
      dateISO: '2026-09-02', year: 2026, month: 9, day: 2,
      weekday: 3, hour: 7, minute: 30, minutesOfDay: 450,
    });
  });
  it('weekday flips with the SGT date, not the UTC one', () => {
    expect(sgtClock(LAST_MINUTE_SGT).weekday).toBe(2); // Tue 1 Sep
    expect(sgtClock(MIDNIGHT_SGT).weekday).toBe(3);    // Wed 2 Sep
  });
});

describe('sgtMMDD', () => {
  it('crosses the year boundary in Singapore time', () => {
    expect(sgtMMDD(Date.UTC(2026, 11, 31, 16, 0))).toBe('01-01');
    expect(sgtMMDD(Date.UTC(2026, 11, 31, 15, 59))).toBe('12-31');
  });
});
