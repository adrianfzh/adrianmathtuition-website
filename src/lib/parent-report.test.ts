import { describe, expect, it } from 'vitest';
import {
  PARENT_NOTICE_HASH, buildReportFacts, findWeakSpot, findWins, isEmail, newInviteCode, normalizeInviteCode,
  reportWords, signParentCookie, signReportToken, verifyParentCookie, verifyReportToken,
  type ReportAttempt, type ReportInputs,
} from './parent-report';
import { paperLosses } from './parent-report-store';

const NOW = new Date('2026-11-08T11:00:00Z'); // Sunday 7pm SGT
const WEEK = '2026-11-02';
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
let qn = 0;
const att = (d: number, topic: string, right: boolean, extra: Partial<ReportAttempt> = {}): ReportAttempt => ({
  at: daysAgo(d), questionId: `q${++qn}`, topics: [topic], verdict: right ? 'correct' : 'incorrect', score: null, outOf: null, helpSteps: 0, science: false, ...extra,
});
const base = (over: Partial<ReportInputs> = {}): ReportInputs => ({ weekStart: WEEK, now: NOW, attempts: [], papers: [], mistakes: [], stretch: null, ...over });

describe('buildReportFacts — this week', () => {
  it('counts practice days, questions and right-first-time inside the SGT week only', () => {
    const f = buildReportFacts(base({ attempts: [att(0, 'Indices', true), att(0, 'Indices', false), att(2, 'Surds', true), att(9, 'Surds', true)] }));
    expect(f.active).toBe(true);
    expect(f.practiceDays).toBe(2);
    expect(f.questionsTried).toBe(3);
    expect(f.rightFirst).toBe(2);
  });
  it('a retry is not a first try', () => {
    const first = att(20, 'Indices', false);
    const again = { ...first, at: daysAgo(1), verdict: 'correct' };
    const f = buildReportFacts(base({ attempts: [first, again] }));
    expect(f.questionsTried).toBe(1);
    expect(f.rightFirst).toBe(0);
  });
  it('a quiet week is not active and has no wins', () => {
    const f = buildReportFacts(base({ attempts: [att(30, 'Indices', false)] }));
    expect(f.active).toBe(false);
    expect(f.wins).toEqual([]);
    expect(f.weakSpot?.topic).toBe('Indices'); // falls back to the longer look-back
  });
  it('a stretch set that was built but not touched does not make the week active', () => {
    expect(buildReportFacts(base({ stretch: { done: 0, total: 4 } })).active).toBe(false);
    expect(buildReportFacts(base({ stretch: { done: 2, total: 4 } })).active).toBe(true);
  });
});

describe('findWins — never invented', () => {
  it('a topic win needs enough first tries on both sides and a real rise', () => {
    const before = [att(30, 'Quadratics', true), att(31, 'Quadratics', false), att(32, 'Quadratics', false), att(33, 'Quadratics', false)];
    const after = [att(1, 'Quadratics', true), att(2, 'Quadratics', true), att(3, 'Quadratics', true), att(4, 'Quadratics', false)];
    const w = findWins({ attempts: [...before, ...after], papers: [], now: NOW });
    expect(w).toEqual([{ kind: 'topic', topic: 'Quadratics', before: [1, 4], after: [3, 4] }]);
  });
  it('too few tries → no win', () => {
    const w = findWins({ attempts: [att(30, 'Q', false), att(1, 'Q', true), att(2, 'Q', true), att(3, 'Q', true)], papers: [], now: NOW });
    expect(w).toEqual([]);
  });
  it('a paper win pools the last fortnight against the six weeks before, two papers each side', () => {
    const p = (d: number, a: number, max = 80) => ({ releasedAt: daysAgo(d), name: 'P', subject: 'A Math', awarded: a, max, losses: [] });
    expect(findWins({ attempts: [], papers: [p(40, 40), p(30, 40), p(2, 52), p(5, 52)], now: NOW })).toEqual([{ kind: 'paper', subject: 'A Math', beforePct: 50, afterPct: 65 }]);
    expect(findWins({ attempts: [], papers: [p(40, 40), p(2, 52)], now: NOW })).toEqual([]); // one paper a side is not enough
    // a short topical set and a full paper pooled honestly: 32/69 + 81/90 = 71% vs 80/90 + 80/90 = 89% → no win
    expect(findWins({ attempts: [], papers: [p(20, 80, 90), p(18, 80, 90), p(3, 32, 69), p(1, 81, 90)], now: NOW })).toEqual([]);
  });
});

