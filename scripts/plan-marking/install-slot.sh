#!/bin/bash
# ---------------------------------------------------------------------------
# Add a PARALLEL plan-marking slot (31 Aug 2026).
#
# The marker was single-threaded by construction: one PID lock, one claim file,
# one launchd job, one paper at a time at ~76 seconds a page. A stack of five
# papers therefore took the better part of three hours, and every handover was
# a chance for the paid API to take the next one.
#
# Nothing on the bot side needed changing to run several: the claim is a
# conditional update guarded on the queue generation (externalClaimNext in
# handlers/webchat.js), so two workers cannot take the same paper — the loser is
# told "lost claim race" and backs off. Submits serialise behind the bot's own
# _queueBusy, so extra slots do not multiply the annotation load either.
#
# What a slot needs is its own STATE DIR: pid file, claim file, work dir, log.
# Config (env, WORKER_PROMPT.md) is symlinked back to slot 1, so there is
# exactly one copy of the runbook to keep current.
#
#   bash scripts/plan-marking/install-slot.sh 2
#   launchctl list | grep planmarking          # both slots
#   tail -f ~/.adrianmath_marker2/plan-marking.log
#
# Remove a slot:
#   launchctl bootout gui/$(id -u)/com.adrianmath.planmarking2
#   rm -rf ~/Library/LaunchAgents/com.adrianmath.planmarking2.plist ~/.adrianmath_marker2
#
# ⚠ Quota: every slot draws on the SAME Claude plan as the sheet worker and the
# pdf pipeline (they share ~/.adrianmath_pipeline/oauth_token). Two slots roughly
# double the marking burn. Check /usage in an interactive session before adding
# a third — hitting a weekly cap sends every paper to the paid API for days,
# which costs far more than the hour a slot saves.
# ---------------------------------------------------------------------------
set -euo pipefail

SLOT="${1:-2}"
if ! [[ "$SLOT" =~ ^[2-9]$ ]]; then
  echo "usage: install-slot.sh <2-9>   (slot 1 is the original ~/.adrianmath_marker)" >&2
  exit 1
fi

BASE="$HOME/.adrianmath_marker"
STATE="$HOME/.adrianmath_marker$SLOT"
LABEL="com.adrianmath.planmarking$SLOT"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -d "$BASE" ] || { echo "FATAL: slot 1 not installed ($BASE missing) — run install.sh first" >&2; exit 1; }
[ -r "$BASE/env" ] || { echo "FATAL: $BASE/env missing — run install.sh first" >&2; exit 1; }

mkdir -p "$STATE"
# Shared config, one copy: a runbook fix lands in every slot at once.
ln -sfn "$BASE/env" "$STATE/env"
ln -sfn "$BASE/WORKER_PROMPT.md" "$STATE/WORKER_PROMPT.md"
[ -r "$BASE/oauth_token" ] && ln -sfn "$BASE/oauth_token" "$STATE/oauth_token"
# The wrapper itself is copied, not symlinked — same reason install.sh copies it:
# the repo checkout flips branches under peer sessions and a launchd job must not
# break when it does.
cp "$HERE/run.sh" "$STATE/run.sh"
chmod +x "$STATE/run.sh"

# Stagger: slot N starts (N-1) × 150s into the 5-minute tick, so slots reach for
# papers at different moments instead of racing on every fire.
DELAY=$(( (SLOT - 1) * 150 ))

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
		<string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
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

echo "✅ slot $SLOT installed"
echo "   state:  $STATE  (env + prompt symlinked to slot 1)"
echo "   starts: ${DELAY}s into each 5-minute tick"
echo "   log:    $STATE/plan-marking.log"
echo
echo "Test it now without waiting for launchd:"
echo "   MARKER_STATE_DIR=$STATE bash $STATE/run.sh"
