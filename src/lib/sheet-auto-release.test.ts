import { describe, it, expect } from 'vitest';
import { autoReleaseGate, holdHours, sgtShort, heldByReviewLine } from './sheet-auto-release';

const good = { noSheet: false, verified: '73/73 sympy', wave: ['chain rule'], exampleCheck: { checked: 3, disagreements: [] }, grounded: null };

describe('autoReleaseGate', () => {
  it('passes a verified, checked, non-empty sheet', () => {
    expect(autoReleaseGate(good)).toEqual({ ok: true, reasons: [] });
  });
  it('names every reason it will not release on its own', () => {
    const r = autoReleaseGate({ noSheet: false, verified: '70/73 sympy', wave: [], exampleCheck: { checked: 2, disagreements: [{}] }, grounded: false });
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(4);
    expect(r.reasons[0]).toMatch(/only 70 of 73/);
  });
  it('a skipped or missing example check holds the sheet for a human', () => {
    expect(autoReleaseGate({ ...good, exampleCheck: { checked: 0, disagreements: [], skipped: 'model call failed' } }).ok).toBe(false);
    expect(autoReleaseGate({ ...good, exampleCheck: null }).ok).toBe(false);
  });
  it('a no-sheet completion is not auto-released', () => {
    expect(autoReleaseGate({ ...good, noSheet: true }).ok).toBe(false);
  });
});

describe('holdHours / sgtShort', () => {
  it('defaults to 12 and honours the env override, including 0 (off)', () => {
    expect(holdHours(undefined)).toBe(12);
    expect(holdHours('0')).toBe(0);
    expect(holdHours('junk')).toBe(12);
  });
  it('formats Singapore time', () => {
    expect(sgtShort('2026-09-06T16:46:58Z')).toBe('Mon 12:46am');
    expect(sgtShort('2026-09-07T01:12:00Z')).toBe('Mon 9:12am');
  });
});

describe('open flags hold the 12-hour clock (8 Sep 2026)', () => {
  it('a sheet that passes every check still waits while questions are flagged for review', () => {
    const r = autoReleaseGate({ ...good, pendingReviews: 4 });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(['4 questions still flagged for your review — Agree or Override each on the desk']);
    expect(autoReleaseGate({ ...good, pendingReviews: 0 }).ok).toBe(true);
    expect(autoReleaseGate({ ...good, pendingReviews: null }).ok).toBe(true);
  });
  it('the cron names the student, the paper and the count when it holds', () => {
    expect(heldByReviewLine('Denise Chan', 'denise am tys 2021 p2', 1, 'https://x')).toContain('1 question still flagged');
    expect(heldByReviewLine('Denise Chan', null, 4, 'https://x')).toMatch(/NOT released — 4 questions/);
  });
});
