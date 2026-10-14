#!/bin/bash
# 🧪 Structured science question check — one nightly batch (14 Oct 2026, Adrian: "check a starter
# set … check more over time, a batch a night on the background worker, until twins replace them;
# questions that fail are never served" → "yes").
#
# Run by the Fly worker (bot worker/fly/jobs.sh job_science_qcheck, 01:40 SGT) on a pooled plan
# login. pick.mjs takes QCHECK_COUNT (30) unchecked structured questions from the open practice
# topics → ONE headless Claude Code session (Opus, medium effort, plan — never the API) follows
# PROMPT.md and writes one verdict file per question → apply.mjs stamps the passes
# practice_checked_at (served), writes a one-line note on the fails (never served), and stamps
# job_runs 'science-qcheck' (meta.fails = the messy ones). Nothing left → stamps ok, no session.
# Needs SUPABASE_URL_SCIENCE + SUPABASE_SERVICE_KEY_SCIENCE, MARKER_API_TOKEN (job-log).
set -u -o pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${QCHECK_WORK:-${HOME:-/tmp}/.adrianmath_science_qcheck}/$(date +%Y%m%d-%H%M)"
COUNT="${QCHECK_COUNT:-30}"
mkdir -p "$WORK/reports"
stamp_fail() { QCHECK_MSG="$1" node --input-type=module -e "import { stamp } from '$HERE/lib.mjs'; await stamp(false, process.env.QCHECK_MSG, {});" 2>/dev/null || true; }

out="$(node "$HERE/pick.mjs" "$WORK" "$COUNT" 2>&1)" || { echo "$out"; stamp_fail "science-qcheck: the pick failed — $(echo "$out" | tail -1)"; exit 1; }
echo "$out"
n="$(echo "$out" | awk '/^PICKED /{print $2}')"
if [ "${n:-0}" = 0 ]; then
  QCHECK_MSG="nothing left to check in the open topics" node --input-type=module -e "import { stamp } from '$HERE/lib.mjs'; await stamp(true, process.env.QCHECK_MSG, { passed: 0, failed: 0, left: 0 });"
  exit 0
fi

unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL   # plan only
timeout -k 60 "${QCHECK_MAX_SEC:-3600}" claude -p "Read $HERE/PROMPT.md and follow it exactly. Batch file: $WORK/batch.json. Reports dir: $WORK/reports. Check every item; for more than 15 items you may hand halves to Agent subagents (model opus) with the same instructions. Do not read other project files." \
  --model claude-opus-5-5 --effort medium --permission-mode dontAsk --allowedTools "Read Write Glob Agent Task"
rc=$?
node "$HERE/apply.mjs" "$WORK/batch.json" "$WORK/reports" || { stamp_fail "science-qcheck: writing the verdicts failed (session exit $rc)"; exit 1; }
exit 0
