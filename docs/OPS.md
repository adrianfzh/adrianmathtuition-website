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
  `daily-queue` (**midnight SGT**, `0 16 * * *` UTC — the waiting list's clock, SPEC-PRACTICE-PHOTO §14, 24 Sep 2026: every science hand-in whose `result_json.queued_for` is today or earlier and that is neither released to the 🌙 queue nor removed goes into the bot's marking queue and is stamped `queue_released_at`; photo-sheet `sheet_jobs` carry `scheduled_for` and the sheet worker's own peek (`dueFilter()`) picks them up when their day comes, so the cron has nothing to do for them; stamps even on an empty night — a missing stamp means queued papers are sitting past their day; `job-health` allows 36 h),
  `practice-again-reminders` (daily 9am SGT — **PAUSED since 17 Sep 2026**, `REMINDERS_PAUSED` in `lib/practice-again-reminders.ts`: the cron stamps a 'paused' line and sends nothing. When on, nudges students whose COMPULSORY
  Practice Again sheet is still not handed in: `portal_assignments.required_at`
  is set when Adrian releases a sheet he queued himself; day 3, then weekly,
  four nudges at most, Telegram + web push, one summary line to Adrian; stamps
  even on quiet days, skips the stamp only in `?dry=1` mode),
  `missing-papers` (Mondays 8am SGT — the last 7 days of runs marked without
  their paper, grouped and checked against `paper_library` + the bank,
  `lib/missing-papers.ts`, one Telegram line; stamps even on a quiet week with
  nothing to report → [`MARKING.md`](MARKING.md) §🕳 When the paper is
  missing),
  `page-gap-sweep` (every 6h at :30 — the monitor + self-fix for a marked page
  whose annotated image never reached the bucket: the last 7 days of runs are
  checked with the pure `lib/page-gap-repair.ts gapsForRun`, a run the student
  has NOT seen is repaired outright (redraw each missing page through
  `/api/admin/desk/redraw {reissue:false}`, then rebuild its PDFs), and since
  14 Sep 2026 a run they ALREADY HOLD is repaired too and re-issued once on the
  **app channel** (`mark-triage {channel:'app'}`) — a three-day line on the
  paper's card, nothing sent. Whatever it still could not fix is named to Adrian
  in the sweep's own line to the marking topic. **A failure that is OURS rather
  than the paper's — `Unauthorized`, `not configured`, a 401/403 — gets its own
  🔌 line that `alreadyReported` never mutes, and stamps the job run as FAILED
  so the board ambers.** Why: the sweep shipped forwarding its own incoming
  `Authorization` to the desk routes, so a Vercel cron (which fires with
  `Bearer CRON_SECRET`) got `Unauthorized` on every redraw and the self-fix
  repaired nothing in production from 14 Sep 2026 until it was found the same
  day — and it looked exactly like an ordinary unfixable page. **A cron that
  calls an admin route must build `Bearer ADMIN_PASSWORD` itself and never
  forward the header it arrived with**; the two ends accept different secrets.
  Every run it looked at carries
  `result_json.page_gap_check`, which is the audit trail AND the memory that
  says an unfixable page once instead of four times a day. Stamps every run
  → [`MARKING.md`](MARKING.md) §🕳 When the paper is missing),
  and `health-check` itself.
- **Mac plan-billed workers** stamp as the last step of their SKILL.md
  (`qb-topup`, `file-subgroups`, `bot-review` — DAILY since 18 Sep 2026, run by the Fly worker's scheduler —, `marking-review` — 🔎 the page reader, 19 Sep 2026: yesterday's marked pages looked at as the student sees them, daily 06:15 on the Fly worker, read-only until 22 Sep —, `question-mine`,
  `figure-fitness` — the nightly question-figure fitness catch-up, which stamps
  every run including quiet ones (`queue empty`) and `ok=false` when it exits on
  a weak model or a failed calibration → [`FIGURES.md`](FIGURES.md) §4,
  `pdf-extract` — stamps only on runs that actually claimed a row, so it has no
  rhythm/alarm; the ops board just shows the newest extraction. **Since 25 Sep 2026
  the Fly worker's `extract` job does the claiming** (bot `worker/fly/extract.sh`,
  every 15 min, POSTs the stamp through `/api/job-log`) →
  [`EXTRACTION-QUEUE.md`](EXTRACTION-QUEUE.md) §4) — a
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
| `optout-rollup` | `day 1`, grace 1, `months: [1, 11, 12]` | 1st 7:30am SGT (Nov, Dec, Jan) |

