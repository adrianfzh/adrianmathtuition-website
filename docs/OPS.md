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
  `embed-index` (**2:40am SGT**, `40 18 * * *` UTC — 🔎 the bank index top-up, 6 Oct 2026: nothing that adds a question to a bank gives it its search index, so `/api/cron/embed-index` asks the bot (`POST /api/embed-index`, bot `lib/embed-backfill.js`) to embed every maths and science question that has none; the BOT writes the `job_runs` row with the counts when it finishes — 10,769 maths and 17,193 science rows were invisible to the solver's bank look before the first run),
  `practice-difficulty` (**3:30am SGT**, `30 19 * * *` UTC — 🎚 science practice Core / Exam / Challenge, 5 Oct 2026: counts each student's FIRST try at every science MCQ (`student_attempts` `attempted_via='portal-mcq'`, the preview identity left out) and, once a question has ≥ 20 first tries, sets its level by the share wrong — under 25 % Core, 25–55 % Exam, over 55 % Challenge (`lib/practice-difficulty.ts`, pure/tested) — into the SCIENCE project's `practice_difficulty` (source `results`, replacing an estimate); nothing a student sees reads the table yet; stamps every night with the tally, `job-health` allows 36 h; `?dry=1` reports only),
  `practice-again-reminders` (daily 9am SGT — **PAUSED since 17 Sep 2026**, `REMINDERS_PAUSED` in `lib/practice-again-reminders.ts`: the cron stamps a 'paused' line and sends nothing. When on, nudges students whose COMPULSORY
  Practice Again sheet is still not handed in: `portal_assignments.required_at`
  is set when Adrian releases a sheet he queued himself; day 3, then weekly,
  four nudges at most, Telegram + web push, one summary line to Adrian; stamps
  even on quiet days, skips the stamp only in `?dry=1` mode),
  `stuck-weekly` (Sundays 7pm SGT, `0 11 * * 0` UTC — 🧭 the week's asks to the bot +
  marks lost → gaps, up to three sheets prepared, ONE Telegram message with Send buttons
  to the students topic; nothing is assigned until Adrian sends it; stamps every
  non-dry run, quiet weeks included, `ok=false` when the Telegram send failed →
  CLAUDE.md row "Where students are stuck"),
  `next-lesson` (nightly 8pm SGT, `0 12 * * *` UTC — 📌 every student with a lesson
  tomorrow: the plan + the ready-to-print PDFs, silent; refreshes the last three days'
  unconfirmed auto logs; stamps every non-dry run → SPEC-STUDENT-FIRST §15),
  `lesson-end` (hourly at :10, 11:10–21:10 SGT, `10 3-13 * * *` UTC — 📒 the lesson log
  that fills itself + one Telegram line per student, switch `lesson_end_line` →
  docs/SCHEDULE.md), `progress-notes` (the Fly worker, 17:05 SGT daily — 📝 the student
  card's progress note; switch `progress-notes`),
  `morning-brief` (the Fly worker, 07:45 SGT daily — ☀️ the one morning message, bot `docs/MORNING-BRIEF.md`; switch `morning-brief`),
  `model-check` (the bot, 09:00 on Mondays of even ISO weeks — its result is read by the morning brief; no message of its own since 8 Oct 2026),
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
  (`qb-topup`, `file-subgroups`, `bot-review` — DAILY since 18 Sep 2026, run by the Fly worker's scheduler —, `marking-review` — 🔎 the page reader, 19 Sep 2026: yesterday's marked pages looked at as the student sees them, daily 06:15 on the Fly worker, read-only until 22 Sep —, `marking-learn` — 🎓 Loop 1, 5 Oct 2026: Adrian's mark/note changes (`marking_corrections`) read daily 07:15 on the Fly worker, a repeated kind → a proposal; stamps every morning even with nothing new (JOB_RHYTHMS 36 h) —, `flag-review` — 🚩 Loop 2, 5 Oct 2026: a student flag the bot closed wrong/unsure, reviewed the same day; on demand, so no rhythm —, `question-mine`,
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

**`twin-batch`** (the Fly worker's 👯 twins lane since 30 Sep 2026, SPEC-TWINS §10 phase 1 — bot `worker/fly/twins.sh`, a `jobs.sh` lane every 15 min at nice 15: by day only when the marking queue is empty, always 00–06 SGT; `TWINS_LANE=0` parks it, `TWINS_LEVEL`/`TWINS_PER_RUN` tune it). One run = up to 3 untwinned school questions → our own twins with `verified=false`, each role its own `claude -p` on a pooled login (author Opus → gates → Sonnet blind → Opus moderate → figure → publish); run dirs `/data/twins/<source-id>/` with `published` / `parked` markers; Adrian verifies on `/admin/generated` (✓ Verify). Stamps on every run that looked at the queue, empty or not; `meta` carries `published` / `parked_*` / `failed`. Rhythm `'twin-batch': { kind: 'interval', hours: 30 }`. **Three lanes since 30 Sep 2026** (`TWINS_LANES=3` in the bot's `fly.worker.toml`; `twins2` / `twins3` in `jobs.sh`, each 5 min behind the one before, logs `twins2.log` / `twins3.log`): lane two works the A Math tree (`TWINS_LEVEL_2`), lane three lane one's level; a source is claimed by an atomic `mkdir` under `/tmp/adrianmath-twins-locks`, the marking queue is asked again between sources, a run waits under 1.5 GB free, and twin sessions do not count against `MAX_SESSIONS` (the `[twins lane]` prompt prefix, like extraction's exclusion).

**`science-twins`** (the Fly worker's 🧪 science twins lane since 5 Oct 2026, SPEC-TWINS §11 — bot `worker/fly/science-twins.sh`, a `jobs.sh` job every 15 min when `lane_room` has room; by day only when the marking queue is empty; ON once `/data/science-twins/.on` exists, `SCI_TWINS_LANE=0` or the `science-twins` switch parks it). One run = up to 3 of our own MCQs, one per sub-skill (3 per pool × sub-skill at the seed's level, open practice topics first — `science_twin_units()`); author → checks → blind → checker, each a fresh Opus `claude -p` on a pooled login; a pass is published into practice, a failure dropped (`parked` in `/data/science-twins/<seed>/`). Stamps every run that looked; `meta` carries `published` / `dropped_*` / `failed` / `ids`. Rhythm `'science-twins': { kind: 'interval', hours: 30 }`.

**`figure-needs-weekly`** (🖼 Figures we need, 5 Oct 2026 — `/api/cron/figure-needs-weekly`, Sundays 18:00 SGT, `0 10 * * 0`): groups the open `figure_needs` rows by shape and sends Adrian one plain Telegram (top shapes with counts, ✅ = needed by 3+ seeds, "build them?"); stamps every run, an empty week too. Rhythm `'figure-needs-weekly': { kind: 'interval', hours: 204 }`. `?dry=1` returns the message without sending. → `docs/FIGURES.md` §Figures we need

**👯 Twins — the flip** (the board's own section, SPEC-TWINS §6 phase 2, 30 Sep 2026): one row per (tree level, topic) from the `twin_readiness` view — verified twins, pending twins, school rows drawn in 90 days, school rows filed — and a **Flip** button enabled only when verified twins ≥ drawn and ≥ 1. Flip = `POST /api/admin/serving-policy {level, topic, schoolRows:false}` → a `serving_policy` row; `serving_school_rows(level, topic)` is read inside the four serving RPCs (`practice_next`, `practice_pool`, `practice_candidates`, `kiosk_pool`), so a flipped topic serves only `AdrianMath` / `AI Generated` rows from the next call (`lib/serving-policy.ts flipReady`, `practiceEligibility {schoolRowsRetired}` mirrors it). The route 409s below the threshold; nothing flips itself; undo puts the school rows back. Health-check `serving-policy` probes the 401.

**`extraction-learn`** (daily 6:50am SGT on the Fly worker since 5 Oct 2026 — the extraction learner:
reads the extraction lanes' finish notes and FLAG files, applies safe rules, proposes filing rules
to Adrian; `docs/EXTRACTION-QUEUE.md` §4b). `'extraction-learn': { kind: 'interval', hours: 36, label: 'daily 6:50am (Fly worker)' }`.
Switch `extraction-learn` on `/admin/switches` (the script checks it itself).

**`figure-fitness`** (nightly 3:10am SGT on the Fly worker since 25 Sep 2026 — the ingestion figure-fitness catch-up,
[`FIGURES.md`](FIGURES.md) §4) keeps the nightly shape it had as a Mac
task: `'figure-fitness': { kind: 'interval', hours: 36, label: 'nightly 3:10am' }`
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

## 💰 The Monday cost check + the cost levers (5 Oct 2026)

Adrian, 5 Oct 2026: *"do page-trimming and weekly cost check and cheaper helper steps"*.
Standing rule: every lever is PROVEN (A/B, shadow or trial) before it touches a student —
never a quality drop.

**`weekly-cost`** — Mondays 08:30 SGT (`30 0 * * 1` UTC), `/api/cron/weekly-cost`
(`?dry=1` returns the message without sending). ONE Telegram message to the money topic:
what a marked paper cost on average last week (Mon–Sun SGT), split into **placing the red
pen** (Gemini placement) · **reading the pages** · **extra checks**, by lane (plan · paid
reader · half-price), the month so far with a projection, the tests' own cost kept apart,
and ONLY the savings whose test has passed — one line each ending *say "switch <name>" to
turn it on*. Per-paper costs come from the runs (`result_json.usage`); the split and the
month from the bot's ledger (Airtable `CostLog`); the bars from Supabase
**`cost_lever_tests`** (one row per lever: `status` running | passed | failed | on,
`measure`, `saving_per_paper_usd`). Pure `lib/weekly-cost.ts` (+ test), loader
`lib/weekly-cost-store.ts`. Stamps `job_runs` `weekly-cost`.

**The switches** — when Adrian says "switch <name>", the session sets the flag on the BOT
app (`flyctl secrets set … -a adrianmath-telegram-math-bot`, which restarts it — do it when
the marking queue is idle), then sets that lever's `cost_lever_tests.status = 'on'` so the
Monday message stops offering it:

| Say | Flag on the bot | What it does | Its test |
|---|---|---|---|
| `switch page-trim` | `MARKING_PAGE_TRIM=1` | a page read on the API carries only the paper pages with that page's questions (and their solutions), not the whole PDF; a read that strays is read again on the whole paper | `scripts/page-trim-ab.cjs` (bot) — marks part by part vs today's read, against the consistency noise floor |
| `switch helper-flash` | `VISION_HELPER_TIER=flash` (shadow first: `=shadow`) | the red pen's part-region and token-ring asks go to the cheaper vision model; the row scan (the ticks) never does | live shadow `result_json.helper_shadow` ≥ 50 pages at the Pro-vs-Pro agreement of the trial (`cost_lever_tests.helper-flash.measure.noise_pct`) |
| `switch classify-flash` | `CLASSIFY_ON_FLASH=1` (shadow first: `CLASSIFY_SHADOW=1`) | the page sorter on the cheaper vision model (only paid on paper the API reads) | `result_json.classify_shadow` ≥ 20 papers, page kind ≥ 97 %, printed questions ≥ 95 % |
| `switch reader-<level>` | none yet — a code change per level | the cheaper reader for one level | the 👻 shadow read (`shadow-read-report`) per level |

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

**The worker's self-fixes (5 Oct 2026, Adrian: "do the self fixes"; bot CLAUDE.md
§Self-fixes).** Four slugs the Fly worker stamps when it heals itself:
`worker-recover` (at every scheduler start — papers a dead extraction run held, put back in
the queue at once instead of after the 3-hour lease, and ship requests the restart killed),
`login-pool` (every Claude login full or switched off: the pooled jobs wait until the soonest
reset instead of retrying each minute; one row when a wait starts, one when it ends),
`disk-clean` (`/data` past 85 %: old work files deleted; `ok=false` = still ≥ 90 % after, and
Adrian got a Telegram line) and `disk-check` (the daily heartbeat of the disk check — the only
one with a `JOB_RHYTHMS` line). Routine fixes reach Adrian as ONE line in the bot-review digest
("The worker fixed itself: …"); he gets his own message only when a fix did not work. A deploy
run that fails is rerun once by GitHub (bot `.github/workflows/rerun-failed-deploy.yml`); a
second failure sends one Telegram line naming the failing tests. A ship whose gate ran out of
time is retried up to twice (`proposal_requests.retries`, migration
`migrations/proposal_requests_retries.sql`).

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

**The one exception (5 Oct 2026): 🪞 `learn-from-adrian`** runs on the MacBook Pro
because what it reads lives there — the Claude Code transcripts. launchd
`com.adrianmath.learnfromadrian`, 07:30 SGT + login catch-up, one plan-billed `claude -p`
on the Pro's keychain login; stamps `learn-from-adrian` every run (quiet ones included,
`ok=false` on a dead session or a failed Telegram send); rhythm 60 h because a laptop can
be shut for a day → [`LEARN-FROM-ADRIAN.md`](LEARN-FROM-ADRIAN.md).

**The second (5 Oct 2026): 🔍 `red-pen-second-opinion`** — the red pen's own line placer, run on
the MacBook Pro because the model and the page images stay there (private, local). launchd
`com.adrianmath.redpen-second-opinion`, 23:40 SGT + login catch-up, once a day; code and results
in `~/paused-work-2026-10-05/linedet/second-opinion/` (README there). It takes the day's newly
marked maths pages, runs PaddleOCR + our matcher (TrOCR-small start, no paid calls) and RECORDS only
the lines where it confidently disagrees with Gemini's placement (`results/<date>/`). **Record-only for
the first week (to ~12 Oct 2026):** nothing goes to the page fixer and no student page changes; then a
session checks a sample of the disagreements on the pages, and only then proposes feeding flags to the
fixer. Skips itself when a training or OCR job is running; stamps every run (rhythm 60 h). Memory
note `own-red-pen-model`.

## 🧹 The stale-doc sweeper (5 Oct 2026)

Adrian: *"stale-doc sweeper"* — sessions kept following instructions the code had left behind.
Two halves:

- **The checker — no model.** `node scripts/doc-sweep/check.mjs --web <dir> --bot <dir>
  [--bank <dir>] [--memory <dir>] [--global ~/.claude/CLAUDE.md] [--json f] [--md f]
  [--changed-since <date>] [--apply]`. Reads every instruction doc (both CLAUDE.md files,
  `docs/`, root `*.md`, skills, worker prompts; on the Mac the memory folder) and checks each
  claim a machine can: file paths (renamed → the new name; deleted → when), function and
  constant names (gone from the code → the commit), routes and pages, `vercel.json` crons named
  beside their route, the Fly worker's times vs `WORKER_JOBS` and `JOB_RHYTHMS` labels, the
  switch table (`docs/SWITCHES.md`) vs `lib/portal-beta.ts`, skill names, model ids, the live Supabase table list
  (main + science), the old `~/Desktop/<repo>` paths, and **each repo's CLAUDE.md size against the
  40 KB lean-index cap** (6 Oct 2026; finding kind `size` — move the detail into `docs/`). Each finding is **sure** or **look**
  (a plan, an outside name, a file outside the repos). `--apply` rewrites only sure renames and
  Desktop paths, one line at a time, never in a SPEC / IDEAS / briefing. Pure half
  `scripts/doc-sweep/claims.mjs`, tested by `claims.test.mjs` (in `npm test`). ~3 min, most of it
  `git log -S` on the names.
- **The judgement pass — plan-billed.** Bot skill `/doc-sweep`, **Sundays 07:20 SGT on the Fly
  worker** (bot `worker/fly/docsweep.sh`, inside the 07:10 marking-learn wake; switch `doc-sweep`
  on `/admin/switches`): runs the checker in its own clones, reviews what `--apply` did, fixes
  the other obvious lines, reads the docs changed since last week plus a rotating slice of 12
  for contradictions / "nothing built" beside built work / rules the code no longer follows.
  Docs-only fixes are pushed (they build and deploy nothing); a fix in a file that deploys, or
  one that changes a rule or a decision, is a `proposal/<date>-doc-sweep-<n>` branch with ONE
  plain Telegram message (ops topic) carrying the Ship buttons — sent only when something was
  fixed or needs him. Stamps `job_runs` `doc-sweep` (rhythm 204 h).
- **The memory half** runs on the MacBook Pro (the memory folder lives only there): the Claude
  scheduled task `doc-sweep-memory`, Sundays 08:00, `/doc-sweep memory` (table below).

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
| `topup-bank-nightly` | 3:30am daily | **the Fly worker** (bot `worker/fly/jobs.sh job_qb_topup`, switch `qb-topup`) — **since 7 Oct 2026**; the Air's task went silent 9 Sep | ✅ live | plan-billed question-bank topup (spec in its SKILL.md; stamps `qb-topup`). Starts a session ONLY when a `generation_requests` row waits (requests come from Practice photo and admin top-ups); an empty night stamps ok with no session |
| `file-subgroups` + `file-subgroups-science` | maths 04:15 + 16:15 · science 10:15 + 22:15 | the Fly worker (`worker/fly/jobs.sh job_file_subgroups`, since 2 Oct 2026) | ✅ live once deployed | 🗂 the sub-skill filer: 300 topic-tagged questions a run filed under ONE sub-skill each (`question_subgroups`, source `cc_backfill`), Opus 5.5 at medium effort (measured: effort makes no difference to the labels), two-reader rule under 0.75, never the API. The Mac task that ran it had not stamped since 9 Sep 2026 — three weeks of extraction went unfiled (maths 2,547, science 7,100 on 2 Oct). Science = the science project, trees PHY / CHEM / BIO, a Combined Science question filed under its subject's pure tree. The wrapper stamps the backlog before and after. N(A) / N(T) / JC H1 maths and lower-sec science have no tree and are never filed. |
| `extract` (Fly worker) | every 15 min, the marking queue empty or 00:00–06:59 SGT | **Fly `adrianmath-worker`** (bot `worker/fly/extract.sh`, since 25 Sep 2026) | ✅ live | drains the `paper_library` queue ONE row per run under the live law + the prompt's box overrides; runner `PDF-Pipeline-Fly-<ddHHMM>`; stamps `pdf-extract` on claiming runs → [`EXTRACTION-QUEUE.md`](EXTRACTION-QUEUE.md) §4. The Mac rows this replaced (`pdf-extraction-worker`, `-b`, `-c`, `s1s2-…`) were deleted from the Pro; `inbox-extract` + `exam-extraction-cc1..3` below are redundant since the same day |
| `question-mine-daily` | — | — | ⏹ **retired 7 Oct 2026** (Adrian: "yes") | four runs (31 Aug–7 Oct) enqueued nothing — the bank covered every asked topic; its one standing finding (thin E Math notes) is in `IDEAS.md`. Spec kept in [`docs/QMINE.md`](QMINE.md) |
| `doc-sweep-memory` | Sundays ~8:07am (the app jitters the minute) | the MacBook Pro — the memory folder lives there | ✅ live (5 Oct 2026) | 🧹 the memory half of the stale-doc sweeper: runs `scripts/doc-sweep/check.mjs --memory …`, fixes or removes memory files that name a file, function or flag that no longer exists, keeps `MEMORY.md` in step (bot skill `doc-sweep` §7) |
| `siteground-vercel-migration-reminder` | one-time 1 Nov 2026 | A (MacBook Pro) | ✅ armed | domain + hosting expiry reminder |
| `exam-extraction-cc1..6` | ⏸ **superseded 25 Sep 2026** by the Fly `extract` job above (cc4–6 retired 8 Sep; cc1–3 + the Pro's `inbox-extract` task are redundant now — claims are atomic, so leaving them on is harmless; Adrian removes them) | the MacBook Pro | ⏸ redundant | was: the queue-only shims under the fleet law, `PDF-Pipeline-CC<n>` runners |
| *(extraction fleet)* | — | B (the Air) | ⏸ redundant since 25 Sep 2026 | the `pdf-pipeline-cc-*` shims read the same queue; the Fly lane replaces them |
| `figure-fitness` | 03:10 SGT daily from the Fly worker's `jobs.sh` timed table | **the Fly worker `adrianmath-worker`** (bot `worker/fly/figfit/figfit.sh` under a pooled login, `with_pool_login`; state `/data/home/.adrianmath_figfit`, runs pruned at 14 days) — **since 25 Sep 2026**; it was a paused Claude scheduled task on the MacBook Pro whose last real run was 9 Sep | ✅ live (2026-09-03; on Fly 25 Sep 2026) | the ingestion figure-fitness catch-up: judges question figures ingested in the last 7 days (Lane A) or whose figure changed since their last stamp (Lane B, the two placement logs' `applied_at`) that carry no `fitness:` stamp, holds failures for Adrian's `/admin/figures-bank?kind=fitness` lane, may un-serve only `wrong-figure`/`answer-leak`. **Rubric is NOT in the scripts** — `law.mjs` cuts the `## Figure fitness` section of the Supabase law row `extraction_worker_prompt` id `exam-extraction` at every run, shared with every extraction worker, so one edit moves both. Ceiling 120 figures/run, one `claude -p` judge (Fable), 12-tile calibration with 4 planted swaps or nothing is written; stamps `figure-fitness` every night incl. quiet → [`FIGURES.md`](FIGURES.md) §4 |
| `missing-figures` | 03:00 SGT daily from the Fly worker's `jobs.sh` timed table (a missed slot runs at the next wake) | **the Fly worker** (bot `scripts/missing-figures-sweep.js`, pure half `lib/missing-figures.js`; remembered looks in `/data/home/.adrianmath_missing_figs/looks.json`) — **since 5 Oct 2026** | ✅ live (first run the night after deploy) | the missing-figure sweep (Adrian: "do the self fixes"): bank questions — maths `questions` and the science project — that NAME a figure ("Fig. 7.2", "the diagram shows") but store none, or fewer than they name; a cheap text pre-filter (a range or a pattern strip counts as one figure, a typed table and an insert are skipped), then a Sonnet look at the stored images (strips, two graphs in one picture and "draw a diagram" count as present); a confirmed paper whose source row is `done`/`flagged` goes back to `queued` with the notes starting `COMPLETE PARTIAL: FIGURES ONLY …` (once per paper — a row that already had one, or says FIGURE MISSING IN SOURCE, is left for Adrian); ≤20 papers and ≤80 looks a night; the extraction lanes crop or redraw (bot `worker/fly/EXTRACT_PROMPT.md`). Off switch `missing-figures` on /admin/switches (the script reads it). Stamps `missing-figures` every run. Questions from papers the library never held (the pre-queue Mac fleet, most of the science bank) are counted but cannot be re-run |

<!-- preview-build tick 2026-08-29a — dev-only nudge so Vercel builds a preview when dev == main (same-commit builds get skipped) -->

- `auto-release-report` — Mondays 8am SGT (`0 0 * * 1` UTC): the auto-release number — hand-ins released without Adrian in the last 7 days, how many he changed afterwards, and the auto-pause rule (≥5 released and >10 % changed → `auto_release_paused` set, Telegram). Route `/api/cron/auto-release-report`, pure `lib/auto-release-report.ts`.
- `consistency-remark` — **Sundays 10pm SGT** (`0 14 * * 0` UTC): 📏 the weekly marking-consistency measure (17 Sep 2026, Adrian: *"we need consistency in marking … how can we measure the effectiveness of all these changes?"*). Every active paper in `consistency_set` is asked to be read again in **SHADOW** — the bot queues it on the Mac lane, a slot reads it with the same prompt and grounding as a whole re-mark, and the reading is filed in `paper_marking_runs.result_json.shadow_runs[]` beside the paper's real marking. **Nothing is delivered**: no student, no parent and no desk lane can see a shadow (bot `lib/shadow-run.js`, proved by `test/shadow-invariant.test.js`). Monday's `auto-release-report` then prints the 📏 Consistency line from `lib/shadow-diff.ts`. Route `/api/cron/consistency-remark`; the set is `lib/consistency-set.ts` + `/api/admin/consistency-set`; the numbers are `/api/admin/consistency`. **It costs plan time, never money** — about 8 × 16 min of Mac plan on a Sunday night, and there is deliberately no API-lane path, so a shadow that finds no slot waits for next Sunday. 22:00 is after the evening's hand-ins have been marked and released, so a measurement never sits in front of a student.
- `weekly-cost` — **Mondays 8:30am SGT** (`30 0 * * 1` UTC): 💰 the Monday cost check — a paper's average cost, its three parts, the lanes, the month, and only the savings that passed their test (see §The Monday cost check). Route `/api/cron/weekly-cost`, pure `lib/weekly-cost.ts`.
- `shadow-read-report` — **Thursdays 9am SGT** (`0 1 * * 4` UTC): 👻 the cheaper-reader shadow read back (1 Oct 2026, Adrian: "wire the three"). Every delivered maths paper the bot shadowed (`result_json.shadow_read`, bot `lib/shadow-read.js`, `MARKING_SHADOW_ARMS=claude-sonnet-5-5+ref:50`) rolled up per arm and per level against the noise floor from `consistency-remark`'s re-reads; ONE Telegram message to the marking topic with the verdict per level (≥ 10 papers and agreement at or above the marker's own) and the first disagreeing parts with their `/admin/mark-paper?run=` doors; silent while nothing is shadowed, stamped either way. Monday's `auto-release-report` prints the same measure as one 👻 line. The bot pings the topic once more when an arm's cap is reached. Pure `lib/shadow-read-report.ts` (the twin of the bot's summariser). Nothing flips itself.

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

## Switches — one page, `/admin/switches` (2 Oct 2026)

Adrian: *"can you put toggles for pdf extraction, twins extraction and whatever other worker
jobs there are together with the toggles for accounts … have a page just for toggles?"*

| Switch | Stored in | Read by | Off means |
|---|---|---|---|
| 🖥 Mac plan only | Airtable `Settings` `marking_mac_only` | the bot, every queue tick | (ON) nothing goes to the API |
| 🌙 Gemini Batch for queued papers (3 Oct 2026) | Airtable `Settings` `marking_vision_batch` | the bot, every queue tick (`lib/marking-settings.js visionBatch()`; no row yet → the Fly secret `VISION_BATCH` decides) | every vision call is live — full price, no waiting. ON = a queued paper's first vision round goes to Google's Batch API at half price and may wait up to an hour; ⚡ Mark now never batches |
| Plan accounts ×3 | `Settings` `slot_accounts` (+ `slot_usage` meters) | every slot and lane's picker | that account is never picked |
| Worker jobs ×20 | `Settings` `worker_jobs` | the Fly worker's scheduler, every 2 min | no NEW run of that job starts |

- **Worker jobs** = `WORKER_JOBS` in `lib/worker-jobs.ts`: `extract`, `twins` (all lanes of each
  share the name), `file-subgroups`, `file-subgroups-science`, `figure-fitness`, `missing-figures`, `subject-retag`,
  `day-review`, `find-review`, `bot-review`, `marking-review`, `marking-fix`, `marking-learn`,
  `doc-sweep`, `extraction-learn`, `nightly-builder` (its 07:30 morning message too), `worksheets`, `proposals`,
  `flagjudge`, `flag-review`, `plan-reads` (✍️ the answer reader, 7 Oct 2026 — reads the `plan_reads` queue every minute; health-check `plan-reads` alarms when an answer waits over 20 minutes; since 8 Oct 2026 it also reads the essay marker's reads, kind `essay-read`, model `opus`, up to three rows at once). `prune`, the disk check and the after-restart recovery are never
  switchable (they keep the worker alive).
- **Every one obeys since 5 Oct 2026** (Adrian: "fix switches page so it stops every job"). The
  scheduler gate written on 2 Oct sat on an unmerged bot branch, so until then only the jobs that
  read their own entry obeyed. Now bot `worker/fly/jobs.sh` reads the list every 2 min
  (`refresh_jobs_off`) and checks `job_on <name>` before EVERY start (`run_job` checks again;
  `learn.sh` and `builder.sh` the same); a skipped start is logged once in the worker log as
  `🎚 <job> is OFF on /admin/switches — not started`. Scripts that can also be run by hand ask
  through one reader, bot `lib/worker-switch.js`. Bot CLAUDE.md §The switches.
- **A switch stops new work only.** A run in flight finishes. A timed job switched back on runs
  its latest missed slot once (the scheduler's stamp rule).
- **Fail-safe direction.** No entry = on. The route answers a failed read with 502 and NO `off`
  list, and the worker keeps the last list it read, so a job Adrian parked never restarts because
  Airtable blinked. The last good list is saved on the worker's volume (`jobs-off`), so a restart
  while the site is down still remembers it; only a worker that has never read the list runs everything.
- **Not switchable here, on purpose:** marking seats and sheet slots (a stray tap must never
  park a student's paper), auto-release and the Science tab (settled, their cards were removed
  1 Oct 2026), and every `*_OPEN_TO_STUDENTS` constant (code, `lib/portal-beta.ts`).
- **When the queue stacks behind a slow paper** the bot sends one ⏳ line to the marking topic
  (at most one an hour, `lib/queue-wait.js stackedWait`): how many papers wait, how long the
  oldest has, and — when 🌙 Gemini Batch is on — that switching it off marks at live speed.
- **A job that is OFF still goes amber on the board above** once its rhythm lapses — the amber
  is true (it is not running); the Switches page says why.
- Adding a worker job: a line in `WORKER_JOBS`, the same key in bot `lib/worker-switch.js
  SCHEDULER_SWITCHES`, and `job_on <key>` at its start site in the bot's `worker/fly/jobs.sh`
  (bot `test/worker-switches.test.js` catches a started job with no switch). Each flip sends one line to the ops topic.

## Safety checks — the leak test and the backup check (5 Oct 2026)

Adrian, 5 Oct 2026: *"unfinished safety work … backup checks"*. Two jobs, both
quiet when fine, both one plain Telegram line when not, both stamped in `job_runs`
with a `JOB_RHYTHMS` line, and both shown on Monday's `auto-release-report` as one
line each (🔒 / 🗄).

### 🔒 `leak-test` — Mondays 04:00 SGT (`0 20 * * 0` UTC)

Route `/api/cron/leak-test`; rules `lib/leak-test.ts` (pure, tested); requests
`lib/leak-test-store.ts`. Runs as the demo student (`portal-teste@example.com`,
session minted server-side with the service key — a magic link generated and
verified in memory, never e-mailed). It:

1. reads **every table and view the database's API exposes** (taken from its own
   OpenAPI listing, so a new table is covered the day it ships) once signed out
   and once as the test student — any row that is not public content
   (`PUBLIC_READ`) and not the test student's own fails;
2. asks the app's doors for **another student's** marked paper (PDF, cover, ink,
   Practice Again PDF, paper page, science page, explanation page), stored file,
   assignment, essay, humanities answer and printed paper — signed in, signed
   out, and for pages also as an in-app navigation (`RSC: 1`, which skips the
   `/app` layout's sign-in check). GET only, so a leak it finds changes nothing;
3. **controls** — the test student must read their own account and open their own
   marked paper, or the run fails as "blind".

A failure goes to Adrian's main chat (not a topic). `?base=<origin>` points the
door checks at another deployment. First run 5 Oct 2026 against www: 173 tables,
36 doors, nothing came back, controls passed.

### 🗄 `backup-check` — the 4th, 03:00 SGT (`0 19 3 * *` UTC)

Route `/api/cron/backup-check` (`?files=1` = quick probe, no copy, no stamp);
rules `lib/backup-check.ts`; I/O `lib/backup-check-store.ts`.

1. **Our own monthly copy, read back.** The student tables of the main database
   (`DB_SNAPSHOT_TABLES`) and the key Airtable tables (`AIRTABLE_SNAPSHOT_TABLES`)
   are written as gzipped JSON to the PRIVATE bucket `backups` in the
   **adrianscience** project (`db/<YYYY-MM>/…`, `airtable/<YYYY-MM>/…`), then
   downloaded, unzipped and counted against what was written and against live.
   Three months are kept; older folders are deleted by the job.
2. **Files open.** Four random files each from `student-files`, `question_images`
   and `paper-library` (SQL `backup_sample_objects`, service role only) are
   downloaded: right size, and really a PDF / image as the name says.
3. **Supabase's own nightly backups** — listed through the Management API when
   `SUPABASE_ACCESS_TOKEN` is set (newest finished backup < 36 h, both projects).
   Without the token the line says "not checked"; it never pretends.

First run 5 Oct 2026: 3,502 rows from 18 tables and 4,686 Airtable records from
11 tables copied and read back whole; 12 sample files opened.

### What is backed up (5 Oct 2026)

| Thing | Backup today | Gap |
|---|---|---|
| Main + science databases | Supabase Pro: a nightly backup kept 7 days (no point-in-time restore — a paid add-on) | Nobody had ever checked one; needs `SUPABASE_ACCESS_TOKEN` for the job to check it |
| Student tables + Airtable | **Our own monthly copy since 5 Oct 2026**, 3 months kept, read back each month | Monthly, so up to a month can be lost if both Supabase's copy and the live data go |
| Files — every bucket of the main project (`student-files` ≈9 GB, `paper-library` ≈10 GB, `question_images` ≈3 GB, `kb-images`, `question-images`, `practice-figures`, `practice_worksheets`, `science_diagrams`, `humanities_images`, `kb-sources`, `syllabus_docs`, `notes-figures`) + the science project's `question_images` (≈3 GB) | **Copied since 5 Oct 2026** (Adrian: "backup the files") — see 🗄 `file-backup` below. Supabase's own backups never held files | ≈26 GB of copies; with the live files the organisation holds ≈52 GB, inside the Pro plan's 100 GB included storage |
| Airtable | Airtable's own snapshots (plan-dependent) + our monthly copy above | — |
| Dropbox | Dropbox's version history | — |
| Both repos | GitHub + the Macs' clones + the Fly worker's clone | — |

### 🗄 `file-backup` — nightly, hourly 02:30–06:30 SGT (`30 18-22 * * *` UTC), 5 Oct 2026

> **Five runs a night since 8 Oct 2026.** One run has 3.5 minutes and copies about 1 GB. By 8 Oct
> more than that was arriving each day, 5,110 files had waited over two days, and the run reported
> FAILED (the hub's Backups light, and `health-check` → `ops-jobs`). A run with nothing left to copy
> ends in seconds. To clear a backlog by hand: call the route with the admin bearer and
> `?concurrency=10` until its line no longer says "still to copy".

Route `/api/cron/file-backup`; rules `lib/file-backup.ts` (pure, tested); copying
`lib/file-backup-store.ts`; SQL `migrations/file_backup_ledger.sql` (applied to BOTH
projects). Every file in every bucket of the main project is copied to the
adrianscience project's private `backups` bucket under `files/<bucket>/<name>`; the
science project's `question_images` goes the other way, to the main project's
private `backups` bucket. Each source project keeps `file_backup_ledger` (what was
copied, with its eTag), so `file_backup_pending` lists what is new or changed. The
first full copy and the nightly top-up are the same job: oldest first until its
4 minutes run out, the next run carries on — it is resumable by construction. A file
deleted at the source is deleted from the backup 30 days later (`file_backup_mark_gone`
/ `file_backup_expired`). Stamps `job_runs` every run (`meta.caughtUp` once nothing
is waiting); one line to the ops topic only when a copy failed, or — once the first
full copy has finished — when files have waited over two days. The monthly
`backup-check` also downloads six random copies FROM the backup and checks them.

**First full copy, 5 Oct 2026:** 87,859 files, 27.1 GB (main 68,9xx files incl. student-files
19,100 / 9.2 GB first; science question_images 18,8xx), no failed copy, driven run after run
from this session; the stamp then carries `meta.caughtUp: true`, which turns on the
two-day stall alarm. The organisation now stores about 54 GB (live + copies) against the
Pro plan's 100 GB included. A run started with large past papers in flight once ran into
Vercel's 300 s limit — a batch now starts only with 45 s to spare.


## 🔕 Messages switched off (Adrian, 8 Oct 2026)

Adrian, of a list of duplicate, redundant and unused messages: **"yes, remove the 12 and move
the messages"** — with the condition *"staff give a summary every day - readability matters"*
(the morning brief is what he relies on instead). On this site four families no longer send;
the work behind each carries on and the morning brief carries the numbers. The list is
`src/lib/quiet-messages.ts` — **delete a line to turn that message back on**:
`handin-queued` (📥 / 🕒 "handed in … queued"), `scan-line` (📠 queued · 🏷 tagged · 📁 filed),
`find-review-empty` (the Find-a-question digest on a day with no finds), `desk-reminder`
(🗂 "N marked papers waiting" at 08:00). Fault lines in the same places still send ("couldn't
tag", "still not filed", "auto-queue failed"). The June revision follow-up left the schedule the
same day (the route is kept). The full record: bot repo `docs/MORNING-BRIEF.md` §The remove list.
