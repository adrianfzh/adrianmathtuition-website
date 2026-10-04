#!/bin/bash
# ---------------------------------------------------------------------------
# Install (or refresh) "learn from Adrian" on this Mac — docs/LEARN-FROM-ADRIAN.md.
#
#   bash scripts/learn-from-adrian/install.sh            # install + load the 07:30 job
#   LFA_NO_LOAD=1 bash scripts/learn-from-adrian/install.sh   # everything but the load
#
# Idempotent. Copies run.sh into ~/.adrianmath_learn (launchd runs the COPY), symlinks
# LEARN_PROMPT.md (always the repo's current text), writes the env file from the repo's
# .env.local (dotenv-parsed), makes the job's OWN clones of both repos (proposal
# branches are cut there, never in a human checkout), loads the LaunchAgent.
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STATE="$HOME/.adrianmath_learn"
AGENT="$HOME/Library/LaunchAgents/com.adrianmath.learnfromadrian.plist"
BOT_REPO="$HOME/dev/adrianmath-telegram-math-bot"

mkdir -p "$STATE/work" "$STATE/proposals" "$STATE/repos"
cp "$HERE/run.sh" "$STATE/run.sh" && chmod 755 "$STATE/run.sh"
ln -sf "$HERE/LEARN_PROMPT.md" "$STATE/LEARN_PROMPT.md"
[ -f "$STATE/ledger.json" ] || echo '{"groups": []}' > "$STATE/ledger.json"

# --- env file (dotenv-PARSED, never grepped; always the www host) -------------
read_env() {
  node -e "
const d = require('$REPO/node_modules/dotenv').parse(require('fs').readFileSync('$REPO/.env.local'));
const v = (d['$1'] || '').trim().replace(/^\"|\"\$/g, '');
process.stdout.write(v === '[SENSITIVE]' ? '' : v);
"
}
TOKEN="$(read_env CRON_SECRET)"; [ -n "$TOKEN" ] || TOKEN="$(read_env ADMIN_PASSWORD)"
TG_TOKEN="$(read_env TELEGRAM_BOT_TOKEN)"
TG_CHAT="$(read_env TELEGRAM_CHAT_ID)"
[ -n "$TOKEN" ] || { echo "✗ neither CRON_SECRET nor ADMIN_PASSWORD readable from $REPO/.env.local"; exit 1; }
[ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ] || echo "⚠ Telegram vars missing — the job will draft messages but not send them"
umask 077
cat > "$STATE/env" <<ENVEOF
LFA_API_BASE=https://www.adrianmathtuition.com
LFA_API_TOKEN=$TOKEN
TELEGRAM_BOT_TOKEN=$TG_TOKEN
TELEGRAM_CHAT_ID=$TG_CHAT
LFA_REPO=$REPO
LFA_BOT_REPO=$BOT_REPO
ENVEOF
chmod 600 "$STATE/env"
umask 022

# --- the job's own clones (share objects with the human checkouts) ------------
clone() {   # clone <name> <human checkout> <default branch>
  local dest="$STATE/repos/$1" url gitdir
  if [ -d "$dest/.git" ]; then git -C "$dest" fetch -q origin || true; return; fi
  url="$(git -C "$2" remote get-url origin)"
  gitdir="$(git -C "$2" rev-parse --git-common-dir)"
  case "$gitdir" in /*) ;; *) gitdir="$2/$gitdir" ;; esac
  git clone -q --reference-if-able "$gitdir" --branch "$3" "$url" "$dest"
  git -C "$dest" config user.name "$(git -C "$2" config user.name || echo 'Adrian Fong')"
  git -C "$dest" config user.email "$(git -C "$2" config user.email || echo 'adrianmathtuition@gmail.com')"
}
clone website "$REPO" dev
clone bot "$BOT_REPO" main
echo "✓ clones: $STATE/repos/{website,bot}"

# --- credentials ---------------------------------------------------------------
if claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then echo "✓ Claude credentials: keychain"
elif [ -s "$STATE/oauth_token" ]; then echo "✓ Claude credentials: $STATE/oauth_token"
else echo "✗ NO CLAUDE CREDENTIALS — 'claude auth login', or put a setup-token in $STATE/oauth_token"; exit 1; fi

# --- LaunchAgent -------------------------------------------------------------------
mkdir -p "$HOME/Library/LaunchAgents"
cp "$HERE/com.adrianmath.learnfromadrian.plist" "$AGENT"
if [ "${LFA_NO_LOAD:-}" = "1" ]; then
  echo "✓ installed, NOT loaded (LFA_NO_LOAD) — load with: launchctl load $AGENT"
else
  launchctl unload "$AGENT" 2>/dev/null || true
  launchctl load "$AGENT"
  echo "✓ loaded — runs daily at 07:30 SGT (and catches up at login); logs: $STATE/learn.log"
fi
echo "  Manual run:  LFA_FORCE=1 bash $STATE/run.sh"
