# Resumable jobs — long work that survives a session ending

> Adrian, 3 Sep 2026: *"sometimes sessions may end due to limits … when limits are
> renewed, session or tasks continues again? I do not want to keep reminding."*
> This is the pattern, named so it can be asked for: **a checkpointed work queue
> driven by a schedule** — the same shape as the 5-step building doctrine in
> `CLAUDE.md` (Spec → Tools → Checkpoints → Trigger → Log + alarm), applied to a
> one-off batch instead of a product feature.

The unit of work is a **scheduled run**, never a session. A session is a worker
that may die at any moment (usage window, crash, laptop lid). Nothing durable may
live only in its context.

## The five parts

| part | what it is | worked examples already in the repo |
|---|---|---|
| **1. State on disk / in a table** | a RESUME note (where things are, what is next) + per-item state (claimed / done / failed) somewhere every session can read | `sheet_jobs` (status · claimed_by · heartbeat_at · attempts · result); `figure_flags` claims + `figure_clean_log` (docs/FIGURES.md §3); `RESUME-wmsweep.md` in the AdrianMath project folder; `HANDOFF-*.md` at the repo root |
| **2. Small, idempotent units** | one sheet, one figure, one paper, one QP+MS pair; a unit either lands whole (logged) or not at all; re-running a landed unit is a no-op | one bucket object + one `figure_clean_log` row per swap; `sheet_jobs` 409 on a duplicate queue; `save-paper` rows filled in place |
| **3. Claims with a lease** | before working, claim the unit with a label and a heartbeat; a claim whose heartbeat is older than the lease is free again, so a dead worker's unit is re-picked, never lost and never double-done | `pickNextJob` + `claimExpired` (lib/sheet-jobs.ts, 40-min lease); the marking queue's `external_claim` (bot lib/queue-pick.js, 10-min lease, heartbeat-refreshed); figure_flags `claimed_by` |
| **4. A trigger that fires without anyone** | a scheduled task (desktop app) or a launchd wrapper that PEEKS first (one cheap read, zero model spend when idle), takes ONE unit, updates the state, exits; a run that hits the limit just fails and the next tick resumes | `scripts/sheet-worker/run.sh` (peek-first, PID lock, watchdog, 15-min tick); `scripts/plan-marking` (5-min tick); the `bio-extract` scheduled task (every 2 h, one pair per run) |
| **5. Log + alarm** | stamp `job_runs` per run and add a `JOB_RHYTHMS` line so a dead process alarms by absence; Telegram Adrian only at his checkpoints (a vet sheet is ready) or on a spent retry — never per tick | docs/OPS.md; the sheet worker's `done`/`fail` Telegrams |

**Adrian's checkpoints stay manual by design.** When a run reaches "Adrian must
vet this", it writes the sheet, sends ONE Telegram, records the gate in the
RESUME note, and exits; later ticks see the gate and do nothing until it is
answered. Automation moves the reversible steps; the outward-facing step waits.

## How to set one up next time (checklist)

1. Write the RESUME note first, in the AdrianMath project folder (or a repo doc
   if the job is code): scope, the unit, the state file/table, the gate(s), the
   batch label, what "done" means.
2. Make the unit idempotent and claimable (label + timestamp; a lease long enough
   for one unit). Prefer an existing table (`sheet_jobs`, `figure_flags`) over a
   new one.
3. Write the runner as "peek → claim one → do one → update state → exit". Never
   loop inside a run; the schedule is the loop.
4. Create the trigger: a desktop-app scheduled task with a fixed prompt ("read
   `<RESUME>`; do the next unit; update it; stop") every 1–2 h for plan-billed
   work, or a launchd plist for a shell/Node runner. Adrian approves the creation
   (a standing change).
5. Stamp `job_runs` and add the `JOB_RHYTHMS` line. Verify by killing a run
   mid-unit and watching the next tick recover it.

## The two traps this has already hit

- **Scratch is not durable enough.** The session scratchpad survives on disk but
  nobody looks there; put resume state in the project folder or a table.
- **A peek that cannot see abandoned claims stalls the queue.** The sheet
  worker's peek counted only `queued` rows, so a job whose session died mid-way
  sat at `claimed` for 33 hours (Tan Sijia, 1–2 Sep 2026). Count expired claims
  as waiting.

## Where the state may live — and iCloud

`~/Desktop` and `~/Documents` are iCloud-synced on Adrian's Macs, and iCloud has
hung rebases, evicted files, minted " 2" copies and rolled refs back (see the
Gotchas in `CLAUDE.md`). Both repos' `.git` already live in `~/.gitdirs/`. For
resume state the rule is the same: **the pattern does not care where the folder
is, only that the path is stable.** If `AdrianMath` moves off iCloud (e.g.
`~/dev/AdrianMath`), leave a symlink at the old path
(`ln -s ~/dev/AdrianMath ~/Desktop/AdrianMath`) so every skill, script, memory
note and RESUME file that names the Desktop path keeps working, then migrate the
hard-coded paths at leisure. Move it when no session or launchd job is mid-run,
after iCloud has downloaded every evicted file (a `find` over an evicted tree
stalls — see the memory note). Scheduled tasks and launchd plists reference the
repo or the project folder by absolute path; update those plists if the repo
itself moves.
