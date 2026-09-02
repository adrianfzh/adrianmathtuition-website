import { describe, it, expect } from 'vitest';
import {
  ARREARS_MONTHS,
  advanceRunNote,
  arrearsBillMonthEnded,
  attendedReviewNote,
  yearEndHoldReason,
  arrearsDueDateISO,
  arrearsMachineryCovers,
  arrearsMonthFormula,
  arrearsRegularLessonsFor,
  arrearsRunTarget,
  arrearsTargetForMonth,
  billingModeFor,
  effectiveEndISO,
  examCutoffFor,
  examCutoffNote,
  humanDate,
  invoiceDueDateISO,
  isCombinedJanuary,
  isExamYearStudent,
  labelOfDate,
  mapArrearsRecord,
  paidInAdvance,
  parseMonthLabel,
  sweepAdditionalFor,
  sweepWindowStartISO,
  unmarkedArrearsFormula,
  unmarkedByStudent,
  type ArrearsLessonRecord,
} from './year-end-billing';
import type { AdditionalLessonRecord } from './additional-lessons';

const sec3 = { level: 'Sec 3', subjects: ['A Math', 'E Math'] };
const sec4 = { level: 'Sec 4', subjects: ['A Math', 'E Math'] };
const sec4EMath = { level: 'Sec 4', subjects: ['E Math'] };
const sec4IP = { level: 'Sec 4', subjects: ['IP Math'], subjectLevel: 'IP' };
const sec5 = { level: 'Sec 5', subjects: ['E Math'] };
const jc1 = { level: 'JC1', subjects: ['H2 Math'] };
const jc2 = { level: 'JC2', subjects: ['H2 Math'] };
const jc2H1 = { level: 'JC2', subjects: ['H1 Math'] };

describe('who is exam-year', () => {
  it('Sec 4, Sec 5 and JC2 are exam-year; Sec 1–3 and JC1 are not', () => {
    expect(isExamYearStudent(sec4)).toBe(true);
    expect(isExamYearStudent(sec5)).toBe(true);
    expect(isExamYearStudent(jc2)).toBe(true);
    expect(isExamYearStudent(sec3)).toBe(false);
    expect(isExamYearStudent(jc1)).toBe(false);
    expect(isExamYearStudent({ level: 'Sec 1' })).toBe(false);
  });
  it('an IP Sec 4 student sits no O-Level — not exam-year', () => {
    expect(isExamYearStudent(sec4IP)).toBe(false);
    expect(isExamYearStudent({ level: 'Sec 4', subjectLevel: 'IP' })).toBe(false);
  });
  it('blank / unknown level is never exam-year', () => {
    expect(isExamYearStudent({})).toBe(false);
    expect(isExamYearStudent({ level: null })).toBe(false);
  });
});

describe('billing mode by month', () => {
  it('non-exam-year students: Oct, Nov, Dec in arrears; every other month in advance', () => {
    for (let m = 1; m <= 12; m++) {
      expect(billingModeFor(sec3, m)).toBe(ARREARS_MONTHS.includes(m) ? 'arrears' : 'advance');
    }
    expect(billingModeFor(jc1, 10)).toBe('arrears');
    expect(billingModeFor(sec4IP, 11)).toBe('arrears');
  });
  it('exam-year students stay in advance all year (the cut-off does the tapering)', () => {
    for (let m = 1; m <= 12; m++) {
      expect(billingModeFor(sec4, m)).toBe('advance');
      expect(billingModeFor(jc2, m)).toBe('advance');
    }
  });
  it('June is NOT an arrears month', () => {
    expect(ARREARS_MONTHS).not.toContain(6);
    expect(billingModeFor(sec3, 6)).toBe('advance');
  });
  it('January is combined with December for arrears students only', () => {
    expect(isCombinedJanuary(sec3, 1)).toBe(true);
    expect(isCombinedJanuary(jc1, 1)).toBe(true);
    expect(isCombinedJanuary(sec4, 1)).toBe(false);
    expect(isCombinedJanuary(sec3, 2)).toBe(false);
  });
});