**`optout-rollup`** (16 Sep 2026) is the odd one in that table: its cron fires
EVERY morning (`30 23 * * *` = 07:30 SGT) and the route itself answers
`shouldSendRollup()` from `lib/optout-notice.ts`, returning
`{ ok: true, skipped: 'not a roll-up day' }` on the other 362 mornings. Vercel
keys crons by unique path, so three date-specific entries would have meant three
routes; month-length arithmetic in UTC for a Singapore morning is the kind of
thing that silently skips a year. Only the three real mornings stamp `job_runs`,
which is why the rhythm above is monthly. It names who has pressed the holiday
opt-out button and which months they are skipping, half an hour before the
arrears run builds those invoices at 8am. **When nobody is skipping it sends no
Telegram at all but still stamps** — absence of the message is never absence of
the job. `GET /api/cron/optout-rollup?force=1` (Bearer `ADMIN_PASSWORD`) asks for
the picture out of season.

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
papers in a week and under half went to the plan. **The batch lane (11 Sep
2026):** the bot's marking queue has a batch-API lane Adrian switches off by
hand some nights (Fly secret `MARK_QUEUE_BATCH`) — when it's off, every
hand-back is drawn on the marker machine instead, and nobody could see that
state the night the machine melted. The route fail-softly probes the bot's
public `GET /queue-quiet` (3s timeout, no auth) and the Marking queue section
shows `batch_lane:'off'` as an amber note, `'on'` as a quiet grey one, and
`marker_reachable:false` as a red "Marker process unreachable" note; an
unknown/missing field or an unreachable bot shows nothing (`lib/bot-queue-
status.ts`, pure/tested). The page refreshes itself every minute while open,
and rows deep-link to the relevant screen (invoices, digests, triage, papers,
bank health).

## The costs page — `/admin/costs` (9 Sep 2026)

Adrian: "I need real cost breakdown on usage via API — /admin/ops only shows the
lane share. Which part costs what? I can only see by models." Read-only, cookie
auth, linked from the ops header. `/api/admin/costs?days=` (default 30, max 120)
returns three views of the same money, from three sources:

- **Per paper and per day** — `paper_marking_runs.cost_usd`, the bot's own pricing
  of the exact Claude tokens each run used (`ai/paper-marker.js finalizeUsage`:
  list price sync, 50 % batch, 10 % cache reads, 2× 1h cache writes). The lane
  (`lib/marking-path.ts`) says Mac plan / batch / mark now / sync; cents per API
  page excludes the pages the Mac read. Since 9 Sep evening a run also stores
  `result_json.usage.buckets` (what was priced), `usage.apiKey` (which Console
  key spent it) and `result_json.vision_usage` (Gemini tokens — Google bills
  those, never in `cost_usd`).
- **By part** — the bot's per-feature ledger (Airtable `CostLog`, every Claude
  call tagged by what it was for, flushed hourly), folded into the seven parts the
  bot's Telegram `/costs` report names (`lib/costs.ts partOf` mirrors the bot's
  `lib/cost-buckets.js`). Marking joined that ledger on 9 Sep evening; earlier
  marking is on the run rows only, so the two views overlap from then on.
- **The invoice** — Anthropic's Admin API `cost_report`, per day and per line
  item (model × tier × token type; amounts arrive in cents), when
  `ANTHROPIC_ADMIN_KEY` is set. The Admin API is unavailable to an individual
  Console account (Adrian's, 9 Sep 2026) — the panel says so and links the
  Console's Cost page. The Console itself only cuts the bill by model, API key
  or workspace, which is why the bot's ledger is the source for "by part"; the
  bot's marking rides its own key (`ANTHROPIC_MARKING_API_KEY`, Console name
  `bot-marking`) when that Fly secret is set, so the Console's API-key filter
  separates marking from the solver too.

Pure pieces + tests: `lib/costs.ts` (`costEntries`, `costByDay`, `costByPath`,
`monthTotal`, `costByPart`, `foldCostReport`, `foldCostLines`).

## Adding a job

