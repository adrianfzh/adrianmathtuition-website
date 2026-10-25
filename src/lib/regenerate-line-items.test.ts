import { describe, it, expect } from 'vitest';
import { rebuildLineItems, type StoredLineItem, type MonthLesson } from './regenerate-line-items';

const DESC = 'Sec 4 A Math — October 2026';

function regular(date: string, status = 'Scheduled'): MonthLesson {
  return { date, type: 'Regular', status };
}

describe('rebuildLineItems — Regular lines', () => {
  it('normal month: rebuilds Regular lines from every non-cancelled lesson, Scheduled included (pre-month projection)', () => {
    const r = rebuildLineItems({
      stored: [],
      monthLessons: [regular('2026-02-03'), regular('2026-02-10', 'Completed'), regular('2026-02-17')],
      prorated: false,
      slotDayLabel: 'Tue',
      regularDescription: DESC,
    });
    expect(r.regularCount).toBe(3);
    expect(r.additionalCount).toBe(0);
    expect(r.lineItems.map(l => l.date)).toEqual(['2026-02-03', '2026-02-10', '2026-02-17']);
    expect(r.lineItems[0]).toEqual({ date: '2026-02-03', day: 'Tue', type: 'Regular', description: DESC });
  });

  it('prorated (arrears) month: bills Completed lessons only — unmarked Scheduled lessons are left out', () => {
    const r = rebuildLineItems({
      stored: [],
      monthLessons: [
        regular('2026-10-06', 'Completed'),
        regular('2026-10-13', 'Scheduled'),
        regular('2026-10-20', 'Completed'),
        regular('2026-10-27', 'Scheduled'),
      ],
      prorated: true,
      slotDayLabel: 'Tue',
      regularDescription: DESC,
    });
    expect(r.regularCount).toBe(2);
    expect(r.lineItems.map(l => l.date)).toEqual(['2026-10-06', '2026-10-20']);
  });

  it('a lesson with no Type is Regular; Trial lessons count as regular lines (unchanged behaviour)', () => {
    const r = rebuildLineItems({
      stored: [],
      monthLessons: [{ date: '2026-02-03', status: 'Scheduled' }, { date: '2026-02-05', type: 'Trial', status: 'Completed' }],
      prorated: false,
      slotDayLabel: 'Tue',
      regularDescription: DESC,
    });
    expect(r.regularCount).toBe(2);
    expect(r.lineItems.map(l => l.type)).toEqual(['Regular', 'Trial']);
  });
});

describe('rebuildLineItems — Additional lines (regression: Regenerate dropped billed additionals + re-billed in-window ones, 2026-09-02)', () => {
  const billedOutOfWindow: StoredLineItem = {
    date: '2026-09-20', day: 'Sun', type: 'Additional', description: 'Additional Lesson — October 2026',
  };

  it('keeps the Additional lines the generator billed even though their dates fall outside the invoice month', () => {
    const r = rebuildLineItems({
      stored: [
        { date: '2026-10-06', day: 'Tue', type: 'Regular', description: DESC },
        billedOutOfWindow,
      ],
      monthLessons: [regular('2026-10-06', 'Completed'), regular('2026-10-13', 'Completed')],
      prorated: true,
      slotDayLabel: 'Tue',
      regularDescription: DESC,
    });
    expect(r.additionalCount).toBe(1);
    expect(r.regularCount).toBe(2);
    expect(r.lineItems).toContainEqual(billedOutOfWindow);
  });

  it('does NOT add an in-window Additional lesson it finds in the schedule — the generator bills those (Billed-guarded), Regenerate never ticks Billed', () => {
    const r = rebuildLineItems({
      stored: [],
      monthLessons: [regular('2026-02-03'), { date: '2026-02-08', type: 'Additional', status: 'Completed' }],
      prorated: false,
      slotDayLabel: 'Tue',
      regularDescription: DESC,
    });
    expect(r.additionalCount).toBe(0);
    expect(r.regularCount).toBe(1);
    expect(r.lineItems.map(l => l.date)).toEqual(['2026-02-03']);
  });

  it('stored Regular lines are discarded (rebuilt from the schedule), stored Additional lines survive verbatim', () => {
    const r = rebuildLineItems({
      stored: [
        { date: '2026-02-03', day: 'Tue', type: 'Regular', description: 'stale' },
        { date: '2026-01-25', day: 'Sun', type: 'Additional', description: 'Additional Lesson — February 2026', note: 'kept' },
      ],
      monthLessons: [regular('2026-02-10')],
      prorated: false,
      slotDayLabel: 'Tue',
      regularDescription: DESC,
    });
    expect(r.lineItems.map(l => l.date)).toEqual(['2026-01-25', '2026-02-10']);
    expect(r.lineItems[0].note).toBe('kept');
    expect(r.lineItems[1].description).toBe(DESC);
  });

  it('sorts the merged lines by date', () => {
    const r = rebuildLineItems({
      stored: [{ date: '2026-10-15', type: 'Additional' }],
      monthLessons: [regular('2026-10-20', 'Completed'), regular('2026-10-06', 'Completed')],
      prorated: true,
      slotDayLabel: 'Tue',
      regularDescription: DESC,
    });
    expect(r.lineItems.map(l => l.date)).toEqual(['2026-10-06', '2026-10-15', '2026-10-20']);
  });
});

