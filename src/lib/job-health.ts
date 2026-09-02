// ─── Missed-slot rules for the centre's logbook ─────────────────────────────────
//
// Pure: given the newest logbook row per job and the clock, say which jobs have
// missed their rhythm or last finished in failure. The health check turns what
// this returns into the Telegram alarm; /admin/ops turns it into amber rows.
//
// A job that has NEVER stamped is skipped, not alarmed — on the day this ships
// nothing has stamped yet, and a day-one alarm storm would teach Adrian to
// ignore the alarm on day two. The ops board lists never-stamped jobs
// separately so they are visible without being noisy.
//
// Rhythm days are judged in SGT (every schedule in this repo is quoted in SGT);
// grace is deliberately generous — a late job is a curiosity, a missed one is
// the incident.

import type { JobRunRow } from './job-log';
import { sgtClock } from './sgt';

export type Rhythm =
  | { kind: 'interval'; hours: number; label: string }
  | { kind: 'monthly'; day: number; graceDays: number; label: string };

export const JOB_RHYTHMS: Record<string, Rhythm> = {
  'qb-topup':          { kind: 'interval', hours: 36, label: 'nightly 3:30am' },
  'file-subgroups':    { kind: 'interval', hours: 36, label: 'nightly 4:15am' },
  'bot-review':        { kind: 'interval', hours: 204, label: 'Mondays 8am' },   // 8.5 days
  'question-mine':     { kind: 'interval', hours: 108, label: 'Mon & Thu 7am' },
  'generate-invoices': { kind: 'monthly', day: 14, graceDays: 1, label: '14th 7am' },
  'send-invoices':     { kind: 'monthly', day: 15, graceDays: 1, label: '15th 10am' },
  'payment-reminder':  { kind: 'monthly', day: 14, graceDays: 1, label: '14th 8pm' },
  // Prorated-month arrears billing (docs/INVOICES.md): generation on the 1st,
  // send on the 2nd, for the just-ended month when it was June/Oct–Dec. Both
  // stamp EVERY month — a quiet "not a prorated month" no-op on the other 8 —
  // so a dead cron and a quiet month are told apart here.
  'prorated-arrears':      { kind: 'monthly', day: 1, graceDays: 1, label: '1st 9am' },
  'prorated-arrears-send': { kind: 'monthly', day: 2, graceDays: 1, label: '2nd 10am' },
  'progress-digest':   { kind: 'monthly', day: 1,  graceDays: 1, label: '1st 8am' },
  'retention':         { kind: 'monthly', day: 2,  graceDays: 1, label: '2nd 3am' },
  // Portal auto-offboarding sweep — vercel.json "30 19 2 * *" UTC = 3rd 3:30am SGT.
  'deactivate-inactive': { kind: 'monthly', day: 3, graceDays: 1, label: '3rd 3:30am' },
  'practice-topup':    { kind: 'interval', hours: 36, label: 'daily 2am' },
  'triage-reminder':   { kind: 'interval', hours: 36, label: 'daily 8am' },
  // Weekly and deliberately quiet — it stamps every run, so a silent Telegram and
  // a dead cron are told apart here rather than by their absence.
  'question-proposals-nudge': { kind: 'interval', hours: 204, label: 'Mondays 9am' },
  // Self-referential: if the health check itself dies, nothing ALARMS (it is the
  // alarm) — but the /admin/ops board still shows this row going stale, which is
  // the one place that failure is visible at all.
  'health-check':      { kind: 'interval', hours: 13, label: 'every 6h' },
};

/** Calendar parts of a moment, in Singapore time. `m` is 0-based (the checks
 *  below only ever compare it to another `sgt()` month, never to a label). */
function sgt(d: Date): { y: number; m: number; day: number } {
  const c = sgtClock(d);
  return { y: c.year, m: c.month - 1, day: c.day };
}

export type StaleJob = { job: string; reason: string };

/**
 * `exclude` exists for one caller: the health check must not grade its own last
 * run. It reads this, then stamps its own row — so without the exclusion a single
 * failed run latches the alarm on permanently (its own ok=false becomes the
 * reason the next run fails). /admin/ops passes no exclusion, so a dead health
 * check is still visible there — which is the only place it ever could be.
 */
export function staleJobs(
  latest: JobRunRow[],
  now: Date,
  opts: { exclude?: string[] } = {},
): StaleJob[] {
  const skip = new Set(opts.exclude || []);
  const byJob = new Map(latest.map((r) => [r.job, r]));
  const out: StaleJob[] = [];
  for (const [job, rhythm] of Object.entries(JOB_RHYTHMS)) {
    if (skip.has(job)) continue;
    const row = byJob.get(job);
    if (!row) continue;   // never stamped — visible on the ops board, never an alarm
    const ranAt = new Date(row.ran_at);
    if (Number.isNaN(ranAt.getTime())) continue;

    if (row.ok === false) {
      out.push({ job, reason: `last run FAILED${row.summary ? ` — ${row.summary}` : ''}` });
      continue;
    }
    if (rhythm.kind === 'interval') {
      const ageH = (now.getTime() - ranAt.getTime()) / 3600e3;
      if (ageH > rhythm.hours) {
        out.push({ job, reason: `hasn't run in ${Math.round(ageH)}h (expected ${rhythm.label})` });
      }
      continue;
    }
    // Monthly: once SGT is past day+grace, this month's run must exist. A run on
    // or after (day − 1) of the current SGT month counts — crons fire in SGT but
    // stamp in UTC, so the day boundary gets a day of slack on the early side.
    const n = sgt(now);
    if (n.day <= rhythm.day + rhythm.graceDays) continue;   // window still open
    const r = sgt(ranAt);
    const ranThisWindow = r.y === n.y && r.m === n.m && r.day >= rhythm.day - 1;
    if (!ranThisWindow) {
      out.push({ job, reason: `no run this month (expected ${rhythm.label})` });
    }
  }
  return out;
}

/** Rhythm jobs with no logbook row at all — shown on the ops board, never alarmed. */
export function neverStamped(latest: JobRunRow[]): string[] {
  const have = new Set(latest.map((r) => r.job));
  return Object.keys(JOB_RHYTHMS).filter((j) => !have.has(j));
}
