#!/bin/bash
# The whole Humanities bench on the plan, one family after another (SPEC-HUMANITIES.md §4, 8 Oct 2026).
# Unattended and resumable: run it again and each run picks up where it stopped.
#   bash scripts/humanities-bench/full-plan.sh [tag] [model] [base]
cd "$(dirname "$0")/../.." || exit 1
TAG="${1:-plan-2026-10-08}"; MODEL="${2:-sonnet}"; BASE="${3:-https://adrianmath-dev.vercel.app}"
LOG="scripts/humanities-bench/results/$TAG.log"
run() { local name="$1"; shift; npx tsx scripts/humanities-bench/run.ts --name "$TAG-$name" --base "$BASE" --model "$MODEL" --batch 20 "$@" 2>&1 | grep -v -e "read$" -e Deprecation -e trace-deprecation >> "$LOG"; bash scripts/humanities-bench/meter.sh "after $name" >> "$LOG"; }
bash scripts/humanities-bench/meter.sh "start ($MODEL)" >> "$LOG"
run ss-structured --subject social-studies --kind structured
run hist-source   --subject history --kind source
run geo-9mark     --subject geography --kind structured
run hist-essays   --subject history --kind structured
run ss-hard       --hard
run geo-points    --subject geography --kind points
run ss-source     --subject social-studies --kind source
echo "DONE $(date -u +%FT%TZ)" >> "$LOG"
