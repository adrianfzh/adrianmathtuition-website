#!/bin/bash
# ---------------------------------------------------------------------------
# Install (or refresh) the self-study sheet worker on this Mac.
#
#   bash scripts/sheet-worker/install.sh
#
# Idempotent: copies run.sh + WORKER_PROMPT.md into ~/.adrianmath_sheets (the
# launchd job runs the COPIES so repo branch flips can't break it), writes the
# env file from the repo's .env.local ADMIN_PASSWORD, loads the LaunchAgent and
# functionally verifies the queue endpoint. Re-run after editing run.sh /
# WORKER_PROMPT.md to roll changes out.
#
# Sibling of scripts/plan-marking/install.sh — same pattern, different queue.
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STATE="$HOME/.adrianmath_sheets"
AGENT="$HOME/Library/LaunchAgents/com.adrianmath.sheetworker.plist"

mkdir -p "$STATE/work"
cp "$HERE/run.sh" "$STATE/run.sh" && chmod 755 "$STATE/run.sh"
cp "$HERE/WORKER_PROMPT.md" "$STATE/WORKER_PROMPT.md"

# --- env file ---------------------------------------------------------------
# dotenv-PARSED, never grepped (pulled env files are dotenv-escaped and values
# can carry trailing newlines — both bit on 2026-08-02). Always the www host:
# the apex 307s and clients drop Authorization across it (CLAUDE.md gotcha).
TOKEN="$(node -e "
const d = require('$REPO/node_modules/dotenv').parse(require('fs').readFileSync('$REPO/.env.local'));
process.stdout.write((d.ADMIN_PASSWORD || '').trim());
")"
if [ -z "$TOKEN" ] || [ "$TOKEN" = "[SENSITIVE]" ]; then
  echo "✗ ADMIN_PASSWORD not readable from $REPO/.env.local — write $STATE/env by hand:"
  echo "  SHEETS_API_BASE=https://www.adrianmathtuition.com"
  echo "  SHEETS_API_TOKEN=<admin password>"
  exit 1
fi
umask 077
cat > "$STATE/env" <<ENVEOF
SHEETS_API_BASE=https://www.adrianmathtuition.com
SHEETS_API_TOKEN=$TOKEN
SHEETS_REPO=$REPO
ENVEOF
chmod 600 "$STATE/env"

# --- LaunchAgent ------------------------------------------------------------
mkdir -p "$HOME/Library/LaunchAgents"
cp "$HERE/com.adrianmath.sheetworker.plist" "$AGENT"
launchctl unload "$AGENT" 2>/dev/null || true
launchctl load "$AGENT"

# --- functional check -------------------------------------------------------
CHECK="$(curl -s -m 30 "https://www.adrianmathtuition.com/api/admin/sheet-jobs" \
  -H "Authorization: Bearer $TOKEN")"
if printf '%s' "$CHECK" | grep -q '"jobs"'; then
  echo "✓ installed — worker polls every 15 min; logs: $STATE/sheet-worker.log"
else
  echo "⚠ installed, but the queue call did not answer with a job list:"
  echo "  $(printf '%s' "$CHECK" | head -c 200)"
  echo "  If /api/admin/sheet-jobs is not deployed yet, that is expected — re-run after promoting."
fi
