#!/bin/bash
# ---------------------------------------------------------------------------
# Self-study sheet worker — wrapper for launchd (com.adrianmath.sheetworker).
#
# Polls the sheet queue (📘 button on /admin/mark-paper history rows) and, only
# when a job is waiting, starts a headless Claude Code session that runs the
# `self-study-sheet` skill on PLAN usage: diagnose the marked paper, author the
# DOCX in Adrian's style, verify every answer, file it into Dropbox, complete
# the job (which Telegrams him). The peek is a single curl, so an empty queue
# costs nothing. Same shape as scripts/plan-marking/run.sh, which has been
# running this pattern since 26 Aug 2026.
#
# Install:  bash scripts/sheet-worker/install.sh   (from the website repo)
# Test:     bash ~/.adrianmath_sheets/run.sh
# Logs:     ~/.adrianmath_sheets/sheet-worker.log
# ---------------------------------------------------------------------------
set -u -o pipefail

export HOME="${HOME:-/Users/adrianfong}"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export LANG="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"

# Slot-scoped state (31 Aug 2026). Slot 1 keeps the original path untouched;
# extra slots get their own dir so two sessions can author two DIFFERENT sheets
# at once. Safe because the claim is a conditional update on (id, status) — two
# workers cannot take the same job, the loser simply picks the next one.
STATE="${SHEETS_STATE_DIR:-$HOME/.adrianmath_sheets}"
LOG="$STATE/sheet-worker.log"
PROMPT="$STATE/WORKER_PROMPT.md"
# Authoring is long: diagnose + write + sympy-verify + figures + render + file.
# Heartbeats keep the lease alive; past this we kill and let the job requeue.
MAX_RUNTIME_SEC="${MAX_RUNTIME_SEC:-4200}"   # 70 min

mkdir -p "$STATE"
ts() { date '+%Y-%m-%d %H:%M:%S'; }
say() { echo "[$(ts)] $*" >> "$LOG"; }

# A worker that dies BEFORE claiming a job is invisible: attempts stays 0, no
# job_runs row is ever written, and /admin/ops has nothing to be amber about.
# That is how this job failed 46 times in a row on 31 Aug 2026 while the UI
# still said "Sheet queued". So a fatal stamps the logbook on its way out —
# best-effort, never blocking, and it says WHY, which the queue-lag alarm in the
# health check cannot know.
stamp_fail() {
  [ -n "${SHEETS_API_BASE:-}" ] && [ -n "${SHEETS_API_TOKEN:-}" ] || return 0
  curl -s -m 15 -X POST "$SHEETS_API_BASE/api/job-log" \
    -H "Authorization: Bearer $SHEETS_API_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"job\":\"sheet-worker\",\"ok\":false,\"summary\":$(python3 -c '
import json, sys
print(json.dumps(sys.argv[1][:300]))' "$1")}" > /dev/null 2>&1 || true
}
die() { say "FATAL: $1"; stamp_fail "$1"; cleanup_pid; exit 1; }


# --- plan limit backoff (9 Sep 2026) ----------------------------------------
# Every slot on this Mac spends the SAME Claude account. Once the CLI says
# "You've hit your weekly limit · resets 9am", every tick of every slot claims a
# paper, dies in ten seconds and hands it back — four slots did that to Sijia's
# paper every forty seconds, and each hand-back cost a Telegram line and an API
# takeover. So the limit is remembered in ONE file per account and no slot
# claims until it lifts. The reset wording is parsed for the hour; a wording we
# cannot read backs off an hour at a time.
# One file PER ACCOUNT (9 Sep 2026): slots on a second account keep marking
# while the first is capped — the pipeline takes whoever is available.
# A slot on a setup-token names its account from the sidecar $STATE/account
# (the email, one line — the marker's convention, 11 Sep 2026); a bare token
# tells `claude auth status` NO email, so without the sidecar a second
# account's slots would share the first account's limit file.
SLOT_ACCOUNT="$( { [ -r "$STATE/account" ] && tr -d '[:space:]' < "$STATE/account"; } 2>/dev/null || true)"
PLAN_ACCOUNT_KEY="$( { [ -n "$SLOT_ACCOUNT" ] && printf '%s' "$SLOT_ACCOUNT" || claude auth status 2>/dev/null | python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("email") or "").strip())
except Exception: print("")'; } 2>/dev/null | python3 -c 'import sys,re; e=sys.stdin.read().strip().lower(); print(re.sub(r"[^a-z0-9]+","-",e) or "default")' 2>/dev/null || echo default)"
PLAN_LIMIT_FILE="$HOME/.adrianmath-plan-limit-until.${PLAN_ACCOUNT_KEY}"
plan_limit_active() {
  [ -r "$PLAN_LIMIT_FILE" ] || return 1
  local until now
  until=$(cat "$PLAN_LIMIT_FILE" 2>/dev/null | tr -d '[:space:]')
  now=$(date +%s)
  [ -n "$until" ] && [ "$until" -gt "$now" ] 2>/dev/null
}
plan_limit_note() {
  # $1 = the CLI's limit line. Writes the epoch the limit lifts.
  python3 - "$1" > "$PLAN_LIMIT_FILE" 2>/dev/null <<'PYLIM' || date -v+60M +%s > "$PLAN_LIMIT_FILE"
import re, sys, datetime, zoneinfo
line = sys.argv[1] if len(sys.argv) > 1 else ""
tz = zoneinfo.ZoneInfo("Asia/Singapore")
now = datetime.datetime.now(tz)
m = re.search(r"resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", line, re.I)
if not m:
    print(int((now + datetime.timedelta(minutes=60)).timestamp())); sys.exit(0)
h = int(m.group(1)); mi = int(m.group(2) or 0); ap = (m.group(3) or "").lower()
if ap == "pm" and h < 12: h += 12
if ap == "am" and h == 12: h = 0
t = now.replace(hour=h, minute=mi, second=0, microsecond=0)
if t <= now: t += datetime.timedelta(days=1)
print(int(t.timestamp()))
PYLIM
}