describe('findWeakSpot', () => {
  it('picks the topic with most lost marks, names the kind only when it dominates', () => {
    const papers = [{ releasedAt: daysAgo(3), name: 'P', subject: 'E Math', awarded: 30, max: 60, losses: [
      { topic: 'Indices', lost: 3, kind: 'sign' }, { topic: 'Indices', lost: 2, kind: 'sign' }, { topic: 'Indices', lost: 1, kind: 'concept' },
      { topic: 'Mensuration', lost: 4, kind: 'units' },
    ] }];
    expect(findWeakSpot({ attempts: [], papers, mistakes: [], now: NOW })).toEqual({ topic: 'Indices', kind: 'sign' });
  });
  it('ignores science papers and returns null when there is nothing', () => {
    const papers = [{ releasedAt: daysAgo(3), name: 'P', subject: 'Physics', awarded: 1, max: 10, losses: [{ topic: 'Forces', lost: 9, kind: null }] }];
    expect(findWeakSpot({ attempts: [], papers, mistakes: [], now: NOW })).toBeNull();
  });
});

describe('reportWords', () => {
  it('active week: counts, wins, one weak spot, one action', () => {
    const f = { ...buildReportFacts(base({ attempts: [att(1, 'Indices', false), att(1, 'Indices', true)] })), focus: { topic: 'Indices', questionIds: ['a', 'b', 'c'] } };
    const w = reportWords(f, 'Wei', 'https://x/app/focus');
    expect(w.title).toBe('Weekly report · 2 Nov – 8 Nov');
    expect(w.heading).toBe('Wei’s week');
    expect(w.done[0]).toBe('Practised on 1 day · 2 questions tried · 1 right on the first try');
    expect(w.action).toContain('10-minute set on Indices');
    expect(w.forwardText).toBe('Your 10-minute set on Indices is ready: https://x/app/focus');
  });
  it('quiet week: a gentle nudge, no counts', () => {
    const w = reportWords(buildReportFacts(base()), null, 'https://x/app/focus');
    expect(w.done).toEqual([]);
    expect(w.heading).toBe('Your child’s week');
    expect(w.action.startsWith('No practice this week.')).toBe(true);
  });
  it('no hype words, no comparison with others', () => {
    const f = { ...buildReportFacts(base({ attempts: [att(1, 'Indices', true)] })), focus: { topic: 'Indices', questionIds: ['a'] } };
    const all = JSON.stringify(reportWords(f, 'Wei', 'u')).toLowerCase();
    for (const bad of ['amazing', 'awesome', 'crush', 'class', 'rank', 'top ', 'other students', 'ai', 'algorithm']) expect(all.includes(bad), bad).toBe(false);
  });
});

describe('links and codes', () => {
  const S = 'secret';
  const id = '123e4567-e89b-12d3-a456-426614174000';
  it('a report token opens one report and expires after 14 days', () => {
    const t = signReportToken(id, S, NOW.getTime());
    expect(verifyReportToken(t, S, NOW.getTime())).toBe(id);
    expect(verifyReportToken(t, S, NOW.getTime() + 15 * 86_400_000)).toBeNull();
    expect(verifyReportToken(t, 'other', NOW.getTime())).toBeNull();
    expect(verifyReportToken(t.replace(/.$/, 'x'), S, NOW.getTime())).toBeNull();
  });
  it('a report token cannot be used as the parent cookie, and back', () => {
    expect(verifyParentCookie(signReportToken(id, S), S)).toBeNull();
    expect(verifyReportToken(signParentCookie(id, S), S)).toBeNull();
  });
  it('invite codes are 8 unambiguous letters and survive spaces/case', () => {
    const c = newInviteCode();
    expect(c).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    expect(normalizeInviteCode(` ${c.slice(0, 4).toLowerCase()}-${c.slice(4)} `)).toBe(c);
    expect(normalizeInviteCode('ABCD0OIL')).toBeNull();
  });
  it('email check and a fixed consent hash', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('nope')).toBe(false);
    expect(PARENT_NOTICE_HASH).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('paperLosses', () => {
  it('reads lost marks per part with the kind of mistake', () => {
    const rj = { results: [
      { marking: { total_max: 5, total_awarded: 2 }, marking_output: { meta: { topic_detected: 'Indices' }, parts: [{ max: 3, awarded: 1, error_kind: 'sign' }, { max: 2, awarded: 1 }] } },
      { marking: { total_max: 4, total_awarded: 1 }, marking_output: { meta: { topic_detected: 'Surds' } } },
      { region: 'no marking here' },
    ] };
    expect(paperLosses(JSON.stringify(rj))).toEqual([
      { topic: 'Indices', lost: 2, kind: 'sign' }, { topic: 'Indices', lost: 1, kind: null }, { topic: 'Surds', lost: 3, kind: null },
    ]);
  });
});
