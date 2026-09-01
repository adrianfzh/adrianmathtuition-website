import { describe, it, expect } from 'vitest';
import {
  decideDeactivation,
  groupEnrollmentsByStudent,
  INACTIVITY_DAYS,
  type EnrollmentLite,
} from './deactivate-inactive';

const ended = (endDate: string | null): EnrollmentLite => ({ status: 'Ended', endDate });
const active = (): EnrollmentLite => ({ status: 'Active', endDate: null });

describe('decideDeactivation', () => {
  const now = new Date('2026-09-02T12:00:00Z');

  it('keeps a student with an Active enrollment', () => {
    expect(decideDeactivation([active()], now)).toEqual({
      action: 'keep',
      reason: 'active-enrollment',
    });
  });

  it('keeps a student whose Active enrollment sits alongside an old Ended one', () => {
    expect(decideDeactivation([ended('2025-01-31'), active()], now)).toEqual({
      action: 'keep',
      reason: 'active-enrollment',
    });
  });

  it('an Active enrollment wins even if it carries a (future) End Date', () => {
    // A scheduled discontinuation: still Active today.
    const e: EnrollmentLite = { status: 'Active', endDate: '2026-09-30' };
    expect(decideDeactivation([e], now)).toEqual({
      action: 'keep',
      reason: 'active-enrollment',
    });
  });

  it('deactivates when the enrollment ended exactly 30 days ago (boundary)', () => {
    // '2026-08-01' parses as 2026-08-01T00:00:00Z; +30 days = 2026-08-31T00:00:00Z.
    const exactly30 = new Date('2026-08-31T00:00:00Z');
    expect(decideDeactivation([ended('2026-08-01')], exactly30)).toEqual({
      action: 'deactivate',
      lastEnrollmentEnd: '2026-08-01',
    });
  });

  it('keeps one second short of the 30-day boundary', () => {
    const justUnder = new Date('2026-08-30T23:59:59Z');
    expect(decideDeactivation([ended('2026-08-01')], justUnder)).toEqual({
      action: 'keep',
      reason: 'ended-recently',
    });
  });

  it('deactivates well past 30 days and reports the end date', () => {
    expect(decideDeactivation([ended('2026-06-15')], now)).toEqual({
      action: 'deactivate',
      lastEnrollmentEnd: '2026-06-15',
    });
  });

  it('the LATEST end date governs when several enrollments ended', () => {
    // One ended long ago, one 10 days ago → still within the grace window.
    expect(decideDeactivation([ended('2026-01-10'), ended('2026-08-23')], now)).toEqual({
      action: 'keep',
      reason: 'ended-recently',
    });
    // Both ≥30 days back → deactivate, reporting the newer date.
    expect(decideDeactivation([ended('2026-01-10'), ended('2026-07-20')], now)).toEqual({
      action: 'deactivate',
      lastEnrollmentEnd: '2026-07-20',
    });
  });

  it('keeps when the end date is in the future (scheduled discontinuation)', () => {
    expect(decideDeactivation([ended('2026-12-31')], now)).toEqual({
      action: 'keep',
      reason: 'ended-recently',
    });
  });

  it('keeps a student with no enrollments at all (departure undatable)', () => {
    expect(decideDeactivation([], now)).toEqual({ action: 'keep', reason: 'no-end-date' });
  });

  it('keeps when an Ended enrollment has no End Date — even alongside a dated old one', () => {
    // The undated one might have ended yesterday; we cannot prove 30 days.
    expect(decideDeactivation([ended(null)], now)).toEqual({
      action: 'keep',
      reason: 'no-end-date',
    });
    expect(decideDeactivation([ended('2025-11-01'), ended(null)], now)).toEqual({
      action: 'keep',
      reason: 'no-end-date',
    });
  });

  it('treats a garbage End Date like a missing one (fail-safe)', () => {
    expect(decideDeactivation([ended('not a date')], now)).toEqual({
      action: 'keep',
      reason: 'no-end-date',
    });
  });

  it('a null/unknown Status counts as not active — dated → 30-day rule applies', () => {
    const weird: EnrollmentLite = { status: null, endDate: '2026-06-01' };
    expect(decideDeactivation([weird], now)).toEqual({
      action: 'deactivate',
      lastEnrollmentEnd: '2026-06-01',
    });
  });

  it('INACTIVITY_DAYS is the agreed 30', () => {
    expect(INACTIVITY_DAYS).toBe(30);
  });
});

describe('groupEnrollmentsByStudent', () => {
  it('groups by the linked Student rec id and reads Status + End Date', () => {
    const map = groupEnrollmentsByStudent([
      { id: 'e1', fields: { Student: ['recAAA'], Status: 'Ended', 'End Date': '2026-05-01' } },
      { id: 'e2', fields: { Student: ['recAAA'], Status: 'Active' } },
      { id: 'e3', fields: { Student: ['recBBB'], Status: 'Ended' } },
    ]);
    expect(map.get('recAAA')).toEqual([
      { status: 'Ended', endDate: '2026-05-01' },
      { status: 'Active', endDate: null },
    ]);
    expect(map.get('recBBB')).toEqual([{ status: 'Ended', endDate: null }]);
  });

  it('skips records with no Student link and tolerates missing fields', () => {
    const map = groupEnrollmentsByStudent([
      { id: 'e1', fields: {} },
      { id: 'e2', fields: { Student: [] } },
    ]);
    expect(map.size).toBe(0);
  });

  it('an enrollment linked to two students counts for both', () => {
    const map = groupEnrollmentsByStudent([
      { id: 'e1', fields: { Student: ['recAAA', 'recBBB'], Status: 'Ended', 'End Date': '2026-01-01' } },
    ]);
    expect(map.get('recAAA')).toEqual([{ status: 'Ended', endDate: '2026-01-01' }]);
    expect(map.get('recBBB')).toEqual([{ status: 'Ended', endDate: '2026-01-01' }]);
  });
});
