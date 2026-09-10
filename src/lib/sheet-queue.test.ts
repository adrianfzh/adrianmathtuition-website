import { describe, it, expect } from 'vitest';
import { sheetQueueGuard, sheetJobInsert, supersededByNewSheet, remarkRequester, focusText, type SheetQueueRun } from './sheet-queue';

const run: SheetQueueRun = {
  id: 'run-1', paper_name: 'am tys 2021 p1', student_id: 'recStudent', student_name: 'Sophie Tan',
  released_at: null, result_json: { pages: [] },
};
const released: SheetQueueRun = { ...run, released_at: '2026-09-08T04:00:00Z' };

describe('sheetQueueGuard — shared rules', () => {
  it('refuses a missing run', () => {
    expect(sheetQueueGuard(null, [])).toMatchObject({ ok: false, status: 'not-found', http: 404 });
  });
  it('refuses an untagged run — a sheet needs someone to be for', () => {
    expect(sheetQueueGuard({ ...run, student_id: null }, [])).toMatchObject({ ok: false, status: 'untagged', http: 400 });
  });
  it('refuses a run with no marking', () => {
    expect(sheetQueueGuard({ ...run, result_json: null }, [])).toMatchObject({ ok: false, status: 'no-marking', http: 400 });
  });
  it('refuses while a job is queued or claimed, naming it', () => {
    expect(sheetQueueGuard(run, [{ id: 'j1', status: 'claimed' }])).toMatchObject({ ok: false, status: 'duplicate', http: 409, jobId: 'j1' });
    expect(sheetQueueGuard(run, [{ id: 'j2', status: 'queued' }], { requestedBy: 'student' })).toMatchObject({ status: 'duplicate' });
  });
});

describe('sheetQueueGuard — no Practice Again for science (10 Sep 2026)', () => {
  it('refuses a science run from both doors', () => {
    expect(sheetQueueGuard({ ...run, subject: 'physics' }, [])).toMatchObject({ ok: false, status: 'science', http: 400 });
    expect(sheetQueueGuard({ ...run, subject: 'biology' }, [], { requestedBy: 'student' })).toMatchObject({ ok: false, status: 'science' });
  });
  it('a maths run, or one with no lane recorded, is unaffected', () => {
    expect(sheetQueueGuard({ ...run, subject: 'math' }, [])).toEqual({ ok: true });
    expect(sheetQueueGuard({ ...run, subject: null }, [])).toEqual({ ok: true });
  });
});

describe("sheetQueueGuard — Adrian's door (the desk)", () => {
  it('lets a tagged marked paper through, released or not', () => {
    expect(sheetQueueGuard(run, [])).toEqual({ ok: true });
    expect(sheetQueueGuard(released, [])).toEqual({ ok: true });
  });
  it('re-queues after a done, failed or cancelled job', () => {
    for (const status of ['done', 'failed', 'cancelled']) {
      expect(sheetQueueGuard(released, [{ id: 'j', status }])).toEqual({ ok: true });
    }
  });
});

describe('sheetQueueGuard — the student door (the app)', () => {
  it('needs the paper to be out first', () => {
    expect(sheetQueueGuard(run, [], { requestedBy: 'student' })).toMatchObject({ ok: false, status: 'not-released', http: 409 });
  });
  it('lets a released paper with no sheet through', () => {
    expect(sheetQueueGuard(released, [], { requestedBy: 'student' })).toEqual({ ok: true });
  });
  it('does not write a second sheet when one exists', () => {
    expect(sheetQueueGuard(released, [{ id: 'j1', status: 'done' }], { requestedBy: 'student' })).toMatchObject({ ok: false, status: 'exists', http: 409, jobId: 'j1' });
  });
  it('lets the student try again after a failed or cancelled job', () => {
    expect(sheetQueueGuard(released, [{ id: 'j1', status: 'failed' }], { requestedBy: 'student' })).toEqual({ ok: true });
    expect(sheetQueueGuard(released, [{ id: 'j1', status: 'cancelled' }], { requestedBy: 'student' })).toEqual({ ok: true });
  });
});

