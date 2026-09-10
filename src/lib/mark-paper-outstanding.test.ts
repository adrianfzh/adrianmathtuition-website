import { describe, it, expect } from 'vitest';
import { isOutstandingRun, sheetInProgress } from './mark-paper-outstanding';

const released = { released_at: '2026-09-09T10:00:00Z', archived_at: null, checked_at: '2026-09-09T12:00:00Z' };

describe('mark-paper "Still to deal with" (31 Aug + 10 Sep 2026)', () => {
  it('not finished with: unreleased, unarchived, unticked', () => {
    expect(isOutstandingRun({ released_at: null, archived_at: null, checked_at: null })).toBe(true);
    expect(isOutstandingRun({ released_at: null, archived_at: null, checked_at: '2026-09-09T12:00:00Z' })).toBe(false);
    expect(isOutstandingRun(released)).toBe(false);
    expect(isOutstandingRun({ released_at: null, archived_at: '2026-09-09T12:00:00Z', checked_at: null })).toBe(false);
  });
  it('a sheet being generated pulls a done paper back, and lets it go once filed', () => {
    expect(isOutstandingRun({ ...released, sheet_status: 'queued' })).toBe(true);
    expect(isOutstandingRun({ ...released, sheet_status: 'claimed' })).toBe(true);
    expect(isOutstandingRun({ ...released, sheet_status: 'failed' })).toBe(true);
    expect(isOutstandingRun({ ...released, sheet_status: 'done' })).toBe(false);
    expect(isOutstandingRun({ ...released, sheet_status: 'cancelled' })).toBe(false);
    expect(isOutstandingRun({ ...released, sheet_status: null })).toBe(false);
  });
  it('sheetInProgress is the one test for "in motion"', () => {
    expect(sheetInProgress({ sheet_status: 'queued' })).toBe(true);
    expect(sheetInProgress({ sheet_status: 'done' })).toBe(false);
    expect(sheetInProgress(null)).toBe(false);
  });
});
