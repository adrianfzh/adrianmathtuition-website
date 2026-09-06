#!/bin/bash
# Weekly exam-library refresh on this Mac (SPEC-PAPER-MATCH phase 2, 7 Sep 2026).
# Sunday 04:10 SGT: index by name, then match by meaning, both --apply, then stamp
# job_runs 'paper-library' so the ops board alarms if a week goes by without one.
#   bash scripts/paper-library/install.sh        # install / reload the launchd agent
#   bash scripts/paper-library/run.sh            # run once by hand
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.adrianmath.paperlibrary.plist"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.adrianmath.paperlibrary</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$REPO/scripts/paper-library/run.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>4</integer><key>Minute</key><integer>10</integer></dict>
  <key>StandardOutPath</key><string>$HOME/.adrianmath-paperlibrary.log</string>
  <key>StandardErrorPath</key><string>$HOME/.adrianmath-paperlibrary.log</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed com.adrianmath.paperlibrary — Sundays 04:10 SGT; log: ~/.adrianmath-paperlibrary.log"
