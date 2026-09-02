import { describe, it, expect } from 'vitest';
import { staleJobs, neverStamped } from './job-health';
import type { JobRunRow } from './job-log';

const row = (job: string, ranAt: string, ok = true, summary: string | null = null): JobRunRow =>
  ({ job, ran_at: ranAt, ok, summary });

describe('staleJobs — interval jobs', () => {
  it('a nightly job that ran last night is fresh', () => {
    const now = new Date('2026-08-27T02:00:00Z');   // 10am SGT
    expect(staleJobs([row('qb-topup', '2026-08-26T19:31:00Z')], now)).toEqual([]);
  });
  it('a nightly job past its 36h window is stale', () => {
    const now = new Date('2026-08-27T02:00:00Z');
    const out = staleJobs([row('qb-topup', '2026-08-24T19:31:00Z')], now);
    expect(out).toHaveLength(1);
    expect(out[0].job).toBe('qb-topup');
    expect(out[0].reason).toMatch(/hasn't run in \d+h/);
  });
  it('a weekly job gets its 8.5-day window', () => {
    const now = new Date('2026-08-27T02:00:00Z');
    expect(staleJobs([row('bot-review', '2026-08-24T00:00:00Z')], now)).toEqual([]);
    expect(staleJobs([row('bot-review', '2026-08-17T00:00:00Z')], now)).toHaveLength(1);
  });
});

describe('staleJobs — monthly jobs (SGT calendar)', () => {
  it('before the window opens, nothing is expected', () => {
    const now = new Date('2026-08-10T02:00:00Z');   // 10th SGT
    expect(staleJobs([row('generate-invoices', '2026-07-13T23:30:00Z')], now)).toEqual([]);
  });
  it('inside the grace day, still quiet', () => {
    const now = new Date('2026-08-15T02:00:00Z');   // 15th SGT, grace runs to the 15th
    expect(staleJobs([row('generate-invoices', '2026-07-13T23:30:00Z')], now)).toEqual([]);
  });
  it('past the grace with no run this month → alarm', () => {
    const now = new Date('2026-08-16T02:00:00Z');   // 16th SGT
    const out = staleJobs([row('generate-invoices', '2026-07-13T23:30:00Z')], now);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toMatch(/no run this month/);
  });
  it('a run stamped in UTC late on the eve of its SGT day still counts', () => {
    const now = new Date('2026-08-20T02:00:00Z');
    // 13th 23:30 UTC = 14th 7:30am SGT — but even a raw-13th SGT stamp gets the
    // one-day early slack.
    expect(staleJobs([row('generate-invoices', '2026-08-13T10:00:00Z')], now)).toEqual([]);
  });
});

describe('staleJobs — month-restricted monthly jobs (year-end arrears billing)', () => {
  it('a Nov/Dec/Jan-only job is never expected in August, however old its last stamp', () => {
    const now = new Date('2026-08-20T02:00:00Z');
    expect(staleJobs([row('generate-invoices-arrears', '2026-01-01T00:30:00Z')], now)).toEqual([]);
  });
  it('in November, past the grace day, a missing run alarms', () => {
    const now = new Date('2026-11-03T02:00:00Z');   // 3 Nov SGT — grace ran to the 2nd
    const out = staleJobs([row('generate-invoices-arrears', '2026-01-01T00:30:00Z')], now);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toMatch(/no run this month/);
  });
  it('in November, a run stamped on the 1st is fresh', () => {
    const now = new Date('2026-11-03T02:00:00Z');
    expect(staleJobs([row('generate-invoices-arrears', '2026-11-01T00:05:00Z')], now)).toEqual([]);
  });
  it('the send job on the 2nd has its own window', () => {
    const now = new Date('2026-12-04T02:00:00Z');   // 4 Dec SGT
    expect(staleJobs([row('send-invoices-arrears', '2026-11-02T02:10:00Z')], now)).toHaveLength(1);
    expect(staleJobs([row('send-invoices-arrears', '2026-12-02T02:10:00Z')], now)).toEqual([]);
  });
  it('January is a firing month (the combined December+January invoice)', () => {
    const now = new Date('2027-01-05T02:00:00Z');
    expect(staleJobs([row('generate-invoices-arrears', '2026-12-01T00:05:00Z')], now)).toHaveLength(1);
    expect(staleJobs([row('generate-invoices-arrears', '2027-01-01T00:05:00Z')], now)).toEqual([]);
  });
  it('October is quiet even though the arrears season has started (first run is 1 Nov)', () => {
    const now = new Date('2026-10-20T02:00:00Z');
    expect(staleJobs([row('send-invoices-arrears', '2026-01-02T02:10:00Z')], now)).toEqual([]);
  });
});

describe('staleJobs — failure and edge handling', () => {
  it('a latest run with ok=false is flagged even when recent', () => {
    const now = new Date('2026-08-27T02:00:00Z');
    const out = staleJobs([row('qb-topup', '2026-08-26T19:31:00Z', false, 'gate rejected all 6')], now);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toMatch(/FAILED — gate rejected all 6/);
  });
  it('never-stamped jobs are skipped by staleJobs and listed by neverStamped', () => {
    const now = new Date('2026-08-27T02:00:00Z');
    const latest = [row('qb-topup', '2026-08-26T19:31:00Z')];
    expect(staleJobs(latest, now)).toEqual([]);
    expect(neverStamped(latest)).toContain('send-invoices');
    expect(neverStamped(latest)).not.toContain('qb-topup');
  });
  it('rows for jobs with no rhythm are ignored', () => {
    const now = new Date('2026-08-27T02:00:00Z');
    expect(staleJobs([row('some-future-job', '2026-01-01T00:00:00Z')], now)).toEqual([]);
  });
  it('an unparseable timestamp never throws', () => {
    const now = new Date('2026-08-27T02:00:00Z');
    expect(staleJobs([row('qb-topup', 'garbage')], now)).toEqual([]);
  });
});

describe('staleJobs — the health check must not grade its own last run', () => {
  const now = new Date('2026-09-01T12:00:00Z');
  const hc = (ok: boolean) => ({ job: 'health-check', ran_at: '2026-09-01T06:00:00Z', ok, summary: '1/41 checks failing' });

  // The latch: health-check reads staleJobs(), then stamps its own row. Once any
  // check failed once, its own ok=false became the reason the NEXT run failed —
  // a self-sustaining 🚨 every 6h that could never clear (29 Aug – 1 Sep 2026).
  it('reports its own failed run to the ops board', () => {
    const out = staleJobs([hc(false)], now);
    expect(out).toHaveLength(1);
    expect(out[0].job).toBe('health-check');
  });

  it('but stays silent when the health check excludes itself', () => {
    expect(staleJobs([hc(false)], now, { exclude: ['health-check'] })).toEqual([]);
  });

  it('excluding one job does not mute the others', () => {
    const out = staleJobs(
      [hc(false), { job: 'qb-topup', ran_at: '2026-09-01T06:00:00Z', ok: false, summary: 'gate rejected all 6' }],
      now,
      { exclude: ['health-check'] },
    );
    expect(out.map(s => s.job)).toEqual(['qb-topup']);
  });
});
