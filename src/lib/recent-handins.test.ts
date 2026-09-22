import { describe, it, expect } from 'vitest';
import { isRecentHandin } from './recent-handins';

const NOW = Date.parse('2026-09-22T10:00:00Z');
const d = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

describe('isRecentHandin (the Handed in this week frame, 22 Sep 2026)', () => {
  it('a hand-in inside seven days is in the frame; older is not', () => {
    expect(isRecentHandin({ created_at: d(0.5) }, NOW)).toBe(true);
    expect(isRecentHandin({ created_at: d(6.9) }, NOW)).toBe(true);
    expect(isRecentHandin({ created_at: d(7.1) }, NOW)).toBe(false);
  });
  it('dragged out (recent_done_at) leaves the frame even when recent', () => {
    expect(isRecentHandin({ created_at: d(1), recent_done_at: d(0.1) }, NOW)).toBe(false);
  });
  it('no row, no date, or a bad date → not in the frame', () => {
    expect(isRecentHandin(null, NOW)).toBe(false);
    expect(isRecentHandin({ created_at: null }, NOW)).toBe(false);
    expect(isRecentHandin({ created_at: 'nonsense' }, NOW)).toBe(false);
  });
});
