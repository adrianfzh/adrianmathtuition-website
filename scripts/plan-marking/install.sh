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
cp "$HERE/run.sh" "$STATE/run.sh" && chmod 755 "$STATE/run.sh"
cp "$HERE/WORKER_PROMPT.md" "$STATE/WORKER_PROMPT.md"

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
