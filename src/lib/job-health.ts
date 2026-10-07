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
  /** `months` (1–12) restricts a monthly job to the months it fires in — no expectation in the others. */
  | { kind: 'monthly'; day: number; graceDays: number; label: string; months?: number[] };

export const JOB_RHYTHMS: Record<string, Rhythm> = {
  'qb-topup':          { kind: 'interval', hours: 36, label: 'nightly 3:30am' },
  // 🗂 The sub-skill filer: on the Fly worker since 2 Oct 2026 (the Mac task had not run since
  // 9 Sep), maths 04:15 + 16:15, science 10:15 + 22:15 (bot worker/fly/jobs.sh job_file_subgroups).
  'file-subgroups':    { kind: 'interval', hours: 36, label: '4:15am + 4:15pm' },
  'file-subgroups-science': { kind: 'interval', hours: 12, label: 'every 2 hours at :15' },
  // Daily since 18 Sep 2026 (the Fly worker's scheduler, 05:45 after the day-review).
  'bot-review':        { kind: 'interval', hours: 36, label: 'daily 5:45am' },
  // 🔎 The page reader (19 Sep 2026, bot skill marking-review): yesterday's marked pages as the student sees them.
  'marking-review':    { kind: 'interval', hours: 36, label: 'daily 6:15am' },
  // 🎓 Loop 1 (5 Oct 2026, bot skill marking-learn): Adrian's mark/note changes → repeated kinds → proposals.
  // Stamps every morning, even with nothing new, so silence here means the job is dead.
  'marking-learn':     { kind: 'interval', hours: 36, label: 'daily 7:15am' },
  // 🧹 The stale-doc sweeper (5 Oct 2026, bot skill doc-sweep on the Fly worker, Sundays 7:20am):
  // docs that no longer match the code or the live system. Weekly → the 8.5-day grace.
  'doc-sweep':         { kind: 'interval', hours: 204, label: 'Sundays 7:20am' },
  // Nightly plan-billed review of the day's bot questions (bot repo
  // scripts/day-review-nightly.sh, launchd com.adrianmath.day-review, 5 Sept 2026).
  'day-review':        { kind: 'interval', hours: 36, label: 'nightly 5am' },
  // Nightly plan-billed review of yesterday's Find-a-question matches (website
  // scripts/find-review, launchd com.adrianmath.findreview, 5:30am SGT, 6 Sept 2026).
  'find-review':       { kind: 'interval', hours: 36, label: 'nightly 5:30am' },
  // Release-by-silence sweep for Practice Again sheets (Vercel cron every 30 min, 6 Sep 2026).
  'sheet-auto-release': { kind: 'interval', hours: 2, label: 'every 30 min' },
  // Release what the automatic path missed — failed/never-attempted hand-ins, every 10 min (9 Sep 2026).
  'auto-release-sweep': { kind: 'interval', hours: 1, label: 'every 10 min' },
  // The weekly auto-release number (8 Sep 2026): released on their own, changed after, auto-pause rule.
  'auto-release-report': { kind: 'interval', hours: 204, label: 'Mondays 8am' },
  // 🔒 The weekly leak test (5 Oct 2026) — vercel.json "0 20 * * 0" UTC = Mondays 4am SGT.
  'leak-test':         { kind: 'interval', hours: 204, label: 'Mondays 4am' },
  // 📏 The weekly shadow read of the consistency set (17 Sep 2026): the papers
  // re-marked on the Mac lane on a Sunday night so Monday can say how far the
  // marking moved. Weekly, so the same 8.5-day grace as the report above.
  'consistency-remark': { kind: 'interval', hours: 204, label: 'Sundays 10pm' },
  // 👻 The cheaper-reader shadow read back weekly (1 Oct 2026, Thursdays 9am SGT).
  'shadow-read-report': { kind: 'interval', hours: 204, label: 'Thursdays 9am' },
  // 💰 The Monday cost check (5 Oct 2026, Mondays 8:30am SGT): a paper's cost, its parts, the lanes, savings that passed.
  'weekly-cost':        { kind: 'interval', hours: 204, label: 'Mondays 8:30am' },
  'scan-inbox':         { kind: 'interval', hours: 1, label: 'every 15 min' },
  // The extraction inbox watcher: Dropbox /Extraction Inbox → paper-library bucket + queue (Vercel cron every 10 min, 8 Sep 2026).
  'extraction-inbox':   { kind: 'interval', hours: 1, label: 'every 10 min' },
  // The weekly "papers we don't hold" line: runs marked without their paper in
  // the last 7 days, grouped, checked against paper_library + the bank, one
  // Telegram line (Vercel cron Mondays 8am SGT, 11 Sep 2026).
  'missing-papers':     { kind: 'interval', hours: 204, label: 'Mondays 8am' },
  // 🧭 Where students are stuck (5 Oct 2026): the week's asks to the bot + marks lost,
  // gaps, sheets prepared, ONE Telegram message (Vercel cron Sundays 7pm SGT). Stamps
  // every week, quiet ones included.
  'stuck-weekly':       { kind: 'interval', hours: 204, label: 'Sundays 7pm' },
  // 🖼 Figures we need (5 Oct 2026): the Sunday message of figures twins needed that no family draws.
  'figure-needs-weekly': { kind: 'interval', hours: 204, label: 'Sundays 6pm' },
  // 📌 Next lesson packs, the night before each lesson (5 Oct 2026, /api/cron/next-lesson, 8pm SGT).
  'next-lesson':        { kind: 'interval', hours: 36, label: 'nightly 8pm' },
  // 📒 The lesson log that fills itself (5 Oct 2026, /api/cron/lesson-end, hourly :10 from 11:10 to 21:10 SGT).
  'lesson-end':         { kind: 'interval', hours: 16, label: 'hourly 11am–9pm' },
  // 📝 The progress note on the student card (5 Oct 2026, Fly worker /progress-note, 17:05 SGT daily; stamps even when nobody is due).
  'progress-notes':     { kind: 'interval', hours: 36, label: 'daily 5:05pm' },
  // The monitor + self-fix for a marked page whose image never uploaded: redraws
  // what the student has not seen, reports what they already hold (Vercel cron
  // every 6h at :30, 14 Sep 2026 — lib/page-gap-repair).
  'page-gap-sweep':     { kind: 'interval', hours: 13, label: 'every 6h' },
  // The Dropbox tray's one-month life: a paper's folder goes 30 days after release (daily 03:30 SGT, 6 Sep 2026).
  'dropbox-tray':      { kind: 'interval', hours: 30, label: 'daily 3:30am' },
  // Weekly exam-library refresh on the Mac (scripts/paper-library/run.sh, launchd com.adrianmath.paperlibrary, Sun 04:10 SGT, 7 Sep 2026).
  'paper-library':     { kind: 'interval', hours: 180, label: 'Sundays 4:10am' },
  // 'question-mine' retired 7 Oct 2026 (Adrian: "yes") — four runs asked for no new questions.
  'figure-fitness':    { kind: 'interval', hours: 36, label: 'nightly 3:10am' },
  'extraction-learn':  { kind: 'interval', hours: 36, label: 'daily 6:50am (Fly worker)' },
  // 🖼 The missing-figure sweep (5 Oct 2026): bot scripts/missing-figures-sweep.js on the Fly
  // worker, 03:00 SGT — questions that name a figure but store none → FIGURES ONLY re-runs.
  'missing-figures':   { kind: 'interval', hours: 36, label: 'nightly 3:00am' },
  // 👯 The twins lane on the Fly worker (30 Sep 2026, SPEC-TWINS §10): every 15 min when marking
  // is quiet by day, always in the 00–06 SGT window; an empty queue still stamps, so absence = dead lane.
  'twin-batch':        { kind: 'interval', hours: 30, label: 'the Fly worker, by night or when marking is quiet' },
  // 🧪 The SCIENCE twins lane (5 Oct 2026, SPEC-TWINS §11, bot worker/fly/science-twins.sh): every 15 min
  // when lane_room says there is room; stamps every run that looked, so absence = a dead lane.
  'science-twins':     { kind: 'interval', hours: 30, label: 'the Fly worker, by night or when marking is quiet' },
  // 🧹 The Fly worker's disk check (5 Oct 2026, bot worker/fly/jobs.sh disk_check): runs every tick,
  // stamps once a day — silence = the scheduler is dead. Its cleanups stamp 'disk-clean' (no rhythm).
  'disk-check':        { kind: 'interval', hours: 36, label: 'the Fly worker, daily' },
  // 🌙 The nightly builder (5 Oct 2026, docs/NIGHTLY-BUILDER.md): bot scripts/nightly-builder.js on the
  // Fly worker, 01:30 SGT — stamps every night, also with nothing approved, so silence = dead builder.
  'nightly-builder':   { kind: 'interval', hours: 36, label: 'the Fly worker, nightly 1:30am' },
  // 🪞 Learn from Adrian (5 Oct 2026, docs/LEARN-FROM-ADRIAN.md): launchd on the MacBook Pro at 07:30 SGT
  // reads his typed messages in the Claude transcripts → repeated asks → drafted rules. A laptop can be
  // shut for a day, hence 60h; it stamps every run, quiet ones included.
  'learn-from-adrian': { kind: 'interval', hours: 60, label: 'daily 7:30am (MacBook Pro)' },
  // 🔍 The red pen's second opinion (5 Oct 2026, Adrian agreed): launchd on the MacBook Pro at 23:40 SGT —
  // the day's marked maths pages through PaddleOCR + our own line matcher, recording only where it
  // confidently disagrees with Gemini's line placement. Record-only; stamps every run, quiet ones included.
  'red-pen-second-opinion': { kind: 'interval', hours: 60, label: 'nightly 11:40pm (MacBook Pro)' },
  'generate-invoices': { kind: 'monthly', day: 14, graceDays: 1, label: '14th 7am' },
  'send-invoices':     { kind: 'monthly', day: 15, graceDays: 1, label: '15th 10am' },
  'payment-reminder':  { kind: 'monthly', day: 14, graceDays: 1, label: '14th 8pm' },
  // Year-end arrears billing (lib/year-end-billing.ts): Oct/Nov/Dec attended
  // lessons billed on the 1st of the next month (Dec+Jan combined on 1 Jan),
  // reminder that evening, sent on the 2nd. vercel.json "… 1 11,12,1 *".
  'generate-invoices-arrears': { kind: 'monthly', day: 1, graceDays: 1, months: [1, 11, 12], label: '1st 8am (Nov, Dec, Jan)' },
  'payment-reminder-arrears':  { kind: 'monthly', day: 1, graceDays: 1, months: [1, 11, 12], label: '1st 8pm (Nov, Dec, Jan)' },
  'send-invoices-arrears':     { kind: 'monthly', day: 2, graceDays: 1, months: [1, 11, 12], label: '2nd 10am (Nov, Dec, Jan)' },
  // Who is skipping which holiday months, half an hour before the arrears run
  // builds those invoices (Adrian, 16 Sep 2026). The cron fires every morning
  // and the route answers shouldSendRollup(), so only these three days stamp.
  'optout-rollup':     { kind: 'monthly', day: 1, graceDays: 1, months: [1, 11, 12], label: '1st 7:30am (Nov, Dec, Jan)' },
  'progress-digest':   { kind: 'monthly', day: 1,  graceDays: 1, label: '1st 8am' },
  'retention':         { kind: 'monthly', day: 2,  graceDays: 1, label: '2nd 3am' },
  // Portal auto-offboarding sweep — vercel.json "30 19 2 * *" UTC = 3rd 3:30am SGT.
  'deactivate-inactive': { kind: 'monthly', day: 3, graceDays: 1, label: '3rd 3:30am' },
  // 🗄 The monthly backup check (5 Oct 2026) — vercel.json "0 19 3 * *" UTC = 4th 3am SGT.
  // Copies + reads back the student tables and Airtable, opens sample files.
  'backup-check':      { kind: 'monthly', day: 4, graceDays: 1, label: '4th 3am' },
  // 🗄 Nightly file backup (5 Oct 2026) — vercel.json "30 18 * * *" UTC = 2:30am SGT; stamps every run.
  'file-backup':       { kind: 'interval', hours: 36, label: 'daily 2:30am' },
  // Closes an enrollment the morning after its End Date passes, and drops the
  // student to Inactive when it was their last one. Runs (and stamps) every day,
  // most days with nothing due — so silence here means the job is dead, not quiet.
  'end-enrollments': { kind: 'interval', hours: 36, label: 'daily 8:15am' },
  'practice-topup':    { kind: 'interval', hours: 36, label: 'daily 2am' },
  'triage-reminder':   { kind: 'interval', hours: 36, label: 'daily 8am' },
  // Compulsory Practice Again sheets not handed in — day 3, then weekly (8 Sep 2026).
  'practice-again-reminders': { kind: 'interval', hours: 36, label: 'daily 9am' },
  // Midnight SGT: science hand-ins that waited on the list go into the marking queue (24 Sep 2026).
  'daily-queue': { kind: 'interval', hours: 36, label: 'daily midnight' },
  // 🎚 Science practice Core / Exam / Challenge from students' first tries (5 Oct 2026); stamps every night.
  'practice-difficulty': { kind: 'interval', hours: 36, label: 'daily 3:30am' },
  // 🔎 the bank index top-up (bot lib/embed-backfill.js via /api/cron/embed-index, 6 Oct 2026)
  'embed-index':       { kind: 'interval', hours: 36, label: 'nightly 2:40am' },
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
    if (rhythm.months && !rhythm.months.includes(n.m + 1)) continue;   // doesn't fire this month
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
