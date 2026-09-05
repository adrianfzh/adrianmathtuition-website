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
# A SYMLINK, not a copy (5 Sep 2026): the copy sat at its 31 Aug text while the repo
# gained the "nothing to teach is a done, not a fail" rule, and Kassandra's job alarmed
# "failed 3×" for a paper with no gap. The worker now always reads the repo's own file.
ln -sf "$HERE/WORKER_PROMPT.md" "$STATE/WORKER_PROMPT.md"

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

# --- credentials: the check that would have caught the 31 Aug failure --------
# The queue check below proves the SERVER half. It passed on install day and
# kept passing while the worker died on every tick for want of a Claude login —
# 46 runs, all exit 1, nothing in the logbook, a job sitting "queued" behind a
# UI that said it was on its way. Verify the half that can actually fail.
CREDS=""
if claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then CREDS="keychain"
elif [ -r "$STATE/oauth_token" ]; then CREDS="$STATE/oauth_token"
elif [ -r "$HOME/.adrianmath_marker/oauth_token" ]; then CREDS="marker token"
elif [ -r "$HOME/.adrianmath_pipeline/oauth_token" ]; then CREDS="pipeline token"
fi
if [ -z "$CREDS" ]; then
  echo "✗ NO CLAUDE CREDENTIALS — the worker would fail on every tick."
  echo "  Fix one of these, then re-run:"
  echo "    claude auth login                       (this machine, interactive)"
  echo "    echo '<setup-token>' > $STATE/oauth_token"
  exit 1
fi
echo "✓ Claude credentials: $CREDS"

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
