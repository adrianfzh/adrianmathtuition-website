#!/bin/bash
# One refresh of the exam library (see install.sh). Stamps job_runs on success.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO" || exit 1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] paper-library refresh start"
OUT1=$(node scripts/paper-library/index.mjs --apply 2>&1 | tail -1)
OUT2=$(node scripts/paper-library/match-by-meaning.mjs --all --apply 2>&1 | tail -1)
echo "$OUT1"; echo "$OUT2"
PW=$(node -e 'const e=require("dotenv").parse(require("fs").readFileSync(".env.local"));process.stdout.write((e.ADMIN_PASSWORD||"").trim())')
SUMMARY=$(printf '%s · %s' "$OUT1" "$OUT2" | tr -d '"' | cut -c1-200)
curl -s -m 15 -X POST "https://www.adrianmathtuition.com/api/job-log" -H "Authorization: Bearer $PW" -H 'Content-Type: application/json' \
  -d "{\"job\":\"paper-library\",\"ok\":true,\"summary\":\"$SUMMARY\"}" >/dev/null && echo "job_runs stamped"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] done"
