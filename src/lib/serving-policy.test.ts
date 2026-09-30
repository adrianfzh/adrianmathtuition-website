import { describe, it, expect } from 'vitest';
import { flipReady, isOurRow, orderReadiness, isFlipped, type TopicReadiness } from './serving-policy';
import { practiceEligibility } from './portal-find';

const row = (o: Partial<TopicReadiness>): TopicReadiness => ({
  level: 'EM', topic: 'Vectors', verified_twins: 0, pending_twins: 0, school_rows: 100, drawn_90d: 0,
  school_rows_served: true, flipped_at: null, flipped_by: null, ...o,
});

describe('flipReady — SPEC-TWINS §6 threshold', () => {
  it('needs at least one verified twin even when nothing was drawn', () => {
    expect(flipReady(row({ verified_twins: 0, drawn_90d: 0 }))).toBe(false);
  });
  it('is ready when verified twins cover the rows drawn in 90 days', () => {
    expect(flipReady(row({ verified_twins: 3, drawn_90d: 3 }))).toBe(true);
    expect(flipReady(row({ verified_twins: 4, drawn_90d: 3 }))).toBe(true);
  });
  it('is not ready one twin short', () => {
    expect(flipReady(row({ verified_twins: 2, drawn_90d: 3 }))).toBe(false);
  });
});

describe('isOurRow', () => {
  it('knows the two pseudo-schools', () => {
    expect(isOurRow('AdrianMath')).toBe(true);
    expect(isOurRow('AI Generated')).toBe(true);
    expect(isOurRow('CCHY')).toBe(false);
    expect(isOurRow(null)).toBe(false);
  });
});

describe('orderReadiness', () => {
  it('lists flipped first, then ready, then the rest; hides topics with no twins', () => {
    const rows = [
      row({ topic: 'A', verified_twins: 1, drawn_90d: 5 }),
      row({ topic: 'B', verified_twins: 0, pending_twins: 0 }),
      row({ topic: 'C', verified_twins: 2, drawn_90d: 1 }),
      row({ topic: 'D', school_rows_served: false, flipped_at: '2026-09-30T00:00:00Z' }),
    ];
    expect(orderReadiness(rows).map(r => r.topic)).toEqual(['D', 'C', 'A']);
    expect(isFlipped(rows[3])).toBe(true);
  });
});

describe('practiceEligibility mirrors the flip', () => {
  const base = { school: 'CCHY', question_text: 'Find x.', answer: '3' };
  it('serves a school row while the topic is not flipped', () => {
    expect(practiceEligibility(base).ok).toBe(true);
    expect(practiceEligibility(base, { schoolRowsRetired: false }).ok).toBe(true);
  });
  it('refuses a school row once the topic is flipped, and still serves ours', () => {
    expect(practiceEligibility(base, { schoolRowsRetired: true })).toEqual({ ok: false, reason: 'school rows retired for this topic — ours only' });
    expect(practiceEligibility({ ...base, school: 'AdrianMath', ai_generated: true, verified: true }, { schoolRowsRetired: true }).ok).toBe(true);
  });
});
