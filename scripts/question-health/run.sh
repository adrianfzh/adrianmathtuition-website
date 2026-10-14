#!/bin/bash
# ---------------------------------------------------------------------------
# 🩺 Question check — one tick of the Fly worker lane `question-health`
# (SPEC-QUESTION-HEALTH.md, 14 Oct 2026). Plan-billed Claude Code, never the API.
#
#   1. peek   GET  /api/admin/question-health?peek=1   — one curl; switched off or nothing waiting = exit 0
#   2. claim  POST {action:'claim', n}                  — up to QH_BATCH questions, a 30-min lease each
#   3. check  one headless `claude -p` session reads WORKER_PROMPT.md + the claimed questions and
#             writes one report JSON per question into $WORK/reports/ (it writes NOTHING to the
#             database — the door decides and writes)
#   4. post   POST {action:'result', report}            — per report; the door applies decide()
#   5. stamp  POST /api/job-log  job `question-health`  (counts)
#
# A question the session did not report keeps its lease and is taken again after 30 minutes.
# Env (set on the Fly worker): MARKER_API_BASE, MARKER_API_TOKEN (the admin bearer),
# SUPABASE_URL + SUPABASE_SECRET_KEY (read-only use by the session), WEB_REPO.
# Test by hand on a Mac: MARKER_API_BASE=https://www.adrianmathtuition.com MARKER_API_TOKEN=… bash scripts/question-health/run.sh
# ---------------------------------------------------------------------------
set -u -o pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export LANG="en_US.UTF-8" LC_ALL="en_US.UTF-8"

API="${MARKER_API_BASE:-https://www.adrianmathtuition.com}"
TOKEN="${MARKER_API_TOKEN:-${ADMIN_PASSWORD:-}}"
REPO="${WEB_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
STATE="${QH_STATE_DIR:-$HOME/.adrianmath_question_health}"
BATCH="${QH_BATCH:-3}"
MAX_RUNTIME_SEC="${MAX_RUNTIME_SEC:-1500}"   # 25 min — inside the 30-min lease
RUNNER="${QH_RUNNER:-fly-$(hostname 2>/dev/null | cut -c1-20)}"
mkdir -p "$STATE"
LOG="$STATE/question-health.log"
say() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }
[ -n "$TOKEN" ] || { say "FATAL: no MARKER_API_TOKEN"; exit 1; }

stamp() {  # stamp <ok true|false> <summary>
  curl -s -m 15 -X POST "$API/api/job-log" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"job":"question-health","ok":sys.argv[1]=="true","summary":sys.argv[2][:300]}))' "$1" "$2")" > /dev/null 2>&1 || true
}

# 1. peek
PEEK=$(curl -s -m 20 "$API/api/admin/question-health?peek=1" -H "Authorization: Bearer $TOKEN") || PEEK=""
WAITING=$(printf '%s' "$PEEK" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin); print(d["waiting"] if d.get("on") else 0)
except Exception: print(-1)')
[ "$WAITING" = "-1" ] && { say "peek failed: $(printf '%s' "$PEEK" | head -c 200)"; exit 1; }
[ "$WAITING" = "0" ] && exit 0

# 2. claim
WORK="$STATE/work/$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$WORK/reports"
curl -s -m 30 -X POST "$API/api/admin/question-health" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"action\":\"claim\",\"runner\":\"$RUNNER\",\"n\":$BATCH}" > "$WORK/claim.json"
N=$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1])).get("questions",[])))' "$WORK/claim.json" 2>/dev/null || echo 0)
[ "$N" -gt 0 ] 2>/dev/null || { say "claimed nothing ($WAITING waiting): $(head -c 200 "$WORK/claim.json")"; exit 0; }
python3 -c 'import json,sys; json.dump(json.load(open(sys.argv[1]))["questions"], open(sys.argv[2],"w"), indent=1, ensure_ascii=False)' "$WORK/claim.json" "$WORK/questions.json"
say "START $N claimed ($WAITING waiting) → $WORK"

# 3. check — plan auth only: never let an API key reach the session
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL
cd "$REPO" || { say "FATAL: no repo at $REPO"; exit 1; }
PROMPT="$(cat "$REPO/scripts/question-health/WORKER_PROMPT.md")

---
QUESTIONS FILE: $WORK/questions.json
WRITE REPORTS TO: $WORK/reports/<question_id>.json"
START=$(date +%s)
claude -p "$PROMPT" \
  --model "${QH_MODEL:-opus}" --effort "${QH_EFFORT:-medium}" \
  --permission-mode dontAsk \
  --allowedTools "Bash Read Write Glob Grep Agent TodoWrite" \
  < /dev/null >> "$LOG" 2>&1 &
PID=$!
while kill -0 "$PID" 2>/dev/null; do
  sleep 10
  if [ $(( $(date +%s) - START )) -ge "$MAX_RUNTIME_SEC" ]; then say "TIMEOUT — killing $PID"; kill -TERM "$PID" 2>/dev/null; sleep 5; kill -9 "$PID" 2>/dev/null; break; fi
done
wait "$PID" 2>/dev/null; RC=$?

# 4. post each report
OK=0; BAD=0; SUMMARY=""
for f in "$WORK"/reports/*.json; do
  [ -f "$f" ] || continue
  BODY=$(python3 -c 'import json,sys; print(json.dumps({"action":"result","runner":sys.argv[2],"report":json.load(open(sys.argv[1]))}))' "$f" "$RUNNER" 2>/dev/null) || { BAD=$((BAD+1)); say "unreadable report $f"; continue; }
  ANS=$(curl -s -m 30 -X POST "$API/api/admin/question-health" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$BODY")
  ST=$(printf '%s' "$ANS" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("status",""))
except Exception: print("")')
  if [ -n "$ST" ]; then OK=$((OK+1)); SUMMARY="$SUMMARY $ST"; else BAD=$((BAD+1)); say "result refused for $(basename "$f"): $(printf '%s' "$ANS" | head -c 200)"; fi
done
COUNTS=$(echo "$SUMMARY" | tr ' ' '\n' | grep -v '^$' | sort | uniq -c | awk '{printf "%s %s, ", $1, $2}' | sed 's/, $//')

# 5. stamp
say "END rc=$RC $(( $(date +%s) - START ))s — $OK reported ($COUNTS), $BAD refused, $((N-OK-BAD)) unreported"
stamp "$([ "$OK" -gt 0 ] || [ "$N" -eq 0 ] && echo true || echo false)" "$N claimed: ${COUNTS:-none reported}; $BAD refused"
find "$STATE/work" -maxdepth 1 -type d -mtime +3 -exec rm -rf {} + 2>/dev/null
exit 0