1. Pick a kebab slug. 2. Stamp your success path (`logJobRun` / SKILL.md insert /
`POST /api/job-log`). 3. If it has a schedule, add one line to `JOB_RHYTHMS` so
missing it alarms. That's the whole contract — no registration anywhere else.

**On-demand workers get NO rhythm.** `sheet-worker` (the 📘 self-study sheet
queue, SPEC-TEACHING-CYCLE) polls every 5 min (was 15 until 7 Sep 2026) but only *works* when Adrian has
queued a sheet, so a week with no sheets is normal, not a fault — giving it a
`JOB_RHYTHMS` line would alarm on his silence. It still stamps `job_runs` on
success, so the /admin/ops board shows when it last produced something. Same
reasoning applies to `practice-photo-author` (23 Sep 2026 — a sheet slot's idle
tick writing one Practice-tab photo question on the plan, SPEC-PRACTICE-PHOTO §5;
it stamps on success and on a plan limit, never on a rhythm) and to any future
queue-driven worker: rhythms are for jobs that MUST run on a clock.

**Since 25 Sep 2026 no Mac runs a plan-billed worker.** The Fly worker
`adrianmath-worker` holds every lane — 9 marking slots, 9 sheet slots
(`SHEET_SLOTS_ON='1'`), `worksheets`, `extract`, `find-review`, `bot-review` — and
each job picks the login with the least 7-day usage before it starts (bot
`scripts/claude-pick.sh`; the meters are the ⏻ slot-accounts card on
`/admin/mark-paper`). The Air's LaunchAgents were unloaded that morning; the
Pro's `com.adrianmath.planmarking{,2,3}`, `sheetworker` and `worksheetworker`
were booted out and disabled by Adrian that evening (`launchctl list | grep
com.adrianmath` → nothing). The Macs now carry only Adrian's own sessions and
the Claude scheduled tasks in the table below. A `plan-marking` / `sheet-worker`
stamp whose `meta.slot` is a Mac after that date means an `install.sh` was
re-run — a Mac slot never uses the picker (no `pool-here`), so it would spend
that Mac's keychain login again.

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
| `topup-bank-nightly` | 3:30am daily | B (the MacBook Air since 10 Sep 2026) | ✅ live | plan-billed question-bank topup (spec in its SKILL.md; stamps `qb-topup`) |
| `file-subgroups-nightly` | 4:15am daily | B (the MacBook Air since 10 Sep 2026) | ✅ live | sub-group filing backfill after the topup (stamps `file-subgroups`) |
| `extract` (Fly worker) | every 15 min, the marking queue empty or 00:00–06:59 SGT | **Fly `adrianmath-worker`** (bot `worker/fly/extract.sh`, since 25 Sep 2026) | ✅ live | drains the `paper_library` queue ONE row per run under the live law + the prompt's box overrides; runner `PDF-Pipeline-Fly-<ddHHMM>`; stamps `pdf-extract` on claiming runs → [`EXTRACTION-QUEUE.md`](EXTRACTION-QUEUE.md) §4. The Mac rows this replaced (`pdf-extraction-worker`, `-b`, `-c`, `s1s2-…`) were deleted from the Pro; `inbox-extract` + `exam-extraction-cc1..3` below are redundant since the same day |
| `question-mine-daily` | Mon & Thu 7:00am | B (the MacBook Air since 10 Sep 2026) | ✅ live (2026-08-28; daily → twice-weekly same day, Adrian: "daily is too frequent") | student-demand mining per [`docs/QMINE.md`](QMINE.md) — asks → coverage cross-ref → topup enqueues + ≤3 judgment digest (stamps `question-mine`) |
| `siteground-vercel-migration-reminder` | one-time 1 Nov 2026 | A (MacBook Pro) | ✅ armed | domain + hosting expiry reminder |
| `exam-extraction-cc1..6` | ⏸ **superseded 25 Sep 2026** by the Fly `extract` job above (cc4–6 retired 8 Sep; cc1–3 + the Pro's `inbox-extract` task are redundant now — claims are atomic, so leaving them on is harmless; Adrian removes them) | the MacBook Pro | ⏸ redundant | was: the queue-only shims under the fleet law, `PDF-Pipeline-CC<n>` runners |
| *(extraction fleet)* | — | B (the Air) | ⏸ redundant since 25 Sep 2026 | the `pdf-pipeline-cc-*` shims read the same queue; the Fly lane replaces them |
| `figure-fitness` | `10 3 * * *` (3:10am SGT daily; the app adds ~6 min jitter) | **this MacBook Pro**, the account whose registry holds `solution-image-pass` + `pdf-pipeline-cc-*` | ✅ live (2026-09-03) | the ingestion figure-fitness catch-up: judges question figures ingested in the last 7 days that carry no `fitness:` stamp, holds failures for Adrian's `/admin/figures-bank?kind=fitness` lane, may un-serve only `wrong-figure`/`answer-leak`. **Rubric is NOT in the SKILL.md** — it is the `## Figure fitness` section of the Supabase law row `extraction_worker_prompt` id `exam-extraction`, shared with every extraction worker, so one edit moves both. Ceiling 120 figures/run, strong model only, stamps `figure-fitness` → [`FIGURES.md`](FIGURES.md) §4 |

<!-- preview-build tick 2026-08-29a — dev-only nudge so Vercel builds a preview when dev == main (same-commit builds get skipped) -->

- `auto-release-report` — Mondays 8am SGT (`0 0 * * 1` UTC): the auto-release number — hand-ins released without Adrian in the last 7 days, how many he changed afterwards, and the auto-pause rule (≥5 released and >10 % changed → `auto_release_paused` set, Telegram). Route `/api/cron/auto-release-report`, pure `lib/auto-release-report.ts`.
- `consistency-remark` — **Sundays 10pm SGT** (`0 14 * * 0` UTC): 📏 the weekly marking-consistency measure (17 Sep 2026, Adrian: *"we need consistency in marking … how can we measure the effectiveness of all these changes?"*). Every active paper in `consistency_set` is asked to be read again in **SHADOW** — the bot queues it on the Mac lane, a slot reads it with the same prompt and grounding as a whole re-mark, and the reading is filed in `paper_marking_runs.result_json.shadow_runs[]` beside the paper's real marking. **Nothing is delivered**: no student, no parent and no desk lane can see a shadow (bot `lib/shadow-run.js`, proved by `test/shadow-invariant.test.js`). Monday's `auto-release-report` then prints the 📏 Consistency line from `lib/shadow-diff.ts`. Route `/api/cron/consistency-remark`; the set is `lib/consistency-set.ts` + `/api/admin/consistency-set`; the numbers are `/api/admin/consistency`. **It costs plan time, never money** — about 8 × 16 min of Mac plan on a Sunday night, and there is deliberately no API-lane path, so a shadow that finds no slot waits for next Sunday. 22:00 is after the evening's hand-ins have been marked and released, so a measurement never sits in front of a student.

## Plan-marking attribution — which Mac, and which Claude account (9 Sep 2026)

The 🌙 queue row on `/admin/ops` names the **machine** holding each paper, from
`result_json.queue.external_claim.by`, which the worker builds as
`mac-plan-$(hostname -s)-$$` (WORKER_PROMPT.md line 41).

**Since 9 Sep 2026 the claim records the account too**: run.sh reads it from
`claude auth status` (for whatever credentials the slot exports) into
`$MARKER_ACCOUNT`, the runbook's `BY` becomes `mac-plan-<host>-<pid>@<account>`,
`lib/marking-queue-state.ts claimAccount` reads it back and the queue card shows
`💻 <machine> · <account>`. A slot that dies on a plan limit stamps
`plan limit on <account>: <the CLI's own line>` (job `plan-marking` /
`sheet-worker`, ok=false) and the board shows "⏸ Plan marking lane closed — …"
above the queue rows (`planLane` in the ops route) until a later ok=true stamp.
Claims older than that carry no account, and then the paragraph below applies.

**Before 9 Sep 2026 it did not record a Claude account** — but the machine implies one. Every slot
authenticates `auth=keychain`, i.e. as the CLI's single logged-in account on that
Mac, so there is one account per machine and the hostname identifies it:

| machine | Claude account | plan |
|---|---|---|
| `Adrians-MacBook-Pro` (Mac B) | `adrianmathtuition@gmail.com` | Max |

**25 Sep 2026: the table above is history** — no Mac slot is loaded (see "Since
25 Sep 2026" under on-demand workers); every claim now comes from the Fly
worker (its `hostname -s` is the machine id `286d921a104298`), the account
chosen per job by the picker and written into the same `BY` tag.

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
