import { describe, it, expect } from 'vitest';
import {
  leavingStatus, isFinalYearLevel, finalExtras, invoicedDates, finalExtrasNote,
  isFinalExtrasInvoice, finalExtrasMonth, FINAL_EXTRAS_NOTE_RE, type ExtraLessonRow,
} from './graduation';

const row = (over: Partial<ExtraLessonRow>): ExtraLessonRow => ({
  id: 'rec1', date: '2026-09-25', studentId: 'recKAYLA', status: 'Completed',
  billed: false, isRevisionMakeup: false, notes: '', ...over,
});

describe('leavingStatus', () => {
  it('a Sec 4 (IP too) leaving in the exam season has graduated (Kayla, 29 Sep 2026)', () => {
    expect(leavingStatus('Sec 4', '2026-09-29')).toBe('Graduated');
    expect(leavingStatus('JC2', '2026-11-06')).toBe('Graduated');
    expect(leavingStatus('Sec 5', '2026-10-28')).toBe('Graduated');
  });
  it('a Sec 4 stopping in March has left, not graduated', () => {
    expect(leavingStatus('Sec 4', '2026-03-15')).toBe('Inactive');
  });
  it('non-final years and bad dates stay Inactive', () => {
    expect(leavingStatus('Sec 3', '2026-11-01')).toBe('Inactive');
    expect(leavingStatus('JC1', '2026-11-01')).toBe('Inactive');
    expect(leavingStatus('Sec 4', '')).toBe('Inactive');
    expect(leavingStatus(null, '2026-10-01')).toBe('Inactive');
  });
  it('recognises the final-year labels', () => {
    expect(isFinalYearLevel(' sec 4 ')).toBe(true);
    expect(isFinalYearLevel('Sec 1')).toBe(false);
  });
});

describe('finalExtras', () => {
  it("bills Kayla's attended 25 Sep extra that no invoice carries", () => {
    const { bill, unmarked } = finalExtras([row({})], 'recKAYLA', '2026-09-29', new Set(['2026-09-07', '2026-09-14']));
    expect(bill.map((l) => l.date)).toEqual(['2026-09-25']);
    expect(unmarked).toEqual([]);
  });
  it('never bills a lesson already marked billed, or already on an invoice by date', () => {
    const pool = [row({ id: 'a', billed: true }), row({ id: 'b', date: '2026-09-18' })];
    const { bill } = finalExtras(pool, 'recKAYLA', '2026-09-29', new Set(['2026-09-18']));
    expect(bill).toEqual([]);
  });
  it('lists a past extra still at Scheduled instead of billing it blind', () => {
    const { bill, unmarked } = finalExtras([row({ status: 'Scheduled' })], 'recKAYLA', '2026-09-29', new Set());
    expect(bill).toEqual([]);
    expect(unmarked.map((l) => l.date)).toEqual(['2026-09-25']);
  });
  it('ignores other students, revision makeups, absences and lessons after the end date', () => {
    const pool = [
      row({ id: 'x', studentId: 'recOTHER' }),
      row({ id: 'y', isRevisionMakeup: true }),
      row({ id: 'z', notes: 'Revision makeup' }),
      row({ id: 'w', status: 'Absent' }),
      row({ id: 'v', date: '2026-10-02' }),
    ];
    const { bill, unmarked } = finalExtras(pool, 'recKAYLA', '2026-09-29', new Set());
    expect(bill).toEqual([]);
    expect(unmarked).toEqual([]);
  });
});

describe('invoicedDates', () => {
  it('collects line-item dates from live invoices and skips voided ones', () => {
    const dates = invoicedDates([
      { fields: { Status: 'Sent', 'Line Items': JSON.stringify([{ date: '2026-09-07' }]), 'Line Items Extra': JSON.stringify([{ date: '2026-09-25' }]) } },
      { fields: { Status: 'Voided', 'Line Items': JSON.stringify([{ date: '2026-10-04' }]) } },
      { fields: { Status: 'Sent', 'Line Items': 'not json' } },
    ]);
    expect([...dates].sort()).toEqual(['2026-09-07', '2026-09-25']);
  });
});

describe('the final-extras invoice', () => {
  it('writes the note the PDF prints, and the send cron can recognise', () => {
    expect(finalExtrasNote(['2026-09-25'])).toBe('Additional lesson on 25 September 2026.');
    expect(finalExtrasNote(['2026-10-02', '2026-09-18', '2026-09-25'])).toBe('Additional lessons on 18 and 25 September; 2 October 2026.');
    expect(FINAL_EXTRAS_NOTE_RE.test(finalExtrasNote(['2026-09-25']))).toBe(true);
    expect(finalExtrasMonth(['2026-09-18', '2026-09-25'])).toBe('September 2026');
  });
  it('is sent unattended only when nothing else is on it', () => {
    const clean = { 'Invoice Type': 'Adjustment', 'Auto Notes': 'Additional lesson on 25 September 2026.', 'Final Amount': 70 };
    expect(isFinalExtrasInvoice(clean)).toBe(true);
    expect(isFinalExtrasInvoice({ ...clean, 'Invoice Type': 'Regular' })).toBe(false);
    expect(isFinalExtrasInvoice({ ...clean, 'Auto Notes': 'Lessons on 13 July.' })).toBe(false);
    expect(isFinalExtrasInvoice({ ...clean, 'Final Amount': 0 })).toBe(false);
    expect(isFinalExtrasInvoice({ ...clean, 'Adjustment Amount': -10 })).toBe(false);
    expect(isFinalExtrasInvoice({ ...clean, 'Custom Email Message': 'Hi' })).toBe(false);
  });
});
