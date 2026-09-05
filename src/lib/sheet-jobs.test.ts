import { describe, it, expect } from 'vitest';
import {
  claimExpired, pickNextJob, sanitizeResult, completionMessage, cancelState, sheetFolder,
  isNoSheet, readNoSheet, NO_SHEET_REASON, LEASE_MS, MAX_ATTEMPTS,
  type SheetJob, type SheetFiledResult,
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
    for (const status of ['queued', 'done', 'failed', 'cancelled'] as const) {
      expect(claimExpired(job({ status, heartbeat_at: iso(t0 - 99 * LEASE_MS) }), t0)).toBe(false);
    }
  });
});

describe('cancelState — undoing a misclicked 📘', () => {
  it('a queued job cancels, and is not running', () => {
    expect(cancelState(job({ status: 'queued' }))).toEqual({ can: true, running: false });
  });
  it('a claimed job cancels, and says a session is mid-way through it', () => {
    expect(cancelState(job({ status: 'claimed' }))).toEqual({ can: true, running: true });
  });
  it('a finished, failed, or already-cancelled job cannot be cancelled, each with its own reason', () => {
    for (const status of ['done', 'failed', 'cancelled'] as const) {
      const r = cancelState(job({ status }));
      expect(r.can).toBe(false);
      expect(r.reason).toBeTruthy();
    }
    expect(cancelState(job({ status: 'done' })).reason).toMatch(/already written/);
  });
  it('a missing job says so rather than throwing', () => {
    expect(cancelState(null).can).toBe(false);
    expect(cancelState(undefined).reason).toMatch(/no sheet job/);
  });
});

