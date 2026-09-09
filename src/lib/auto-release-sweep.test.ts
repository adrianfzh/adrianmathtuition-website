import { describe, it, expect } from 'vitest';
import { sweepVerdict, sweepCandidates, type SweepRow } from './auto-release-sweep';

const NOW = new Date('2026-09-09T05:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const row = (over: Partial<SweepRow> & { rj?: Record<string, unknown> } = {}): SweepRow => ({
  id: 'r1', created_at: ago(120), released_at: null, annotated_pdf_url: 'https://www.adrianmathtuition.com/api/files/runs/r1/marked.pdf',
  queue_status: 'done',
  result_json: over.rj ?? { portal_submission: true, results: [{ question_number: '1' }] },
  ...over,
});

describe('auto-release sweep — retry until it succeeds (9 Sep 2026)', () => {
  it('retries a marked hand-in whose last auto-release FAILED', () => {
    const r = row({ rj: { portal_submission: true, results: [{}], auto_release: { outcome: 'failed', at: ago(10), note: 'HTTP 502' } } });
    expect(sweepVerdict(r, NOW)).toEqual({ retry: true, why: 'last auto-release failed' });
  });
  it('waits while the bot is still on its own retries', () => {
    const r = row({ rj: { portal_submission: true, results: [{}], auto_release: { outcome: 'failed', at: ago(1) } } });
    expect(sweepVerdict(r, NOW).retry).toBe(false);
  });
  it('retries a marked hand-in that was never stamped, once it is old enough', () => {
    expect(sweepVerdict(row(), NOW)).toEqual({ retry: true, why: 'marked, never auto-released' });
    expect(sweepVerdict(row({ created_at: ago(5) }), NOW).retry).toBe(false);
  });
  it('never touches a rule refusal, a hold, a released run, or a paper Adrian uploaded', () => {
    expect(sweepVerdict(row({ rj: { portal_submission: true, results: [{}], auto_release: { outcome: 'refused', at: ago(60) } } }), NOW).retry).toBe(false);
    expect(sweepVerdict(row({ rj: { portal_submission: true, results: [{}], auto_release: { outcome: 'held', at: ago(60) } } }), NOW).retry).toBe(false);
    expect(sweepVerdict(row({ released_at: ago(30) }), NOW).why).toBe('released');
    expect(sweepVerdict(row({ rj: { results: [{}] } }), NOW).why).toBe('not a student hand-in');
  });
  it('skips what is not finished: unmarked, no PDF, still queued, or outside the window', () => {
    expect(sweepVerdict(row({ rj: { portal_submission: true, results: [] } }), NOW).why).toBe('not marked yet');
    expect(sweepVerdict(row({ annotated_pdf_url: null }), NOW).why).toBe('no marked PDF yet');
    expect(sweepVerdict(row({ queue_status: 'claimed' }), NOW).why).toBe('still in the queue');
    expect(sweepVerdict(row({ created_at: ago(8 * 24 * 60) }), NOW).why).toBe('outside the window');
  });
  it('a Telegram /handin counts as a student hand-in', () => {
    const r = row({ rj: { telegram_handin: { chat_id: 1 }, results: [{}] } });
    expect(sweepCandidates([r], NOW).map(x => x.id)).toEqual(['r1']);
  });
});