describe('sheetQueueGuard — wave two (11 Sep 2026)', () => {
  it('lets the student past the "a sheet already exists" refusal, and nothing else', () => {
    const done = [{ id: 'j1', status: 'done' }];
    expect(sheetQueueGuard(released, done, { requestedBy: 'student' })).toMatchObject({ status: 'exists' });
    expect(sheetQueueGuard(released, done, { requestedBy: 'student', wave: 2 })).toEqual({ ok: true });
  });
  it('still refuses while a job is in flight, and a paper that is not out', () => {
    expect(sheetQueueGuard(released, [{ id: 'j1', status: 'done' }, { id: 'j2', status: 'queued' }], { requestedBy: 'student', wave: 2 }))
      .toMatchObject({ ok: false, status: 'duplicate', jobId: 'j2' });
    expect(sheetQueueGuard(run, [{ id: 'j1', status: 'done' }], { requestedBy: 'student', wave: 2 }))
      .toMatchObject({ ok: false, status: 'not-released' });
  });
  it('wave 1 (or none) is unchanged', () => {
    expect(sheetQueueGuard(released, [{ id: 'j1', status: 'done' }], { requestedBy: 'student', wave: 1 })).toMatchObject({ status: 'exists' });
  });
});

describe('focusText — the instruction the worker honours', () => {
  it('passes a written note through, trimmed', () => {
    expect(focusText('  teach the chain rule  ')).toBe('teach the chain rule');
    expect(focusText(undefined)).toBeNull();
    expect(focusText('')).toBeNull();
  });
  it('renders the wave-two shape as JSON the worker can read, never "[object Object]"', () => {
    const text = focusText({ wave: 2, shelved: ['Polynomials', 'Plane geometry'] }) ?? '';
    expect(text).not.toContain('object Object');
    const f = JSON.parse(text);
    expect(f.wave).toBe(2);
    expect(f.shelved).toEqual(['Polynomials', 'Plane geometry']);
  });
  it('still says wave 2 when the first sheet named no shelf', () => {
    const f = JSON.parse(focusText({ wave: 2, shelved: [] }) ?? '');
    expect(f).toMatchObject({ wave: 2, shelved: [] });
    expect(f.instruction).toContain('next wave');
  });
});

describe('sheetJobInsert', () => {
  it('stamps who asked — Adrian by default', () => {
    expect(sheetJobInsert(run)).toEqual({
      run_id: 'run-1', airtable_student_id: 'recStudent', student_name: 'Sophie Tan', paper_name: 'am tys 2021 p1', focus: null, requested_by: 'adrian',
    });
    expect(sheetJobInsert(run, undefined, 'student').requested_by).toBe('student');
  });
  it('keeps the focus note to 300 characters', () => {
    expect(sheetJobInsert(run, 'x'.repeat(400)).focus).toHaveLength(300);
  });
});

describe('supersededByNewSheet', () => {
  const jobs = [{ id: 'a', status: 'done' }, { id: 'b', status: 'claimed' }, { id: 'c', status: 'failed' }];
  it('a plain new sheet cancels nothing but clears every earlier held item', () => {
    expect(supersededByNewSheet(jobs)).toEqual({ cancel: [], clearHeld: ['a', 'b', 'c'] });
  });
  it('a re-mark also cancels what is still in flight', () => {
    expect(supersededByNewSheet(jobs, { remark: true })).toEqual({ cancel: ['b'], clearHeld: ['a', 'b', 'c'] });
  });
});

describe('remarkRequester — who a replacement sheet is for', () => {
  it('is nobody when the paper never had a sheet', () => {
    expect(remarkRequester([])).toBeNull();
    expect(remarkRequester([{ id: 'x', status: 'cancelled', requested_by: 'student' }])).toBeNull();
  });
  it('follows the newest non-cancelled job', () => {
    expect(remarkRequester([
      { id: 'a', status: 'done', requested_by: 'adrian', created_at: '2026-09-01T00:00:00Z' },
      { id: 'b', status: 'done', requested_by: 'student', created_at: '2026-09-05T00:00:00Z' },
    ])).toBe('student');
  });
  it('treats legacy auto-queued sheets as Adrian’s (back to the desk, on the clock)', () => {
    expect(remarkRequester([{ id: 'a', status: 'done', requested_by: 'auto' }])).toBe('adrian');
    expect(remarkRequester([{ id: 'a', status: 'done', requested_by: null }])).toBe('adrian');
  });
});

