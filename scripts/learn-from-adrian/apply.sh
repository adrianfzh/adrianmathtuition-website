#!/bin/bash
# ---------------------------------------------------------------------------
# Learn from Adrian — carry out the ✅ Apply / 🗑 Drop taps from Telegram (16 Oct 2026).
# launchd com.adrianmath.learnapply, every 10 min while the Mac is on. A quiet run is one
# database read and nothing else; only a pending tap starts a Claude session (plan usage).
# Spec: docs/LEARN-FROM-ADRIAN.md. Log: ~/.adrianmath_learn/apply.log
# ---------------------------------------------------------------------------
set -u -o pipefail
export HOME="${HOME:-/Users/adrianfong}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"
export LANG="en_US.UTF-8" LC_ALL="en_US.UTF-8"

STATE="${LFA_STATE_DIR:-$HOME/.adrianmath_learn}"
LOG="$STATE/apply.log"
PIDF="$STATE/apply.pid"

if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF" 2>/dev/null)" 2>/dev/null; then exit 0; fi
echo $$ > "$PIDF"
trap 'rm -f "$PIDF"' EXIT

[ -r "$STATE/env" ] || { echo "[$(date)] missing $STATE/env — run install.sh" >> "$LOG"; exit 1; }
set -a
# shellcheck disable=SC1091
. "$STATE/env"
set +a
export LFA_STATE="$STATE"
export LFA_REPO="${LFA_REPO:-$HOME/dev/adrianmathtuition-website}"
export LFA_TODAY="$(TZ=Asia/Singapore date '+%Y-%m-%d')"

# plan auth, never the API (same as run.sh)
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL
if ! claude auth status 2>/dev/null | grep -q '"loggedIn": *true' && [ -s "$STATE/oauth_token" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$STATE/oauth_token")"; export CLAUDE_CODE_OAUTH_TOKEN
fi

node "$STATE/apply.mjs" >> "$LOG" 2>&1
