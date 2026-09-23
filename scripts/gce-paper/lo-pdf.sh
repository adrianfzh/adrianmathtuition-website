#!/bin/bash
# Word file -> PDF through LibreOffice with the maths at the body size.
# A plain `soffice --convert-to pdf` draws every imported Word formula at
# LibreOffice's own 12 pt beside 9.5 pt text (Adrian, 21 Sep 2026: "the fonts
# are of different sizes?"). This opens the file, sets every formula's base
# size, then exports. Word's own PDF needs none of this.
#   usage: lo-pdf.sh <file.docx> [size-pt, default 10]   -> <file>.pdf beside it
# LibreOffice: $SOFFICE when set, else the Mac app, else `soffice` / `libreoffice`
# on PATH (Linux: apt install libreoffice-writer libreoffice-math; add
# libreoffice-script-provider-python for the macro). Where the macro cannot run
# (Ubuntu 24.04's LibreOffice 24.2 aborts on a macro named on the command line),
# a plain convert with the formula base size set in a fresh profile draws the same.
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
[ "${LOPDF_VIA:-}" = convert ] || "$SOFFICE" --headless --norestore \
  "-env:UserInstallation=file://$PROFILE" \
  'vnd.sun.star.script:lopdf.py$main?language=Python&location=user' >/dev/null 2>&1 || true
if [ ! -f "$LOPDF_LOG" ]; then   # the macro never ran: LOPDF_VIA=convert takes this route first
  T2="$(mktemp -d)"; mkdir -p "$T2/lo/user"
  cat > "$T2/lo/user/registrymodifications.xcu" <<XCU
<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Math/StandardFormat"><prop oor:name="BaseSize" oor:op="fuse"><value>$LOPDF_SIZE</value></prop></item>
</oor:items>
XCU
  "$SOFFICE" --headless --norestore "-env:UserInstallation=file://$T2/lo" \
    --convert-to pdf --outdir "$T2/out" "$SRC" >/dev/null 2>&1 || true
  OUT="$T2/out/$(basename "${SRC%.docx}").pdf"
  [ -f "$OUT" ] || { echo "lo-pdf: LibreOffice ran neither the macro nor a convert ($SOFFICE)" >&2; exit 1; }
  mv "$OUT" "$LOPDF_DST"
  printf 'formulas at %s pt through the profile (the macro did not run)\nok\n' "$LOPDF_SIZE" > "$LOPDF_LOG"
fi
cat "$LOPDF_LOG"
grep -q '^ok' "$LOPDF_LOG"
