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
  their year-end twins `generate-invoices-arrears`, `send-invoices-arrears`,
  `payment-reminder-arrears` (the SAME three routes run with `?mode=arrears`;
  `jobNameFor()` in `lib/invoice-run-mode.ts` picks the slug, so a run can never
  stamp the other cycle's row → [`INVOICES.md`](INVOICES.md#year-end-billing-octjan--2026-09-02)),
  `progress-digest` (month period only), `retention` (non-dry),
  `deactivate-inactive` (non-dry — the monthly portal offboarding sweep,
  3rd 3:30am SGT), `practice-topup`,
  `triage-reminder` (daily 8am SGT — Telegrams Adrian when marked scripts are
  waiting unreleased **and unarchived** on /admin/desk (triage retired 8 Sep 2026); stamps even on
  quiet 0-waiting days, skips the stamp only in `?dry=1` mode),
  `auto-release-sweep` (every 10 min — releases a marked student hand-in whose
  automatic release FAILED for an operational reason or was never attempted,
  through the same `mark-triage {release, auto:true, sweep:true}` door, until it
  succeeds; rule refusals and holds are left to the desk; the bot stamps every
  outcome on `result_json.auto_release` — 9 Sep 2026, Sophie's 1 Sep hand-in),
  `practice-again-reminders` (daily 9am SGT — nudges students whose COMPULSORY
  Practice Again sheet is still not handed in: `portal_assignments.required_at`
  is set when Adrian releases a sheet he queued himself; day 3, then weekly,
  four nudges at most, Telegram + web push, one summary line to Adrian; stamps
  even on quiet days, skips the stamp only in `?dry=1` mode), and
  `health-check` itself.
- **Mac plan-billed workers** stamp as the last step of their SKILL.md
  (`qb-topup`, `file-subgroups`, `bot-review`, `question-mine`,
  `figure-fitness` — the nightly question-figure fitness catch-up, which stamps
  every run including quiet ones (`queue empty`) and `ok=false` when it exits on
  a weak model or a failed calibration → [`FIGURES.md`](FIGURES.md) §4,
  `pdf-extract` — the last stamps only on runs that actually claimed a file, so
  it has no rhythm/alarm; the ops board just shows the newest extraction) — a
  direct `insert into job_runs …` through the Supabase access each skill
  already has. **`plan-marking` is stamped by its launchd WRAPPER, not the
  session** (bot `worker/plan-marking/run.sh`, 2 Sep 2026): ok=true per paper
  whose reads landed, ok=false when a session died holding a paper (plan cap,
  timeout, crash) — via `POST /api/job-log` with `meta {path, slot, run_id,
  elapsed_sec}`. No rhythm (on-demand), so ok=false is board-amber only. Until
  that day the runbook had no stamp step and `plan-marking` had never appeared.
- **Anything shell-ish** can `POST /api/job-log` (`Bearer CRON_SECRET` or admin)
  with `{job, ok?, summary?}` — job must be a kebab-case slug. **`find-review`**
  (the nightly Find-a-question similarity review, `scripts/find-review/`,
  launchd `com.adrianmath.findreview`, 05:30 SGT + login catch-up, 6 Sep 2026)
  stamps this way as the last step of its runbook (`REVIEW_PROMPT.md`) — every
  night, quiet days included (`ok=true`, summary `<date>: N finds · N judged ·
  N misses`); its wrapper `run.sh` stamps `ok=false` with the reason when the
  session never starts or dies (no credentials, plan cap, timeout).

## The alarm — health-check rules

`lib/job-health.ts` (pure, unit-tested) owns the rhythms (`JOB_RHYTHMS`) and
`staleJobs()`: interval jobs alarm past their window (nightly = 36h grace,
weekly = 8.5 days), monthly jobs alarm once SGT passes `day + graceDays` with no
run that month (a UTC stamp on the SGT-eve gets a day of early slack), and a
latest row with `ok=false` alarms as "last run FAILED". **A job that has never
stamped is skipped, not alarmed** — no day-one alarm storm; it shows on the ops
board as "not stamped yet" until its first run.

**A monthly rhythm may also carry `months: [...]` (1-based)** — the job is only
expected in those months, and `staleJobs()` skips every other month outright.
The three year-end invoice jobs use it, since their crons only fire Nov/Dec/Jan
(`0 0 1 11,12,1 *` and friends) and a February absence is correct, not a fault:

| Job | Rhythm | Fires |
|---|---|---|
| `generate-invoices-arrears` | `day 1`, grace 1, `months: [1, 11, 12]` | 1st 8am SGT (Nov, Dec, Jan) |
| `payment-reminder-arrears` | `day 1`, grace 1, `months: [1, 11, 12]` | 1st 8pm SGT (Nov, Dec, Jan) |
| `send-invoices-arrears` | `day 2`, grace 1, `months: [1, 11, 12]` | 2nd 10am SGT (Nov, Dec, Jan) |

**`find-review`** (nightly 5:30am SGT — reads yesterday's `portal_generation_log`
through `GET /api/admin/find-review`, judges every question that reached a student
Similar / Same-chapter-only / Off, `POST`s the verdicts into
`portal_generation_log.review`, and the route Telegrams one digest to the Ops
topic; SPEC-PORTAL-V2 §4) takes the same nightly shape:
`'find-review': { kind: 'interval', hours: 36, label: 'nightly 5:30am' }` in
`lib/job-health.ts` (armed 6 Sep 2026 with the route, the scripts and the
`find-review` health-check probe). Install on the Mac with
`bash scripts/find-review/install.sh`.

**`figure-fitness`** (nightly 3:10am SGT — the ingestion figure-fitness catch-up,
[`FIGURES.md`](FIGURES.md) §4) takes the nightly shape every plan-billed Mac
worker uses: `'figure-fitness': { kind: 'interval', hours: 36, label: 'nightly 3:10am' }`
— the same 36h grace as `qb-topup`, so one skipped night (a sleeping laptop) is
quiet and a genuinely dead task ambers on the board and alarms on the next
6-hourly check. It stamps on quiet nights too, so a dead task and an empty queue
are never confused. The line is in `lib/job-health.ts` (armed 3 Sep 2026, same
commit as the task, the docs and the health-check probe).

Without `months` these would have alarmed amber for nine months of the year and
trained the alarm to be ignored — the same tune-out failure as the health-check
latch below. Any future seasonal job (a June-only or exam-season run) gets the
same treatment; **never** silence one by deleting its rhythm.

The 6-hourly `/api/health-check` runs two new checks: `ops-jobs` (the rules
above → one red line naming every stale job) and `marking-queue-lag` (the queue
is event-driven, so its signal is lag: any queued, unmarked, unfailed paper
older than 2h). Red goes out on the existing Telegram alert. The health check
also stamps its own `health-check` row — if the watcher dies, /admin/ops is the
one place that failure is visible (nothing can alarm for the alarm).

> ⚠ **`ops-jobs` passes `{ exclude: ['health-check'] }` — the health check must
> never grade its own last run.** It reads the logbook, then stamps itself into
> the logbook, and `staleJobs()` alarms on `ok=false`; so without the exclusion
> **one** failed check latched the alarm on permanently — run N fails → stamps
> `ok=false` → run N+1's `ops-jobs` reads it → "health-check: last run FAILED" →
> fails → stamps `ok=false` → forever. A single transient failure at 00:00 on
> 29 Aug 2026 fired 🚨 every 6h for four days and could never clear itself; by
> 1 Sep the only red check in 41 was the latch. That is precisely how a real
> alarm gets tuned out. `/admin/ops` passes no exclusion, so a genuinely dead
> health check still shows amber there.

## The board — `/admin/ops`

Read-only, cookie-auth, hub tile 🩺. `/api/admin/ops` returns the newest logbook
row per job (staleness pre-computed, amber rows sorted first), the never-stamped
list, the marking queue's pending count + oldest wait, and — since 2 Sep 2026 —
the **Marking bill**: Adrian's own marked papers over the last 7/30 days split
into 💻 plan (the Mac) vs ☁️ API, hand-ins apart (always API by design). Read
straight off `paper_marking_runs` (plan ⟺ `result_json.queue.external_claim.
delivered_at`) by `lib/marking-path.ts` (pure, tested); amber when ≥3 of his
papers in a week and under half went to the plan. The page refreshes
itself every minute while open, and rows deep-link to the relevant screen
(invoices, digests, triage, papers, bank health).

## Adding a job

1. Pick a kebab slug. 2. Stamp your success path (`logJobRun` / SKILL.md insert /
`POST /api/job-log`). 3. If it has a schedule, add one line to `JOB_RHYTHMS` so
missing it alarms. That's the whole contract — no registration anywhere else.

**On-demand workers get NO rhythm.** `sheet-worker` (the 📘 self-study sheet
queue, SPEC-TEACHING-CYCLE) polls every 5 min (was 15 until 7 Sep 2026) but only *works* when Adrian has
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
| `pdf-extraction-worker` (clone) | every 20 min | *(new Mac, Adrian setting up)* | 🔜 planned (2026-08-28) | same task on a second machine — recipe: copy this repo's task SKILL.md, change RUNNER prefix to `PDF-Pipeline-<MacName>-Sched-`. **Both Macs share the SAME iCloud-synced `~/Desktop/AdrianMath`** (confirmed by Adrian 2026-08-28) — do NOT split `papers/` into slices. Caveats of the shared folder: `mv -n` claims are atomic only within one filesystem, so cross-machine races are possible during sync lag — the claim files + the both-legs claim-confirm test (law v2026-08-28) + re-running the dedup guard immediately before the first INSERT are the mitigations (a lost race wastes paid extraction but can't corrupt the bank). iCloud may also evict/lag files on the second Mac — a worker that sees an empty or partial `papers/` should just exit (the next 20-min run retries); `brctl download <file>` force-hydrates. **One machine per append-only file** (8 Sep 2026): both Macs appending to the shared `papers/processing_log.txt` lost EVERY line this MacBook Pro's cc1–cc4 workers wrote between 7 Sep 21:56 and 8 Sep 03:30 SGT (32 papers' DONE lines + their stale-claim notes, ~100 lines) when iCloud resolved the two-writer conflict in favour of the other Mac's copy — the other Mac's lines in the same window survived, the bank and `processed/` were untouched, and no local process wrote the file at the wipe moment (03:30–03:32). The last local event before it was a worker REWRITING the whole 2.5 MB file in place at 03:01 to fix a typo in its own line — never do that on a shared file (a big in-place rewrite is exactly what makes iCloud re-evaluate the conflict); typo fixes are a `CORRECTION` line. Restored verbatim from the runs' transcripts (`LOG-RESTORE` block + addendum in the log). Until the law moves the log to Supabase (or per-host files), a lost run is recoverable: its append command sits in `~/.claude/projects/<cwd-dir>/<session>.jsonl` as a Bash `tool_use` |
| `question-mine-daily` | Mon & Thu 7:00am | A (MacBook Pro) | ✅ live (2026-08-28; daily → twice-weekly same day, Adrian: "daily is too frequent") | student-demand mining per [`docs/QMINE.md`](QMINE.md) — asks → coverage cross-ref → topup enqueues + ≤3 judgment digest (stamps `question-mine`) |
| `siteground-vercel-migration-reminder` | one-time 1 Nov 2026 | A (MacBook Pro) | ✅ armed | domain + hosting expiry reminder |
| `exam-extraction-cc1..6` | `*/5 * * * *` (was `*/30`; cadence pre-set 2026-09-02) | **this MacBook Pro** (registered on Adrian's main account — the machine the rows above call "A") | cc1–cc3 ✅ enabled (`*/5`); cc4–cc6 ⏸ retired 8 Sep 2026 (a 4th worker never gets a slot — see the cap note) | the main paper→bank producer (40 of ~57 DONE on 2026-09-02); thin shims, law = Supabase `extraction_worker_prompt` id `exam-extraction`. The runner never double-starts a task and launches a missed fire the moment a run ends, so `*/5` ≈ continuous. **The app dispatches at most 3 scheduled-task runs at once** (`main.log` `[CCDScheduledTasks] … global_limit (active=3, limit=3)`, `per_task_limit (limit=1)`; undocumented, no setting) and re-checks due tasks every minute in registry order cc1→cc2→cc3→cc4, so a finished `*/5` task is already overdue and refills its own slot before cc4 is reached: a 4th enabled worker runs only on its enable-run (cc4: 1 run in 7 h on 8 Sep, 383 `global_limit` skips). **Per-run cost is the lever (law v2026-09-08-onecall, 8 Sep 2026):** content goes to the bank through `scripts/bank_insert.py` (one call, `bank_insert_paper`) and the V gates through `bank_insert.py verify` (one call, `verify_paper`) instead of ~22 `execute_sql` calls with base64 DO blocks; CLAUDE.md read once (finished batches in `CLAUDE-ARCHIVE.md`). Measured before: 33 min / 56 API calls / 135k output tokens (75% reasoning) / 13.8M cached tokens per paper — the reasoning share is the part that stays. Budget note (measured 2026-09-02): 6 workers ≈ 300M context tokens/h and hit the 5-hour session limit 3× in a morning; a run that hits it PARKS with its claim held until the reset (85-min and 4-hour parks measured). 3 workers at `*/5` ≈ 175M/h is the no-park size — drop cc4–cc6 if limit hits recur. Does NOT stamp `job_runs` (the law has no stamp step) |
| *(extraction fleet)* | various | B | ❓ list from Mac B | the `pdf-pipeline-cc-*` shims (RUNNER `PDF-Pipeline-CC`) — also seen running on the main account 2026-09-02 02:12–08:41; keep only ONE family enabled per account |
| `figure-fitness` | `10 3 * * *` (3:10am SGT daily; the app adds ~6 min jitter) | **this MacBook Pro**, the account whose registry holds `solution-image-pass` + `pdf-pipeline-cc-*` | ✅ live (2026-09-03) | the ingestion figure-fitness catch-up: judges question figures ingested in the last 7 days that carry no `fitness:` stamp, holds failures for Adrian's `/admin/figures-bank?kind=fitness` lane, may un-serve only `wrong-figure`/`answer-leak`. **Rubric is NOT in the SKILL.md** — it is the `## Figure fitness` section of the Supabase law row `extraction_worker_prompt` id `exam-extraction`, shared with every extraction worker, so one edit moves both. Ceiling 120 figures/run, strong model only, stamps `figure-fitness` → [`FIGURES.md`](FIGURES.md) §4 |

<!-- preview-build tick 2026-08-29a — dev-only nudge so Vercel builds a preview when dev == main (same-commit builds get skipped) -->

- `auto-release-report` — Mondays 8am SGT (`0 0 * * 1` UTC): the auto-release number — hand-ins released without Adrian in the last 7 days, how many he changed afterwards, and the auto-pause rule (≥5 released and >10 % changed → `auto_release_paused` set, Telegram). Route `/api/cron/auto-release-report`, pure `lib/auto-release-report.ts`.

## Plan-marking attribution — which Mac, and which Claude account (9 Sep 2026)

The 🌙 queue row on `/admin/ops` names the **machine** holding each paper, from
`result_json.queue.external_claim.by`, which the worker builds as
`mac-plan-$(hostname -s)-$$` (WORKER_PROMPT.md line 41).

**It does not record a Claude account** — but the machine implies one. Every slot
authenticates `auth=keychain`, i.e. as the CLI's single logged-in account on that
Mac, so there is one account per machine and the hostname identifies it:

| machine | Claude account | plan |
|---|---|---|
| `Adrians-MacBook-Pro` (Mac B) | `adrianmathtuition@gmail.com` | Max |

Check the current mapping with `claude auth status` on the machine in question
(it prints `email` and `subscriptionType`). Update this table if a slot is ever
pointed at an `oauth_token` file instead of the keychain — that is the one way a
slot could run as a different account from the machine's CLI login, and the
hostname would then no longer imply the account.

**Recording the account explicitly would need a bot deploy.** `BY` is constructed
inside `WORKER_PROMPT.md`, which the deployed bot serves to the worker via
`phase:'external-runbook'` — editing the repo copy alone changes nothing until the
bot ships.

**An interactive Claude Code session is not necessarily the same account as the
workers.** A desktop-app session runs as whoever is signed into the app, which may
differ from the CLI's keychain login; when they differ the two draw on separate
plan quotas, and a heavy interactive session does not eat the markers' 5-hour
window. Do not assume they share a plan without checking both.
