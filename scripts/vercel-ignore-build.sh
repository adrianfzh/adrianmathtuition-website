#!/usr/bin/env bash
# Vercel "Ignored Build Step" — vercel.json `ignoreCommand` (9 Sep 2026).
# Exit 0 = SKIP this build, exit 1 = build. Vercel bills every build's CPU
# minutes; 928 builds in 19 days (230 of them for docs/skills/scripts-only
# commits) drained the $20 monthly credit. A build is skipped only when every
# file changed since the last BUILT commit on this branch lives somewhere that
# never ships. Anything unsure → build.
set -u
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
cur="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
[ -z "$prev" ] && { echo "[ignore-build] no previous deployment on this branch → build"; exit 1; }
if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  git fetch -q --deepen=50 origin 2>/dev/null || true
  git cat-file -e "$prev^{commit}" 2>/dev/null || { echo "[ignore-build] $prev not in clone → build"; exit 1; }
fi
changed=$(git diff --name-only "$prev" "$cur" 2>/dev/null) || { echo "[ignore-build] diff failed → build"; exit 1; }
[ -z "$changed" ] && { echo "[ignore-build] no diff → build"; exit 1; }
# Places that never reach the deployed app. `data/` DOES ship (lesson-load.ts imports it).
NON_SHIPPING='^(docs/|\.claude/|\.githooks/|\.github/|scripts/|migrations/|reference/|_backups/|_old/|ios-shell/|[^/]+\.md$|\.gitignore$)'
if printf '%s\n' "$changed" | grep -qvE "$NON_SHIPPING"; then
  echo "[ignore-build] shipping files changed since $prev → build"; exit 1
fi
echo "[ignore-build] only docs/skills/scripts changed since $prev → skip"; exit 0
