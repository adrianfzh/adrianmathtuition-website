#!/bin/bash
# ---------------------------------------------------------------------------
# Telegram worksheet worker — wrapper for launchd (com.adrianmath.worksheetworker).
#
# Polls the /make queue (SPEC-WORKSHEET-MENU.md; Adrian's Telegram menu, kinds
# 1 · 2 · 4 · 5) and, only when a job is waiting, starts a headless Claude Code
# session that builds that KIND of worksheet with the skill that owns it —
# revision-worksheet, copy-revision-worksheet-with-different-practice (notes or
# worked), prelim-paper — on PLAN usage, files the DOCX into Dropbox, and
# completes the job (which Telegrams Adrian the file). The peek is a single
# curl, so an empty queue costs nothing. A clone of scripts/sheet-worker/run.sh,
# which has run this pattern since 30 Aug 2026; only the names and the queue differ.
#
# Install:  bash scripts/worksheet-worker/install.sh   (from the website repo)
# Test:     bash ~/.adrianmath_worksheets/run.sh
# Logs:     ~/.adrianmath_worksheets/worksheet-worker.log
# ---------------------------------------------------------------------------
set -u -o pipefail

export HOME="${HOME:-/Users/adrianfong}"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export LANG="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"

STATE="${WORKSHEETS_STATE_DIR:-$HOME/.adrianmath_worksheets}"
LOG="$STATE/worksheet-worker.log"
PROMPT="$STATE/WORKER_PROMPT.md"
# A worked-examples sheet is plan + practice + author + sympy-verify + render;
# a prelim paper is 25 slots of curation. Heartbeats keep the lease; past this
# we kill and let the lease lapse so the next tick reclaims it.
MAX_RUNTIME_SEC="${MAX_RUNTIME_SEC:-4200}"   # 70 min

mkdir -p "$STATE"
ts() { date '+%Y-%m-%d %H:%M:%S'; }
say() { echo "[$(ts)] $*" >> "$LOG"; }

# A worker that dies BEFORE claiming a job is invisible (no attempts, no
# job_runs row, nothing amber on /admin/ops) — the way the sheet worker failed
# 46 ticks in a row on 31 Aug 2026. So a fatal stamps the logbook on its way
# out, best-effort, saying WHY.
stamp_fail() {
  [ -n "${WORKSHEETS_API_BASE:-}" ] && [ -n "${WORKSHEETS_API_TOKEN:-}" ] || return 0
  curl -s -m 15 -X POST "$WORKSHEETS_API_BASE/api/job-log" \
    -H "Authorization: Bearer $WORKSHEETS_API_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"job\":\"worksheet-worker\",\"ok\":false,\"summary\":$(python3 -c '
import json, sys
print(json.dumps(sys.argv[1][:300]))' "$1")}" > /dev/null 2>&1 || true
}
die() { say "FATAL: $1"; stamp_fail "$1"; cleanup_pid; exit 1; }

# --- single instance --------------------------------------------------------
if [ -f "$STATE/worker.pid" ]; then
  OLDPID=$(cat "$STATE/worker.pid" 2>/dev/null || echo "")
  if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then
    exit 0   # previous run still authoring — launchd will fire again
  fi
fi
echo $$ > "$STATE/worker.pid"
cleanup_pid() { rm -f "$STATE/worker.pid"; }

if [ "${START_DELAY_SEC:-0}" -gt 0 ] 2>/dev/null; then sleep "$START_DELAY_SEC"; fi

# --- config -----------------------------------------------------------------
if [ ! -r "$STATE/env" ]; then
  say "FATAL: missing $STATE/env (WORKSHEETS_API_BASE + WORKSHEETS_API_TOKEN) — run install.sh"
  cleanup_pid; exit 1
fi
# shellcheck disable=SC1091
. "$STATE/env"
if [ -z "${WORKSHEETS_API_BASE:-}" ] || [ -z "${WORKSHEETS_API_TOKEN:-}" ]; then
  say "FATAL: WORKSHEETS_API_BASE / WORKSHEETS_API_TOKEN not set in $STATE/env"
  cleanup_pid; exit 1
fi
export WORKSHEETS_API_BASE WORKSHEETS_API_TOKEN
export WORKSHEETS_STATE="$STATE"
# The repo the session works in — the skills, their python libs and the
# revision builders all live there. Shared checkout; tolerate any branch.
export WORKSHEETS_REPO="${WORKSHEETS_REPO:-$HOME/dev/adrianmathtuition-website}"

