import { describe, it, expect } from 'vitest';
import { parseAudit, typesToLearn, parseDraft, scoreTest, spreadSample, auditPrompt, type MissRow, type TestCase } from './humanities-selfcheck';

describe('parseAudit', () => {
  const d = { lo: 2, hi: 3, max: 4 };
  it('agrees inside the delivered range, and says which way it was off', () => {
    expect(parseAudit('{"level":3,"why":"ok","missed_rule":"x"}', d)).toMatchObject({ verdict: 'agree', missedRule: null });
    expect(parseAudit('Sure: {"level":1,"why":"one source only","missed_rule":"Credit a comparison only when both sources are quoted."}', d))
      .toMatchObject({ level: 1, verdict: 'delivered_high', missedRule: 'Credit a comparison only when both sources are quoted.' });
    expect(parseAudit('{"level":4,"why":"","missed_rule":null}', d)?.verdict).toBe('delivered_low');
  });
  it('refuses a level off the scale or no JSON', () => {
    expect(parseAudit('{"level":7}', d)).toBeNull();
    expect(parseAudit('no', d)).toBeNull();
  });
});

describe('typesToLearn', () => {
  const now = Date.parse('2026-10-20T00:00:00Z');
  const m = (skill: string, o: Partial<MissRow> = {}): MissRow => ({ skill, verdict: 'delivered_high', missed_rule: 'r', created_at: '2026-10-18T00:00:00Z', run_id: 'x', ...o });
  it('needs three recent misses with a rule, on a type not already being worked on', () => {
    const rows = [m('comparison'), m('comparison'), m('comparison'), m('surprise'), m('surprise'), m('purpose', { verdict: 'agree' }), m('comparison', { created_at: '2026-09-01T00:00:00Z' })];
    expect([...typesToLearn(rows, now, new Set()).keys()]).toEqual(['comparison']);
    expect(typesToLearn(rows, now, new Set(['comparison'])).size).toBe(0);
  });
});

describe('parseDraft', () => {
  it('takes one rule sentence, or nothing', () => {
    expect(parseDraft('{"rule":"Credit a difference only when both sources speak about the same point."}')).toMatch(/^Credit/);
    expect(parseDraft('{"rule":null}')).toBeNull();
    expect(parseDraft('{"rule":"too short"}')).toBeNull();
  });
});

describe('scoreTest', () => {
  const c = (kind: 'seeded' | 'missed', truth: number, base: number | null, patched: number | null, key = Math.random().toString()): TestCase => ({ key, kind, truth, base, patched });
  it('goes live only when seeded is no worse and missed is better', () => {
    const good = [c('seeded', 1, 1, 1), c('seeded', 2, 2, 2), c('seeded', 3, 3, 3), c('seeded', 4, 3, 4), c('missed', 2, 3, 2), c('missed', 1, 2, 2)];
    expect(scoreTest(good)).toMatchObject({ seededBase: 3, seededPatched: 4, missedBase: 0, missedPatched: 1, live: true });
    const worse = [c('seeded', 1, 1, 2), c('seeded', 2, 2, 2), c('seeded', 3, 3, 3), c('seeded', 4, 4, 4), c('missed', 2, 3, 2)];
    expect(scoreTest(worse).live).toBe(false);
    const noGain = [c('seeded', 1, 1, 1), c('seeded', 2, 2, 2), c('seeded', 3, 3, 3), c('seeded', 4, 4, 4), c('missed', 2, 3, 3)];
    expect(scoreTest(noGain).live).toBe(false);
  });
});

describe('spreadSample', () => {
  it('takes across the levels', () => {
    const items = [1, 1, 1, 2, 2, 3, 4, 4].map((truth, i) => ({ truth, i }));
    expect(spreadSample(items, 4).map(x => x.truth)).toEqual([1, 2, 3, 4]);
    expect(spreadSample(items, 6).map(x => x.truth)).toEqual([1, 2, 3, 4, 1, 2]);
  });
});

describe('auditPrompt', () => {
  it('names the scale and what the marker gave', () => {
    const p = auditPrompt({ subject: 'Geography', question: 'Explain …', material: '', standard: '- a', answer: 'x', delivered: { lo: 2, hi: 2, max: 4, lift: null, points: true } });
    expect(p).toContain('2 (marks out of 4)');
  });
});
