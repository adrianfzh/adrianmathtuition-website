import { describe, it, expect } from 'vitest';
import {
  claimExpired, pickNextJob, sanitizeResult, completionMessage, cancelState, sheetFolder,
  jobInsert, labelFor, isQueuedKind, LEASE_MS, MAX_ATTEMPTS, QUEUED_KINDS,
  type WorksheetJob,
} from './worksheet-jobs';

const t0 = Date.parse('2026-09-05T06:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function job(over: Partial<WorksheetJob> = {}): WorksheetJob {
  return {
    id: 'j1', kind: 1, level: 'S2', topic: 'Polygons', params: { count: 8 }, requested_by: 123,
    label: 'Revision worksheet with worked examples — S2 · Polygons · 8 q',
    status: 'queued', claimed_by: null, claimed_at: null, heartbeat_at: null, stage: null,
    attempts: 0, result: null, error: null, created_at: iso(t0), completed_at: null, ...over,
  };
}

describe('kinds — 3 is instant, the other four queue', () => {
  it('only 1, 2, 4, 5 queue', () => {
    expect(QUEUED_KINDS).toEqual([1, 2, 4, 5]);
    expect(isQueuedKind(3)).toBe(false);
    expect(isQueuedKind('1')).toBe(false);
  });
});

describe('claimExpired — a dead session must never strand a job', () => {
  it('a fresh heartbeat holds the lease', () => {
    const j = job({ status: 'claimed', claimed_at: iso(t0), heartbeat_at: iso(t0 + 60_000) });
    expect(claimExpired(j, t0 + 5 * 60_000)).toBe(false);
  });
  it('a silent claim past the lease is reclaimable', () => {
    const j = job({ status: 'claimed', claimed_at: iso(t0), heartbeat_at: iso(t0) });
    expect(claimExpired(j, t0 + LEASE_MS + 1000)).toBe(true);
  });
  it('a queued job is not "expired" — it is simply waiting', () => {
    expect(claimExpired(job(), t0 + 10 * LEASE_MS)).toBe(false);
  });
});

describe('pickNextJob', () => {
  it('oldest queued first', () => {
    const a = job({ id: 'a', created_at: iso(t0 + 1000) });
    const b = job({ id: 'b', created_at: iso(t0) });
    expect(pickNextJob([a, b], t0 + 5000)?.id).toBe('b');
  });
  it('falls back to an expired claim when nothing is queued', () => {
    const stale = job({ id: 's', status: 'claimed', claimed_at: iso(t0), heartbeat_at: iso(t0) });
    expect(pickNextJob([stale], t0 + LEASE_MS + 1)?.id).toBe('s');
  });
  it('never resurrects a cancelled job, and never past MAX_ATTEMPTS', () => {
    const c = job({ id: 'c', status: 'cancelled' });
    const spent = job({ id: 'x', attempts: MAX_ATTEMPTS });
    expect(pickNextJob([c, spent], t0 + LEASE_MS * 2)).toBeNull();
  });
});

describe('jobInsert — what the bot may queue', () => {
  it('a plain revision sheet request', () => {
    const r = jobInsert({ kind: 1, level: 's2', topic: 'Polygons', params: { count: 8, band: 'Mixed' }, requested_by: 42 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.level).toBe('S2');
      expect(r.row.params).toEqual({ count: 8, band: 'mixed' });
      expect(r.row.status).toBe('queued');
      expect(r.row.label).toContain('Polygons');
    }
  });
  it('refuses kind 3 — that one is instant', () => {
    const r = jobInsert({ kind: 3, level: 'AM', topic: 'Surds' });
    expect(r.ok).toBe(false);
  });
  it('kind 5 needs a paper, not a topic', () => {
    expect(jobInsert({ kind: 5, level: 'EM' }).ok).toBe(false);
    const r = jobInsert({ kind: 5, level: 'EM', params: { paper: 'em-p1', exclude: ['Vectors', ' Sets '] } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row.params).toEqual({ paper: 'EM-P1', exclude: ['Vectors', 'Sets'] });
  });
  it('kind 4 needs the base sheet named', () => {
    expect(jobInsert({ kind: 4, level: 'AM', topic: 'Circles' }).ok).toBe(false);
    expect(jobInsert({ kind: 4, level: 'AM', topic: 'Circles', params: { sheet: '05 Circles Revision.docx' } }).ok).toBe(true);
  });
  it('count is bounded', () => {
    expect(jobInsert({ kind: 2, level: 'AM', topic: 'Surds', params: { count: 0 } }).ok).toBe(false);
    expect(jobInsert({ kind: 2, level: 'AM', topic: 'Surds', params: { count: 41 } }).ok).toBe(false);
  });
});

describe('labelFor — the one line Telegram and the ops board show', () => {
  it('names kind, level, topic, count and band', () => {
    expect(labelFor({ kind: 2, level: 'AM', topic: 'Surds', params: { count: 6, band: 'advanced' } }))
      .toBe('Practice worksheet with notes at the front — AM · Surds · 6 q · advanced');
  });
  it('a prelim paper says which paper and how many topics were dropped', () => {
    expect(labelFor({ kind: 5, level: 'EM', topic: null, params: { paper: 'EM-P1', preset: 'top-school-hard', exclude: ['Vectors'] } }))
      .toBe('Prelim paper EM-P1 (top-school-hard) · minus 1 topic');
  });
  it('kind 4 names the base sheet', () => {
    expect(labelFor({ kind: 4, level: 'AM', topic: 'Circles', params: { sheet: '05 Circles Revision', count: 8 } }))
      .toContain('on "05 Circles Revision"');
  });
});

describe('sanitizeResult / completionMessage', () => {
  it('needs a docx path', () => {
    expect(sanitizeResult({})).toBeNull();
    expect(sanitizeResult({ docx_path: '/Revision/S2/2 REV Polygons.docx', summary: '6 examples · 9 practice', fallbacks: ['Q3'] }))
      .toEqual({ docx_path: '/Revision/S2/2 REV Polygons.docx', pdf_path: null, summary: '6 examples · 9 practice', verified: '', fallbacks: ['Q3'] });
  });
  it('the message carries the label, the folder and the fallbacks', () => {
    const msg = completionMessage(job({ kind: 5, label: 'Prelim paper EM-P1' }),
      sanitizeResult({ docx_path: '/Prelim/EM/2026 EM Prelim.docx', pdf_path: '/Prelim/EM/2026 EM Prelim.pdf', fallbacks: ['slot 4'] }));
    expect(msg).toContain('Prelim paper EM-P1');
    expect(msg).toContain('Prelim › EM');
    expect(msg).toContain('slot 4');
    expect(msg).toContain('PDF and DOCX below');
  });
  it('sheetFolder reads like the Files app', () => {
    expect(sheetFolder('/Revision/S2/2 REV Polygons.docx')).toBe('Revision › S2');
    expect(sheetFolder('')).toBe('');
  });
});

describe('cancelState', () => {
  it('queued and claimed can cancel; done cannot', () => {
    expect(cancelState(job()).can).toBe(true);
    expect(cancelState(job({ status: 'claimed' }))).toEqual({ can: true, running: true });
    expect(cancelState(job({ status: 'done' })).can).toBe(false);
    expect(cancelState(null).can).toBe(false);
  });
});
