import { describe, it, expect } from 'vitest';
import {
  additionalLessonLines,
  attendedLessonLines,
  descriptionBase,
  projectedLessonLines,
  sumLineRates,
  type SlotLine,
} from './arrears-lines';
import type { ArrearsLessonRecord } from './year-end-billing';

const tue: SlotLine = { slotId: 'slotTue', dayLabel: 'Tue 4pm', weekday: 2, rate: 90, endISO: null };
const sat: SlotLine = { slotId: 'slotSat', dayLabel: 'Sat 10am', weekday: 6, rate: 100, endISO: null };
const ctx = { level: 'Sec 3', subjects: ['A Math', 'E Math'], invoicedMonths: new Set(['September 2026']) };
const rec = (id: string, over: Partial<ArrearsLessonRecord>): ArrearsLessonRecord => ({
  id, date: '2026-10-06', studentId: 'recA', type: 'Regular', billingMonth: 'October 2026', isMakeup: false, slotId: 'slotTue', ...over,
});

describe('descriptionBase', () => {
  it('joins level and subjects the way the advance generator does', () => {
    expect(descriptionBase('Sec 3', ['A Math', 'E Math'])).toBe('Sec 3 A Math & E Math');
    expect(descriptionBase('JC1', null)).toBe('JC1');
    expect(descriptionBase(null, ['H2 Math'])).toBe('H2 Math');
  });
});

describe('attendedLessonLines', () => {
  it('one line per attended lesson, labelled with its own slot and charged at that slot rate', () => {
    const pool = [rec('a', {}), rec('b', { date: '2026-10-10', slotId: 'slotSat' }), rec('c', { date: '2026-10-13', type: 'Rescheduled', slotId: 'slotTue' })];
    const lines = attendedLessonLines(pool, 'recA', ctx, { descriptionBase: 'Sec 3 A Math & E Math', billLabel: 'October 2026', slots: [tue, sat], defaultRate: 80 });
    expect(lines).toEqual([
      { date: '2026-10-06', day: 'Tue 4pm', type: 'Regular', description: 'Sec 3 A Math & E Math — October 2026', rate: 90 },
      { date: '2026-10-10', day: 'Sat 10am', type: 'Regular', description: 'Sec 3 A Math & E Math — October 2026', rate: 100 },
      { date: '2026-10-13', day: 'Tue 4pm', type: 'Regular', description: 'Sec 3 A Math & E Math — October 2026', rate: 90 },
    ]);
  });
  it('a lesson whose slot is unknown falls to the first slot; no slots at all → blank day, default rate', () => {
    const pool = [rec('a', { slotId: null })];
    expect(attendedLessonLines(pool, 'recA', ctx, { descriptionBase: 'Sec 3', billLabel: 'October 2026', slots: [sat], defaultRate: 80 })[0])
      .toMatchObject({ day: 'Sat 10am', rate: 100 });
    expect(attendedLessonLines(pool, 'recA', ctx, { descriptionBase: 'Sec 3', billLabel: 'October 2026', slots: [], defaultRate: 80 })[0])
      .toMatchObject({ day: '', rate: 80 });
  });
  it('a slot with a zero rate falls to the default rate', () => {
    const zero: SlotLine = { ...tue, rate: 0 };
    expect(attendedLessonLines([rec('a', {})], 'recA', ctx, { descriptionBase: 'Sec 3', billLabel: 'October 2026', slots: [zero], defaultRate: 85 })[0].rate).toBe(85);
  });
  it('applies the paid-in-advance exclusion (a September lesson moved into October is not re-billed)', () => {
    const pool = [rec('moved', { type: 'Rescheduled', billingMonth: 'September 2026' }), rec('own', { date: '2026-10-20' })];
    const lines = attendedLessonLines(pool, 'recA', ctx, { descriptionBase: 'Sec 3', billLabel: 'October 2026', slots: [tue], defaultRate: 90 });
    expect(lines.map((l) => l.date)).toEqual(['2026-10-20']);
  });
});

describe('projectedLessonLines (the January half of the combined invoice)', () => {
  it('walks every slot through the month, clamps to End Date, skips holidays, sorted by date', () => {
    const lines = projectedLessonLines('2027-01-01', {
      descriptionBase: 'Sec 3 A Math & E Math', label: 'January 2027',
      slots: [tue, { ...sat, endISO: '2027-01-16' }], defaultRate: 80, excluded: ['2027-01-12'],
    });
    expect(lines.map((l) => `${l.date} ${l.day}`)).toEqual([
      '2027-01-02 Sat 10am', '2027-01-05 Tue 4pm', '2027-01-09 Sat 10am',
      '2027-01-16 Sat 10am', '2027-01-19 Tue 4pm', '2027-01-26 Tue 4pm',
    ]);
    expect(lines[0]).toMatchObject({ description: 'Sec 3 A Math & E Math — January 2027', type: 'Regular', rate: 100 });
  });
  it('a slot with no weekday projects nothing', () => {
    expect(projectedLessonLines('2027-01-01', { descriptionBase: 'x', label: 'January 2027', slots: [{ ...tue, weekday: undefined }], defaultRate: 80, excluded: [] })).toEqual([]);
  });
});

describe('additionalLessonLines', () => {
  it('labels each swept extra with its OWN month, sorted by date, at the given rate', () => {
    const lines = additionalLessonLines([
      { id: 'b', date: '2026-10-27', studentId: 'recA', isRevisionMakeup: false, notes: '', billed: false },
      { id: 'a', date: '2026-09-20', studentId: 'recA', isRevisionMakeup: false, notes: '', billed: false },
    ], 90);
    expect(lines).toEqual([
      { date: '2026-09-20', day: '', type: 'Additional', description: 'Additional Lesson — September 2026', rate: 90 },
      { date: '2026-10-27', day: '', type: 'Additional', description: 'Additional Lesson — October 2026', rate: 90 },
    ]);
  });
});

describe('sumLineRates', () => {
  it('sums per-line rates, default for lines without one', () => {
    expect(sumLineRates([{ date: '', day: '', type: 'Regular', description: '', rate: 90 }, { date: '', day: '', type: 'Regular', description: '' }], 80)).toBe(170);
    expect(sumLineRates([], 80)).toBe(0);
  });
});
