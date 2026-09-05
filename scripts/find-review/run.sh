#!/bin/bash
# ---------------------------------------------------------------------------
# Find-a-question nightly review — wrapper for launchd (com.adrianmath.findreview).
#
# Once a day (05:30 SGT, plus a catch-up at every login/boot) starts a headless
# Claude Code session on PLAN usage that follows REVIEW_PROMPT.md: read
# yesterday's Find-a-question ledger through GET /api/admin/find-review, judge
# every match that reached a student (Similar / Same-chapter-only / Off, one
# line why), POST the verdicts back (the route stores them and Telegrams
# Adrian one digest), and stamp job_runs 'find-review'. Same shape as
# scripts/sheet-worker/run.sh (single instance, plan-auth chain, stamp on a
# fatal) and the bot's scripts/day-review-nightly.sh (one run per SGT day).
#
# Install:  bash scripts/find-review/install.sh   (from the website repo)
# Test:     REVIEW_DATE=2026-09-05 bash ~/.adrianmath_find_review/run.sh
# Logs:     ~/.adrianmath_find_review/find-review.log
# ---------------------------------------------------------------------------
set -u -o pipefail

export HOME="${HOME:-/Users/adrianfong}"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export LANG="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"

STATE="${FIND_REVIEW_STATE_DIR:-$HOME/.adrianmath_find_review}"
LOG="$STATE/find-review.log"
PROMPT="$STATE/REVIEW_PROMPT.md"
STAMP="$STATE/last-run"
# A day's review is a few dozen rows at most; past this something is wrong.
MAX_RUNTIME_SEC="${MAX_RUNTIME_SEC:-1800}"   # 30 min

mkdir -p "$STATE/work"
ts() { date '+%Y-%m-%d %H:%M:%S'; }
say() { echo "[$(ts)] $*" >> "$LOG"; }

# A wrapper that dies before the session starts is invisible to the logbook —
# the health check would only notice by absence 36h later. So a fatal stamps
# job_runs ok=false on its way out, saying why (best-effort, never blocking).
stamp_fail() {
  [ -n "${FIND_API_BASE:-}" ] && [ -n "${FIND_API_TOKEN:-}" ] || return 0
  curl -s -m 15 -X POST "$FIND_API_BASE/api/job-log" \
    -H "Authorization: Bearer $FIND_API_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"job\":\"find-review\",\"ok\":false,\"summary\":$(python3 -c '
import json, sys
print(json.dumps(sys.argv[1][:300]))' "$1")}" > /dev/null 2>&1 || true
}
cleanup_pid() { rm -f "$STATE/worker.pid"; }
die() { say "FATAL: $1"; stamp_fail "$1"; cleanup_pid; exit 1; }

# --- single instance --------------------------------------------------------
if [ -f "$STATE/worker.pid" ]; then
  OLDPID=$(cat "$STATE/worker.pid" 2>/dev/null || echo "")
  if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then
    exit 0   # previous run still reviewing
  fi
fi
echo $$ > "$STATE/worker.pid"

# --- once per SGT day -------------------------------------------------------
# launchd fires at 05:30 AND at every login/boot (RunAtLoad — a shut-down Mac
# would otherwise skip the night; launchd only catches up from sleep). The
# stamp makes the runs idempotent per day: whichever trigger fires first after
# 05:30 does the review, every later one that day exits quietly. An explicit
# REVIEW_DATE (a manual re-run) bypasses the stamp.
if [ -z "${REVIEW_DATE:-}" ]; then
  now=$(date +%s)
  today_due=$(date -j -f '%H:%M:%S' '05:30:00' +%s 2>/dev/null || date +%s)
  if [ "$now" -ge "$today_due" ]; then due=$today_due; else due=$(( today_due - 86400 )); fi
  last=0
  [ -f "$STAMP" ] && last=$(cat "$STAMP" 2>/dev/null || echo 0)
  if [ "${last:-0}" -ge "$due" ]; then
    cleanup_pid; exit 0   # already reviewed today
  fi
fi

