import { describe, it, expect } from 'vitest';
import { adhocChargeDefault, billableAdhocLessons, adhocLineDescription, adhocDatesText, adhocInvoiceNote, LESSONS_PER_PACKAGE, type LessonRow } from './adhoc-billing';

const KEVIN = 'recKevin';
const row = (id: string, fields: Record<string, any>): LessonRow => ({ id, fields: { Student: [KEVIN], ...fields } });

describe('adhocChargeDefault', () => {
  // REGRESSION — Kevin Seng, Jul–Aug 2026: the Rates Amount ($320) is the price
  // of four lessons and was prefilled as the charge for ONE ad-hoc lesson.
  it('divides the package price by four when the student has no rate of their own', () => {
    expect(LESSONS_PER_PACKAGE).toBe(4);
    expect(adhocChargeDefault({ packageAmount: 320 })).toBe(80);
    expect(adhocChargeDefault({ packageAmount: 360 })).toBe(90);
    expect(adhocChargeDefault({ packageAmount: 330 })).toBe(82.5);
  });
  it('uses the student’s own per-lesson rate first, an Active enrollment before an Ended one', () => {
    expect(adhocChargeDefault({ enrollments: [{ rate: 70, status: 'Ended' }, { rate: 80, status: 'Active' }], packageAmount: 320 })).toBe(80);
    expect(adhocChargeDefault({ enrollments: [{ rate: 70, status: 'Ended' }], packageAmount: 320 })).toBe(70);
    expect(adhocChargeDefault({ enrollments: [{ rate: 0, status: 'Active' }], packageAmount: 320 })).toBe(80);
  });
  it('is null when nothing is known', () => {
    expect(adhocChargeDefault({})).toBeNull();
    expect(adhocChargeDefault({ packageAmount: null })).toBeNull();
  });
});

describe('billableAdhocLessons', () => {
  it('bills Completed, un-invoiced Ad-hoc lessons of this student only, oldest first', () => {
    const rows = [
      row('a2', { Type: 'Ad-hoc', Status: 'Completed', Date: '2026-08-03', 'Charge Override': 80 }),
      row('a1', { Type: 'Ad-hoc', Status: 'Completed', Date: '2026-07-13', 'Charge Override': 80 }),
      row('s', { Type: 'Ad-hoc', Status: 'Scheduled', Date: '2026-07-04', 'Charge Override': 80 }),
      row('b', { Type: 'Ad-hoc', Status: 'Completed', Date: '2026-07-20', 'Charge Override': 80, 'Source Invoice': ['recInv'] }),
      { id: 'o', fields: { Student: ['recOther'], Type: 'Ad-hoc', Status: 'Completed', Date: '2026-07-14', 'Charge Override': 80 } },
    ];
    expect(billableAdhocLessons(rows, KEVIN)).toEqual([
      { id: 'a1', date: '2026-07-13', charge: 80 },
      { id: 'a2', date: '2026-08-03', charge: 80 },
    ]);
  });

  // REGRESSION — Kevin Seng's 26 Jul ad-hoc lesson was moved to 27 Jul; the new
  // row is Type 'Rescheduled' with no charge, so it was never billable.
  it('bills a moved ad-hoc lesson once, on the row that happened, at the original’s charge', () => {
    const rows = [
      row('orig', { Type: 'Ad-hoc', Status: 'Rescheduled', Date: '2026-07-26', 'Charge Override': 80 }),
      row('moved', { Type: 'Rescheduled', Status: 'Completed', Date: '2026-07-27', 'Makeup For': ['orig'] }),
    ];
    expect(billableAdhocLessons(rows, KEVIN)).toEqual([{ id: 'moved', date: '2026-07-27', charge: 80, movedFrom: 'orig', movedFromDate: '2026-07-26' }]);
  });

  it('follows a lesson moved twice, and a charge set on the moved row wins', () => {
    const rows = [
      row('orig', { Type: 'Ad-hoc', Status: 'Rescheduled', Date: '2026-07-26', 'Charge Override': 80 }),
      row('m1', { Type: 'Rescheduled', Status: 'Rescheduled', Date: '2026-07-27', 'Makeup For': ['orig'] }),
      row('m2', { Type: 'Rescheduled', Status: 'Completed', Date: '2026-07-29', 'Makeup For': ['m1'], 'Charge Override': 90 }),
    ];
    expect(billableAdhocLessons(rows, KEVIN)).toEqual([{ id: 'm2', date: '2026-07-29', charge: 90, movedFrom: 'orig', movedFromDate: '2026-07-26' }]);
  });

  it('ignores a moved REGULAR lesson (the monthly invoice already covers it) and a moved lesson already billed', () => {
    const rows = [
      row('reg', { Type: 'Regular', Status: 'Rescheduled', Date: '2026-07-06' }),
      row('mreg', { Type: 'Rescheduled', Status: 'Completed', Date: '2026-07-07', 'Makeup For': ['reg'] }),
      row('orig', { Type: 'Ad-hoc', Status: 'Rescheduled', Date: '2026-07-26', 'Charge Override': 80, 'Source Invoice': ['recInv'] }),
      row('moved', { Type: 'Rescheduled', Status: 'Completed', Date: '2026-07-27', 'Makeup For': ['orig'] }),
      row('lone', { Type: 'Rescheduled', Status: 'Completed', Date: '2026-07-28' }),
    ];
    expect(billableAdhocLessons(rows, KEVIN)).toEqual([]);
  });

  it('reports a charge of 0 when no row in the chain carries one', () => {
    const rows = [row('a', { Type: 'Ad-hoc', Status: 'Completed', Date: '2026-07-13' })];
    expect(billableAdhocLessons(rows, KEVIN)).toEqual([{ id: 'a', date: '2026-07-13', charge: 0 }]);
  });
});

describe('the invoice’s words', () => {
  it('names each lesson, and says where a moved one came from', () => {
    expect(adhocLineDescription({ date: '2026-07-13' })).toBe('Ad-hoc lesson — 13 Jul 2026');
    expect(adhocLineDescription({ date: '2026-07-27', movedFromDate: '2026-07-26' })).toBe('Ad-hoc lesson — 27 Jul 2026 (moved from 26 Jul)');
  });
  it('lists Kevin’s nine dates the way Adrian wrote them', () => {
    const dates = ['2026-08-23', '2026-07-13', '2026-07-27', '2026-07-31', '2026-08-03', '2026-08-10', '2026-08-18', '2026-08-19', '2026-08-21'];
    expect(adhocDatesText(dates)).toBe('13, 27 and 31 July; 3, 10, 18, 19, 21 and 23 August 2026');
    expect(adhocDatesText(['2026-12-28', '2027-01-04'])).toBe('28 December 2026; 4 January 2027');
    expect(adhocDatesText(['2026-07-13'])).toBe('13 July 2026');
  });
  it('the PDF note states the count and, when they agree, the price', () => {
    expect(adhocInvoiceNote(Array(9).fill(80))).toBe('9 ad-hoc lessons at $80.00 each.');
    expect(adhocInvoiceNote([80, 90])).toBe('2 ad-hoc lessons.');
    expect(adhocInvoiceNote([82.5])).toBe('1 ad-hoc lesson at $82.50 each.');
  });
});
