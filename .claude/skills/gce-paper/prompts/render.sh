#!/bin/zsh
# Render one of the per-slot prompt templates for an Agent spawn.
#   usage: render.sh <author|blind|moderate|repair> <RUN dir> <paper no> <slots, e.g. 1,2,3>
#   prints the rendered prompt's path (written into the run dir); paste its contents as the agent prompt.
# Placeholders: __RUN__ = run dir, __P__ = paper number, __SLOTS__ = "Q1, Q2, Q3", __N__ = the raw slot list.
# blind.md and repair.md are one slot per spawn (__N__ must be a single number).
set -e
kind=$1; RUN=$2; P=$3; slots=$4
here=${0:A:h}
[[ -f "$here/${kind}.md" ]] || { echo "no template $here/${kind}.md" >&2; exit 1; }
[[ -d "$RUN" ]] || { echo "no run dir $RUN" >&2; exit 1; }
label=$(echo "$slots" | sed 's/,/, Q/g; s/^/Q/')
out="$RUN/prompt-${kind}-Q$(echo "$slots" | tr ',' '-').md"
sed -e "s|__RUN__|$RUN|g" -e "s|__P__|$P|g" -e "s|__SLOTS__|$label|g" -e "s|__N__|$slots|g" "$here/${kind}.md" > "$out"
echo "$out"
