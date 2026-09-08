import { describe, it, expect } from 'vitest';
import { sheetQueueGuard, sheetJobInsert, supersededByNewSheet, remarkRequester, type SheetQueueRun } from './sheet-queue';

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
