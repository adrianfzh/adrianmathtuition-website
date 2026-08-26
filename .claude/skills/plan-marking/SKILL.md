---
name: plan-marking
description: Run one cycle of the plan-billed 🌙 marking worker by hand — claim one of Adrian's own queued papers, mark it in-session on plan usage, and post the reads back to the bot for annotation/PDF/Telegram delivery. Use when Adrian says "mark the queue on the plan", "run the plan marker", or when debugging why the launchd worker isn't picking papers up. Hand-ins are never claimable here.
---

# Plan-billed marking — manual cycle

The real runbook is [`scripts/plan-marking/WORKER_PROMPT.md`](../../../scripts/plan-marking/WORKER_PROMPT.md)
— the launchd job (`com.adrianmath.planmarking`, every 5 min) feeds that exact
file to a headless session. This skill exists so the same cycle can be run and
debugged interactively.

1. Provide the environment the wrapper would have set, then follow
   `scripts/plan-marking/WORKER_PROMPT.md` to the letter:

```bash
export MARKER_STATE="$HOME/.adrianmath_marker"
set -a; . "$MARKER_STATE/env"; set +a   # MARKER_API_BASE + MARKER_API_TOKEN
```

   If `$MARKER_STATE/env` is missing, run `bash scripts/plan-marking/install.sh` first.

2. Debugging the launchd worker instead: check, in order —
   - `~/.adrianmath_marker/last_peek` (is it ticking at all? `launchctl list | grep planmarking`),
   - `~/.adrianmath_marker/plan-marking.log` (claims, timeouts, plan-limit notes),
   - `{"phase":"external-peek"}` against `/api/admin/mark-paper` (is anything claimable? hand-ins and ⚡ Mark now papers never are),
   - a leftover `~/.adrianmath_marker/current-claim.json` means a session died mid-paper; run.sh releases it on its next tick.

3. Ops notes: docs/MARKING.md § "💻 Plan-billed Mac marker". Pause the worker with
   `launchctl unload ~/Library/LaunchAgents/com.adrianmath.planmarking.plist`;
   the Fly worker's API fallback then marks everything, exactly as before this
   feature existed (plus a ≤12-min head-start delay — kill that too with
   `MARK_QUEUE_EXTERNAL_GRACE_MS=0` on Fly if the pause is long-term).
