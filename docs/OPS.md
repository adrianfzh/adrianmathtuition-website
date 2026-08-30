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
  `triage-reminder` (daily 8am SGT — Telegrams Adrian when marked scripts are
  waiting unreleased **and unarchived** in /admin/mark/triage; stamps even on
  quiet 0-waiting days, skips the stamp only in `?dry=1` mode), and
  `health-check` itself.
- **Mac plan-billed workers** stamp as the last step of their SKILL.md
  (`qb-topup`, `file-subgroups`, `bot-review`, `plan-marking`, `question-mine`,
  `pdf-extract` — the last stamps only on runs that actually claimed a file, so
  it has no rhythm/alarm; the ops board just shows the newest extraction) — a
  direct `insert into job_runs …` through the Supabase access each skill
  already has.
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

**On-demand workers get NO rhythm.** `sheet-worker` (the 📘 self-study sheet
queue, SPEC-TEACHING-CYCLE) polls every 15 min but only *works* when Adrian has
queued a sheet, so a week with no sheets is normal, not a fault — giving it a
`JOB_RHYTHMS` line would alarm on his silence. It still stamps `job_runs` on
success, so the /admin/ops board shows when it last produced something. Same
reasoning would apply to any future queue-driven worker: rhythms are for jobs
that MUST run on a clock.

## Claude Code scheduled tasks — per-Mac registry

Claude Code desktop scheduled tasks are **machine-local**: stored under
`~/.claude/scheduled-tasks/<taskId>/SKILL.md` on the Mac that created them, they
run only while that Mac is awake with the app open, and each Mac's list is
invisible from every other machine. This table is the cross-Mac source of truth
— update it whenever a task is created, moved, or retired (Adrian 2026-08-27).

Rules:
- **Recurring tasks live on an always-on Mac only** — a sleeping laptop silently
  skips runs (no catch-up).
- **Keep the task thin**: the prompt points at a spec (repo doc or Supabase row)
  and says "follow it". Recreating a task on another Mac is then one 30-second
  create; the intelligence stays in synced files.
- Recurring workers stamp `job_runs` (above), so a dead or orphaned task still
  alarms by absence no matter which Mac owned it.
- One-time reminders auto-disable after firing — don't register those here.

| Task | Schedule | Mac | Status (2026-08-27) | What it does |
|---|---|---|---|---|
| `topup-bank-nightly` | 3:30am daily | A (MacBook Pro) | ✅ live | plan-billed question-bank topup (spec in its SKILL.md; stamps `qb-topup`) |
| `file-subgroups-nightly` | 4:15am daily | A (MacBook Pro) | ✅ live | sub-group filing backfill after the topup (stamps `file-subgroups`) |
| `s1s2-math-extraction-worker` | every 20 min | A (MacBook Pro) | ⏸ retired | superseded by `pdf-extraction-worker` (below) — delete when convenient |
| `pdf-extraction-worker` | every 20 min | A (MacBook Pro) | ✅ live (2026-08-28) | drains `~/Desktop/AdrianMath/papers/` ONE file per run under the live law + CLAUDE.md overrides (GCE priority); stamps `pdf-extract` only on claiming runs |
| `pdf-extraction-worker-b` | :07/:27/:47 hourly | A (MacBook Pro) | ✅ live (2026-08-28) | second Mac A worker, staggered against the first; RUNNER prefix `PDF-Pipeline-MacA-SchedB-<HHMM>`; otherwise identical |
| `pdf-extraction-worker-c` | :13/:33/:53 hourly | A (MacBook Pro) | ✅ live (2026-08-28) | third Mac A worker; RUNNER prefix `PDF-Pipeline-MacA-SchedC-<HHMM>`; otherwise identical |
| `pdf-extraction-worker` (clone) | every 20 min | *(new Mac, Adrian setting up)* | 🔜 planned (2026-08-28) | same task on a second machine — recipe: copy this repo's task SKILL.md, change RUNNER prefix to `PDF-Pipeline-<MacName>-Sched-`. **Both Macs share the SAME iCloud-synced `~/Desktop/AdrianMath`** (confirmed by Adrian 2026-08-28) — do NOT split `papers/` into slices. Caveats of the shared folder: `mv -n` claims are atomic only within one filesystem, so cross-machine races are possible during sync lag — the claim files + the both-legs claim-confirm test (law v2026-08-28) + re-running the dedup guard immediately before the first INSERT are the mitigations (a lost race wastes paid extraction but can't corrupt the bank). iCloud may also evict/lag files on the second Mac — a worker that sees an empty or partial `papers/` should just exit (the next 20-min run retries); `brctl download <file>` force-hydrates |
| `question-mine-daily` | Mon & Thu 7:00am | A (MacBook Pro) | ✅ live (2026-08-28; daily → twice-weekly same day, Adrian: "daily is too frequent") | student-demand mining per [`docs/QMINE.md`](QMINE.md) — asks → coverage cross-ref → topup enqueues + ≤3 judgment digest (stamps `question-mine`) |
| `siteground-vercel-migration-reminder` | one-time 1 Nov 2026 | A (MacBook Pro) | ✅ armed | domain + hosting expiry reminder |
| *(extraction fleet)* | various | B | ❓ list from Mac B | paper→bank workers in `~/Desktop/AdrianMath`; worker law = live Supabase row |

<!-- preview-build tick 2026-08-29a — dev-only nudge so Vercel builds a preview when dev == main (same-commit builds get skipped) -->