# --- peek: is anything waiting? (one curl — no Claude spend) ----------------
# "Waiting" = queued, OR claimed by a session that stopped heartbeating more
# than LEASE_MS ago (40 min, lib/worksheet-jobs.ts) — mirrored here so a dead
# session's job is noticed by the NEXT tick, not by Adrian.
JOBS=$(curl -s -m 30 "$WORKSHEETS_API_BASE/api/admin/worksheet-jobs" \
  -H "Authorization: Bearer $WORKSHEETS_API_TOKEN") || JOBS=""
WAITING=$(printf '%s' "$JOBS" | python3 -c "
import json,sys,datetime
LEASE_S = 40*60
now = datetime.datetime.now(datetime.timezone.utc)
def expired(j):
    beat = j.get('heartbeat_at') or j.get('claimed_at')
    if not beat: return True
    try:
        t = datetime.datetime.fromisoformat(beat.replace('Z','+00:00'))
    except Exception:
        return True
    return (now - t).total_seconds() > LEASE_S
try:
    jobs = json.load(sys.stdin).get('jobs', [])
    print(sum(1 for j in jobs
              if (j.get('attempts') or 0) < 3
              and (j.get('status') == 'queued' or (j.get('status') == 'claimed' and expired(j)))))
except Exception:
    print(-1)")
date '+%Y-%m-%d %H:%M:%S' > "$STATE/last_peek"
if [ "$WAITING" = "-1" ]; then
  say "peek failed: $(printf '%s' "$JOBS" | head -c 200)"
  cleanup_pid; exit 1
fi
if [ "$WAITING" = "0" ]; then
  cleanup_pid; exit 0   # quiet tick — nothing to build
fi

# --- credentials for the headless session (plan auth, never the API) --------
# The same chain every plan-billed worker on this Mac uses, ending at the
# pipeline token that actually exists (the sheet worker's 31 Aug lesson).
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL
AUTH_VIA=""
if claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then
  AUTH_VIA="keychain"
elif [ -r "$STATE/oauth_token" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$STATE/oauth_token")"; export CLAUDE_CODE_OAUTH_TOKEN; AUTH_VIA="oauth_token file"
elif [ -r "$HOME/.adrianmath_sheets/oauth_token" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$HOME/.adrianmath_sheets/oauth_token")"; export CLAUDE_CODE_OAUTH_TOKEN; AUTH_VIA="sheets oauth_token"
elif [ -r "$HOME/.adrianmath_pipeline/oauth_token" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$HOME/.adrianmath_pipeline/oauth_token")"; export CLAUDE_CODE_OAUTH_TOKEN; AUTH_VIA="pipeline oauth_token"
else
  die "no Claude credentials — 'claude auth login' once, or put a setup-token in $STATE/oauth_token"
fi

[ -r "$PROMPT" ] || die "missing $PROMPT — run install.sh again"

# --- run: one job, one session ---------------------------------------------
say "START ($WAITING waiting, auth=$AUTH_VIA, model=${WORKER_MODEL:-opus}, max ${MAX_RUNTIME_SEC}s)"
START_EPOCH=$(date +%s)
cd "$WORKSHEETS_REPO" || die "cannot cd to $WORKSHEETS_REPO"

# Effort HIGH: a sheet Adrian has to rewrite costs more of his time than the tokens save.
claude -p "$(cat "$PROMPT")" \
  --model "${WORKER_MODEL:-opus}" \
  --effort "${WORKER_EFFORT:-high}" \
  --permission-mode dontAsk \
  --allowedTools Bash Read Write Edit Glob Grep TodoWrite Skill \
  --setting-sources user project \
  < /dev/null >> "$LOG" 2>&1 &
CLAUDE_PID=$!

while kill -0 "$CLAUDE_PID" 2>/dev/null; do
  sleep 15
  if [ $(( $(date +%s) - START_EPOCH )) -ge "$MAX_RUNTIME_SEC" ]; then
    say "TIMEOUT after ${MAX_RUNTIME_SEC}s — killing pid $CLAUDE_PID"
    kill -TERM "$CLAUDE_PID" 2>/dev/null; sleep 5; kill -9 "$CLAUDE_PID" 2>/dev/null
    break
  fi
done
wait "$CLAUDE_PID" 2>/dev/null
RC=$?
ELAPSED=$(( $(date +%s) - START_EPOCH ))

# A job left 'claimed' by a dead session is NOT released here: the lease
# expires on its own and the next tick reclaims it — a half-built sheet should
# not be retried instantly.
if [ "$RC" -eq 0 ]; then
  say "END ok (${ELAPSED}s)"
elif tail -40 "$LOG" | grep -qiE 'usage limit|rate.?limit|quota'; then
  say "END rc=$RC (${ELAPSED}s) — looks like a PLAN USAGE LIMIT, not a bug"
else
  say "END rc=$RC (${ELAPSED}s)"
fi

cleanup_pid