describe('a cancelled job never comes back', () => {
  it('is not picked as queued work', () => {
    expect(pickNextJob([job({ id: 'x', status: 'cancelled' })], t0)).toBeNull();
  });
  it('is not picked as an abandoned lease, however long it sits', () => {
    const stale = job({ id: 'x', status: 'cancelled', claimed_at: iso(t0), heartbeat_at: iso(t0) });
    expect(pickNextJob([stale], t0 + 99 * LEASE_MS)).toBeNull();
  });
  it('does not block a real queued job behind it', () => {
    const live = job({ id: 'live', created_at: iso(t0 + 60_000) });
    const dead = job({ id: 'dead', status: 'cancelled', created_at: iso(t0) });
    expect(pickNextJob([dead, live], t0 + 120_000)?.id).toBe('live');
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

/** sanitizeResult narrowed to a FILED sheet — the noSheet shape is asserted separately below. */
const filed = (input: unknown) => sanitizeResult(input) as SheetFiledResult;

describe('sanitizeResult', () => {
  it('keeps the paths and lists, trims and caps', () => {
    const r = filed({
      docx_path: '  /Self-Study/A/sheet.docx ', pdf_path: '/Self-Study/A/sheet.pdf',
      wave: ['chain rule', ' ', 'integration'], shelved: ['polynomials'], verified: '42/42 checks',
    });
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
    const r = filed({ docx_path: '/a.docx', wave: 'nope', shelved: null });
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
  it('names the Dropbox folder as the Files app shows it, and says the files follow when a PDF exists', () => {
    const msg = completionMessage(
      { student_name: 'Tan Sijia', paper_name: 'sijia am tys 2021 p1' },
      sanitizeResult({ docx_path: '/Students/Tan Sijia/2026-08-31 sijia am tys 2021 p1/Practice Again.docx', pdf_path: '/Students/Tan Sijia/2026-08-31 sijia am tys 2021 p1/Practice Again.pdf' }),
    );
    expect(msg).toContain('📂 Dropbox › Students › Tan Sijia › 2026-08-31 sijia am tys 2021 p1');
    expect(msg).toContain('PDF and DOCX below');
    const noPdf = completionMessage({ student_name: 'X', paper_name: '' }, sanitizeResult({ docx_path: '/Students/X/p/Practice Again.docx' }));
    expect(noPdf).not.toContain('PDF and DOCX below');
  });
  it('survives a bare result', () => {
    const msg = completionMessage({ student_name: '', paper_name: '' }, null);
    expect(msg).toContain('A student');
    expect(msg).toContain('In Dropbox');
    expect(msg).not.toContain('undefined');
  });
  it('carries the Practice Again hand-back line when items were held (SPEC-PORTAL-V2 §7)', () => {
    const result = sanitizeResult({ docx_path: '/Students/X/p/Practice Again.docx', wave: ['chain rule'] });
    const msg = completionMessage({ student_name: 'X', paper_name: 'AM P1' }, result, { heldItemsLine: '🔁 5 practice items held for release (3 from the bank, 2 written)' });
    expect(msg).toContain('🔁 5 practice items held for release');
    expect(msg).toContain('the practice items go out with them');
    const plain = completionMessage({ student_name: 'X', paper_name: 'AM P1' }, result);
    expect(plain).not.toContain('🔁');
    expect(plain).not.toContain('practice items go out');
  });
});

// ── "nothing to teach" is a completion, not a failure (Adrian, 3 Sep 2026) ────
// Kassandra Lim's 89/90 (one misread) and 87/90 (three careless slips, same
// score at a previous sitting): the worker was right both times, but `fail` was
// the only way to close the job, so each conclusion was reached three times and
// alarmed as "⚠️ Self-study sheet failed 3×".
describe('sanitizeResult — noSheet needs no files', () => {
  it('accepts a completion with no docx at all, and keeps the reason', () => {
    const r = sanitizeResult({ noSheet: true, reason: '89/90 — the one lost mark was a misread, not a gap' })!;
    expect(isNoSheet(r)).toBe(true);
    expect(r).toEqual({ noSheet: true, reason: '89/90 — the one lost mark was a misread, not a gap' });
  });
  it('a missing reason falls back rather than being blank', () => {
    expect(sanitizeResult({ noSheet: true })).toEqual({ noSheet: true, reason: NO_SHEET_REASON });
    expect(sanitizeResult({ noSheet: true, reason: '   ' })).toEqual({ noSheet: true, reason: NO_SHEET_REASON });
  });
  it('caps a runaway reason', () => {
    const r = sanitizeResult({ noSheet: true, reason: 'x'.repeat(900) })!;
    expect((r as { reason: string }).reason).toHaveLength(300);
  });
  it('noSheet:false is an ordinary sheet — still needs its docx', () => {
    expect(sanitizeResult({ noSheet: false })).toBeNull();
    const r = sanitizeResult({ noSheet: false, docx_path: '/a.docx' })!;
    expect(isNoSheet(r)).toBe(false);
  });
  it('a filed sheet is never mistaken for one', () => {
    expect(isNoSheet(sanitizeResult({ docx_path: '/a.docx' }))).toBe(false);
    expect(isNoSheet(null)).toBe(false);
  });
});

describe('readNoSheet — the flag as STORED on the row', () => {
  it('reads the reason back out of the jsonb', () => {
    expect(readNoSheet({ noSheet: true, reason: '87/90, three careless slips' }))
      .toEqual({ noSheet: true, reason: '87/90, three careless slips' });
  });
  it('a filed sheet, a null result and junk are all "there is a sheet"', () => {
    expect(readNoSheet({ docx_path: '/a.docx' })).toEqual({ noSheet: false, reason: '' });
    expect(readNoSheet(null)).toEqual({ noSheet: false, reason: '' });
    expect(readNoSheet('nope')).toEqual({ noSheet: false, reason: '' });
    expect(readNoSheet({ noSheet: false, reason: 'x' })).toEqual({ noSheet: false, reason: '' });
  });
  it('falls back when the reason went missing', () => {
    expect(readNoSheet({ noSheet: true }).reason).toBe(NO_SHEET_REASON);
  });
});

describe('completionMessage — a right answer must not read like an alarm', () => {
  it('names the student, the paper and the reason, and says what to do', () => {
    const msg = completionMessage(
      { student_name: 'Kassandra Lim', paper_name: 'AM 2022 P2' },
      sanitizeResult({ noSheet: true, reason: '89/90 — the one lost mark was a misread' }),
    );
    expect(msg).toBe('📘 No sheet for <b>Kassandra Lim</b> (AM 2022 P2) — 89/90 — the one lost mark was a misread. Release the paper on its own from the desk.');
    expect(msg).not.toContain('⚠️');
    expect(msg).not.toMatch(/fail/i);
  });
  it('survives a nameless job', () => {
    const msg = completionMessage({ student_name: '', paper_name: '' }, sanitizeResult({ noSheet: true }));
    expect(msg).toContain('A student');
    expect(msg).not.toContain('undefined');
    expect(msg).not.toContain('()');
  });
});

describe('sheetFolder', () => {
  it('drops the file and joins the folders with ›', () => {
    expect(sheetFolder('/Students/Tan Sijia/2026-08-31 sijia am tys 2021 p1/Practice Again.docx')).toBe('Students › Tan Sijia › 2026-08-31 sijia am tys 2021 p1');
    expect(sheetFolder('x.docx')).toBe('');
    expect(sheetFolder(null)).toBe('');
  });
});
