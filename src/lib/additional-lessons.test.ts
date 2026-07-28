import { describe, it, expect } from 'vitest';
import { billableAdditionalFor, mapAdditionalRecord } from './additional-lessons';

const rec = (over: Partial<ReturnType<typeof mapAdditionalRecord>>) => ({
  id: 'rec1', date: '2026-07-12', studentId: 'recStudent', isRevisionMakeup: false, notes: '', billed: false, ...over,
});

describe('billableAdditionalFor', () => {
  // REGRESSION — Tan Heng Kang, Jul 2026: the generator filtered Lessons with
  // {Student}='recXXX' in the Airtable formula, which matches nothing on a
  // linked field. 11 completed Additional lessons across 3 students were never
  // billed (0 of 315 invoices ever carried an Additional line item). Matching
  // the student link in JS is the fix; this pins it.
  it('matches lessons by the student record id from the link array', () => {
    const pool = [
      rec({ id: 'a', studentId: 'recHengKang', date: '2026-07-12' }),
      rec({ id: 'b', studentId: 'recSomeoneElse', date: '2026-07-13' }),
      rec({ id: 'c', studentId: 'recHengKang', date: '2026-07-19' }),
      rec({ id: 'd', studentId: null, date: '2026-07-14' }),
    ];
    expect(billableAdditionalFor(pool, 'recHengKang').map(l => l.id)).toEqual(['a', 'c']);
  });

  it('excludes revision makeups via the structured flag', () => {
    const pool = [rec({ id: 'a', isRevisionMakeup: true }), rec({ id: 'b' })];
    expect(billableAdditionalFor(pool, 'recStudent').map(l => l.id)).toEqual(['b']);
  });

  it('excludes revision makeups via the legacy note text, case-insensitively', () => {
    const pool = [rec({ id: 'a', notes: 'Revision Makeup for 3 Jun' }), rec({ id: 'b', notes: 'extra practice' })];
    expect(billableAdditionalFor(pool, 'recStudent').map(l => l.id)).toEqual(['b']);
  });

  // REGRESSION — Tan Heng Kang, Jul 2026: his 12/17/19 Jul extras were billed
  // on a manual adjustment invoice; the September run's window (15 Jul-14 Aug)
  // still contained 17+19 Jul. The Billed marker — not the window — must be
  // what prevents the second billing.
  it('excludes lessons already marked Billed', () => {
    const pool = [rec({ id: 'billed17', date: '2026-07-17', billed: true }), rec({ id: 'fresh', date: '2026-07-20' })];
    expect(billableAdditionalFor(pool, 'recStudent').map(l => l.id)).toEqual(['fresh']);
  });

  it('sorts by date ascending', () => {
    const pool = [rec({ id: 'later', date: '2026-07-19' }), rec({ id: 'earlier', date: '2026-06-21' })];
    expect(billableAdditionalFor(pool, 'recStudent').map(l => l.id)).toEqual(['earlier', 'later']);
  });
});

describe('mapAdditionalRecord', () => {
  it('maps the Airtable record shape incl. the linked-student array', () => {
    const m = mapAdditionalRecord({
      id: 'recL', fields: { 'Date': '2026-07-12', 'Student': ['recS'], 'Is Revision Makeup': true, 'Notes': 'n', 'Billed': true },
    });
    expect(m).toEqual({ id: 'recL', date: '2026-07-12', studentId: 'recS', isRevisionMakeup: true, notes: 'n', billed: true });
  });
  it('is safe on missing fields', () => {
    const m = mapAdditionalRecord({ id: 'recL', fields: {} });
    expect(m).toEqual({ id: 'recL', date: '', studentId: null, isRevisionMakeup: false, notes: '', billed: false });
  });
});
