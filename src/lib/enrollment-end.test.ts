import { describe, it, expect } from 'vitest';
import {
  enrollmentsDueToEnd,
  studentsLeftWithoutEnrollment,
  endSummaryLine,
  type EnrollmentRow,
  type StudentRow,
} from './enrollment-end';

const e = (id: string, studentId: string | null, status: string | null, endDate: string | null): EnrollmentRow => ({
  id, studentId, status, endDate,
});

describe('enrollmentsDueToEnd', () => {
  it('ends an Active enrollment whose End Date is in the past', () => {
    const rows = [e('e1', 's1', 'Active', '2026-10-28')];
    expect(enrollmentsDueToEnd(rows, '2026-10-29').map((r) => r.id)).toEqual(['e1']);
  });

  it('leaves the enrollment alone ON its End Date — End Date is INCLUSIVE', () => {
    // regression: the Sec 4 cohort's last lesson falls ON the end date (28 Oct 2026).
    // Ending that morning would delete the lesson the parent already paid for.
    const rows = [e('e1', 's1', 'Active', '2026-10-28')];
    expect(enrollmentsDueToEnd(rows, '2026-10-28')).toEqual([]);
  });

  it('never touches an open-ended enrollment', () => {
    const rows = [e('e1', 's1', 'Active', null), e('e2', 's2', 'Active', '')];
    expect(enrollmentsDueToEnd(rows, '2027-01-01')).toEqual([]);
  });

  it('ignores enrollments that are already Ended', () => {
    const rows = [e('e1', 's1', 'Ended', '2026-01-01')];
    expect(enrollmentsDueToEnd(rows, '2026-10-29')).toEqual([]);
  });

  it('fails closed on a malformed End Date or today', () => {
    expect(enrollmentsDueToEnd([e('e1', 's1', 'Active', '28/10/2026')], '2026-10-29')).toEqual([]);
    expect(enrollmentsDueToEnd([e('e1', 's1', 'Active', '2026-10-28')], 'today')).toEqual([]);
  });
});

describe('studentsLeftWithoutEnrollment', () => {
  const students: StudentRow[] = [
    { id: 's1', name: 'One Slot', status: 'Active' },
    { id: 's2', name: 'Two Slots', status: 'Active' },
    { id: 's3', name: 'Already Inactive', status: 'Inactive' },
  ];

  it('deactivates a student whose only enrollment just ended', () => {
    const all = [e('e1', 's1', 'Active', '2026-10-28')];
    const out = studentsLeftWithoutEnrollment(all, ['e1'], students);
    expect(out.map((s) => s.id)).toEqual(['s1']);
  });

  it('leaves a student who keeps a second Active enrollment', () => {
    const all = [e('e1', 's2', 'Active', '2026-10-28'), e('e2', 's2', 'Active', null)];
    expect(studentsLeftWithoutEnrollment(all, ['e1'], students)).toEqual([]);
  });

  it('does not re-flip a student who is already Inactive', () => {
    const all = [e('e1', 's3', 'Active', '2026-10-28')];
    expect(studentsLeftWithoutEnrollment(all, ['e1'], students)).toEqual([]);
  });

  it('ignores students none of whose enrollments are ending', () => {
    const all = [e('e1', 's1', 'Active', '2026-10-28'), e('e9', 's2', 'Ended', null)];
    expect(studentsLeftWithoutEnrollment(all, ['e1'], students).map((s) => s.id)).toEqual(['s1']);
  });
});

describe('endSummaryLine', () => {
  it('is empty on a quiet day so the cron stays silent', () => {
    expect(endSummaryLine([], [])).toBe('');
  });

  it('names each ended enrollment and the students left without one', () => {
    const out = endSummaryLine(
      [{ name: 'Alexis Wong', endDate: '2026-10-28' }, { name: 'Tin Tze Hin', endDate: '2026-10-23' }],
      [{ name: 'Tin Tze Hin' }],
    );
    expect(out).toContain('🎓 Enrollments ended (2)');
    expect(out).toContain('• Alexis Wong — ended 2026-10-28');
    expect(out).toContain('Now Inactive (no enrollment left): Tin Tze Hin');
  });
});
