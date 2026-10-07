import { describe, it, expect } from 'vitest';
import { stuckReads } from './plan-reads';

describe('plan reads', () => {
  it('counts only reads still waiting after the limit', () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    const rows = [
      { status: 'queued', created_at: '2026-10-07T11:55:00Z' },
      { status: 'queued', created_at: '2026-10-07T11:30:00Z' },
      { status: 'claimed', created_at: '2026-10-07T11:00:00Z' },
      { status: 'replied', created_at: '2026-10-07T09:00:00Z' },
    ];
    expect(stuckReads(rows, now)).toBe(2);
    expect(stuckReads(rows, now, 90)).toBe(0);
  });
});
