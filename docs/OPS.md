# Ops — the centre's logbook, alarms, and board

> Built 2026-08-27 (Adrian: "okay" to the logbook + alarm + /admin/ops proposal —
> design record in the "Centre's Machine" artifact). Three pieces, no new
> infrastructure: a table the jobs write to, the existing health check reading it,
> one page showing it.

## The logbook — Supabase `job_runs`

One row per automated-job run: `job` (kebab slug), `ran_at`, `ok`, `summary`,
`meta`. RLS on, no policies — service-role only. **Only SUCCESS paths stamp**:
a crashed or never-started run then alarms by ABSENCE, which needs no error
plumbing and cannot itself crash a job. (`ok=false` stamps exist for runs that
completed but failed at their task — the Mac skills use them.)

Writers:
- **Vercel crons** stamp via `lib/job-log.ts` `logJobRun()` at their success
  exits: `generate-invoices`, `send-invoices`, `payment-reminder`,
  `progress-digest` (month period only), `retention` (non-dry), `practice-topup`,
  and `health-check` itself.
- **Mac plan-billed workers** stamp as the last step of their SKILL.md
  (`qb-topup`, `file-subgroups`, `bot-review`, `plan-marking`) — a direct
  `insert into job_runs …` through the Supabase access each skill already has.
- **Anything shell-ish** can `POST /api/job-log` (`Bearer CRON_SECRET` or admin)
  with `{job, ok?, summary?}` — job must be a kebab-case slug.

## The alarm — health-check rules

`lib/job-health.ts` (pure, unit-tested) owns the rhythms (`JOB_RHYTHMS`) and
`staleJobs()`: interval jobs alarm past their window (nightly = 36h grace,
weekly = 8.5 days), monthly jobs alarm once SGT passes `day + graceDays` with no
run that month (a UTC stamp on the SGT-eve gets a day of early slack), and a
latest row with `ok=false` alarms as "last run FAILED". **A job that has never
stamped is skipped, not alarmed** — no day-one alarm storm; it shows on the ops
board as "not stamped yet" until its first run.

The 6-hourly `/api/health-check` runs two new checks: `ops-jobs` (the rules
above → one red line naming every stale job) and `marking-queue-lag` (the queue
is event-driven, so its signal is lag: any queued, unmarked, unfailed paper
older than 2h). Red goes out on the existing Telegram alert. The health check
also stamps its own `health-check` row — if the watcher dies, /admin/ops is the
one place that failure is visible (nothing can alarm for the alarm).

## The board — `/admin/ops`

Read-only, cookie-auth, hub tile 🩺. `/api/admin/ops` returns the newest logbook
row per job (staleness pre-computed, amber rows sorted first), the never-stamped
list, and the marking queue's pending count + oldest wait. The page refreshes
itself every minute while open, and rows deep-link to the relevant screen
(invoices, digests, triage, papers, bank health).

## Adding a job

1. Pick a kebab slug. 2. Stamp your success path (`logJobRun` / SKILL.md insert /
`POST /api/job-log`). 3. If it has a schedule, add one line to `JOB_RHYTHMS` so
missing it alarms. That's the whole contract — no registration anywhere else.
