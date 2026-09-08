import { describe, it, expect } from 'vitest';
import { markingQueueState, finishedBecause, type QueueRunRow } from './marking-queue-state';

const NOW = Date.parse('2026-09-09T12:00:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function row(over: Partial<QueueRunRow> = {}): QueueRunRow {
  return { id: 'r1', created_at: minsAgo(10), queue_status: 'queued', paper_name: 'a paper', ...over };
}

describe('finishedBecause', () => {
  it('calls a released paper released', () => {
    expect(finishedBecause(row({ released_at: minsAgo(1) }))).toBe('released');
  });
  it('calls an archived paper archived', () => {
    expect(finishedBecause(row({ archived_at: minsAgo(1) }))).toBe('archived');
  });
  it('calls a paper with a total marked', () => {
    expect(finishedBecause(row({ total_max: 80 }))).toBe('marked');
  });
  it('leaves a genuinely waiting paper alone', () => {
    expect(finishedBecause(row())).toBeNull();
  });
  it('prefers released over the other reasons when several apply', () => {
    expect(finishedBecause(row({ released_at: minsAgo(1), archived_at: minsAgo(2), total_max: 80 }))).toBe('released');
  });
});

describe('markingQueueState', () => {
  it('is empty when nothing is queued', () => {
    const s = markingQueueState([row({ queue_status: null }), row({ queue_status: 'done' })], NOW);
    expect(s).toMatchObject({ pending: 0, oldestMinutes: null, rows: [], stale: [] });
  });

  it('counts and lists only papers genuinely waiting', () => {
    const s = markingQueueState([
      row({ id: 'wait', created_at: minsAgo(30), paper_name: 'p1', student_name: 'Sophie' }),
      row({ id: 'gone', released_at: minsAgo(1), paper_name: 'p2' }),
    ], NOW);
    expect(s.pending).toBe(1);
    expect(s.rows.map(r => r.id)).toEqual(['wait']);
    expect(s.rows[0]).toMatchObject({ paper: 'p1', student: 'Sophie', waitingMinutes: 30 });
  });

  // The 9 Sep 2026 regression: three rows said `queued` long after their papers
  // were released or archived, and every screen showed "empty" because nothing
  // read the column. A stale flag must be visible, never silently dropped.
  it('surfaces a queued flag on a finished paper instead of hiding it', () => {
    const s = markingQueueState([
      row({ id: 'a', released_at: minsAgo(5), paper_name: 'sophie am tys 2021 p1' }),
      row({ id: 'b', archived_at: minsAgo(5), paper_name: 'kassandra p2' }),
      row({ id: 'c', total_max: 80, paper_name: 'kassandra p1' }),
    ], NOW);
    expect(s.pending).toBe(0);
    expect(s.stale).toEqual([
      { id: 'a', paper: 'sophie am tys 2021 p1', because: 'released' },
      { id: 'b', paper: 'kassandra p2', because: 'archived' },
      { id: 'c', paper: 'kassandra p1', because: 'marked' },
    ]);
  });

  it('orders waiting papers oldest first, the picker’s own order', () => {
    const s = markingQueueState([
      row({ id: 'new', created_at: minsAgo(5) }),
      row({ id: 'old', created_at: minsAgo(500) }),
      row({ id: 'mid', created_at: minsAgo(50) }),
    ], NOW);
    expect(s.rows.map(r => r.id)).toEqual(['old', 'mid', 'new']);
    expect(s.oldestMinutes).toBe(500);
  });

  it('carries the claim and the failure reason so a wedged paper is legible', () => {
    const s = markingQueueState([
      row({ claimed_by: 'slot2', queue_attempts: 2, queue_failed_reason: 'groundingSource is not defined' }),
    ], NOW);
    expect(s.rows[0]).toMatchObject({ claimedBy: 'slot2', attempts: 2, failedReason: 'groundingSource is not defined' });
  });

  it('never reports a negative wait for a row stamped in the future', () => {
    const s = markingQueueState([row({ created_at: new Date(NOW + 60_000).toISOString() })], NOW);
    expect(s.rows[0].waitingMinutes).toBe(0);
  });

  it('names an unnamed paper rather than rendering a blank', () => {
    expect(markingQueueState([row({ paper_name: '  ' })], NOW).rows[0].paper).toBe('(unnamed paper)');
    expect(markingQueueState([row({ paper_name: null })], NOW).rows[0].paper).toBe('(unnamed paper)');
  });
});
