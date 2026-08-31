import { describe, it, expect } from 'vitest';
import { markQueueState, cancelMarkingState, stripQueue, CLAIM_FRESH_MS } from './mark-queue-cancel';

const NOW = Date.parse('2026-08-31T15:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('markQueueState', () => {
  it('calls a paper with no queue key not queued', () => {
    expect(markQueueState({ total_max: null, result_json: { source: {} } }, NOW)).toBe('none');
  });

  it('calls a queued, unclaimed paper queued', () => {
    expect(markQueueState({ total_max: null, result_json: { queue: { queued_at: iso(60_000) } } }, NOW)).toBe('queued');
  });

  it('calls a paper under a FRESH Mac claim running', () => {
    const row = { total_max: null, result_json: { queue: { queued_at: iso(600_000), external_claim: { by: 'mac-1', at: iso(30_000) } } } };
    expect(markQueueState(row, NOW)).toBe('running');
  });

  it('treats a STALE claim as merely queued — nobody is working on it', () => {
    const row = { total_max: null, result_json: { queue: { external_claim: { by: 'mac-1', at: iso(CLAIM_FRESH_MS + 60_000) } } } };
    expect(markQueueState(row, NOW)).toBe('queued');
  });

  it('treats a RELEASED claim as queued even when the stamp is fresh', () => {
    const row = { total_max: null, result_json: { queue: { external_claim: { by: 'mac-1', at: iso(1_000), released_at: iso(500) } } } };
    expect(markQueueState(row, NOW)).toBe('queued');
  });

  it('calls a paper with a score marked', () => {
    expect(markQueueState({ total_max: 90, result_json: { queue: { queued_at: iso(1) } } }, NOW)).toBe('marked');
  });

  it('calls a paper carrying results marked even when total_max is missing', () => {
    expect(markQueueState({ total_max: null, result_json: { results: [{ q: '1' }], queue: {} } }, NOW)).toBe('marked');
  });
});

describe('cancelMarkingState', () => {
  it('allows cancelling a queued paper, not flagged as running', () => {
    const r = cancelMarkingState({ total_max: null, result_json: { queue: { queued_at: iso(1000) } } }, NOW);
    expect(r).toMatchObject({ can: true, running: false, state: 'queued' });
  });

  it('allows cancelling a running one, and says it is running', () => {
    const row = { total_max: null, result_json: { queue: { external_claim: { by: 'mac', at: iso(5_000) } } } };
    expect(cancelMarkingState(row, NOW)).toMatchObject({ can: true, running: true });
  });

  it('refuses a marked paper with a reason', () => {
    const r = cancelMarkingState({ total_max: 90, result_json: {} }, NOW);
    expect(r.can).toBe(false);
    expect(r.reason).toMatch(/already marked/);
  });

  it('refuses one that was never queued', () => {
    const r = cancelMarkingState({ total_max: null, result_json: {} }, NOW);
    expect(r.can).toBe(false);
    expect(r.reason).toMatch(/not queued/);
  });
});

describe('stripQueue', () => {
  it('removes the queue key — which is what every drain filters on', () => {
    const out = stripQueue({ source: { photos: [1] }, queue: { queued_at: iso(1000) } }, 'T');
    expect(out.queue).toBeUndefined();
    expect('queue' in out).toBe(false);
    expect(out.source).toEqual({ photos: [1] });
  });

  it('keeps an audit stamp of what was dropped', () => {
    const out = stripQueue({ queue: { queued_at: 'Q', mark_now: true, external_claim: { by: 'mac-2' } } }, 'T');
    expect(out.queue_cancelled).toEqual({
      at: 'T', queued_at: 'Q', was_claimed_by: 'mac-2', mark_now: true, skip_external: false,
    });
  });

  it('never mutates the row it was handed', () => {
    const rj = { queue: { queued_at: 'Q' } };
    stripQueue(rj, 'T');
    expect(rj.queue).toEqual({ queued_at: 'Q' });
  });

  it('survives a null result_json', () => {
    expect(stripQueue(null, 'T')).toMatchObject({ queue_cancelled: { at: 'T', queued_at: null } });
  });
});
