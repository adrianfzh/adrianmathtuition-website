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
# The macro runs in LibreOffice's own Python; another Python's library path
# (e.g. a CI runner's setup-python LD_LIBRARY_PATH) stops it from starting.
LO="env -u LD_LIBRARY_PATH -u PYTHONHOME -u PYTHONPATH"
[ "${LOPDF_VIA:-}" = pipe ] || $LO "$SOFFICE" --headless --norestore \
  "-env:UserInstallation=file://$PROFILE" \
  'vnd.sun.star.script:lopdf.py$main?language=Python&location=user' >/dev/null 2>&1 || true
if [ ! -f "$LOPDF_LOG" ]; then
  # Some builds (Ubuntu 24.04's LibreOffice 24.2) crash running a macro named on
  # the command line: run the same code from a Python with LibreOffice's uno
  # module, over a pipe. LOPDF_VIA=pipe takes this route first.
  PY=""
  for c in "${LOPDF_PYTHON:-}" "$(dirname "$SOFFICE")/../Resources/python" "$(dirname "$SOFFICE")/python" /usr/bin/python3 python3; do
    [ -n "$c" ] && $LO "$c" -c 'import uno' >/dev/null 2>&1 && { PY="$c"; break; }
  done
  [ -n "$PY" ] || { echo "lo-pdf: the macro never ran ($SOFFICE) and no Python here imports uno — on Linux install libreoffice-script-provider-python" >&2; exit 1; }
  PIPE="lopdf$$"; PROFILE2="$(mktemp -d)/lo"
  $LO "$SOFFICE" --headless --norestore --invisible "-env:UserInstallation=file://$PROFILE2" \
    "--accept=pipe,name=$PIPE;urp;" >/dev/null 2>&1 &
  LOPID=$!
  $LO "$PY" "$HERE/lopdf.py" "$PIPE" || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$LOPID" 2>/dev/null || break; sleep 1; done
  kill "$LOPID" 2>/dev/null || true
  [ -f "$LOPDF_LOG" ] || { echo "lo-pdf: LibreOffice ran neither the macro nor the pipe route ($SOFFICE, $PY)" >&2; exit 1; }
fi
cat "$LOPDF_LOG"
grep -q '^ok' "$LOPDF_LOG"
