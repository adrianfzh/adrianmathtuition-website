import { describe, it, expect } from 'vitest';
import { monthLabelFor, monthFloorISO, skipRowsFrom, groupByStudent, sortLabels, rateFor } from './optout-rollup';

describe('monthLabelFor', () => {
  it('names the month a date sits in', () => {
    expect(monthLabelFor('2026-11-08')).toBe('November 2026');
    expect(monthLabelFor('2027-01-03')).toBe('January 2027');
  });
  it('refuses junk rather than guessing', () => {
    expect(monthLabelFor('')).toBe('');
    expect(monthLabelFor('not a date')).toBe('');
    expect(monthLabelFor('2026-13-01')).toBe('');
  });
});

describe('monthFloorISO', () => {
  // The month being billed right now still counts — a roll-up on 1 November
  // that started at 1 December would show nothing about November.
  it('is the 1st of the current Singapore month', () => {
    expect(monthFloorISO(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01'); // 1 Nov SGT
    expect(monthFloorISO(new Date('2026-11-20T09:00:00Z'))).toBe('2026-11-01');
  });
});

describe('skipRowsFrom', () => {
  const rec = (fields: Record<string, unknown>) => ({ fields });

  it('keeps only rows the opt-out wrote', () => {
    const rows = skipRowsFrom([
      rec({ Notes: 'Holiday opt-out — December 2026 (auto-created)', Student: ['recA'], Slot: ['slot1'], Date: '2026-12-05' }),
      rec({ Notes: 'Away for a wedding', Student: ['recA'], Slot: ['slot1'], Date: '2026-12-12' }),
      rec({ Student: ['recA'], Slot: ['slot1'], Date: '2026-12-19' }),
    ]);
    expect(rows).toEqual([{ studentId: 'recA', slotId: 'slot1', date: '2026-12-05', label: 'December 2026' }]);
  });

  it('drops a row with no student or no readable date', () => {
    const rows = skipRowsFrom([
      rec({ Notes: 'Holiday opt-out — December 2026', Slot: ['slot1'], Date: '2026-12-05' }),
      rec({ Notes: 'Holiday opt-out — December 2026', Student: ['recA'], Date: '' }),
    ]);
    expect(rows).toEqual([]);
  });

  it('survives a lesson with no slot link', () => {
    const rows = skipRowsFrom([rec({ Notes: 'Holiday opt-out — November 2026', Student: ['recA'], Date: '2026-11-08' })]);
    expect(rows[0].slotId).toBe('');
  });
});

describe('groupByStudent', () => {
  it('counts lessons per student per month, in calendar order', () => {
    const grouped = groupByStudent([
      { studentId: 'recB', slotId: 's1', date: '2026-12-06', label: 'December 2026' },
      { studentId: 'recB', slotId: 's1', date: '2026-11-08', label: 'November 2026' },
      { studentId: 'recB', slotId: 's1', date: '2026-11-15', label: 'November 2026' },
      { studentId: 'recJ', slotId: 's2', date: '2026-12-02', label: 'December 2026' },
    ]);
    expect(grouped.get('recB')!.map((m) => [m.label, m.lessons])).toEqual([
      ['November 2026', 2], ['December 2026', 1],
    ]);
    expect(grouped.get('recJ')!.map((m) => [m.label, m.lessons])).toEqual([['December 2026', 1]]);
  });
});

describe('sortLabels', () => {
  it('puts January of the next year after December', () => {
    expect(sortLabels(['January 2027', 'December 2026', 'November 2026']))
      .toEqual(['November 2026', 'December 2026', 'January 2027']);
  });
});

describe('rateFor', () => {
  const rates = new Map([['s1', 70], ['s2', 90]]);
  it('uses the rate when every skipped lesson shares one', () => {
    expect(rateFor([{ slotIds: ['s1', 's1'] }, { slotIds: ['s1'] }], rates)).toBe(70);
  });
  // Averaging two slots would produce a figure Adrian might quote to a parent.
  it('refuses a figure when the slots disagree', () => {
    expect(rateFor([{ slotIds: ['s1', 's2'] }], rates)).toBeNull();
  });
  it('refuses when any slot has no readable rate', () => {
    expect(rateFor([{ slotIds: ['s1', 'unknown'] }], rates)).toBeNull();
    expect(rateFor([{ slotIds: [''] }], rates)).toBeNull();
  });
});
