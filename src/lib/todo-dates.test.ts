import { describe, it, expect } from 'vitest';
import { classifyDue, daysBetweenISO, dueLabel } from './todo-dates';

const TODAY = '2026-07-24'; // a Friday

describe('daysBetweenISO', () => {
  it('counts forward days', () => {
    expect(daysBetweenISO('2026-07-24', '2026-07-25')).toBe(1);
    expect(daysBetweenISO('2026-07-24', '2026-08-01')).toBe(8); // month boundary
  });
  it('is negative going backwards', () => {
    expect(daysBetweenISO('2026-07-24', '2026-07-21')).toBe(-3);
  });
  it('crosses year boundaries', () => {
    expect(daysBetweenISO('2026-12-30', '2027-01-02')).toBe(3);
  });
});

describe('classifyDue', () => {
  it('handles missing due date', () => {
    expect(classifyDue(null, TODAY)).toBe('none');
    expect(classifyDue(undefined, TODAY)).toBe('none');
    expect(classifyDue('', TODAY)).toBe('none');
  });
  it('classifies past dates as overdue', () => {
    expect(classifyDue('2026-07-23', TODAY)).toBe('overdue');
    expect(classifyDue('2026-01-01', TODAY)).toBe('overdue');
  });
  it('classifies today and tomorrow', () => {
    expect(classifyDue('2026-07-24', TODAY)).toBe('today');
    expect(classifyDue('2026-07-25', TODAY)).toBe('tomorrow');
  });
  it('classifies later dates as upcoming', () => {
    expect(classifyDue('2026-07-26', TODAY)).toBe('upcoming');
    expect(classifyDue('2027-01-01', TODAY)).toBe('upcoming');
  });
  it('handles tomorrow across a month boundary', () => {
    expect(classifyDue('2026-08-01', '2026-07-31')).toBe('tomorrow');
  });
});

describe('dueLabel', () => {
  it('labels overdue dates', () => {
    expect(dueLabel('2026-07-23', TODAY)).toBe('Yesterday');
    expect(dueLabel('2026-07-20', TODAY)).toBe('4d overdue');
  });
  it('labels today and tomorrow', () => {
    expect(dueLabel('2026-07-24', TODAY)).toBe('Today');
    expect(dueLabel('2026-07-25', TODAY)).toBe('Tomorrow');
  });
  it('labels dates within a week by weekday', () => {
    expect(dueLabel('2026-07-27', TODAY)).toBe('Mon');
    expect(dueLabel('2026-07-30', TODAY)).toBe('Thu');
  });
  it('labels further dates as day + month', () => {
    expect(dueLabel('2026-08-15', TODAY)).toBe('15 Aug');
  });
  it('includes year when it differs', () => {
    expect(dueLabel('2027-01-03', TODAY)).toBe('3 Jan 2027');
  });
});
