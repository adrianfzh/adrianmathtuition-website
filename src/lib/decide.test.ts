import { describe, expect, it } from 'vitest';
import { canRetry, checkDecide, failedWhy, flagReason, stillFailed, tapWords, type ReqRow } from './decide';

const row = (slug: string, status: string, at: string, failure_kind: string | null = null): ReqRow =>
  ({ slug, action: 'ship', status, failure_kind, result: `${status} ${slug}`, requested_at: at });

describe('stillFailed', () => {
  it('drops a proposal whose later tap shipped (6 Nov 2026: all nine had)', () => {
    const rows = [
      row('doc-sweep-4', 'failed', '2026-11-01T11:58:30Z', 'gate_failed'),
      row('doc-sweep-4', 'done', '2026-11-01T12:47:43Z'),
      row('misprinted-show-that', 'failed', '2026-11-01T12:39:14Z', 'timeout'),
      row('misprinted-show-that', 'failed', '2026-11-01T18:11:31Z', 'gate_failed'),
      row('misprinted-show-that', 'done', '2026-11-01T21:57:11Z'),
    ];
    expect(stillFailed(rows)).toEqual([]);
  });
  it('keeps one line per proposal, newest first', () => {
    const rows = [
      row('a', 'failed', '2026-11-01T10:00:00Z', 'timeout'),
      row('a', 'failed', '2026-11-02T10:00:00Z', 'gate_failed'),
      row('b', 'needs_session', '2026-11-03T10:00:00Z'),
      row('c', 'running', '2026-11-03T11:00:00Z'),
    ];
    expect(stillFailed(rows).map((r) => [r.slug, r.failure_kind])).toEqual([['b', null], ['a', 'gate_failed']]);
  });
});

describe('failedWhy / canRetry', () => {
  it('says it in everyday words and only offers Try again where it can help', () => {
    expect(failedWhy({ status: 'failed', failure_kind: 'push_race', result: null })).toMatch(/Trying again usually works/);
    expect(canRetry({ status: 'failed', failure_kind: 'push_race' })).toBe(true);
    expect(canRetry({ status: 'failed', failure_kind: 'gate_failed' })).toBe(false);
    expect(canRetry({ status: 'needs_session', failure_kind: 'merge_conflict' })).toBe(false);
    expect(failedWhy({ status: 'needs_session', failure_kind: null, result: null })).toMatch(/Claude session/);
  });
});

describe('flagReason', () => {
  it('uses the Status: FLAGGED words', () => {
    expect(flagReason('… | verify PASS | Status: FLAGGED (banked whole, Q21 figure incomplete)', 'flagged')).toBe('banked whole, Q21 figure incomplete');
  });
  it('falls back to the FLAG_ file name after the year', () => {
    expect(flagReason('… see FLAG_Catholic_High_P4_2018_q37_missing_angle.md) | verify PASS | Status: FLAGGED', 'flagged')).toBe('Q37 missing angle');
  });
  it('says a held paper is held', () => {
    expect(flagReason('HELD (not queued): cut from 2020 P6 …', 'failed')).toBe('Held back, not queued');
  });
  it('never returns nothing', () => {
    expect(flagReason(null, 'flagged')).toBe('No reason written');
  });
});

describe('checkDecide', () => {
  it('takes a rule Ship / Change / Drop', () => {
    expect(checkDecide({ kind: 'rule', slug: 'xr-primary-cover-same-school', action: 'ship' })).toEqual({ ok: true, d: { kind: 'rule', slug: 'xr-primary-cover-same-school', action: 'ship', note: null } });
    expect(checkDecide({ kind: 'rule', slug: 'xr-a', action: 'change', note: '' })).toEqual({ ok: false, error: 'Say what to change first.' });
    expect(checkDecide({ kind: 'rule', slug: 'not-a-rule', action: 'ship' }).ok).toBe(false);
  });
  it('takes Try again / Drop for a proposal and Fine / Try again for a paper', () => {
    expect(checkDecide({ kind: 'ship', slug: 'doc-sweep-4', action: 'ship' }).ok).toBe(true);
    expect(checkDecide({ kind: 'ship', slug: 'doc-sweep-4', action: 'change' }).ok).toBe(false);
    expect(checkDecide({ kind: 'paper', id: '3f0c2a5e-1b2c-4d5e-8f90-123456789abc', action: 'done' }).ok).toBe(true);
    expect(checkDecide({ kind: 'paper', id: 'x; drop', action: 'done' }).ok).toBe(false);
    expect(checkDecide({ kind: 'nope' }).ok).toBe(false);
  });
});

describe('tapWords', () => {
  it('says where a tap stands', () => {
    expect(tapWords(null)).toBeNull();
    expect(tapWords({ action: 'ship', status: 'running', result: null })).toMatch(/^⏳ Shipping/);
    expect(tapWords({ action: 'drop', status: 'done', result: null })).toBe('✅ Dropped');
  });
});
