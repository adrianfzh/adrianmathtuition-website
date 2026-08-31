#!/bin/bash
# ---------------------------------------------------------------------------
# Add a PARALLEL self-study-sheet slot (31 Aug 2026).
#
# The sheet worker was single-threaded the same way the marker was: one PID
# lock, one launchd job, one sheet per session at up to 70 minutes. Queue three
# students and the third waits out the first two.
#
# Nothing server-side needed changing: the claim is a conditional update on
# (id, status), so two workers cannot take the same job — the loser picks the
# next one. A slot only needs its own state dir (pid file, work dir, log);
# config is symlinked back to slot 1 so there is one env file to keep current.
#
#   bash scripts/sheet-worker/install-slot.sh 2
#   tail -f ~/.adrianmath_sheets2/sheet-worker.log
#
# Remove:
#   launchctl bootout gui/$(id -u)/com.adrianmath.sheetworker2
#   rm -rf ~/Library/LaunchAgents/com.adrianmath.sheetworker2.plist ~/.adrianmath_sheets2
#
# ⚠ Sheets are Opus for up to 70 minutes — far heavier per job than a marking
# session — and every slot draws on the SAME plan as the marking slots and the
# pdf work. Two sheet slots plus two marking slots is four concurrent Opus
# sessions on one quota. Check /usage before adding a third.
# ---------------------------------------------------------------------------
set -euo pipefail

SLOT="${1:-2}"
if ! [[ "$SLOT" =~ ^[2-9]$ ]]; then
  echo "usage: install-slot.sh <2-9>   (slot 1 is ~/.adrianmath_sheets)" >&2
  exit 1
fi

BASE="$HOME/.adrianmath_sheets"
STATE="$HOME/.adrianmath_sheets$SLOT"
LABEL="com.adrianmath.sheetworker$SLOT"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -r "$BASE/env" ] || { echo "FATAL: slot 1 not installed ($BASE/env missing) — run install.sh first" >&2; exit 1; }

mkdir -p "$STATE"
ln -sfn "$BASE/env" "$STATE/env"
[ -r "$BASE/oauth_token" ] && ln -sfn "$BASE/oauth_token" "$STATE/oauth_token"
cp "$HERE/run.sh" "$STATE/run.sh"; chmod +x "$STATE/run.sh"
cp "$HERE/WORKER_PROMPT.md" "$STATE/WORKER_PROMPT.md"

# Slot N starts (N-1)×420s into the 15-minute tick, so slots reach for jobs at
# different moments instead of racing on every fire.
DELAY=$(( (SLOT - 1) * 420 ))

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
		<key>SHEETS_STATE_DIR</key>
		<string>$STATE</string>
		<key>START_DELAY_SEC</key>
		<string>$DELAY</string>
	</dict>
	<key>StartInterval</key>
	<integer>900</integer>
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

echo "✅ sheet slot $SLOT installed"
echo "   state:  $STATE   (env symlinked to slot 1)"
echo "   starts: ${DELAY}s into each 15-minute tick"
echo "   log:    $STATE/sheet-worker.log"