# --- config -----------------------------------------------------------------
if [ ! -r "$STATE/env" ]; then
  say "FATAL: missing $STATE/env (FIND_API_BASE + FIND_API_TOKEN) — run install.sh"
  cleanup_pid; exit 1
fi
# shellcheck disable=SC1091
. "$STATE/env"
if [ -z "${FIND_API_BASE:-}" ] || [ -z "${FIND_API_TOKEN:-}" ]; then
  say "FATAL: FIND_API_BASE / FIND_API_TOKEN not set in $STATE/env"
  cleanup_pid; exit 1
fi
export FIND_API_BASE FIND_API_TOKEN
export FIND_REVIEW_STATE="$STATE"
export FIND_REPO="${FIND_REPO:-$HOME/dev/adrianmathtuition-website}"
# Yesterday in Singapore (the Mac is on SGT; TZ pinned so a travelling laptop
# still reviews the right day).
REVIEW_DATE="${REVIEW_DATE:-$(TZ=Asia/Singapore date -v-1d '+%Y-%m-%d')}"
export REVIEW_DATE

# --- credentials for the headless session (plan auth, never the API) --------
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL
AUTH_VIA=""
if claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then
  AUTH_VIA="keychain"
elif [ -r "$STATE/oauth_token" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$STATE/oauth_token")"
  export CLAUDE_CODE_OAUTH_TOKEN
  AUTH_VIA="oauth_token file"
elif [ -r "$HOME/.adrianmath_pipeline/oauth_token" ]; then
  # The token every plan-billed worker on this Mac shares (sheet-worker precedent).
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$HOME/.adrianmath_pipeline/oauth_token")"
  export CLAUDE_CODE_OAUTH_TOKEN
  AUTH_VIA="pipeline oauth_token"
else
  die "no Claude credentials — 'claude auth login' once, or put a setup-token in $STATE/oauth_token"
fi

if [ ! -r "$PROMPT" ]; then
  die "missing $PROMPT — run install.sh again"
fi

# --- run: one day, one session ---------------------------------------------
say "START (date=$REVIEW_DATE, auth=$AUTH_VIA, model=${WORKER_MODEL:-opus}, max ${MAX_RUNTIME_SEC}s)"
START_EPOCH=$(date +%s)
cd "$FIND_REPO" || die "cannot cd to $FIND_REPO"

# The judge must be strong: "same sub-skill" vs "same chapter" is exactly the
# distinction a cheap pass gets wrong, and a wrong verdict here mis-tunes the
# rule the students live with.
claude -p "$(cat "$PROMPT")" \
  --model "${WORKER_MODEL:-opus}" \
  --effort "${WORKER_EFFORT:-high}" \
  --permission-mode dontAsk \
  --allowedTools Bash Read Write Glob Grep TodoWrite \
  --setting-sources user project \
  < /dev/null >> "$LOG" 2>&1 &
CLAUDE_PID=$!

while kill -0 "$CLAUDE_PID" 2>/dev/null; do
  sleep 15
  if [ $(( $(date +%s) - START_EPOCH )) -ge "$MAX_RUNTIME_SEC" ]; then
    say "TIMEOUT after ${MAX_RUNTIME_SEC}s — killing pid $CLAUDE_PID"
    kill -TERM "$CLAUDE_PID" 2>/dev/null
    sleep 5
    kill -9 "$CLAUDE_PID" 2>/dev/null
    break
  fi
done
wait "$CLAUDE_PID" 2>/dev/null
RC=$?
ELAPSED=$(( $(date +%s) - START_EPOCH ))

if [ "$RC" -eq 0 ]; then
  say "END ok (${ELAPSED}s)"
  date +%s > "$STAMP"
elif tail -40 "$LOG" | grep -qiE 'usage limit|rate.?limit|quota'; then
  say "END rc=$RC (${ELAPSED}s) — looks like a PLAN USAGE LIMIT, not a bug"
  stamp_fail "session hit the plan usage limit before finishing $REVIEW_DATE"
else
  say "END rc=$RC (${ELAPSED}s)"
  stamp_fail "session exited rc=$RC after ${ELAPSED}s (date $REVIEW_DATE)"
fi

cleanup_pid
