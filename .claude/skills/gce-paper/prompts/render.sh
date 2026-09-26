#!/bin/sh
# Render one of the per-slot prompt templates for an Agent spawn.
#   usage: render.sh <author|blind|moderate|repair> <RUN dir> <paper no> <slots, e.g. 1,2,3>
#   prints the rendered prompt's path (written into the run dir); paste its contents as the agent prompt.
# Placeholders: __RUN__ = run dir, __P__ = paper number, __SLOTS__ = "Q1, Q2, Q3", __N__ = the raw slot list,
# __SUBJECT__ / __CODE__ / __EXAM__ = the syllabus, read from the run's plan.json key (GCE-AM-* → Additional
# Mathematics 4049 O-Level, GCE-EM-* → Elementary Mathematics 4052 O-Level, GCE-JC-* → H2 Mathematics 9758
# A-Level) — the templates serve all three levels. __YEARS__ / __STANDARD_NOTE__ = the sittings that set the
# difficulty standard (O-Level: 2024/25, "harder than earlier years"; H2: 2022–2024, with 2025 discounted as
# too easy — Adrian, 26 Sep 2026).
# blind.md and repair.md are one slot per spawn (__N__ must be a single number).
# POSIX sh (23 Sep 2026): runs under sh, bash or zsh — the cloud containers have no zsh.
set -e
kind=$1; RUN=$2; P=$3; slots=$4
here="$(cd "$(dirname "$0")" && pwd)"
[ -f "$here/${kind}.md" ] || { echo "no template $here/${kind}.md" >&2; exit 1; }
[ -d "$RUN" ] || { echo "no run dir $RUN" >&2; exit 1; }
fam=$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).key.split('-')[1]" "$RUN/plan.json" 2>/dev/null || echo "")
olevel_note="the 2024 and 2025 papers are harder than earlier years"
case "$fam" in
  AM) subject="Additional Mathematics"; code=4049; exam="O-Level"; years="2024/25"; note="$olevel_note" ;;
  EM) subject="Elementary Mathematics"; code=4052; exam="O-Level"; years="2024/25"; note="$olevel_note" ;;
  JC) subject="H2 Mathematics"; code=9758; exam="A-Level"; years="2022–2024"; note="the representative sittings are 2022, 2023 and 2024; the 2025 paper was the first of the revised syllabus and read as too easy, so it is not the standard" ;;
  *) echo "cannot read the level from $RUN/plan.json (key GCE-AM-*, GCE-EM-* or GCE-JC-*)" >&2; exit 1 ;;
esac
label=$(echo "$slots" | sed 's/,/, Q/g; s/^/Q/')
out="$RUN/prompt-${kind}-Q$(echo "$slots" | tr ',' '-').md"
sed -e "s|__RUN__|$RUN|g" -e "s|__P__|$P|g" -e "s|__SLOTS__|$label|g" -e "s|__N__|$slots|g" -e "s|__SUBJECT__|$subject|g" -e "s|__CODE__|$code|g" \
    -e "s|__EXAM__|$exam|g" -e "s|__YEARS__|$years|g" -e "s|__STANDARD_NOTE__|$note|g" "$here/${kind}.md" > "$out"
echo "$out"
