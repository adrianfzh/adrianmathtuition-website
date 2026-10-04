import { describe, it, expect } from 'vitest';
import { RETENTION_MONTHS, retentionCutoffIso, latestActivityIso, isExpired } from './retention';

describe('retentionCutoffIso', () => {
  it('is exactly 12 months back for a mid-month date', () => {
    expect(retentionCutoffIso(new Date('2026-08-21T03:00:00Z'))).toBe('2025-08-21T03:00:00.000Z');
  });
  it('clamps 29 Feb to 28 Feb when the target year is not a leap year', () => {
    expect(retentionCutoffIso(new Date('2028-02-29T12:00:00Z'))).toBe('2027-02-28T12:00:00.000Z');
  });
  it('window is 12 months', () => {
    expect(RETENTION_MONTHS).toBe(12);
  });
});

describe('latestActivityIso / isExpired', () => {
  const cutoff = '2025-08-21T00:00:00.000Z';
  it('picks the newest of attempt time and last login', () => {
    expect(latestActivityIso('2025-01-01T00:00:00Z', '2026-03-01T00:00:00Z')).toBe('2026-03-01T00:00:00Z');
    expect(latestActivityIso(null, '2024-01-01T00:00:00Z')).toBe('2024-01-01T00:00:00Z');
    expect(latestActivityIso(null, undefined)).toBe(null);
    expect(latestActivityIso('garbage', '2024-01-01T00:00:00Z')).toBe('2024-01-01T00:00:00Z');
  });
  it('a recent login keeps old attempts alive', () => {
    expect(isExpired(latestActivityIso('2024-06-01T00:00:00Z', '2026-08-01T00:00:00Z'), cutoff)).toBe(false);
  });
  it('activity older than the window is expired; unknown activity is expired', () => {
    expect(isExpired('2025-08-20T23:59:59Z', cutoff)).toBe(true);
    expect(isExpired(null, cutoff)).toBe(true);
  });
  it('activity exactly at the cutoff is kept (strictly-older rule)', () => {
    expect(isExpired(cutoff, cutoff)).toBe(false);
  });
});

import { notebookExpired } from './retention';
describe('notebookExpired (5 Oct 2026)', () => {
  it('never clears a bench / calibration identity (calib:…), only students', () => {
    expect(notebookExpired({ identity: 'calib:h1-01', currentTuition: false, lastNotebook: '2020-01-01T00:00:00.000Z' }, '2025-10-05T00:00:00.000Z')).toBe(false);
  });
  const cutoff = '2025-10-05T00:00:00.000Z';
  const old = '2025-01-01T00:00:00.000Z';
  const recent = '2026-09-01T00:00:00.000Z';
  it('never clears a current tuition student, however quiet', () => {
    expect(notebookExpired({ identity: 'recAAAAAAAAAAAAAA', currentTuition: true, lastLogin: old, lastNotebook: old }, cutoff)).toBe(false);
  });
  it('clears an identity quiet on every count for over 12 months', () => {
    expect(notebookExpired({ identity: 'acct:00000000-0000-0000-0000-000000000000', currentTuition: false, lastLogin: old, lastAttempt: old, lastHandIn: old, lastNotebook: old }, cutoff)).toBe(true);
  });
  it('a recent hand-in (Telegram-only student) keeps it', () => {
    expect(notebookExpired({ identity: 'recBBBBBBBBBBBBBB', currentTuition: false, lastLogin: null, lastHandIn: recent, lastNotebook: old }, cutoff)).toBe(false);
  });
  it('recent notebook use keeps it', () => {
    expect(notebookExpired({ identity: 'recBBBBBBBBBBBBBB', currentTuition: false, lastLogin: old, lastNotebook: recent }, cutoff)).toBe(false);
  });
  it('no datable activity at all keeps it (a failed lookup must not delete)', () => {
    expect(notebookExpired({ identity: 'recCCCCCCCCCCCCCC', currentTuition: false }, cutoff)).toBe(false);
  });
});
