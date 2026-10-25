import { describe, it, expect } from 'vitest';
import { summariseFixOne } from './fix-one-stats';

const runs = [
  { id: 'r1', student_id: 's1', released_at: '2026-10-20T02:00:00Z' },
  { id: 'r2', student_id: 's2', released_at: '2026-10-20T02:00:00Z' },
];

describe('summariseFixOne', () => {
  it('counts opened within 24 h, fixes per run, and requests within 24 h', () => {
    const s = summariseFixOne(runs, [
      { identity: 's1', kind: 'marking:view', created_at: '2026-10-20T05:00:00Z' },
      { identity: 's2', kind: 'marking:view', created_at: '2026-10-22T05:00:00Z' }, // too late
      { identity: 's1', kind: 'fix:shown', created_at: '2026-10-20T05:01:00Z', detail: { runId: 'r1' } },
      { identity: 's1', kind: 'fix:shown', created_at: '2026-10-21T05:01:00Z', detail: { runId: 'r1' } },
      { identity: 's1', kind: 'fix:answered', created_at: '2026-10-20T05:02:00Z', detail: { runId: 'r1', correct: false } },
      { identity: 's1', kind: 'fix:answered', created_at: '2026-10-20T05:03:00Z', detail: { runId: 'r1', correct: true } },
      { identity: 's1', kind: 'fix:shown', created_at: '2026-10-20T05:01:00Z', detail: { runId: 'other' } },
      { identity: 's2', kind: 'practice-again:request', created_at: '2026-10-20T09:00:00Z', detail: { runIds: ['r2'] } },
      { identity: 's1', kind: 'practice-again:request', created_at: '2026-10-23T09:00:00Z', detail: { runIds: ['r1'] } },
    ], 14);
    expect(s).toEqual({ days: 14, released: 2, opened: 1, shown: 1, answered: 1, correct: 1, requested: 1 });
  });
});
