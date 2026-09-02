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
