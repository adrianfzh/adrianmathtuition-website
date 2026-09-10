import { describe, it, expect } from 'vitest';
import { isOutstandingRun, sheetInProgress, markingInProgress } from './mark-paper-outstanding';

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

// 10 Sep 2026 (Adrian: "so remarks does not show? it should also show"): a
// re-mark of a released paper is in motion while its queue record is live and
// its total is cleared — it rides Still to deal with until the marking lands.
describe('markingInProgress — a re-mark of a released paper is still to deal with', () => {
  const released = { released_at: '2026-09-10T12:05:00Z', archived_at: null, checked_at: '2026-09-10T12:10:00Z' };
  it('a queued re-mark with no total is outstanding, whatever its release state', () => {
    expect(markingInProgress({ ...released, queued_at: '2026-09-10T12:51:00Z', total_max: null })).toBe(true);
    expect(isOutstandingRun({ ...released, queued_at: '2026-09-10T12:51:00Z', total_max: null })).toBe(true);
  });
  it('the moment the marking lands (a total is stored) it goes back to Done', () => {
    expect(markingInProgress({ ...released, queued_at: '2026-09-10T12:51:00Z', total_max: 90 })).toBe(false);
    expect(isOutstandingRun({ ...released, queued_at: '2026-09-10T12:51:00Z', total_max: 90 })).toBe(false);
  });
  it('a queue that failed for good is not in motion', () => {
    expect(markingInProgress({ ...released, queued_at: '2026-09-10T12:51:00Z', total_max: null, queue_failed: '2026-09-10T13:00:00Z' })).toBe(false);
  });
  it('a paper never queued is judged by the old rule alone', () => {
    expect(markingInProgress({ ...released })).toBe(false);
    expect(isOutstandingRun({ ...released })).toBe(false);
  });
});
