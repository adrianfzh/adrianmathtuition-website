import { describe, it, expect } from 'vitest';
import {
  claimExpired, pickNextJob, sanitizeResult, completionMessage,
  LEASE_MS, MAX_ATTEMPTS, type SheetJob,
} from './sheet-jobs';

const t0 = Date.parse('2026-08-30T10:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function job(over: Partial<SheetJob> = {}): SheetJob {
  return {
    id: 'j1', run_id: 'r1', airtable_student_id: 'recAAAAAAAAAAAAAA', student_name: 'A Student',
    paper_name: 'AM 2021 P1', focus: null, status: 'queued', claimed_by: null, claimed_at: null,
    heartbeat_at: null, attempts: 0, result: null, error: null,
    created_at: iso(t0), completed_at: null, ...over,
  };
}

describe('claimExpired — a dead session must never strand a job', () => {
  it('a fresh heartbeat holds the lease', () => {
    const j = job({ status: 'claimed', claimed_at: iso(t0), heartbeat_at: iso(t0 + 60_000) });
    expect(claimExpired(j, t0 + 5 * 60_000)).toBe(false);
  });
  it('a silent claim past the lease is reclaimable', () => {
    const j = job({ status: 'claimed', claimed_at: iso(t0), heartbeat_at: iso(t0) });
    expect(claimExpired(j, t0 + LEASE_MS + 1000)).toBe(true);
  });
  it('a claim with no heartbeat at all falls back to claimed_at, then to reclaimable', () => {
    expect(claimExpired(job({ status: 'claimed', claimed_at: iso(t0) }), t0 + 60_000)).toBe(false);
    expect(claimExpired(job({ status: 'claimed', claimed_at: null }), t0)).toBe(true);
    expect(claimExpired(job({ status: 'claimed', claimed_at: 'not-a-date' }), t0)).toBe(true);
  });
  it('only claimed jobs expire', () => {
    for (const status of ['queued', 'done', 'failed'] as const) {
      expect(claimExpired(job({ status, heartbeat_at: iso(t0 - 99 * LEASE_MS) }), t0)).toBe(false);
    }
  });
});

describe('pickNextJob', () => {
  it('oldest queued job wins', () => {
    const older = job({ id: 'old', created_at: iso(t0 - 60_000) });
    const newer = job({ id: 'new', created_at: iso(t0) });
    expect(pickNextJob([newer, older], t0)!.id).toBe('old');
  });
  it('queued beats an abandoned claim', () => {
    const stale = job({ id: 'stale', status: 'claimed', created_at: iso(t0 - 999_000), heartbeat_at: iso(t0 - LEASE_MS - 1) });
    const queued = job({ id: 'q', created_at: iso(t0) });
    expect(pickNextJob([stale, queued], t0)!.id).toBe('q');
  });
  it('an abandoned claim is taken when nothing is queued', () => {
    const stale = job({ id: 'stale', status: 'claimed', heartbeat_at: iso(t0 - LEASE_MS - 1) });
    expect(pickNextJob([stale], t0)!.id).toBe('stale');
  });
  it('a live claim, a finished job and an exhausted job are never picked', () => {
    const live = job({ id: 'live', status: 'claimed', heartbeat_at: iso(t0) });
    const done = job({ id: 'done', status: 'done' });
    const burnt = job({ id: 'burnt', status: 'queued', attempts: MAX_ATTEMPTS });
    expect(pickNextJob([live, done, burnt], t0)).toBeNull();
    expect(pickNextJob([], t0)).toBeNull();
  });
});

describe('sanitizeResult', () => {
  it('keeps the paths and lists, trims and caps', () => {
    const r = sanitizeResult({
      docx_path: '  /Self-Study/A/sheet.docx ', pdf_path: '/Self-Study/A/sheet.pdf',
      wave: ['chain rule', ' ', 'integration'], shelved: ['polynomials'], verified: '42/42 checks',
    })!;
    expect(r.docx_path).toBe('/Self-Study/A/sheet.docx');
    expect(r.wave).toEqual(['chain rule', 'integration']);
    expect(r.shelved).toEqual(['polynomials']);
    expect(r.verified).toBe('42/42 checks');
  });
  it('a result with no DOCX path is unusable', () => {
    expect(sanitizeResult({ pdf_path: '/x.pdf' })).toBeNull();
    expect(sanitizeResult(null)).toBeNull();
    expect(sanitizeResult({ docx_path: '   ' })).toBeNull();
  });
  it('junk lists degrade to empty rather than throwing', () => {
    const r = sanitizeResult({ docx_path: '/a.docx', wave: 'nope', shelved: null })!;
    expect(r.wave).toEqual([]);
    expect(r.shelved).toEqual([]);
  });
});

describe('completionMessage', () => {
  it('names the student, the wave and the shelf, and says what to do next', () => {
    const msg = completionMessage(
      { student_name: 'A Student', paper_name: 'AM 2021 P1' },
      sanitizeResult({ docx_path: '/x.docx', wave: ['chain rule'], shelved: ['polynomials'], verified: '42/42 checks' }),
    );
    expect(msg).toContain('A Student');
    expect(msg).toContain('AM 2021 P1');
    expect(msg).toContain('chain rule');
    expect(msg).toContain('🧺 Shelved for later: polynomials');
    expect(msg).toContain('release the paper + sheet together');
  });
  it('survives a bare result', () => {
    const msg = completionMessage({ student_name: '', paper_name: '' }, null);
    expect(msg).toContain('A student');
    expect(msg).not.toContain('undefined');
  });
});
