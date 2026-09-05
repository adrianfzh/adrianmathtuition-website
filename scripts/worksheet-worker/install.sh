#!/bin/bash
# ---------------------------------------------------------------------------
# Install (or refresh) the Telegram worksheet worker on this Mac.
#
#   bash scripts/worksheet-worker/install.sh
#
# Idempotent: copies run.sh + WORKER_PROMPT.md into ~/.adrianmath_worksheets
# (launchd runs the COPIES so repo branch flips can't break it), writes the env
# file from the repo's .env.local ADMIN_PASSWORD, loads the LaunchAgent, checks
# Claude credentials and functionally verifies the queue endpoint. Re-run after
# editing run.sh / WORKER_PROMPT.md to roll changes out.
#
# Sibling of scripts/sheet-worker/install.sh — same pattern, different queue.
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STATE="$HOME/.adrianmath_worksheets"
AGENT="$HOME/Library/LaunchAgents/com.adrianmath.worksheetworker.plist"

mkdir -p "$STATE/work"
cp "$HERE/run.sh" "$STATE/run.sh" && chmod 755 "$STATE/run.sh"
cp "$HERE/WORKER_PROMPT.md" "$STATE/WORKER_PROMPT.md"

# --- env file: dotenv-PARSED, never grepped; always the www host -------------
TOKEN="$(node -e "
const d = require('$REPO/node_modules/dotenv').parse(require('fs').readFileSync('$REPO/.env.local'));
process.stdout.write((d.ADMIN_PASSWORD || '').trim());
")"
if [ -z "$TOKEN" ] || [ "$TOKEN" = "[SENSITIVE]" ]; then
  echo "✗ ADMIN_PASSWORD not readable from $REPO/.env.local — write $STATE/env by hand:"
  echo "  WORKSHEETS_API_BASE=https://www.adrianmathtuition.com"
  echo "  WORKSHEETS_API_TOKEN=<admin password>"
  exit 1
fi
umask 077
cat > "$STATE/env" <<ENVEOF
WORKSHEETS_API_BASE=https://www.adrianmathtuition.com
WORKSHEETS_API_TOKEN=$TOKEN
WORKSHEETS_REPO=$REPO
ENVEOF
chmod 600 "$STATE/env"

# --- LaunchAgent ------------------------------------------------------------
mkdir -p "$HOME/Library/LaunchAgents"
cp "$HERE/com.adrianmath.worksheetworker.plist" "$AGENT"
launchctl unload "$AGENT" 2>/dev/null || true
launchctl load "$AGENT"

# --- credentials: the half that can actually fail ---------------------------
CREDS=""
if claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then CREDS="keychain"
elif [ -r "$STATE/oauth_token" ]; then CREDS="$STATE/oauth_token"
elif [ -r "$HOME/.adrianmath_sheets/oauth_token" ]; then CREDS="sheets token"
elif [ -r "$HOME/.adrianmath_pipeline/oauth_token" ]; then CREDS="pipeline token"
fi
if [ -z "$CREDS" ]; then
  echo "✗ NO CLAUDE CREDENTIALS — the worker would fail on every tick."
  echo "    claude auth login                       (this machine, interactive)"
  echo "    echo '<setup-token>' > $STATE/oauth_token"
  exit 1
fi
echo "✓ Claude credentials: $CREDS"

# --- functional check -------------------------------------------------------
CHECK="$(curl -s -m 30 "https://www.adrianmathtuition.com/api/admin/worksheet-jobs" \
  -H "Authorization: Bearer $TOKEN")"
if printf '%s' "$CHECK" | grep -q '"jobs"'; then
  echo "✓ installed — worker polls every 15 min; logs: $STATE/worksheet-worker.log"
else
  echo "⚠ installed, but the queue call did not answer with a job list:"
  echo "  $(printf '%s' "$CHECK" | head -c 200)"
  echo "  If /api/admin/worksheet-jobs is not on prod yet, that is expected — re-run after promoting."
fi
