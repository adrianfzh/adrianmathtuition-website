#!/bin/bash
# ---------------------------------------------------------------------------
# Install (or refresh) the plan-billed marking worker on this Mac.
#
#   bash scripts/plan-marking/install.sh
#
# Idempotent: copies run.sh + WORKER_PROMPT.md into ~/.adrianmath_marker (the
# launchd job runs the COPIES so repo branch flips can't break it), writes the
# env file from the repo's .env.local ADMIN_PASSWORD, loads the LaunchAgent,
# and functionally verifies the website→bot chain with a stats call.
# Re-run after editing run.sh / WORKER_PROMPT.md to roll changes out.
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STATE="$HOME/.adrianmath_marker"
AGENT="$HOME/Library/LaunchAgents/com.adrianmath.planmarking.plist"

mkdir -p "$STATE"
# The wrapper and the runbook both come from the SERVER now (31 Aug 2026)
# — see the fetch below, after the env file gives us a token. Nothing about the
# worker is shipped with this repo any more, so a machine cannot run yesterday's
# code just because nobody re-ran the installer on it.
# The RUNBOOK is no longer copied (31 Aug 2026): the wrapper pulls it from the
# deployed bot on every run, so one edit reaches every machine on its next tick
# instead of leaving other Macs marking to yesterday's rules. Canonical copy:
# the bot repo's worker/plan-marking/WORKER_PROMPT.md, served as external-runbook.
# For a machine WITHOUT this repo, use bootstrap-marker.sh instead.

# --- env file (MARKER_API_BASE + MARKER_API_TOKEN) --------------------------
# The token is the admin password from the repo's .env.local, parsed with
# dotenv (NEVER grep/sed — pulled env files are dotenv-escaped and values can
# carry trailing newlines; both bit on 2026-08-02). Always the www host: the
# apex 307s and clients drop Authorization across it (CLAUDE.md gotcha).
TOKEN="$(node -e "
const d = require('$REPO/node_modules/dotenv').parse(require('fs').readFileSync('$REPO/.env.local'));
process.stdout.write((d.ADMIN_PASSWORD || '').trim());
")"
if [ -z "$TOKEN" ] || [ "$TOKEN" = "[SENSITIVE]" ]; then
  echo "✗ ADMIN_PASSWORD not readable from $REPO/.env.local — write $STATE/env by hand:"
  echo "  MARKER_API_BASE=https://www.adrianmathtuition.com"
  echo "  MARKER_API_TOKEN=<admin password>"
  exit 1
fi
umask 077
cat > "$STATE/env" <<EOF
MARKER_API_BASE=https://www.adrianmathtuition.com
MARKER_API_TOKEN=$TOKEN
EOF
chmod 600 "$STATE/env"

# --- credentials: the half that actually fails ------------------------------
# The queue probe below proves the SERVER half, which is the half that cannot
# fail quietly. The sheet worker shipped with only that check, passed it on
# install day, and then died on every tick for want of a Claude login — 46 runs,
# nothing in the logbook, a job sitting "queued" behind a UI that said it was on
# its way. Never declare a worker installed without proving it can authenticate.
CREDS=""
if claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then CREDS="keychain"
elif [ -r "$STATE/oauth_token" ]; then CREDS="$STATE/oauth_token"
elif [ -r "$HOME/.adrianmath_pipeline/oauth_token" ]; then CREDS="pipeline token"
fi
if [ -z "$CREDS" ]; then
  echo "✗ NO CLAUDE CREDENTIALS — this worker would fail on every tick."
  echo "  Fix one of these, then re-run:"
  echo "    claude auth login                       (this machine, interactive)"
  echo "    echo '<setup-token>' > $STATE/oauth_token"
  exit 1
fi
echo "✓ Claude credentials: $CREDS"

# --- wrapper, from the deployed tree ---------------------------------------
curl -s -m 30 -X POST "https://www.adrianmathtuition.com/api/admin/mark-paper" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"phase":"external-runner"}' | python3 -c '
import json, sys
d = json.load(sys.stdin)
t = d.get("text") or ""
assert "external-marking-result" in t and len(t) > 1000, "that is not the marking wrapper"
open(sys.argv[1], "w").write(t)
' "$STATE/run.sh"
chmod 755 "$STATE/run.sh"

# --- LaunchAgent ------------------------------------------------------------
mkdir -p "$HOME/Library/LaunchAgents"
cp "$HERE/com.adrianmath.planmarking.plist" "$AGENT"
launchctl unload "$AGENT" 2>/dev/null || true
launchctl load "$AGENT"

# --- functional check: website proxy → bot, authenticated -------------------
CHECK="$(curl -s -m 30 -X POST "https://www.adrianmathtuition.com/api/admin/mark-paper" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"phase":"external-peek"}')"
echo "external-peek → $CHECK"
if printf '%s' "$CHECK" | grep -q '"eligible"'; then
  echo "✓ installed — worker polls every 5 min; logs: $STATE/plan-marking.log"
else
  echo "⚠ installed, but the peek call did not answer with an eligible count."
  echo "  If the bot is not yet deployed with the external phases, that is expected — re-run this check after the deploy."
fi
