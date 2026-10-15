import { describe, expect, it } from 'vitest';
import { fullMessage, inSmallClassPeriod, makeupLimit, makeupLimitOnDate, septemberHolidayStart, smallClassPeriod, weeklyLimit } from './class-size-rules';

describe('the small-class period (September holidays → 7 October)', () => {
  it('starts the Saturday after Term 3 ends', () => {
    expect(septemberHolidayStart(2025)).toBe('2025-09-06');
    expect(septemberHolidayStart(2026)).toBe('2026-09-05');
    expect(septemberHolidayStart(2027)).toBe('2027-09-04');
    expect(smallClassPeriod(2026)).toEqual({ from: '2026-09-05', until: '2026-10-07' });
  });
  it('both ends count; the days around do not', () => {
    expect(inSmallClassPeriod('2026-09-04')).toBe(false);
    expect(inSmallClassPeriod('2026-09-05')).toBe(true);
    expect(inSmallClassPeriod('2026-10-07')).toBe(true);
    expect(inSmallClassPeriod('2026-10-08')).toBe(false);
    expect(inSmallClassPeriod('')).toBe(false);
    expect(inSmallClassPeriod(null)).toBe(false);
  });
});

describe('weekly limit (hard cap)', () => {
  it('is the stored Normal Capacity, else Sec 4 / JC 3', () => {
    expect(weeklyLimit(4, 'Secondary')).toBe(4);
    expect(weeklyLimit(null, 'Secondary')).toBe(4);
    expect(weeklyLimit(0, 'JC')).toBe(3);
    expect(weeklyLimit(null, 'Something')).toBeNull();
  });
});

describe('makeup limit (soft cap)', () => {
  const sec = { storedMakeup: 6, storedNormal: 4, level: 'Secondary', secCap: null };
  const jc = { storedMakeup: 4, storedNormal: 3, level: 'JC', secCap: null };
  it('outside the period: Sec 6, JC 4', () => {
    expect(makeupLimit({ ...sec, date: '2026-10-20' })).toEqual({ limit: 6, reason: 'normal' });
    expect(makeupLimit({ ...jc, date: '2026-10-20' })).toEqual({ limit: 4, reason: 'normal' });
  });
  it('inside the period: held to the hard cap, Sec 4, JC 3', () => {
    expect(makeupLimit({ ...sec, date: '2026-09-20' })).toEqual({ limit: 4, reason: 'small-class-period' });
    expect(makeupLimit({ ...jc, date: '2026-10-01' })).toEqual({ limit: 3, reason: 'small-class-period' });
  });
  it('the Sec cap toggle still lowers it outside the period', () => {
    expect(makeupLimit({ ...sec, secCap: 5, date: '2026-10-20' })).toEqual({ limit: 5, reason: 'sec-cap' });
  });
  it('a slot with no Makeup Capacity stays null', () => {
    expect(makeupLimit({ ...sec, storedMakeup: null, date: '2026-10-20' })).toBeNull();
  });
  it('the 409 words say why', () => {
    expect(fullMessage('makeup', 4, 'small-class-period')).toMatch(/exam period/);
    expect(fullMessage('weekly', 4)).toMatch(/weekly class/);
    expect(fullMessage('makeup', 5, 'sec-cap', 5)).toBe('Slot full (Sec cap 5 active)');
  });
});

describe('makeupLimitOnDate (the schedule page pickers)', () => {
  it('matches makeupLimit from the payload numbers', () => {
    expect(makeupLimitOnDate(6, 4, 'Secondary', '2026-10-20')).toBe(6);
    expect(makeupLimitOnDate(6, 4, 'Secondary', '2026-09-10')).toBe(4);
    expect(makeupLimitOnDate(5, 4, 'Secondary', '2026-10-20')).toBe(5);
    expect(makeupLimitOnDate(4, 3, 'JC', '2026-10-02')).toBe(3);
    expect(makeupLimitOnDate(null, 4, 'Secondary', '2026-10-20')).toBe(4);
  });
});
