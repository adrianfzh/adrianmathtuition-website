import { describe, it, expect } from 'vitest';
import { adhocChargeDefault, billableAdhocLessons, bookedAdhocLessons, studentsWithBookedAdhoc, cancelledPaidAdhoc, adhocCreditLine, creditedLessonIds, isCleanAdhocInvoice, adhocRowDescription, adhocDatesText, adhocInvoiceNote, LESSONS_PER_PACKAGE, type LessonRow } from './adhoc-billing';

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
  // Adrian, 22 Sep 2026: "just put Ad-hoc lessons -> 9 … simpler and looks better".
  it('gives every lesson at one price the same description, so the PDF shows one row', () => {
    expect(adhocRowDescription(80, Array(9).fill(80))).toBe('Ad-hoc lessons');
  });
  it('splits the row by price when the prices differ (one description would bill all at the first price)', () => {
    expect(adhocRowDescription(80, [80, 90, 80])).toBe('Ad-hoc lessons at $80.00');
    expect(adhocRowDescription(90, [80, 90, 80])).toBe('Ad-hoc lessons at $90.00');
  });
  it('lists Kevin’s nine dates the way Adrian wrote them', () => {
    const dates = ['2026-08-23', '2026-07-13', '2026-07-27', '2026-07-31', '2026-08-03', '2026-08-10', '2026-08-18', '2026-08-19', '2026-08-21'];
    expect(adhocDatesText(dates)).toBe('13, 27 and 31 July; 3, 10, 18, 19, 21 and 23 August 2026');
    expect(adhocDatesText(['2026-12-28', '2027-01-04'])).toBe('28 December 2026; 4 January 2027');
    expect(adhocDatesText(['2026-07-13'])).toBe('13 July 2026');
  });
  it('the PDF note lists the dates', () => {
    const dates = ['2026-07-13', '2026-07-27', '2026-07-31', '2026-08-03', '2026-08-10', '2026-08-18', '2026-08-19', '2026-08-21', '2026-08-23'];
    expect(adhocInvoiceNote(dates)).toBe('Lessons on 13, 27 and 31 July; 3, 10, 18, 19, 21 and 23 August 2026.');
    expect(adhocInvoiceNote(['2026-07-13'])).toBe('Lessons on 13 July 2026.');
    expect(adhocInvoiceNote([])).toBe('');
  });
});

// 3 Nov 2026 — Chantal: one-off lessons in Nov/Dec paid AHEAD, a month at a time.
describe('bookedAdhocLessons (billed ahead)', () => {
  const C = 'recChantal';
  const c = (id: string, fields: Record<string, any>): LessonRow => ({ id, fields: { Student: [C], Type: 'Ad-hoc', 'Charge Override': 80, ...fields } });
  const rows = [
    c('n20', { Status: 'Scheduled', Date: '2026-11-20' }),
    c('d04', { Status: 'Scheduled', Date: '2026-12-04' }),
    c('d13', { Status: 'Scheduled', Date: '2026-12-13' }),
    c('d18', { Status: 'Cancelled', Date: '2026-12-18' }),
    c('d20', { Status: 'Scheduled', Date: '2026-12-20', 'Source Invoice': ['recInv'] }),
    row('k1', { Type: 'Ad-hoc', Status: 'Completed', Date: '2026-07-04', 'Charge Override': 80 }),
  ];
  it('takes only the window\'s booked, unbilled lessons', () => {
    expect(bookedAdhocLessons(rows, C, '2026-12-01', '2026-12-31').map(l => l.id)).toEqual(['d04', 'd13']);
    expect(bookedAdhocLessons(rows, C, '2026-11-01', '2026-11-30').map(l => l.id)).toEqual(['n20']);
  });
  it('never sweeps an old unbilled Completed lesson into the run (Kevin Seng, Jul 2026)', () => {
    expect(studentsWithBookedAdhoc(rows, '2026-12-01', '2026-12-31')).toEqual([C]);
    expect(bookedAdhocLessons(rows, KEVIN, '2026-12-01', '2026-12-31')).toEqual([]);
  });
  it('a paid-ahead lesson that is moved is not billed again', () => {
    const moved = [
      c('o', { Status: 'Rescheduled', Date: '2026-12-04', 'Source Invoice': ['recInv'] }),
      c('m', { Type: 'Rescheduled', Status: 'Scheduled', Date: '2026-12-06', 'Makeup For': ['o'], 'Charge Override': undefined }),
    ];
    expect(bookedAdhocLessons(moved, C, '2026-12-01', '2026-12-31')).toEqual([]);
  });
});

