import { describe, it, expect } from 'vitest';
import { markingQueueState, finishedBecause, isInFlight, claimMachine, type QueueRunRow } from './marking-queue-state';

const NOW = Date.parse('2026-09-09T01:10:00+08:00');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function row(over: Partial<QueueRunRow> = {}): QueueRunRow {
  return {
    id: 'r1',
    created_at: minsAgo(10),
    paper_name: 'a paper',
    total_max: null,
    queue: { queued_at: minsAgo(10) },
    ...over,
  };
}

describe('claimMachine', () => {
  it('pulls the hostname out of the claim string', () => {
    expect(claimMachine('mac-plan-Adrians-MacBook-Pro-89778')).toBe('Adrians-MacBook-Pro');
  });
  it('handles a hostname containing digits', () => {
    expect(claimMachine('mac-plan-Mac-Studio-2-4471')).toBe('Mac-Studio-2');
  });
  it('is null for no claim', () => {
    expect(claimMachine(null)).toBeNull();
    expect(claimMachine('')).toBeNull();
  });
});

describe('isInFlight', () => {
  it('is true for a queued, unmarked, unfailed paper', () => {
    expect(isInFlight(row())).toBe(true);
  });
  // The regression this module was rewritten for: a live paper carries
  // result_json.queue but leaves queue_status NULL. Reading the column alone
  // reported "empty" while two of Alexis's papers were actively being marked.
  it('is true even though queue_status is null — the column is not the signal', () => {
    expect(isInFlight(row({ queue_status: null }))).toBe(true);
  });
  it('is false once the paper has a total', () => {
    expect(isInFlight(row({ total_max: 80 }))).toBe(false);
  });
  it('is false when the queue entry failed', () => {
    expect(isInFlight(row({ queue: { queued_at: minsAgo(10), failed_at: minsAgo(1) } }))).toBe(false);
  });
  it('is false with no queue blob at all', () => {
    expect(isInFlight(row({ queue: null }))).toBe(false);
  });
});

describe('markingQueueState', () => {
  it('is empty when nothing is in flight', () => {
    expect(markingQueueState([row({ total_max: 80 }), row({ queue: null })], NOW))
      .toMatchObject({ pending: 0, oldestMinutes: null, rows: [], stale: [] });
  });

  it('lists a claimed paper with its Mac and how long it has been held', () => {
    const s = markingQueueState([row({
      id: 'p1', paper_name: 'alexis am tys 2023 p1', student_name: 'Alexis',
      queue: { queued_at: minsAgo(8), external_claim: { by: 'mac-plan-Adrians-MacBook-Pro-89778', since: minsAgo(7), attempts: 1 } },
    })], NOW);
    expect(s.pending).toBe(1);
    expect(s.rows[0]).toMatchObject({
      paper: 'alexis am tys 2023 p1', student: 'Alexis',
      waitingMinutes: 8, machine: 'Adrians-MacBook-Pro', claimedMinutes: 7, attempts: 1,
    });
  });

  it('shows an unclaimed paper with no machine', () => {
    const s = markingQueueState([row()], NOW);
    expect(s.rows[0]).toMatchObject({ machine: null, claimedMinutes: null });
  });

  it('orders by queued_at, oldest first — the picker’s own order', () => {
    const s = markingQueueState([
      row({ id: 'new', queue: { queued_at: minsAgo(2) } }),
      row({ id: 'old', queue: { queued_at: minsAgo(300) } }),
      row({ id: 'mid', queue: { queued_at: minsAgo(40) } }),
    ], NOW);
    expect(s.rows.map(r => r.id)).toEqual(['old', 'mid', 'new']);
    expect(s.oldestMinutes).toBe(300);
  });

  // The 9 Sep 2026 leftovers: three rows flagged queued long after release.
  it('reports a queued flag left on a finished paper, without counting it as work', () => {
    const s = markingQueueState([
      row({ id: 'a', queue_status: 'queued', total_max: 80, released_at: minsAgo(5), paper_name: 'sophie am tys 2021 p1' }),
      row({ id: 'b', queue_status: 'queued', total_max: 80, archived_at: minsAgo(5), paper_name: 'kassandra p2' }),
    ], NOW);
    expect(s.pending).toBe(0);
    expect(s.stale).toEqual([
      { id: 'a', paper: 'sophie am tys 2021 p1', because: 'released' },
      { id: 'b', paper: 'kassandra p2', because: 'archived' },
    ]);
  });

  it('never calls a genuinely waiting paper stale, even when flagged queued', () => {
    const s = markingQueueState([row({ queue_status: 'queued' })], NOW);
    expect(s.stale).toEqual([]);
    expect(s.pending).toBe(1);
  });

  it('never reports a negative wait for a row stamped in the future', () => {
    const s = markingQueueState([row({ queue: { queued_at: new Date(NOW + 60_000).toISOString() } })], NOW);
    expect(s.rows[0].waitingMinutes).toBe(0);
  });

  it('names an unnamed paper rather than rendering a blank', () => {
    expect(markingQueueState([row({ paper_name: '  ' })], NOW).rows[0].paper).toBe('(unnamed paper)');
  });
});

describe('finishedBecause', () => {
  it('prefers released over the other reasons', () => {
    expect(finishedBecause(row({ released_at: minsAgo(1), archived_at: minsAgo(2), total_max: 80 }))).toBe('released');
  });
  it('is null for a paper still in flight', () => {
    expect(finishedBecause(row())).toBeNull();
  });
});
