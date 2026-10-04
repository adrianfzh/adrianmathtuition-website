#!/bin/bash
# ---------------------------------------------------------------------------
# Learn from Adrian — wrapper for launchd (com.adrianmath.learnfromadrian).
#
# Daily at 07:30 SGT (plus a catch-up at every login/boot): read what Adrian typed to
# Claude sessions on THIS Mac since the last run (extract.mjs, no model), hand it to one
# headless Claude Code session on PLAN usage that follows LEARN_PROMPT.md (group the
# repeats, check which rules exist, draft proposals on branches of the job's own clones),
# then send its message to Adrian's Telegram — only when it found something new — and
# stamp job_runs 'learn-from-adrian'. Spec: docs/LEARN-FROM-ADRIAN.md.
#
# Same shape as scripts/find-review/run.sh (single instance, once per SGT day, plan
# auth, stamp on a fatal). It runs on the Mac, not the Fly worker, because the
# transcripts live here.
#
# Install:   bash scripts/learn-from-adrian/install.sh
# Manual:    LFA_FORCE=1 bash ~/.adrianmath_learn/run.sh
# First run: LFA_SINCE=2026-09-21T00:00:00+08:00 LFA_NO_SEND=1 LFA_FORCE=1 bash ~/.adrianmath_learn/run.sh
# Logs:      ~/.adrianmath_learn/learn.log ; each run's files in ~/.adrianmath_learn/work/<stamp>/
# ---------------------------------------------------------------------------
set -u -o pipefail

export HOME="${HOME:-/Users/adrianfong}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"
export LANG="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"

STATE="${LFA_STATE_DIR:-$HOME/.adrianmath_learn}"
LOG="$STATE/learn.log"
PROMPT="$STATE/LEARN_PROMPT.md"
STAMP="$STATE/last-run"
MAX_RUNTIME_SEC="${MAX_RUNTIME_SEC:-3600}"   # 60 min — a first run reads two weeks

mkdir -p "$STATE/work" "$STATE/proposals"
ts() { date '+%Y-%m-%d %H:%M:%S'; }
say() { echo "[$(ts)] $*" >> "$LOG"; }

stamp() {   # stamp <ok:true|false> <summary>
  [ -n "${LFA_API_BASE:-}" ] && [ -n "${LFA_API_TOKEN:-}" ] || return 0
  curl -s -m 15 -X POST "$LFA_API_BASE/api/job-log" \
    -H "Authorization: Bearer $LFA_API_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"job\":\"learn-from-adrian\",\"ok\":$1,\"summary\":$(python3 -c '
import json, sys
print(json.dumps(sys.argv[1][:300]))' "$2")}" > /dev/null 2>&1 || true
}
cleanup_pid() { rm -f "$STATE/worker.pid"; }
die() { say "FATAL: $1"; stamp false "$1"; cleanup_pid; exit 1; }

# --- single instance --------------------------------------------------------
if [ -f "$STATE/worker.pid" ]; then
  OLDPID=$(cat "$STATE/worker.pid" 2>/dev/null || echo "")
  if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then exit 0; fi
fi
echo $$ > "$STATE/worker.pid"

# --- once per SGT day, after 07:30 ------------------------------------------
if [ -z "${LFA_FORCE:-}" ]; then
  now=$(date +%s)
  today_due=$(TZ=Asia/Singapore date -j -f '%H:%M:%S' '07:30:00' +%s 2>/dev/null || date +%s)
  if [ "$now" -ge "$today_due" ]; then due=$today_due; else due=$(( today_due - 86400 )); fi
  last=0
  [ -f "$STAMP" ] && last=$(cat "$STAMP" 2>/dev/null || echo 0)
  if [ "${last:-0}" -ge "$due" ]; then cleanup_pid; exit 0; fi
fi

# --- config -----------------------------------------------------------------
[ -r "$STATE/env" ] || { say "FATAL: missing $STATE/env — run install.sh"; cleanup_pid; exit 1; }
# shellcheck disable=SC1091
. "$STATE/env"
export LFA_API_BASE LFA_API_TOKEN
export LFA_REPO="${LFA_REPO:-$HOME/dev/adrianmathtuition-website}"
export LFA_BOT_REPO="${LFA_BOT_REPO:-$HOME/dev/adrianmath-telegram-math-bot}"
export LFA_MEMORY="${LFA_MEMORY:-$HOME/.claude/projects/-Users-adrianfong-dev-adrianmathtuition-website/memory}"
export LFA_STATE="$STATE"
export LFA_TODAY="$(TZ=Asia/Singapore date '+%Y-%m-%d')"
export LFA_NO_PUSH="${LFA_NO_PUSH:-}"
[ -r "$PROMPT" ] || die "missing $PROMPT — run install.sh again"
[ -d "$STATE/repos/website/.git" ] && [ -d "$STATE/repos/bot/.git" ] || die "the job's own clones are missing — run install.sh again"