describe('exam cut-off dates (2026 SEAB timetables)', () => {
  it('Sec 4 with A Math ends on A Math Paper 2, Wed 28 Oct', () => {
    expect(examCutoffFor(sec4, 2026)).toEqual({ iso: '2026-10-28', paper: 'O-Level A Math Paper 2' });
  });
  it('E-Math-only Sec 4 / Sec 5 ends on E Math Paper 2, Fri 23 Oct', () => {
    expect(examCutoffFor(sec4EMath, 2026)?.iso).toBe('2026-10-23');
    expect(examCutoffFor(sec5, 2026)?.iso).toBe('2026-10-23');
    expect(examCutoffFor({ level: 'Sec 4', subjects: ['Math'] }, 2026)?.iso).toBe('2026-10-23');
  });
  it('unknown subjects fall to the later A Math date', () => {
    expect(examCutoffFor({ level: 'Sec 4' }, 2026)?.iso).toBe('2026-10-28');
    expect(examCutoffFor({ level: 'Sec 4', subjects: [] }, 2026)?.iso).toBe('2026-10-28');
  });
  it('JC2 H2 ends Fri 6 Nov; H1-only ends Tue 3 Nov', () => {
    expect(examCutoffFor(jc2, 2026)).toEqual({ iso: '2026-11-06', paper: 'A-Level H2 Math Paper 2' });
    expect(examCutoffFor(jc2H1, 2026)?.iso).toBe('2026-11-03');
    expect(examCutoffFor({ level: 'JC2', subjects: ['H1 Math', 'H2 Math'] }, 2026)?.iso).toBe('2026-11-06');
  });
  it('no cut-off for non-exam-year students, IP students, or a year without a table', () => {
    expect(examCutoffFor(sec3, 2026)).toBeNull();
    expect(examCutoffFor(sec4IP, 2026)).toBeNull();
    expect(examCutoffFor(sec4, 2027)).toBeNull();
  });
  it('effective end = the earlier of End Date and cut-off; either may be absent', () => {
    expect(effectiveEndISO('2026-10-10', '2026-10-28')).toBe('2026-10-10');
    expect(effectiveEndISO('2026-12-31', '2026-10-28')).toBe('2026-10-28');
    expect(effectiveEndISO(null, '2026-10-28')).toBe('2026-10-28');
    expect(effectiveEndISO('2026-12-31', null)).toBe('2026-12-31');
    expect(effectiveEndISO(undefined, undefined)).toBeNull();
  });
  it('the parent-facing note names the date and the paper', () => {
    expect(examCutoffNote({ iso: '2026-10-28', paper: 'O-Level A Math Paper 2' }))
      .toBe('Lessons run up to Wed, 28 Oct 2026, the last O-Level A Math Paper 2. No lessons are scheduled after the exams.');
  });
});

describe('arrears run target', () => {
  it('1 Nov bills October under the October label', () => {
    expect(arrearsRunTarget('2026-11-01')).toMatchObject({
      billLabel: 'October 2026', invoiceLabel: 'October 2026', billMonth: 10, projectInvoiceMonth: false,
    });
  });
  it('1 Dec bills November', () => {
    expect(arrearsRunTarget('2026-12-01')).toMatchObject({ billLabel: 'November 2026', invoiceLabel: 'November 2026' });
  });
  it('1 Jan is the combined invoice: December attended, filed under January, January projected', () => {
    expect(arrearsRunTarget('2027-01-01')).toEqual({
      billYear: 2026, billMonth: 12, billLabel: 'December 2026',
      invoiceYear: 2027, invoiceMonth: 1, invoiceLabel: 'January 2027',
      projectInvoiceMonth: true,
    });
  });
  it('a manual re-run names the invoice label; January means the combined one', () => {
    expect(arrearsTargetForMonth(2026, 10).billLabel).toBe('October 2026');
    expect(arrearsTargetForMonth(2027, 1)).toMatchObject({ billLabel: 'December 2026', invoiceLabel: 'January 2027', projectInvoiceMonth: true });
  });
  it('a late run still targets the same month (2 Nov → October)', () => {
    expect(arrearsRunTarget('2026-11-02').invoiceLabel).toBe('October 2026');
  });
});

describe('due dates', () => {
  it('arrears invoices are due 7 days after issue', () => {
    expect(arrearsDueDateISO('2026-11-02')).toBe('2026-11-09');
    expect(invoiceDueDateISO('arrears', 2026, 10, '2026-11-02')).toBe('2026-11-09');
  });
  it('advance invoices keep the 15th-of-the-invoice-month rule', () => {
    expect(invoiceDueDateISO('advance', 2026, 10, '2026-09-15')).toBe('2026-10-15');
  });
  it('the combined January invoice is due 7 days after its 2 Jan issue, not 15 Jan', () => {
    expect(invoiceDueDateISO('arrears', 2027, 1, '2027-01-02')).toBe('2027-01-09');
  });
});

