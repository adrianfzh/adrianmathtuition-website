import { describe, expect, it } from 'vitest';
import { canMoveInPlace, moveHistoryNote, shortDayDate } from './move-in-place';

describe('canMoveInPlace', () => {
  it('only a still-booked moved-in lesson', () => {
    expect(canMoveInPlace({ type: 'Rescheduled', status: 'Scheduled' })).toBe(true);
    expect(canMoveInPlace({ type: 'Makeup', status: 'Scheduled' })).toBe(true);
    expect(canMoveInPlace({ type: 'Regular', status: 'Scheduled' })).toBe(false);
    expect(canMoveInPlace({ type: 'Additional', status: 'Scheduled' })).toBe(false);
    expect(canMoveInPlace({ type: 'Revision Makeup', status: 'Scheduled' })).toBe(false);
    expect(canMoveInPlace({ type: 'Rescheduled', status: 'Completed' })).toBe(false);
    expect(canMoveInPlace({ type: 'Rescheduled', status: 'Rescheduled' })).toBe(false);
  });
});

describe('the history note', () => {
  it('formats a calendar date', () => {
    expect(shortDayDate('2026-10-18')).toBe('Sun 18 Oct');
  });
  it('keeps the old note and adds one line', () => {
    expect(moveHistoryNote('Rescheduled from Sat, 10 Oct 2026', { date: '2026-10-18', time: '11am-1pm' }, { date: '2026-10-20', time: '5-7pm' }))
      .toBe('Rescheduled from Sat, 10 Oct 2026 | was Sun 18 Oct 11am-1pm, moved to Tue 20 Oct 5-7pm');
    expect(moveHistoryNote('', { date: '2026-10-18', time: '' }, { date: '2026-10-20', time: '5-7pm' }))
      .toBe('was Sun 18 Oct, moved to Tue 20 Oct 5-7pm');
  });
});
