import { describe, it, expect } from 'vitest';
import { WORKER_JOBS, WORKER_JOB_GROUPS, parseWorkerJobs, offJobs, withWorkerJob, workerJobRows, isWorkerJob } from './worker-jobs';

describe('worker-jobs — the Fly worker\'s job switches', () => {
  it('every job has a unique scheduler key in a known group', () => {
    const keys = WORKER_JOBS.map(j => j.key);
    expect(new Set(keys).size).toBe(keys.length);
    const groups = new Set(WORKER_JOB_GROUPS.map(g => g.key));
    for (const j of WORKER_JOBS) {
      expect(j.key).toMatch(/^[a-z][a-z0-9-]*$/);   // what jobs.sh matches as a whole word
      expect(groups.has(j.group)).toBe(true);
    }
    // the two Adrian named, and the filers added the same day
    for (const k of ['extract', 'twins', 'file-subgroups', 'file-subgroups-science']) expect(isWorkerJob(k)).toBe(true);
    // marking is never switchable here
    expect(isWorkerJob('marking')).toBe(false);
    expect(isWorkerJob('prune')).toBe(false);
  });

  it('fails open: no entry = on, an unreadable row = everything on, unknown keys dropped', () => {
    expect(offJobs(parseWorkerJobs(undefined))).toEqual([]);
    expect(offJobs(parseWorkerJobs('not json'))).toEqual([]);
    const m = parseWorkerJobs(JSON.stringify({ twins: { on: false, at: '2026-10-02T01:00:00Z', by: 'adrian' }, extract: { on: true }, 'rm -rf': { on: false }, 'file-subgroups': { } }));
    expect(offJobs(m)).toEqual(['twins']);
    expect(Object.keys(m).sort()).toEqual(['extract', 'file-subgroups', 'twins']);
    expect(workerJobRows(m).every(r => r.key === 'twins' ? !r.on : r.on)).toBe(true);
  });

  it('a flip changes one job and keeps the rest', () => {
    const a = withWorkerJob({}, 'extract', false, 'adrian', '2026-10-02T01:00:00Z');
    const b = withWorkerJob(a, 'twins', false, 'adrian', '2026-10-02T01:01:00Z');
    expect(offJobs(b)).toEqual(['extract', 'twins']);
    const c = withWorkerJob(b, 'extract', true, 'adrian', '2026-10-02T01:02:00Z');
    expect(offJobs(c)).toEqual(['twins']);
    expect(c.extract).toEqual({ on: true, at: '2026-10-02T01:02:00Z', by: 'adrian' });
  });
});