RUN_ID="$(TZ=Asia/Singapore date '+%Y-%m-%d-%H%M')"
export LFA_WORK="$STATE/work/$RUN_ID"
mkdir -p "$LFA_WORK"
# prune old run folders (keep 30 days)
find "$STATE/work" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true

# --- step 1: extract (no model) ---------------------------------------------
SINCE_ARGS=(--state "$STATE")
[ -n "${LFA_SINCE:-}" ] && SINCE_ARGS=(--since "$LFA_SINCE")
node "$LFA_REPO/scripts/learn-from-adrian/extract.mjs" "${SINCE_ARGS[@]}" --out "$LFA_WORK" >> "$LOG" 2>&1 \
  || die "extract.mjs failed (see $LOG)"
MSGS=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["messages"])' "$LFA_WORK/stats.json")
UNTIL=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["until"])' "$LFA_WORK/stats.json")

if [ "${MSGS:-0}" -eq 0 ]; then
  say "no new messages since the cursor — nothing to read"
  echo "$UNTIL" > "$STATE/cursor"; date +%s > "$STAMP"
  stamp true "$LFA_TODAY: no new messages"
  cleanup_pid; exit 0
fi

# --- credentials for the headless session (plan auth, never the API) --------
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL
AUTH_VIA=""
if claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then
  AUTH_VIA="keychain"
elif [ -s "$STATE/oauth_token" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$STATE/oauth_token")"; export CLAUDE_CODE_OAUTH_TOKEN
  AUTH_VIA="oauth_token file"
else
  die "no Claude credentials — 'claude auth login' once, or put a setup-token in $STATE/oauth_token"
fi

# --- step 2: the judge -------------------------------------------------------
say "START run=$RUN_ID messages=$MSGS auth=$AUTH_VIA model=${WORKER_MODEL:-opus} max=${MAX_RUNTIME_SEC}s"
START_EPOCH=$(date +%s)
cd "$STATE" || die "cannot cd to $STATE"
claude -p "$(cat "$PROMPT")" \
  --model "${WORKER_MODEL:-opus}" \
  --effort "${WORKER_EFFORT:-high}" \
  --permission-mode dontAsk \
  --allowedTools Bash Read Write Edit Glob Grep TodoWrite \
  --add-dir "$LFA_REPO" "$LFA_BOT_REPO" "$LFA_MEMORY" "$HOME/.claude" \
  --setting-sources user \
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

if [ "$RC" -ne 0 ] || [ ! -s "$LFA_WORK/summary.json" ]; then
  if tail -40 "$LOG" | grep -qiE 'usage limit|rate.?limit|quota'; then
    say "END rc=$RC (${ELAPSED}s) — PLAN USAGE LIMIT"; stamp false "plan usage limit before finishing ($MSGS messages)"
  else
    say "END rc=$RC (${ELAPSED}s) — no summary.json"; stamp false "session exited rc=$RC after ${ELAPSED}s, no summary"
  fi
  cleanup_pid; exit 1   # cursor NOT advanced — tomorrow re-reads these messages
fi

# --- step 3: the message (only when there is something new) ------------------
SENT="no message"
if [ -s "$LFA_WORK/message.txt" ]; then
  if [ "${LFA_NO_SEND:-}" = "1" ]; then
    SENT="message drafted, not sent (LFA_NO_SEND)"
  elif [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    RESP=$(curl -s -m 30 "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
      --data-urlencode "text@$LFA_WORK/message.txt" \
      --data-urlencode "disable_web_page_preview=true")
    if printf '%s' "$RESP" | grep -q '"ok":true'; then SENT="message sent"; else SENT="message FAILED: $(printf '%s' "$RESP" | head -c 120)"; fi
  else
    SENT="message drafted, no Telegram config"
  fi
fi

SUMMARY=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("summary",""))' "$LFA_WORK/summary.json" 2>/dev/null)
echo "$UNTIL" > "$STATE/cursor"
date +%s > "$STAMP"
say "END ok (${ELAPSED}s) — $SUMMARY — $SENT"
case "$SENT" in
  *FAILED*) stamp false "$LFA_TODAY: $SUMMARY — $SENT" ;;
  *)        stamp true  "$LFA_TODAY: $MSGS messages · $SUMMARY · $SENT" ;;
esac
cleanup_pid