describe('rebuildLineItems — moved lessons are billed once (regression: Ian Chen, November 2026)', () => {
  // Real rows, 25 Oct 2026: Sundays 8/15/29 Nov moved to Saturdays 7/14/28 Nov
  // (Sat 1-3pm); 1 and 22 Nov holiday opt-outs (Cancelled — the route never
  // fetches those). The rebuild billed 6 lessons / $480 with the Sunday label.
  const NOV = 'November 2026';
  const moved = (date: string): MonthLesson => ({ date, type: 'Regular', status: 'Rescheduled' });
  const replacement = (date: string): MonthLesson =>
    ({ date, type: 'Rescheduled', status: 'Scheduled', billingMonth: NOV, slotLabel: 'Sat 1-3pm' });

  it('counts the Saturday replacements only — 3 lessons, Saturday slot on every line', () => {
    const r = rebuildLineItems({
      stored: [],
      monthLessons: [
        replacement('2026-11-07'), moved('2026-11-08'),
        replacement('2026-11-14'), moved('2026-11-15'),
        replacement('2026-11-28'), moved('2026-11-29'),
      ],
      prorated: false,
      slotDayLabel: 'Sun 11am-1pm',
      regularDescription: 'Sec 3 A Math — November 2026',
      invoiceMonthLabel: NOV,
    });
    expect(r.regularCount).toBe(3);
    expect(r.regularCount * 80).toBe(240);
    expect(r.lineItems.map(l => l.date)).toEqual(['2026-11-07', '2026-11-14', '2026-11-28']);
    expect(r.lineItems.every(l => l.day === 'Sat 1-3pm')).toBe(true);
    expect(r.lineItems.every(l => l.type === 'Rescheduled')).toBe(true);
  });

  it('a lesson moved INTO this month that belongs to another month is left for that month', () => {
    const r = rebuildLineItems({
      stored: [],
      monthLessons: [
        regular('2026-11-03'),
        { date: '2026-11-05', type: 'Rescheduled', status: 'Scheduled', billingMonth: 'October 2026' },
      ],
      prorated: false, slotDayLabel: 'Tue', regularDescription: DESC, invoiceMonthLabel: NOV,
    });
    expect(r.lineItems.map(l => l.date)).toEqual(['2026-11-03']);
  });

  it('a lesson moved OUT of this month (fetched by its Billing Month) is still billed here', () => {
    const r = rebuildLineItems({
      stored: [],
      monthLessons: [
        moved('2026-11-24'),
        { date: '2026-12-01', type: 'Rescheduled', status: 'Scheduled', billingMonth: NOV, slotLabel: 'Tue 5-7pm' },
      ],
      prorated: false, slotDayLabel: 'Tue 5-7pm', regularDescription: DESC, invoiceMonthLabel: NOV,
    });
    expect(r.lineItems.map(l => l.date)).toEqual(['2026-12-01']);
  });

  it('a lesson moved twice is billed once, on the last row', () => {
    const r = rebuildLineItems({
      stored: [],
      monthLessons: [
        moved('2026-11-08'),
        { date: '2026-11-10', type: 'Rescheduled', status: 'Rescheduled', billingMonth: NOV },
        replacement('2026-11-14'),
      ],
      prorated: false, slotDayLabel: 'Sun', regularDescription: DESC, invoiceMonthLabel: NOV,
    });
    expect(r.lineItems.map(l => l.date)).toEqual(['2026-11-14']);
  });
});
