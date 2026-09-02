import { describe, it, expect } from 'vitest';
import { sheetQueueGuard, sheetJobInsert, type SheetQueueRun } from './sheet-queue';

const run: SheetQueueRun = {
  id: 'f0d82c18-0000-4000-8000-000000000000',
  paper_name: 'am tys 2021 p1',
  student_id: 'recStudent',
  student_name: 'Sophie Tan',
  released_at: null,
  result_json: { results: [{ question_number: '1' }] },
};

describe('sheetQueueGuard — the button and the auto-queue share one rule', () => {
  it('a tagged, marked, unreleased run with no jobs may be queued by either door', () => {
    expect(sheetQueueGuard(run, [])).toEqual({ ok: true });
    expect(sheetQueueGuard(run, [], { auto: true })).toEqual({ ok: true });
  });

  it('refuses a missing run (404)', () => {
    expect(sheetQueueGuard(null, [])).toMatchObject({ ok: false, status: 'not-found', http: 404 });
  });

  it('refuses an untagged run with the message the button has always shown', () => {
    expect(sheetQueueGuard({ ...run, student_id: null }, [])).toMatchObject({
      ok: false, status: 'untagged', http: 400,
      message: 'Tag this paper to a student first — a sheet needs someone to be for.',
    });
  });

  it('refuses a run with no marking yet (a ⏳ pending row)', () => {
    expect(sheetQueueGuard({ ...run, result_json: { source: {} } }, [])).toMatchObject({ ok: false, status: 'no-marking', http: 400 });
    expect(sheetQueueGuard({ ...run, result_json: { results: [] } }, [])).toMatchObject({ ok: false, status: 'no-marking' });
  });

  it('never queues twice while one is in flight — either door', () => {
    for (const status of ['queued', 'claimed']) {
      const r = sheetQueueGuard(run, [{ id: 'j1', status }]);
      expect(r).toMatchObject({ ok: false, status: 'duplicate', http: 409, jobId: 'j1', message: 'A sheet for this paper is already queued.' });
      expect(sheetQueueGuard(run, [{ id: 'j1', status }], { auto: true })).toMatchObject({ ok: false, status: 'duplicate' });
    }
  });

  it('the BUTTON may re-queue after a done, failed or cancelled job', () => {
    for (const status of ['done', 'failed', 'cancelled']) {
      expect(sheetQueueGuard(run, [{ id: 'j1', status }])).toEqual({ ok: true });
    }
  });

  it('the AUTO door is first-time only: any earlier job refuses it', () => {
    expect(sheetQueueGuard(run, [{ id: 'j1', status: 'done' }], { auto: true })).toMatchObject({ ok: false, status: 'exists', http: 409, jobId: 'j1' });
    expect(sheetQueueGuard(run, [{ id: 'j1', status: 'failed' }], { auto: true })).toMatchObject({ ok: false, status: 'exists' });
    // A cancelled job still counts for the auto door — Adrian stopped one on purpose.
    expect(sheetQueueGuard(run, [{ id: 'j1', status: 'cancelled' }], { auto: true })).toMatchObject({ ok: false, status: 'exists', jobId: 'j1' });
  });

  it('the AUTO door refuses a released run; the button does not', () => {
    const released = { ...run, released_at: '2026-09-02T10:00:00Z' };
    expect(sheetQueueGuard(released, [], { auto: true })).toMatchObject({ ok: false, status: 'released', http: 409 });
    expect(sheetQueueGuard(released, [])).toEqual({ ok: true });
  });

  it('untagged / unmarked outrank the in-flight check', () => {
    expect(sheetQueueGuard({ ...run, student_id: null }, [{ id: 'j1', status: 'queued' }])).toMatchObject({ status: 'untagged' });
  });
});

describe('sheetJobInsert', () => {
  it('builds the row the worker claims, focus capped at 300 chars', () => {
    expect(sheetJobInsert(run, null)).toEqual({
      run_id: run.id, airtable_student_id: 'recStudent', student_name: 'Sophie Tan', paper_name: 'am tys 2021 p1', focus: null,
    });
    expect(sheetJobInsert(run, 'x'.repeat(400)).focus).toHaveLength(300);
    expect(sheetJobInsert({ ...run, student_name: null, paper_name: null }, 'logs')).toMatchObject({ student_name: '', paper_name: '', focus: 'logs' });
  });
});
