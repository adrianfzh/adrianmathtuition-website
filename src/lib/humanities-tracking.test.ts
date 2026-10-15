import { describe, it, expect } from 'vitest';
import { markerStats, ourRange, pct, type TrackRow } from './humanities-tracking';

const row = (o: Partial<TrackRow>): TrackRow => ({
  id: 'x', created_at: '2026-10-15T00:00:00Z', student_name: null, subject: 'social-studies', skill: 'comparison',
  status: 'marked', level_lo: 3, level_hi: 3, levels_max: 4, reads: [{}, {}], marks: 6, points: false, ...o,
});

describe('ourRange', () => {
  it('a level as school marks, or marks as they are', () => {
    expect(ourRange(row({}))).toEqual([5, 5, 6]);
    expect(ourRange(row({ skill: 'geo_explain', points: true, level_lo: 2, level_hi: 3, marks: 4 }))).toEqual([2, 3, 4]);
    expect(ourRange(row({ level_lo: null }))).toBeNull();
  });
});

describe('markerStats', () => {
  it('counts agreement, held and failed', () => {
    const s = markerStats([row({}), row({ reads: [{}, {}, {}] }), row({ status: 'held', reads: [{}, {}, {}] }), row({ status: 'failed', level_lo: null, level_hi: null })]);
    expect(s).toEqual({ answers: 4, read: 3, agreedFirst: 1, held: 1, failed: 1 });
    expect(pct(s.agreedFirst, s.read)).toBe('33%');
    expect(pct(0, 0)).toBe('—');
  });
});
