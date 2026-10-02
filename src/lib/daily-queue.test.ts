import { describe, it, expect } from 'vitest';
import { placeInQueue, countByDay, usedByDay, dayWord, queuedLabel, QUEUE_HORIZON_DAYS } from './daily-queue';

const today = '2026-09-24'; // a Thursday

describe('placeInQueue', () => {
  it('lands today when today has room', () => {
    expect(placeInQueue({ allowance: 1, today, usedByDay: {} })).toEqual({ ok: true, day: today, waits: false });
  });
  it('lands on the first day with room', () => {
    const r = placeInQueue({ allowance: 1, today, usedByDay: { [today]: 1 } });
    expect(r).toEqual({ ok: true, day: '2026-09-25', waits: true });
  });
  it('a two-a-day allowance takes the second slot today', () => {
    expect(placeInQueue({ allowance: 2, today, usedByDay: { [today]: 1 } })).toEqual({ ok: true, day: today, waits: false });
    expect(placeInQueue({ allowance: 2, today, usedByDay: { [today]: 2 } })).toEqual({ ok: true, day: '2026-09-25', waits: true });
  });
  it('queued items take the next day first; the horizon is today + 3', () => {
    const used = { [today]: 1, '2026-09-25': 1, '2026-09-26': 1 };
    expect(placeInQueue({ allowance: 1, today, usedByDay: used })).toEqual({ ok: true, day: '2026-09-27', waits: true });
    const full = { ...used, '2026-09-27': 1 };
    const r = placeInQueue({ allowance: 1, today, usedByDay: full, noun: 'sheet' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/next 3 days are full — remove a queued sheet/);
    expect(QUEUE_HORIZON_DAYS).toBe(3);
  });
  it('refuses a zero allowance', () => {
    expect(placeInQueue({ allowance: 0, today, usedByDay: {} }).ok).toBe(false);
  });
});

describe('the counts', () => {
  it('countByDay skips blanks', () => {
    expect(countByDay(['2026-09-24', null, '2026-09-24', undefined, '2026-09-25'])).toEqual({ '2026-09-24': 2, '2026-09-25': 1 });
  });
  it('usedByDay files a queued item on its day, a direct one on the day it was made', () => {
    expect(usedByDay([
      { createdDay: '2026-09-24', queuedFor: null },
      { createdDay: '2026-09-24', queuedFor: '2026-09-26' },
    ])).toEqual({ '2026-09-24': 1, '2026-09-26': 1 });
  });
});

describe('dayWord / queuedLabel', () => {
  it('today, tomorrow, a weekday, then a date', () => {
    expect(dayWord(today, today)).toBe('today');
    expect(dayWord('2026-09-25', today)).toBe('tomorrow');
    expect(dayWord('2026-09-26', today)).toBe('Saturday');
    expect(dayWord('2026-09-27', today)).toBe('Sunday');
    expect(dayWord('2026-10-03', today)).toBe('3 Oct');
    expect(queuedLabel('2026-09-26', today)).toBe('Queued · Saturday');
    expect(queuedLabel('2026-09-25', today)).toBe('Queued · Tomorrow');
  });
});
