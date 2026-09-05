import { describe, it, expect } from 'vitest';
import {
  parseReviewBody, reviewCounts, reviewDigest, reviewSummaryLine, MAX_WHY, type ReviewDayRow,
} from './find-review';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

describe('parseReviewBody', () => {
  it('accepts a well-formed post and trims/caps the why', () => {
    const r = parseReviewBody({
      date: '2026-09-05',
      verdicts: [{ id: A, verdict: 'similar', why: '  same   tangent skill,  4 vs 4 marks ' }],
      note: ' quiet night ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.date).toBe('2026-09-05');
    expect(r.verdicts).toEqual([{ id: A, verdict: 'similar', why: 'same tangent skill, 4 vs 4 marks' }]);
    expect(r.note).toBe('quiet night');
  });
  it('an empty verdict list is valid — a quiet day still posts', () => {
    const r = parseReviewBody({ date: '2026-09-05', verdicts: [] });
    expect(r.ok && r.verdicts).toEqual([]);
  });
  it('caps the why at MAX_WHY', () => {
    const r = parseReviewBody({ date: '2026-09-05', verdicts: [{ id: A, verdict: 'off', why: 'x'.repeat(MAX_WHY + 40) }] });
    expect(r.ok && r.verdicts[0].why.length).toBe(MAX_WHY);
  });
  it('rejects a bad date, a non-array, a non-uuid id, an unknown verdict, a missing why, a repeated id', () => {
    const bad: unknown[] = [
      { date: '5 Sep', verdicts: [] },
      { date: '2026-09-05', verdicts: 'nope' },
      { date: '2026-09-05', verdicts: [{ id: 'row-1', verdict: 'similar', why: 'ok fine' }] },
      { date: '2026-09-05', verdicts: [{ id: A, verdict: 'close-enough', why: 'ok fine' }] },
      { date: '2026-09-05', verdicts: [{ id: A, verdict: 'similar' }] },
      { date: '2026-09-05', verdicts: [{ id: A, verdict: 'similar', why: 'ok fine' }, { id: A, verdict: 'off', why: 'twice' }] },
      null,
      'json',
    ];
    for (const b of bad) expect(parseReviewBody(b).ok).toBe(false);
  });
});

const rows: ReviewDayRow[] = [
  { id: A, student: 'Zane', tier: 'similar', miss: false, topic: 'Circles', subgroup: 'Tangent at a Point on the Circle' },
  { id: B, student: 'Sijia', tier: 'made-for-you', miss: false, topic: 'Binomial Theorem', subgroup: null },
  { id: C, student: 'Kieran', tier: null, miss: true, topic: null, subgroup: null },
];

describe('reviewCounts + digest', () => {
  it('counts tiers, misses and verdicts — ignoring verdicts for rows not on the day', () => {
    const c = reviewCounts(rows, [
      { id: A, verdict: 'same-chapter', why: 'general form, not tangent' },
      { id: B, verdict: 'similar', why: 'same coefficient skill' },
      { id: '44444444-4444-4444-8444-444444444444', verdict: 'off', why: 'stray' },
    ]);
    expect(c).toEqual({
      finds: 3, similar: 1, madeForYou: 1, misses: 1, judged: 2,
      byVerdict: { similar: 1, 'same-chapter': 1, off: 0 },
    });
    expect(reviewSummaryLine(c)).toBe('3 finds · 2 judged · 1 miss');
  });

  it('digest leads with the counts and lists every miss with student, place and why', () => {
    const d = reviewDigest('2026-09-05', rows, [
      { id: A, verdict: 'same-chapter', why: 'general form <x>, not tangent' },
      { id: B, verdict: 'similar', why: 'same coefficient skill' },
    ]);
    expect(d).toContain('Find review — 5 Sep');
    expect(d).toContain('3 finds · 1 similar · 1 made for you · 1 nothing found');
    expect(d).toContain('Judged 2: 1 similar · 1 same-chapter · 0 off');
    expect(d).toContain('Same chapter only</b> (1)');
    expect(d).toContain('Zane · Circles / Tangent at a Point on the Circle · similar — general form &lt;x&gt;, not tangent');
    expect(d).not.toContain('Off</b>');
    expect(d.split('\n').length).toBeLessThan(20);
  });

  it('a day with no finds still produces a digest line', () => {
    expect(reviewDigest('2026-09-05', [], [])).toBe('🔍 <b>Find review — 5 Sep</b>\nNo finds yesterday — nothing to judge.');
  });
});
