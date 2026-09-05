#!/bin/bash
# ---------------------------------------------------------------------------
# Install (or refresh) the Find-a-question nightly review on this Mac.
#
#   bash scripts/find-review/install.sh
#
# Idempotent: copies run.sh into ~/.adrianmath_find_review (the launchd job
# runs the COPY so repo branch flips can't break it), symlinks REVIEW_PROMPT.md
# (so the runbook is always the repo's current text — sheet-worker precedent,
# 5 Sep 2026), writes the env file from the repo's .env.local ADMIN_PASSWORD,
# loads the LaunchAgent, verifies credentials and the review endpoint.
# Re-run after editing run.sh to roll the change out.
#
# Sibling of scripts/sheet-worker/install.sh — same pattern, a clock instead
# of a queue.
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STATE="$HOME/.adrianmath_find_review"
AGENT="$HOME/Library/LaunchAgents/com.adrianmath.findreview.plist"

mkdir -p "$STATE/work"
cp "$HERE/run.sh" "$STATE/run.sh" && chmod 755 "$STATE/run.sh"
ln -sf "$HERE/REVIEW_PROMPT.md" "$STATE/REVIEW_PROMPT.md"

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
  echo "  FIND_API_BASE=https://www.adrianmathtuition.com"
  echo "  FIND_API_TOKEN=<admin password>"
  exit 1
fi
umask 077
cat > "$STATE/env" <<ENVEOF
FIND_API_BASE=https://www.adrianmathtuition.com
FIND_API_TOKEN=$TOKEN
FIND_REPO=$REPO
ENVEOF
chmod 600 "$STATE/env"

# --- LaunchAgent ------------------------------------------------------------
mkdir -p "$HOME/Library/LaunchAgents"
cp "$HERE/com.adrianmath.findreview.plist" "$AGENT"
launchctl unload "$AGENT" 2>/dev/null || true
launchctl load "$AGENT"

# --- credentials: the half that can actually fail ----------------------------
CREDS=""
if claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then CREDS="keychain"
elif [ -r "$STATE/oauth_token" ]; then CREDS="$STATE/oauth_token"
elif [ -r "$HOME/.adrianmath_pipeline/oauth_token" ]; then CREDS="pipeline token"
fi
if [ -z "$CREDS" ]; then
  echo "✗ NO CLAUDE CREDENTIALS — the review would fail every night."
  echo "  Fix one of these, then re-run:"
  echo "    claude auth login                       (this machine, interactive)"
  echo "    echo '<setup-token>' > $STATE/oauth_token"
  exit 1
fi
echo "✓ Claude credentials: $CREDS"

# --- functional check -------------------------------------------------------
CHECK="$(curl -s -m 30 "https://www.adrianmathtuition.com/api/admin/find-review?date=$(TZ=Asia/Singapore date -v-1d '+%Y-%m-%d')" \
  -H "Authorization: Bearer $TOKEN")"
if printf '%s' "$CHECK" | grep -q '"rows"'; then
  echo "✓ installed — reviews yesterday's finds at 05:30 SGT daily (and catches up at login); logs: $STATE/find-review.log"
  echo "  Manual run for a day:  REVIEW_DATE=$(TZ=Asia/Singapore date -v-1d '+%Y-%m-%d') bash $STATE/run.sh"
else
  echo "⚠ installed, but the review endpoint did not answer with rows:"
  echo "  $(printf '%s' "$CHECK" | head -c 200)"
  echo "  If /api/admin/find-review is not deployed yet, that is expected — re-run after promoting."
fi