describe('month labels', () => {
  it('parses canonical labels and rejects spans and junk', () => {
    expect(parseMonthLabel('October 2026')).toEqual({ year: 2026, month: 10 });
    expect(parseMonthLabel('July–August 2026')).toBeNull();
    expect(parseMonthLabel('')).toBeNull();
    expect(parseMonthLabel('2026-10')).toBeNull();
  });
  it('labelOfDate gives the owning month of an ISO date', () => {
    expect(labelOfDate('2026-10-31')).toBe('October 2026');
    expect(labelOfDate('')).toBe('');
  });
  it('sweep window starts 3 months before the bill month by default', () => {
    expect(sweepWindowStartISO(2026, 10)).toBe('2026-07-01');
    expect(sweepWindowStartISO(2027, 1)).toBe('2026-10-01');
    expect(sweepWindowStartISO(2026, 12, 1)).toBe('2026-11-01');
  });
});

describe('arrears lesson selection', () => {
  const rec = (id: string, over: Partial<ArrearsLessonRecord>): ArrearsLessonRecord => ({
    id, date: '2026-10-10', studentId: 'recA', type: 'Regular', billingMonth: 'October 2026', isMakeup: false, slotId: null, ...over,
  });
  const ctxA = { ...sec3, invoicedMonths: new Set(['August 2026', 'September 2026']) };

  it('formula covers Regular AND Rescheduled Completed lessons, half-open month window, no {Student} clause', () => {
    const f = arrearsMonthFormula(2026, 10);
    expect(f).toBe("AND(OR({Type}='Regular',{Type}='Rescheduled'),{Status}='Completed',{Date}>='2026-10-01',{Date}<'2026-11-01')");
    expect(f).not.toContain('{Student}');
    expect(f).not.toContain('<=');
  });

  it('maps an Airtable record (Billing Month, Is Makeup, Slot link)', () => {
    expect(mapArrearsRecord({ id: 'r1', fields: { Date: '2026-10-03', Student: ['recA'], Type: 'Rescheduled', 'Billing Month': 'September 2026', 'Is Makeup': true, Slot: ['slot1'] } }))
      .toEqual({ id: 'r1', date: '2026-10-03', studentId: 'recA', type: 'Rescheduled', billingMonth: 'September 2026', isMakeup: true, slotId: 'slot1' });
    expect(mapArrearsRecord({ id: 'r2', fields: {} })).toEqual({ id: 'r2', date: '', studentId: null, type: '', billingMonth: '', isMakeup: false, slotId: null });
  });

  it("bills the student's own Completed Regular and Rescheduled lessons, sorted by date, other students excluded", () => {
    const pool = [
      rec('c', { date: '2026-10-24' }),
      rec('a', { date: '2026-10-03', type: 'Rescheduled' }),
      rec('other', { studentId: 'recB' }),
      rec('b', { date: '2026-10-10' }),
    ];
    expect(arrearsRegularLessonsFor(pool, 'recA', ctxA).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('a September lesson moved into October was paid in the September advance invoice — not billed again', () => {
    const moved = rec('m', { date: '2026-10-05', type: 'Rescheduled', billingMonth: 'September 2026' });
    expect(paidInAdvance(ctxA, 'September 2026')).toBe(true);
    expect(arrearsRegularLessonsFor([moved], 'recA', ctxA)).toEqual([]);
  });

  it('a makeup for a September absence is likewise already paid; a makeup for an October absence is billed', () => {
    const sepMakeup = rec('s', { date: '2026-11-07', type: 'Rescheduled', billingMonth: 'September 2026', isMakeup: true });
    const octMakeup = rec('o', { date: '2026-11-07', type: 'Rescheduled', billingMonth: 'October 2026', isMakeup: true });
    const ctxNov = { ...sec3, invoicedMonths: new Set(['September 2026', 'October 2026']) };
    expect(arrearsRegularLessonsFor([sepMakeup, octMakeup], 'recA', ctxNov).map((l) => l.id)).toEqual(['o']);
  });

  it('an October lesson moved into November is billed by the November run (October arrears invoice never carried it)', () => {
    const moved = rec('m', { date: '2026-11-03', type: 'Rescheduled', billingMonth: 'October 2026' });
    const ctxNov = { ...sec3, invoicedMonths: new Set(['October 2026']) };
    expect(arrearsRegularLessonsFor([moved], 'recA', ctxNov).map((l) => l.id)).toEqual(['m']);
  });

  it('a lesson owned by an advance month with NO invoice was never paid — billed', () => {
    const moved = rec('m', { date: '2026-10-05', type: 'Rescheduled', billingMonth: 'September 2026' });
    const ctxNoSep = { ...sec3, invoicedMonths: new Set<string>() };
    expect(arrearsRegularLessonsFor([moved], 'recA', ctxNoSep).map((l) => l.id)).toEqual(['m']);
  });

  it('blank Billing Month falls back to the date month', () => {
    const plain = rec('p', { date: '2026-10-17', billingMonth: '' });
    expect(arrearsRegularLessonsFor([plain], 'recA', ctxA).map((l) => l.id)).toEqual(['p']);
  });

  it('an exam-year student (advance all year) processed by the run: post-cut-off lessons in a month with no invoice are billed, October-owned ones are not', () => {
    const ctxSec4 = { ...sec4, invoicedMonths: new Set(['October 2026']) };
    const octOwned = rec('x', { date: '2026-11-02', type: 'Rescheduled', billingMonth: 'October 2026' });
    const novOwned = rec('y', { date: '2026-11-14', billingMonth: 'November 2026' });
    expect(arrearsRegularLessonsFor([octOwned, novOwned], 'recA', ctxSec4).map((l) => l.id)).toEqual(['y']);
  });

  it('other types (Additional, Trial, Ad-hoc, Revision) never enter the regular count', () => {
    const pool = ['Additional', 'Trial', 'Ad-hoc', 'Revision Sprint', 'Revision Makeup'].map((type, i) => rec(`t${i}`, { type }));
    expect(arrearsRegularLessonsFor(pool, 'recA', ctxA)).toEqual([]);
  });
});

describe('extras sweep', () => {
  const add = (id: string, date: string, over: Partial<AdditionalLessonRecord> = {}): AdditionalLessonRecord => ({
    id, date, studentId: 'recA', isRevisionMakeup: false, notes: '', billed: false, ...over,
  });
  it('sweeps every unbilled extra dated before the cut, older ones included', () => {
    const pool = [add('sep', '2026-09-20'), add('oct', '2026-10-27'), add('nov', '2026-11-02'), add('billed', '2026-10-01', { billed: true }), add('rev', '2026-10-02', { isRevisionMakeup: true }), add('b', '2026-10-05', { studentId: 'recB' })];
    expect(sweepAdditionalFor(pool, 'recA', '2026-11-01').map((l) => l.id)).toEqual(['sep', 'oct']);
  });
  it('the cut is exclusive: an extra ON the first of the next month waits for the next run', () => {
    expect(sweepAdditionalFor([add('edge', '2026-11-01')], 'recA', '2026-11-01')).toEqual([]);
    expect(sweepAdditionalFor([add('last', '2026-10-31')], 'recA', '2026-11-01').map((l) => l.id)).toEqual(['last']);
  });
});

describe('arrearsMachineryCovers — where the machinery starts (regenerate-invoice consults this first)', () => {
  it('October 2026 is the first covered month; September and June 2026 rebuild the old way', () => {
    expect(arrearsMachineryCovers(2026, 10)).toBe(true);
    expect(arrearsMachineryCovers(2026, 9)).toBe(false);
    expect(arrearsMachineryCovers(2026, 6)).toBe(false);
  });
  it('every later month is covered, across the year boundary', () => {
    expect(arrearsMachineryCovers(2026, 12)).toBe(true);
    expect(arrearsMachineryCovers(2027, 1)).toBe(true);
    expect(arrearsMachineryCovers(2027, 10)).toBe(true);
  });
  it('a 2025 month is never covered', () => {
    expect(arrearsMachineryCovers(2025, 11)).toBe(false);
  });
});

describe('arrearsBillMonthEnded — the pre-end guard', () => {
  it('a cron run on the 1st always targets a finished month', () => {
    expect(arrearsBillMonthEnded(arrearsRunTarget('2026-11-01'), '2026-11-01')).toBe(true);
    expect(arrearsBillMonthEnded(arrearsRunTarget('2026-12-01'), '2026-12-01')).toBe(true);
    expect(arrearsBillMonthEnded(arrearsRunTarget('2027-01-01'), '2027-01-01')).toBe(true);
  });
  it('a manual run for the current month is refused until the month ends', () => {
    const t = arrearsTargetForMonth(2026, 10);
    expect(arrearsBillMonthEnded(t, '2026-10-20')).toBe(false);
    expect(arrearsBillMonthEnded(t, '2026-10-31')).toBe(false);
    expect(arrearsBillMonthEnded(t, '2026-11-01')).toBe(true);
    expect(arrearsBillMonthEnded(t, '2026-11-15')).toBe(true);
  });
  it('the combined January target is judged on December', () => {
    const t = arrearsTargetForMonth(2027, 1);
    expect(arrearsBillMonthEnded(t, '2026-12-31')).toBe(false);
    expect(arrearsBillMonthEnded(t, '2027-01-01')).toBe(true);
  });
});

describe('unmarked lessons — still Scheduled after the month', () => {
  const rec = (studentId: string, date: string, type = 'Regular'): ArrearsLessonRecord =>
    ({ id: `${studentId}-${date}`, date, studentId, type, billingMonth: '', isMakeup: false, slotId: null });

  it('asks for Scheduled Regular/Rescheduled lessons in a half-open month window', () => {
    const f = unmarkedArrearsFormula(2026, 10);
    expect(f).toContain(`{Status}='Scheduled'`);
    expect(f).toContain(`{Type}='Regular'`);
    expect(f).toContain(`{Type}='Rescheduled'`);
    expect(f).toContain(`{Date}>='2026-10-01'`);
    expect(f).toContain(`{Date}<'2026-11-01'`);
    expect(f).not.toContain('<=');
  });
  it('groups dates per student, sorted, ignoring other lesson types', () => {
    const m = unmarkedByStudent([
      rec('a', '2026-10-20'), rec('a', '2026-10-06'), rec('b', '2026-10-13', 'Rescheduled'),
      rec('a', '2026-10-27', 'Additional'), rec('c', '2026-10-27', 'Trial'),
    ]);
    expect(m.get('a')).toEqual(['2026-10-06', '2026-10-20']);
    expect(m.get('b')).toEqual(['2026-10-13']);
    expect(m.has('c')).toBe(false);
  });
});

describe('review notes + the send cron hold reasons', () => {
  it('the attended-lessons note names the bill month', () => {
    expect(attendedReviewNote('October 2026')).toBe('Billed for the lessons attended in October 2026.');
  });
  it('classifies the notes this module writes, and nothing else', () => {
    expect(yearEndHoldReason(examCutoffNote({ iso: '2026-10-28', paper: 'O-Level A Math Paper 2' }))).toBe('exam cut-off');
    expect(yearEndHoldReason(attendedReviewNote('October 2026'))).toBe('attended lessons (exam-year student)');
    expect(yearEndHoldReason('Additional lessons: Tue 6 Oct')).toBeNull();
    expect(yearEndHoldReason('')).toBeNull();
  });
});

describe('advanceRunNote — what the 12th/13th reminders say', () => {
  it('is silent outside the year-end months', () => {
    expect(advanceRunNote(2026, 9)).toBeNull();
    expect(advanceRunNote(2027, 2)).toBeNull();
    expect(advanceRunNote(2026, 6)).toBeNull();
  });
  it('October 2026: non-exam-year in arrears on 1 Nov; Sec 4/5 cut at their papers; JC2 as usual', () => {
    const n = advanceRunNote(2026, 10)!;
    expect(n).toContain('NO October draft');
    expect(n).toContain('1 November');
    expect(n).toContain(`E Math up to ${humanDate('2026-10-23')}`);
    expect(n).toContain(`A Math up to ${humanDate('2026-10-28')}`);
    expect(n).toContain('JC2: as usual');
  });
  it('November 2026: Sec 4/5 exams over; JC2 cut at H1/H2', () => {
    const n = advanceRunNote(2026, 11)!;
    expect(n).toContain('Sec 4/5: exams over, no invoice');
    expect(n).toContain(`H1 up to ${humanDate('2026-11-03')}`);
    expect(n).toContain(`H2 up to ${humanDate('2026-11-06')}`);
    expect(n).toContain('1 December');
  });
  it('December 2026: both groups past their exams; arrears on 1 Jan', () => {
    const n = advanceRunNote(2026, 12)!;
    expect(n).toContain('Sec 4/5: exams over, no invoice');
    expect(n).toContain('JC2: exams over, no invoice');
    expect(n).toContain('1 January');
  });
  it('January: the combined invoice', () => {
    expect(advanceRunNote(2027, 1)).toContain('ONE invoice on 1 Jan');
  });
  it('warns when the year has no cut-off row', () => {
    expect(advanceRunNote(2027, 10)).toContain('no EXAM_CUTOFFS row for 2027');
  });
});
