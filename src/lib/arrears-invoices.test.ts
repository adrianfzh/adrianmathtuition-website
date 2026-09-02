import { describe, it, expect } from 'vitest';
import {
  PRORATION_MONTHS,
  isProratedMonth,
  justEndedMonth,
  monthHasEnded,
  arrearsInvoiceDates,
  arrearsAdditionalWindowStartISO,
  arrearsSendAtISO,
  existingInvoicesMissRegulars,
} from './arrears-invoices';

describe('isProratedMonth', () => {
  it('June and Oct–Dec are prorated', () => {
    expect(PRORATION_MONTHS).toEqual([6, 10, 11, 12]);
    for (const m of [6, 10, 11, 12]) expect(isProratedMonth(m)).toBe(true);
  });
  it('every other month projects from slots', () => {
    for (const m of [1, 2, 3, 4, 5, 7, 8, 9]) expect(isProratedMonth(m)).toBe(false);
  });
});

describe('justEndedMonth', () => {
  // The arrears cron fires on the 1st (9am SGT) and must bill the month that
  // ended the night before — never the current one, never getInvoiceMonth()'s
  // next one (which is exactly why the 14th cron could never bill it).
  it('on the 1st resolves to the previous month', () => {
    expect(justEndedMonth('2026-11-01')).toEqual({ label: 'October 2026', year: 2026, month: 10 });
    expect(justEndedMonth('2026-07-01')).toEqual({ label: 'June 2026', year: 2026, month: 6 });
  });
  it('rolls January back into December of the previous year', () => {
    expect(justEndedMonth('2027-01-01')).toEqual({ label: 'December 2026', year: 2026, month: 12 });
  });
  it('is the previous month on any day, not just the 1st (a late manual run)', () => {
    expect(justEndedMonth('2026-02-15')).toEqual({ label: 'January 2026', year: 2026, month: 1 });
  });
  it('builds the label the Invoices {Month} query matches exactly', () => {
    expect(justEndedMonth('2026-12-01').label).toBe('November 2026');
  });
});

describe('monthHasEnded', () => {
  // A prorated month generated BEFORE it ends bills a partial month, or mints
  // the additionals-only trap invoice the arrears run then skips. The route
  // refuses such a manual run; this is the gate.
  it('true from the first day of the following month', () => {
    expect(monthHasEnded('2026-11-01', 2026, 10)).toBe(true);
    expect(monthHasEnded('2026-11-20', 2026, 10)).toBe(true);
  });
  it('false on the last day of the month itself (still being taught)', () => {
    expect(monthHasEnded('2026-10-31', 2026, 10)).toBe(false);
  });
  it('false mid-month', () => {
    expect(monthHasEnded('2026-10-20', 2026, 10)).toBe(false);
  });
  it('handles the December → January year wrap', () => {
    expect(monthHasEnded('2027-01-01', 2026, 12)).toBe(true);
    expect(monthHasEnded('2026-12-31', 2026, 12)).toBe(false);
  });
});

describe('arrearsInvoiceDates', () => {
  // The pre-month defaults would stamp an October arrears draft (generated
  // 1 Nov) with Due Date 15 Oct — already in the past. Arrears invoices are
  // issued on the scheduled send day (the 2nd) and due on the 15th.
  it('issues on the 2nd and is due on the 15th of the following month', () => {
    expect(arrearsInvoiceDates(2026, 10)).toEqual({ issueISO: '2026-11-02', dueISO: '2026-11-15' });
    expect(arrearsInvoiceDates(2026, 6)).toEqual({ issueISO: '2026-07-02', dueISO: '2026-07-15' });
  });
  it('rolls December into January of the next year', () => {
    expect(arrearsInvoiceDates(2026, 12)).toEqual({ issueISO: '2027-01-02', dueISO: '2027-01-15' });
  });
});

describe('arrearsSendAtISO', () => {
  // 10am SGT on the 2nd = 02:00 UTC — the generator's Telegram summary uses it
  // to say whether the auto-send is still coming or the drafts need a manual send.
  it('is 02:00 UTC on the 2nd of the following month', () => {
    expect(arrearsSendAtISO(2026, 10)).toBe('2026-11-02T02:00:00Z');
    expect(arrearsSendAtISO(2026, 12)).toBe('2027-01-02T02:00:00Z');
    expect(Date.parse(arrearsSendAtISO(2026, 10))).toBe(Date.UTC(2026, 10, 2, 2, 0, 0));
  });
});

describe('arrearsAdditionalWindowStartISO', () => {
  // The 14th cron creates nothing for a prorated target month, so the
  // additionals batch it would have carried (from the 15th two months back)
  // rides the arrears invoice. E.g. October's arrears run on 1 Nov must reach
  // back to 15 Aug — the batch the 14 Sep run skipped.
  it('starts on the 15th two months before the prorated month', () => {
    expect(arrearsAdditionalWindowStartISO(2026, 10)).toBe('2026-08-15');
    expect(arrearsAdditionalWindowStartISO(2026, 11)).toBe('2026-09-15');
    expect(arrearsAdditionalWindowStartISO(2026, 12)).toBe('2026-10-15');
    expect(arrearsAdditionalWindowStartISO(2026, 6)).toBe('2026-04-15');
  });
  it('rolls back across the year boundary', () => {
    expect(arrearsAdditionalWindowStartISO(2026, 1)).toBe('2025-11-15');
    expect(arrearsAdditionalWindowStartISO(2026, 2)).toBe('2025-12-15');
  });
});

describe('existingInvoicesMissRegulars', () => {
  const inv = (lessonsCount: number, invoiceType = 'Regular', status = 'Draft') => ({ lessonsCount, invoiceType, status });

  it('a live invoice that bills lessons → nothing is missing', () => {
    expect(existingInvoicesMissRegulars([inv(2)])).toBe(false);
    expect(existingInvoicesMissRegulars([inv(0, 'Regular', 'Sent'), inv(3)])).toBe(false);
  });
  // THE TRAP (docs/INVOICES.md): the old 14th cron could create a prorated-
  // month invoice carrying only Additional lessons; the arrears run then saw
  // "already has an invoice" and the Completed lessons were never billed.
  it('an additionals-only invoice (0 lessons) → Completed lessons are unbilled', () => {
    expect(existingInvoicesMissRegulars([inv(0, 'Regular', 'Sent')])).toBe(true);
  });
  it('an adjustment invoice alone does not bill the month', () => {
    expect(existingInvoicesMissRegulars([inv(0, 'Adjustment', 'Sent')])).toBe(true);
  });
  it('a Revision Sprint invoice deliberately replaces the regular June invoice', () => {
    expect(existingInvoicesMissRegulars([inv(0, 'Revision Sprint', 'Sent')])).toBe(false);
  });
  it('voided invoices do not count as billing anything', () => {
    expect(existingInvoicesMissRegulars([inv(5, 'Regular', 'Voided')])).toBe(true);
  });
  it('no invoices at all → missing (defensive; the route only asks when one exists)', () => {
    expect(existingInvoicesMissRegulars([])).toBe(true);
  });
});