# --- credentials for the headless session (plan auth, never the API) --------
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL
AUTH_VIA=""
# A slot's OWN token file wins over the keychain login (11 Sep 2026, the second
# account — the marker's order): sheet slots 1-3 follow the CLI login (account
# A); slots 4-6 carry a symlink to ~/.adrianmath_marker4/oauth_token (account B,
# the same token the marking slots 4-6 use) plus the $STATE/account sidecar, so
# A running out never stops B and vice versa. Until this moved up, the keychain
# won and any token file was ignored.
if [ -r "$STATE/oauth_token" ] && [ -n "$(tr -d '[:space:]' < "$STATE/oauth_token")" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$STATE/oauth_token")"
  export CLAUDE_CODE_OAUTH_TOKEN
  AUTH_VIA="oauth_token file"
elif claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then
  AUTH_VIA="keychain"
elif [ -r "$HOME/.adrianmath_marker/oauth_token" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$HOME/.adrianmath_marker/oauth_token")"
  export CLAUDE_CODE_OAUTH_TOKEN
  AUTH_VIA="marker oauth_token"
# The token every plan-billed worker on this Mac actually shares (31 Aug 2026).
# This chain was copied from the marker's wrapper but its last rung was pointed
# at ~/.adrianmath_marker/oauth_token — a file that has never existed, because
# the MARKER itself falls through to the pipeline token. So the sheet worker
# died on "no Claude credentials" on every one of its 15-minute ticks, from
# install onward, and Adrian's first queued sheet sat untouched for two hours
# while the button that queued it looked broken.
elif [ -r "$HOME/.adrianmath_pipeline/oauth_token" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$HOME/.adrianmath_pipeline/oauth_token")"
  export CLAUDE_CODE_OAUTH_TOKEN
  AUTH_VIA="pipeline oauth_token"
else
  die "no Claude credentials — 'claude auth login' once, or put a setup-token in $STATE/oauth_token"
fi

# `run.sh --auth-check` prints which credential and account this slot would
# use and exits — the way to verify a slot's account without queueing a sheet.
if [ "${1:-}" = "--auth-check" ]; then
  echo "slot=$STATE auth=$AUTH_VIA account=${SLOT_ACCOUNT:-$(claude auth status 2>/dev/null | python3 -c 'import json,sys; print((json.load(sys.stdin).get("email") or "?"))' 2>/dev/null)} limit_file=$PLAN_LIMIT_FILE"
  exit 0
fi

# --- single instance --------------------------------------------------------
if plan_limit_active; then
  say "plan limit on this account until $(date -r "$(cat "$PLAN_LIMIT_FILE")" '+%a %H:%M') — not claiming"
  exit 0
fi
if [ -f "$STATE/worker.pid" ]; then
  OLDPID=$(cat "$STATE/worker.pid" 2>/dev/null || echo "")
  if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then
    exit 0   # previous run still authoring — launchd will fire again
  fi
fi
echo $$ > "$STATE/worker.pid"
cleanup_pid() { rm -f "$STATE/worker.pid"; }

# Stagger slots so two workers rarely reach for the same job on the same tick.
if [ "${START_DELAY_SEC:-0}" -gt 0 ] 2>/dev/null; then sleep "$START_DELAY_SEC"; fi

# --- config -----------------------------------------------------------------
if [ ! -r "$STATE/env" ]; then
  say "FATAL: missing $STATE/env (SHEETS_API_BASE + SHEETS_API_TOKEN) — run install.sh"
  cleanup_pid; exit 1
fi
# shellcheck disable=SC1091
. "$STATE/env"
if [ -z "${SHEETS_API_BASE:-}" ] || [ -z "${SHEETS_API_TOKEN:-}" ]; then
  say "FATAL: SHEETS_API_BASE / SHEETS_API_TOKEN not set in $STATE/env"
  cleanup_pid; exit 1
fi
export SHEETS_API_BASE SHEETS_API_TOKEN
export SHEETS_STATE="$STATE"
# The repo the session works in — sheets are authored with the skills that live
# there. A COPY is not possible here (python envs, skills, scripts), so the
# session must tolerate the shared checkout being on any branch.
export SHEETS_REPO="${SHEETS_REPO:-$HOME/dev/adrianmathtuition-website}"

# --- peek: is anything waiting? (one curl — no Claude spend) ----------------
# "Waiting" = queued, OR claimed by a session that stopped heartbeating more
# than LEASE_MS ago (40 min, lib/sheet-jobs.ts). The peek used to count only
# 'queued', so a job whose session died mid-authoring sat at 'claimed ·
# diagnosing' for 33 hours (Tan Sijia, 1–2 Sep 2026): the API's `next` action
# knows how to reclaim an expired lease, but no session was ever started to
# call it. The lease is 40 min server-side; mirror it here.
JOBS=$(curl -s -m 30 "$SHEETS_API_BASE/api/admin/sheet-jobs" \
  -H "Authorization: Bearer $SHEETS_API_TOKEN") || JOBS=""
WAITING=$(printf '%s' "$JOBS" | python3 -c "
import json,sys,datetime
LEASE_S = 40*60
now = datetime.datetime.now(datetime.timezone.utc)
def expired(j):
    beat = j.get('heartbeat_at') or j.get('claimed_at')
    if not beat: return True
    try:
        t = datetime.datetime.fromisoformat(beat.replace('Z','+00:00'))
    except Exception:
        return True
    return (now - t).total_seconds() > LEASE_S
try:
    jobs = json.load(sys.stdin).get('jobs', [])
    print(sum(1 for j in jobs
              if (j.get('attempts') or 0) < 3
              and (j.get('status') == 'queued' or (j.get('status') == 'claimed' and expired(j)))))
except Exception:
    print(-1)")
date '+%Y-%m-%d %H:%M:%S' > "$STATE/last_peek"
if [ "$WAITING" = "-1" ]; then
  say "peek failed: $(printf '%s' "$JOBS" | head -c 200)"
  cleanup_pid; exit 1
fi
if [ "$WAITING" = "0" ]; then
  cleanup_pid; exit 0   # quiet tick — nothing to author
fi

if [ ! -r "$PROMPT" ]; then
  die "missing $PROMPT — run install.sh again"
fi

# --- run: one sheet, one session -------------------------------------------
say "START ($WAITING queued, auth=$AUTH_VIA, model=${WORKER_MODEL:-opus}, max ${MAX_RUNTIME_SEC}s)"
START_EPOCH=$(date +%s)
cd "$SHEETS_REPO" || die "cannot cd to $SHEETS_REPO"

# Fetch the latest code before authoring (10 Sep 2026): the session runs the
# self-study-sheet skill, worksheet_lib.py and WORKER_PROMPT.md from THIS
# checkout, so a rule that landed on GitHub reached the sheets only when someone
# remembered to pull here (the Practice Again focus rule sat unpulled for a
# night). A pull that cannot fast-forward — offline, diverged, a dirty file in
# the way — is a warning, not a failure: the sheet is authored on the checkout
# as it stands. install.sh COPIES this file; the block after the pull keeps
# that copy current, so a change here reaches every worker Mac by itself.
if PULL_OUT=$(GIT_TERMINAL_PROMPT=0 git pull --ff-only --quiet 2>&1); then
  say "git pull ok: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
else
  say "WARN: git pull failed — authoring on the checkout as it is: $(echo "$PULL_OUT" | tr '\n' ' ' | cut -c1-200)"
fi

# Refresh the INSTALLED copies from the repo just pulled (10 Sep 2026). launchd
# runs ~/.adrianmath_sheets/run.sh, a COPY install.sh made, so until now a change to
# this file reached a worker Mac only when someone re-ran install.sh there. Now
# the copy replaces itself with the repo's version whenever the two differ —
# written beside and moved into place, so the bash reading THIS copy keeps its
# old inode and finishes the tick unchanged; the new version runs from the next
# tick. A WORKER_PROMPT.md copy is refreshed the same way (a symlinked one
# already follows the repo), and that one applies THIS tick — it is read below.
# The one copy this cannot reach is one older than this block: it has no pull
# and no refresh, and needs install.sh once more by hand.
REPO_RUN="$SHEETS_REPO/scripts/sheet-worker/run.sh"
REPO_PROMPT="$SHEETS_REPO/scripts/sheet-worker/WORKER_PROMPT.md"
if [ -r "$REPO_RUN" ] && [ -f "$STATE/run.sh" ] && ! cmp -s "$REPO_RUN" "$STATE/run.sh"; then
  if cp "$REPO_RUN" "$STATE/run.sh.new" && chmod 755 "$STATE/run.sh.new" && mv -f "$STATE/run.sh.new" "$STATE/run.sh"; then
    say "run.sh refreshed from the repo @ $(git rev-parse --short HEAD) — the new version runs from the next tick"
  else
    say "WARN: could not refresh $STATE/run.sh from $REPO_RUN"
  fi
fi
if [ -r "$REPO_PROMPT" ] && [ -f "$PROMPT" ] && [ ! -L "$PROMPT" ] && ! cmp -s "$REPO_PROMPT" "$PROMPT"; then
  cp "$REPO_PROMPT" "$PROMPT" && say "WORKER_PROMPT.md refreshed from the repo" || say "WARN: could not refresh $PROMPT"
fi

# Effort is pinned HIGH, not left to the default: authoring a sheet is
# diagnosis + writing + symbolic verification + figure construction in one
# pass, and a cheap pass here produces a sheet Adrian has to rewrite — which
# costs more of his time than the tokens ever save.
claude -p "$(cat "$PROMPT")" \
  --model "${WORKER_MODEL:-opus}" \
  --effort "${WORKER_EFFORT:-high}" \
  --permission-mode dontAsk \
  --allowedTools Bash Read Write Edit Glob Grep TodoWrite Skill \
  --setting-sources user project \
  < /dev/null >> "$LOG" 2>&1 &
CLAUDE_PID=$!

while kill -0 "$CLAUDE_PID" 2>/dev/null; do
  sleep 15
  if [ $(( $(date +%s) - START_EPOCH )) -ge "$MAX_RUNTIME_SEC" ]; then
    say "TIMEOUT after ${MAX_RUNTIME_SEC}s — killing pid $CLAUDE_PID"
    kill -TERM "$CLAUDE_PID" 2>/dev/null
    sleep 5
    kill -9 "$CLAUDE_PID" 2>/dev/null
    break
  fi
done
wait "$CLAUDE_PID" 2>/dev/null
RC=$?
ELAPSED=$(( $(date +%s) - START_EPOCH ))

# A job left 'claimed' by a dead session is NOT released here: the lease
# (lib/sheet-jobs.ts) expires on its own and the next tick reclaims it. That is
# deliberate — a half-authored sheet should not be retried instantly.
if [ "$RC" -eq 0 ]; then
  say "END ok (${ELAPSED}s)"
elif tail -40 "$LOG" | grep -qiE 'usage limit|rate.?limit|quota|weekly limit|hit your .*limit'; then
  # Name the limit and the account so /admin/ops can say "sheet worker closed" (9 Sep 2026).
  LIMIT_LINE="$(tail -40 "$LOG" | grep -iE 'usage limit|rate.?limit|quota|weekly limit|hit your .*limit' | tail -1 | tr -d '\r' | cut -c1-120)"
  SHEETS_ACCOUNT="$(claude auth status 2>/dev/null | python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("email") or "").strip())
except Exception: print("")' 2>/dev/null || true)"
  plan_limit_note "$LIMIT_LINE"
  say "END rc=$RC (${ELAPSED}s) — looks like a PLAN USAGE LIMIT, not a bug; no slot claims until $(date -r "$(cat "$PLAN_LIMIT_FILE")" '+%a %H:%M')"
  stamp_fail "plan limit on ${SHEETS_ACCOUNT:-unknown account}: ${LIMIT_LINE:-usage limit}"
else
  say "END rc=$RC (${ELAPSED}s)"
fi

cleanup_pid
