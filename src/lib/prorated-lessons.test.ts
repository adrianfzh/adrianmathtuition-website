import { describe, it, expect } from 'vitest';
import { mapProratedRecord, proratedLessonsFor, proratedMonthFormula, type ProratedLessonRecord } from './prorated-lessons';

describe('proratedMonthFormula', () => {
  // REGRESSION (found 2026-09-02) — generate-invoices' prorated branch
  // filtered Lessons with {Student}='recXXX'. Linked-record fields coerce to
  // their display name in Airtable formulas, so that clause matches NOTHING:
  // every prorated month (June/Oct–Dec) found 0 Completed lessons for every
  // student, and the branch never billed a single regular lesson. The formula
  // must fetch the whole month with NO student clause; the student link is
  // matched in JS (proratedLessonsFor) — same fix as lib/additional-lessons.ts.
  it('never filters by the linked Student field', () => {
    expect(proratedMonthFormula(2026, 10)).not.toContain('{Student}');
  });

  // REGRESSION (found 2026-09-02) — the same branch ended its window with
  // {Date}<='2026-10-31'; on Airtable date-typed fields the inclusive form
  // silently drops lessons ON the month's last day. The window must be
  // half-open at the first of the next month.
  it('uses a half-open window ending at the first of the next month', () => {
    expect(proratedMonthFormula(2026, 10)).toBe(
      "AND({Type}='Regular',{Status}='Completed',{Date}>='2026-10-01',{Date}<'2026-11-01')"
    );
  });

  it('rolls the December window over the year end', () => {
    expect(proratedMonthFormula(2026, 12)).toContain("{Date}<'2027-01-01'");
  });

  it('zero-pads June (the other prorated month)', () => {
    expect(proratedMonthFormula(2026, 6)).toContain("{Date}>='2026-06-01',{Date}<'2026-07-01'");
  });
});

describe('proratedLessonsFor', () => {
  const rec = (over: Partial<ProratedLessonRecord>): ProratedLessonRecord => ({
    id: 'rec1', date: '2026-10-05', studentId: 'recStudent', ...over,
  });

  it('matches lessons by the student record id from the link array', () => {
    const pool = [
      rec({ id: 'a', studentId: 'recA', date: '2026-10-05' }),
      rec({ id: 'b', studentId: 'recB', date: '2026-10-06' }),
      rec({ id: 'c', studentId: 'recA', date: '2026-10-12' }),
      rec({ id: 'd', studentId: null }),
    ];
    expect(proratedLessonsFor(pool, 'recA').map(l => l.id)).toEqual(['a', 'c']);
  });

  it('sorts by date ascending for the invoice line items', () => {
    const pool = [rec({ id: 'later', date: '2026-10-26' }), rec({ id: 'earlier', date: '2026-10-05' })];
    expect(proratedLessonsFor(pool, 'recStudent').map(l => l.id)).toEqual(['earlier', 'later']);
  });

  // The formula test above keeps a last-day lesson IN the fetched pool;
  // this pins that the JS side doesn't drop it either.
  it('keeps a lesson dated on the last day of the month', () => {
    const pool = [rec({ id: 'boundary', date: '2026-10-31' })];
    expect(proratedLessonsFor(pool, 'recStudent').map(l => l.id)).toEqual(['boundary']);
  });
});

describe('mapProratedRecord', () => {
  it('maps the Airtable record shape incl. the linked-student array', () => {
    expect(mapProratedRecord({ id: 'recL', fields: { 'Date': '2026-10-31', 'Student': ['recS'] } }))
      .toEqual({ id: 'recL', date: '2026-10-31', studentId: 'recS' });
  });

  it('is safe on missing fields', () => {
    expect(mapProratedRecord({ id: 'recL', fields: {} }))
      .toEqual({ id: 'recL', date: '', studentId: null });
  });
});