describe('cancelledPaidAdhoc (credit on the next bill)', () => {
  const C = 'recChantal';
  const c = (id: string, fields: Record<string, any>): LessonRow => ({ id, fields: { Student: [C], Type: 'Ad-hoc', 'Charge Override': 80, ...fields } });
  it('credits a paid lesson that was cancelled, once', () => {
    const rows = [
      c('paid', { Status: 'Cancelled', Date: '2026-12-18', 'Source Invoice': ['recInv'] }),
      c('unpaid', { Status: 'Cancelled', Date: '2026-12-20' }),
      c('done', { Status: 'Completed', Date: '2026-12-13', 'Source Invoice': ['recInv'] }),
    ];
    expect(cancelledPaidAdhoc(rows, C, new Set())).toEqual([{ lessonId: 'paid', date: '2026-12-18', amount: 80 }]);
    expect(cancelledPaidAdhoc(rows, C, new Set(['paid']))).toEqual([]);
  });
  it('a moved paid lesson is no credit; the moved one cancelled is', () => {
    const rows = [
      c('o', { Status: 'Rescheduled', Date: '2026-12-04', 'Source Invoice': ['recInv'] }),
      c('m', { Type: 'Rescheduled', Status: 'Scheduled', Date: '2026-12-06', 'Makeup For': ['o'], 'Charge Override': undefined }),
    ];
    expect(cancelledPaidAdhoc(rows, C, new Set())).toEqual([]);
    rows[1].fields.Status = 'Cancelled';
    expect(cancelledPaidAdhoc(rows, C, new Set())).toEqual([{ lessonId: 'm', date: '2026-12-06', amount: 80 }]);
  });
  it('the credit line carries the lesson id, and is read back', () => {
    const line = adhocCreditLine({ lessonId: 'paid', date: '2026-12-18', amount: 80 });
    expect(line).toEqual({ description: 'Credit — lesson on 18 December 2026 cancelled', amount: -80, lessonId: 'paid' });
    expect([...creditedLessonIds([JSON.stringify([line]), null, 'not json'])]).toEqual(['paid']);
  });
});

describe('isCleanAdhocInvoice (sent on the 15th unattended)', () => {
  const clean = { 'Invoice Type': 'Adhoc', 'Final Amount': 400, 'Auto Notes': adhocInvoiceNote(['2026-12-04', '2026-12-13']) };
  it('sends a plain booked-ahead bill', () => { expect(isCleanAdhocInvoice(clean)).toBe(true); });
  it('holds one with a credit, an adjustment, a custom email or another note', () => {
    expect(isCleanAdhocInvoice({ ...clean, 'Line Items Extra': '[{"amount":-80}]' })).toBe(false);
    expect(isCleanAdhocInvoice({ ...clean, 'Adjustment Amount': 10 })).toBe(false);
    expect(isCleanAdhocInvoice({ ...clean, 'Custom Email Message': 'hi' })).toBe(false);
    expect(isCleanAdhocInvoice({ ...clean, 'Auto Notes': 'First invoice' })).toBe(false);
    expect(isCleanAdhocInvoice({ ...clean, 'Invoice Type': 'Regular' })).toBe(false);
    expect(isCleanAdhocInvoice({ ...clean, 'Final Amount': 0 })).toBe(false);
  });
});
