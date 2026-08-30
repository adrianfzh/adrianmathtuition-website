#!/bin/bash
# ---------------------------------------------------------------------------
# Join a NEW machine to the plan-billed marking pool (31 Aug 2026).
#
# This is the only file a new machine needs. Everything else — the wrapper, the
# runbook, the marking system prompts — is pulled from the server, so a machine
# set up today is still correct after tomorrow's fixes without anyone touching
# it. No repo checkout, no .env.local, no copying prompts around.
#
#   MARKER_API_TOKEN='<admin password>' bash bootstrap-marker.sh
#   MARKER_API_TOKEN='…' bash bootstrap-marker.sh --refresh     # re-pull the wrapper
#   MARKER_API_TOKEN='…' SLOT=2 bash bootstrap-marker.sh        # a second parallel slot
#
# Before you run it, on THIS machine, once:
#   claude auth login       (a different account here = a separate quota pool,
#                            which is the whole point of adding a machine)
#
# ⚠ The token is the site's ADMIN password: it authorises the whole admin API,
# not just marking. Put it only on machines you own. If you ever want someone
# else's machine in the pool, ask for the scoped marker token first — a secret
# that authorises the external-* phases and nothing else.
# ---------------------------------------------------------------------------
set -euo pipefail

BASE="${MARKER_API_BASE:-https://www.adrianmathtuition.com}"   # www, never the
                                                               # apex: it 307s and
                                                               # clients drop the
                                                               # Authorization header
TOKEN="${MARKER_API_TOKEN:-}"
SLOT="${SLOT:-1}"
REFRESH=0
[ "${1:-}" = "--refresh" ] && REFRESH=1

if [ -z "$TOKEN" ]; then
  echo "usage: MARKER_API_TOKEN='<admin password>' bash bootstrap-marker.sh [--refresh]" >&2
  exit 1
fi

if [ "$SLOT" = "1" ]; then STATE="$HOME/.adrianmath_marker"; else STATE="$HOME/.adrianmath_marker$SLOT"; fi
LABEL="com.adrianmath.planmarking$([ "$SLOT" = 1 ] || echo "$SLOT")"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

api() {  # api '<json body>'
  curl -s -m 30 -X POST "$BASE/api/admin/mark-paper" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$1"
}

# --- prerequisites ----------------------------------------------------------
command -v claude  >/dev/null || { echo "✗ the 'claude' CLI is not on PATH — install Claude Code first" >&2; exit 1; }
command -v python3 >/dev/null || { echo "✗ python3 is required (the wrapper parses JSON with it)" >&2; exit 1; }

# --- reachability, before writing anything ----------------------------------
PEEK="$(api '{"phase":"external-peek"}')"
if ! printf '%s' "$PEEK" | grep -q '"eligible"'; then
  echo "✗ could not reach the queue as an admin. Answer was:" >&2
  printf '   %s\n' "$(printf '%s' "$PEEK" | head -c 300)" >&2
  echo "   Check the token, and that MARKER_API_BASE is the www host." >&2
  exit 1
fi
echo "✓ queue reachable — $PEEK"

mkdir -p "$STATE"
umask 077
printf 'MARKER_API_BASE=%s\nMARKER_API_TOKEN=%s\n' "$BASE" "$TOKEN" > "$STATE/env"
chmod 600 "$STATE/env"

# --- the wrapper, from the server ------------------------------------------
# Pulled rather than copied, so this script stays the only local file that has
# to be current. The wrapper then pulls the RUNBOOK itself on every run.
api '{"phase":"external-runner"}' | python3 -c '
import json, sys
d = json.load(sys.stdin)
t = d.get("text") or ""
assert "external-marking-result" in t and len(t) > 1000, "that is not the marking wrapper"
open(sys.argv[1], "w").write(t)
' "$STATE/run.sh"
chmod +x "$STATE/run.sh"
echo "✓ wrapper installed ($(wc -c < "$STATE/run.sh" | tr -d ' ') bytes) — it refreshes its runbook every run"

if [ "$REFRESH" = "1" ]; then
  echo "✓ refreshed; leaving the LaunchAgent as it is"
  exit 0
fi

# --- timer ------------------------------------------------------------------
# Every 5 minutes; the wrapper's first move is one peek curl, so an empty queue
# costs nothing. Slots start 150s apart so two of them rarely reach for the same
# paper (harmless when they do — the loser is told "lost claim race").
DELAY=$(( (SLOT - 1) * 150 ))
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>$LABEL</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>$STATE/run.sh</string>
	</array>
	<key>WorkingDirectory</key>
	<string>$STATE</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
		<key>LANG</key>
		<string>en_US.UTF-8</string>
		<key>MARKER_STATE_DIR</key>
		<string>$STATE</string>
		<key>START_DELAY_SEC</key>
		<string>$DELAY</string>
	</dict>
	<key>StartInterval</key>
	<integer>300</integer>
	<key>RunAtLoad</key>
	<false/>
	<key>StandardOutPath</key>
	<string>$STATE/launchd.log</string>
	<key>StandardErrorPath</key>
	<string>$STATE/launchd.log</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "✅ this machine is in the marking pool (slot $SLOT)"
echo "   state: $STATE"
echo "   log:   $STATE/plan-marking.log"
echo
echo "It polls every 5 minutes and claims a paper only when one is waiting."
echo "Try it now without waiting:  MARKER_STATE_DIR=$STATE bash $STATE/run.sh"
