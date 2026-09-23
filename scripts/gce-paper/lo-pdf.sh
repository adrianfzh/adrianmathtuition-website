#!/bin/bash
# Word file -> PDF through LibreOffice with the maths at the body size.
# A plain `soffice --convert-to pdf` draws every imported Word formula at
# LibreOffice's own 12 pt beside 9.5 pt text (Adrian, 21 Sep 2026: "the fonts
# are of different sizes?"). This opens the file, sets every formula's base
# size, then exports. Word's own PDF needs none of this.
#   usage: lo-pdf.sh <file.docx> [size-pt, default 10]   -> <file>.pdf beside it
# LibreOffice: $SOFFICE when set, else the Mac app, else `soffice` / `libreoffice`
# on PATH (Linux: apt install libreoffice-writer libreoffice-math
# libreoffice-script-provider-python — the last one runs the macro).
set -euo pipefail
MAC_SOFFICE=/Applications/LibreOffice.app/Contents/MacOS/soffice
if [ -z "${SOFFICE:-}" ]; then
  if [ -x "$MAC_SOFFICE" ]; then SOFFICE="$MAC_SOFFICE"
  else SOFFICE="$(command -v soffice || command -v libreoffice || true)"; fi
fi
[ -n "$SOFFICE" ] || { echo "lo-pdf: no LibreOffice — install it, or set SOFFICE=<path to soffice>" >&2; exit 1; }
SRC="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
HERE="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$(mktemp -d)/lo"
mkdir -p "$PROFILE/user/Scripts/python"
cp "$HERE/lopdf.py" "$PROFILE/user/Scripts/python/lopdf.py"
export LOPDF_SRC="$SRC" LOPDF_DST="${SRC%.docx}.pdf" LOPDF_SIZE="${2:-10}" LOPDF_LOG="$PROFILE/log.txt"
"$SOFFICE" --headless --norestore \
  "-env:UserInstallation=file://$PROFILE" \
  'vnd.sun.star.script:lopdf.py$main?language=Python&location=user' >/dev/null 2>&1 || true
[ -f "$LOPDF_LOG" ] || { echo "lo-pdf: the macro never ran ($SOFFICE) — on Linux install libreoffice-script-provider-python" >&2; exit 1; }
cat "$LOPDF_LOG"
grep -q '^ok' "$LOPDF_LOG"
