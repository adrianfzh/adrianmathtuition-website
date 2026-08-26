#!/bin/bash
# ---------------------------------------------------------------------------
# Plan-billed marking worker — wrapper for launchd (com.adrianmath.planmarking).
#
# Polls the 🌙 marking queue for Adrian's OWN queued papers (hand-ins are never
# offered externally) and, only when one is claimable, starts a headless Claude
# Code session that marks it on PLAN usage and posts the reads back to the bot.
# The peek is a single curl, so the every-5-min tick costs nothing while the
# queue is empty. Same shape as mac_b_setup/run_worker.sh (pdfpipelinecc).
#
# Install:  bash scripts/plan-marking/install.sh   (from the website repo)
# Test:     bash ~/.adrianmath_marker/run.sh
# Logs:     ~/.adrianmath_marker/plan-marking.log
# ---------------------------------------------------------------------------
set -u -o pipefail

export HOME="${HOME:-/Users/adrianfong}"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export LANG="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"

STATE="$HOME/.adrianmath_marker"
LOG="$STATE/plan-marking.log"
PROMPT="$STATE/WORKER_PROMPT.md"
CLAIM_FILE="$STATE/current-claim.json"
MAX_RUNTIME_SEC="${MAX_RUNTIME_SEC:-5100}"   # 85 min — heartbeats keep the lease
                                             # alive; past this we kill and release
                                             # so the API fallback takes the paper.

mkdir -p "$STATE"
ts() { date '+%Y-%m-%d %H:%M:%S'; }
say() { echo "[$(ts)] $*" >> "$LOG"; }

# --- single instance --------------------------------------------------------
if [ -f "$STATE/worker.pid" ]; then
  OLDPID=$(cat "$STATE/worker.pid" 2>/dev/null || echo "")
  if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then
    exit 0   # previous run still marking — launchd will fire again
  fi
fi
echo $$ > "$STATE/worker.pid"
cleanup_pid() { rm -f "$STATE/worker.pid"; }

# --- config -----------------------------------------------------------------
if [ ! -r "$STATE/env" ]; then
  say "FATAL: missing $STATE/env (MARKER_API_BASE + MARKER_API_TOKEN) — run install.sh"
  cleanup_pid; exit 1
fi
# shellcheck disable=SC1091
. "$STATE/env"
if [ -z "${MARKER_API_BASE:-}" ] || [ -z "${MARKER_API_TOKEN:-}" ]; then
  say "FATAL: MARKER_API_BASE / MARKER_API_TOKEN not set in $STATE/env"
  cleanup_pid; exit 1
fi
export MARKER_API_BASE MARKER_API_TOKEN
export MARKER_STATE="$STATE"

api() {  # api '<json body>' [timeout]
  curl -s -m "${2:-30}" -X POST "$MARKER_API_BASE/api/admin/mark-paper" \
    -H "Authorization: Bearer $MARKER_API_TOKEN" \
    -H "Content-Type: application/json" -d "$1"
}

# Release a claim left behind by a killed/dead session, so the Fly worker's API
# fallback takes the paper now instead of after the 10-min lease.
release_stale_claim() {
  local why="$1"
  if [ -f "$CLAIM_FILE" ]; then
    local body
    body=$(python3 - "$CLAIM_FILE" "$why" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))
print(json.dumps({"phase": "external-release", "id": c.get("id"), "by": c.get("by"), "error": sys.argv[2]}))
PY
) && api "$body" 30 > /dev/null 2>&1
    say "RELEASED leftover claim ($why)"
    rm -f "$CLAIM_FILE"
  fi
}

# A claim file with no live session behind it = a previous run died mid-paper.
release_stale_claim "previous run died"

# --- peek: is there anything for us? (one curl — no Claude spend) -----------
PEEK=$(api '{"phase":"external-peek"}' 30) || PEEK=""
ELIGIBLE=$(printf '%s' "$PEEK" | python3 -c "import json,sys
try: print(json.load(sys.stdin).get('eligible', 0))
except Exception: print(-1)")
date '+%Y-%m-%d %H:%M:%S' > "$STATE/last_peek"
if [ "$ELIGIBLE" = "-1" ]; then
  say "peek failed: $(printf '%s' "$PEEK" | head -c 200)"
  cleanup_pid; exit 1
fi
if [ "$ELIGIBLE" = "0" ]; then
  cleanup_pid; exit 0   # quiet tick — nothing claimable
fi

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
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$HOME/.adrianmath_pipeline/oauth_token")"
  export CLAUDE_CODE_OAUTH_TOKEN
  AUTH_VIA="pipeline oauth_token"
else
  say "FATAL: no Claude credentials — 'claude auth login' once, or put a setup-token in $STATE/oauth_token"
  cleanup_pid; exit 1
fi

if [ ! -r "$PROMPT" ]; then
  say "FATAL: missing $PROMPT — run install.sh again"
  cleanup_pid; exit 1
fi

# --- run: one paper, one session -------------------------------------------
say "START ($ELIGIBLE claimable, auth=$AUTH_VIA, model=${WORKER_MODEL:-opus}, max ${MAX_RUNTIME_SEC}s)"
START_EPOCH=$(date +%s)
cd "$STATE" || { say "FATAL: cannot cd to $STATE"; cleanup_pid; exit 1; }

claude -p "$(cat "$PROMPT")" \
  --model "${WORKER_MODEL:-opus}" \
  --permission-mode dontAsk \
  --allowedTools Bash Read Write Glob Grep TodoWrite \
  --setting-sources user \
  < /dev/null >> "$LOG" 2>&1 &
CLAUDE_PID=$!

while kill -0 "$CLAUDE_PID" 2>/dev/null; do
  sleep 10
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

# The session deletes the claim file on success/supersession; anything left
# means it died holding the paper — give it back to the API fallback now.
release_stale_claim "session ended rc=$RC"

if [ "$RC" -eq 0 ]; then
  say "END ok (${ELAPSED}s)"
elif tail -40 "$LOG" | grep -qiE 'usage limit|rate.?limit|quota'; then
  say "END rc=$RC (${ELAPSED}s) — looks like a PLAN USAGE LIMIT, not a bug"
else
  say "END rc=$RC (${ELAPSED}s)"
fi

cleanup_pid
exit "$RC"
