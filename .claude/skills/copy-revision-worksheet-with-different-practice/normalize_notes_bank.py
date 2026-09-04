#!/usr/bin/env python3
"""Force one font size across every notes-bank fragment.

WHY
---
Adrian's fragments were authored over years from different formula sheets, and
they carry their authors' sizes. Measured 2026-08-12 across all 66 files, every
single one held more than one size, and the bulk of the content was SMALLER than
the body text:

    6.5–7.0 pt   6250 elements   <- the formula lines
    9.5 pt       2832 elements   <- the Reminders prose
    2.0–5.5 pt    173 elements   <- nested scripts
    8–14 pt        46 elements   <- the topic heading, which varied 8/10/14 pt

On screen that reads as a tiny heading over tiny equations with normal-size
bullets underneath — Adrian, 2026-08-12: "the front part saved in notes_bank
does not have the font sizes to be of equal sizes".

The generated worksheets never showed this because `_normalize_house_style`
already pins the OUTPUT to 9.5 pt. This script applies that same pass to the
SOURCE, so the bank looks like what it produces when opened on its own.

WHY PINNING SCRIPTS TO 9.5 pt DOES NOT FLATTEN EXPONENTS
--------------------------------------------------------
Word derives OMML script sizes from the base run size at RENDER time; the stored
size on a superscript run is ignored. `_normalize_house_style`'s docstring
records the proof: in the S4 AM fragment, base `a` and exponent `n` are both
stored at 6.5 pt yet render at different sizes. So setting every `w:sz` to 19
scales each equation as a whole instead of collapsing it flat.

SCOPE — deliberately size only
------------------------------
`_normalize_house_style` also imposes 1.5 line spacing, a 15.5 cm marks tab and
A4 page setup. Those are OUTPUT concerns and are still applied at build time.
Adrian asked about font size, so that is all this touches: line spacing and page
geometry in the bank are left exactly as he authored them.
"""

from __future__ import annotations
import argparse
import collections
import os
import shutil
import sys
import zipfile
from pathlib import Path

from lxml import etree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import revision_lib as R  # noqa: E402

W_NS = R.W_NS
M_NS = R.M_NS


def w(tag: str) -> str:
    return "{%s}%s" % (W_NS, tag)


def normalize_sizes(root) -> int:
    """The size half of _normalize_house_style, and nothing else.

    Three passes, mirroring it exactly:
      1. every OMML equation through style_omml (also sizes the ctrlPr glyphs,
         which carry their own rPr and are missed by a plain w:sz sweep)
      2. every explicit w:sz / w:szCs anywhere in the document
      3. runs with no size at all, which would otherwise fall back to the
         fragment's docDefaults (12 pt in these files)
    """
    changed = 0

    for m in root.iter("{%s}oMath" % M_NS):
        R.style_omml(m, size=R.SZ_BODY)

    for tag in ("sz", "szCs"):
        for e in root.iter(w(tag)):
            if e.get(w("val")) != str(R.SZ_BODY):
                e.set(w("val"), str(R.SZ_BODY))
                changed += 1

    for r in root.iter(w("r")):
        rPr = r.find(w("rPr"))
        if rPr is None:
            rPr = etree.Element(w("rPr"))
            r.insert(0, rPr)
        if rPr.find(w("sz")) is None:
            R._sub(rPr, "sz", val=R.SZ_BODY)
            R._sub(rPr, "szCs", val=R.SZ_BODY)
            R._order_rpr(rPr)
            changed += 1

    return changed


def sizes_in(path: Path) -> collections.Counter:
    with zipfile.ZipFile(path) as z:
        root = etree.fromstring(z.read("word/document.xml"))
    c = collections.Counter()
    for e in root.iter(w("sz")):
        c[e.get(w("val"))] += 1
    return c


def process(path: Path, apply: bool) -> tuple[int, collections.Counter]:
    before = sizes_in(path)
    with zipfile.ZipFile(path) as z:
        root = etree.fromstring(z.read("word/document.xml"))
    changed = normalize_sizes(root)
    if not apply:
        return changed, before

    # Byte-clone every other part, exactly as clone_with_practice does: only
    # word/document.xml is rewritten, so numbering, styles, embedded images and
    # fonts survive untouched.
    new_xml = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    tmp = str(path) + ".tmp"
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "word/document.xml":
                data = new_xml
            zout.writestr(item, data)
    shutil.move(tmp, path)
    return changed, before


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None,
                    help="override root holding <BANK>/ subfolders (default: "
                         "resolve each bank under its practice folder)")
    ap.add_argument("--bank", help="limit to one bank, e.g. S3_AM")
    ap.add_argument("--apply", action="store_true", help="write (default is a dry run)")
    a = ap.parse_args()

    names = [a.bank] if a.bank else R.BANKS
    if a.root:
        root_dir = Path(a.root)
        if not root_dir.is_dir():
            print(f"NOT FOUND: {root_dir}", file=sys.stderr)
            return 2
        # A copy of the bank keeps the flat <BANK>/ layout, so honour whatever
        # subfolders are actually there rather than assuming all four exist.
        banks = [root_dir / n for n in names if (root_dir / n).is_dir()] \
            or sorted(p for p in root_dir.iterdir() if p.is_dir())
    else:
        banks = [R.bank_dir(n) for n in names]
        missing = [str(b) for b in banks if not b.is_dir()]
        if missing:
            print("NOT FOUND: " + "; ".join(missing), file=sys.stderr)
            return 2
    total_files = total_changed = skipped = 0

    for bank in banks:
        for f in sorted(bank.glob("*.docx")):
            if f.name.startswith("~$"):
                continue
            # A Word lock file means the document is OPEN. Rewriting it now would
            # be silently undone by Adrian's next save in Word, so leave it and
            # say so rather than pretend it was done.
            lock = f.parent / ("~$" + f.name[2:])
            if lock.exists():
                print(f"  SKIP (open in Word) {bank.name}/{f.name}")
                skipped += 1
                continue
            n, before = process(f, a.apply)
            total_files += 1
            total_changed += n
            if len(before) > 1 or n:
                pretty = ", ".join(f"{int(k)/2}pt" for k, _ in before.most_common(4))
                print(f"  {'wrote' if a.apply else 'would fix'} {bank.name}/{f.name[:40]:40} "
                      f"[{pretty}] -> 9.5pt ({n} elements)")

    print(f"\n{'APPLIED' if a.apply else 'DRY RUN'}: {total_files} file(s), "
          f"{total_changed} size element(s) -> {R.SZ_BODY/2} pt"
          + (f", {skipped} skipped (open in Word)" if skipped else ""))
    if not a.apply:
        print("re-run with --apply to write")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