describe('a returned Practice Again sheet gets no sheet of its own (9 Sep 2026)', () => {
  it('refuses whoever asks', () => {
    const run = { id: 'r', paper_name: 'Practice Again — A Math 2021 Paper 1', student_id: 's', student_name: 'Sophie', released_at: '2026-09-08T04:00:00Z', result_json: { results: [{}] } } as never;
    const a = sheetQueueGuard(run, [], { requestedBy: 'adrian' });
    const b = sheetQueueGuard(run, [], { requestedBy: 'student' });
    expect(a.ok).toBe(false); expect((a as { status: string }).status).toBe('practice-again');
    expect(b.ok).toBe(false); expect((b as { status: string }).status).toBe('practice-again');
  });
});

// ── Batches: one sheet for several papers of one subject (10 Sep 2026) ──────
import { sheetBatchGuard, batchPaperName, coveredRunIds, sheetBatchInsert, type SheetBatchRun } from './sheet-queue';

const bRun = (id: string, extra: Partial<SheetBatchRun> = {}): SheetBatchRun => ({
  id, paper_name: `isabelle TYS AM 2025 ${id}`, student_id: 'recIsa', student_name: 'Isabelle Toh Si Xian',
  released_at: '2026-09-09T06:56:41Z', result_json: { results: [] }, created_at: '2026-09-08T04:59:00Z', paper_subject: 'A Math', ...extra,
});

describe('sheetBatchGuard — the desk tick', () => {
  it('needs at least two distinct papers', () => {
    expect(sheetBatchGuard([bRun('p1')])).toMatchObject({ ok: false, status: 'too-few', http: 400 });
    expect(sheetBatchGuard([bRun('p1'), bRun('p1')])).toMatchObject({ ok: false, status: 'too-few' });
  });
  it('refuses when a ticked paper is missing, untagged, unmarked, or a returned sheet', () => {
    expect(sheetBatchGuard([bRun('p1'), null])).toMatchObject({ ok: false, status: 'not-found', http: 404 });
    expect(sheetBatchGuard([bRun('p1'), bRun('p2', { student_id: null })])).toMatchObject({ ok: false, status: 'untagged', runId: 'p2' });
    expect(sheetBatchGuard([bRun('p1'), bRun('p2', { result_json: null })])).toMatchObject({ ok: false, status: 'no-marking', runId: 'p2' });
  });
  it('one student, one subject', () => {
    expect(sheetBatchGuard([bRun('p1'), bRun('p2', { student_id: 'recOther' })])).toMatchObject({ ok: false, status: 'mixed-students' });
    expect(sheetBatchGuard([bRun('p1'), bRun('p2', { paper_subject: 'E Math' })])).toMatchObject({ ok: false, status: 'mixed-subjects' });
  });
  it('the newest paper is the primary; the batch keeps every run', () => {
    const g = sheetBatchGuard([bRun('old', { created_at: '2026-09-08T04:59:00Z' }), bRun('new', { created_at: '2026-09-09T08:40:00Z' }), bRun('mid', { created_at: '2026-09-08T05:27:00Z' })]);
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.primary.id).toBe('new');
    expect(g.runs.map(r => r.id)).toEqual(['new', 'mid', 'old']);
    const row = sheetBatchInsert(g.primary, g.runs, null, 'adrian');
    expect(row).toMatchObject({ run_id: 'new', run_ids: ['new', 'mid', 'old'], requested_by: 'adrian', airtable_student_id: 'recIsa' });
    expect(row.paper_name).toBe('3 papers: isabelle TYS AM 2025 new · isabelle TYS AM 2025 mid · isabelle TYS AM 2025 old');
  });
  it('batchPaperName and coveredRunIds', () => {
    expect(batchPaperName([{ paper_name: 'a' }, { paper_name: null }])).toBe('2 papers: a · untitled');
    expect(coveredRunIds({ run_id: 'p1', run_ids: ['p1', 'p2', 'p3'] })).toEqual(['p1', 'p2', 'p3']);
    expect(coveredRunIds({ run_id: 'p1', run_ids: null })).toEqual(['p1']);
    expect(coveredRunIds({ run_id: 'p1', run_ids: ['p2'] })).toEqual(['p1', 'p2']);
  });
});
