#!/bin/bash
# Word file -> PDF through LibreOffice with the maths at the body size.
# A plain `soffice --convert-to pdf` draws every imported Word formula at
# LibreOffice's own 12 pt beside 9.5 pt text (Adrian, 21 Sep 2026: "the fonts
# are of different sizes?"). This opens the file, sets every formula's base
# size, then exports. Word's own PDF needs none of this.
#   usage: lo-pdf.sh <file.docx> [size-pt, default 10]   -> <file>.pdf beside it
set -euo pipefail
SRC="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
HERE="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$(mktemp -d)/lo"
mkdir -p "$PROFILE/user/Scripts/python"
cp "$HERE/lopdf.py" "$PROFILE/user/Scripts/python/lopdf.py"
export LOPDF_SRC="$SRC" LOPDF_DST="${SRC%.docx}.pdf" LOPDF_SIZE="${2:-10}" LOPDF_LOG="$PROFILE/log.txt"
/Applications/LibreOffice.app/Contents/MacOS/soffice --headless --norestore \
  "-env:UserInstallation=file://$PROFILE" \
  'vnd.sun.star.script:lopdf.py$main?language=Python&location=user' >/dev/null 2>&1 || true
cat "$LOPDF_LOG"
grep -q '^ok' "$LOPDF_LOG"
