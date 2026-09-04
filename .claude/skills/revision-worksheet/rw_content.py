"""Helpers a sheet's content.py imports, plus the layout shims rw.py render uses.

Layout mechanics are lifted from the Kinematics reference build
(copy-revision-worksheet-with-different-practice/bank_worked_sheet.py) so every
sheet this skill produces lays out the way that one did: padded literal part
labels in Examples, hoisted first parts on parts-only Practice questions, and
literal labels for every part after a hoist (SQ's auto-numbering would restart).
"""
from __future__ import annotations
import sys
from pathlib import Path

SKILLS = Path(__file__).resolve().parent.parent
for d in ("copy-revision-worksheet-with-different-practice", "create-worksheet"):
    p = SKILLS / d
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import revision_lib as R                      # noqa: E402
from docx.shared import Cm, RGBColor           # noqa: E402
from docx.enum.text import WD_TAB_ALIGNMENT    # noqa: E402

GREY = RGBColor(0x7F, 0x7F, 0x7F)
LIGHT = RGBColor(0xA6, 0xA6, 0xA6)

T = lambda s: ('text', s)                                   # noqa: E731
B = lambda s: ('text', s, {'bold': True})                   # noqa: E731
I = lambda s: ('text', s, {'italic': True})                 # noqa: E731
M = lambda s: ('math', s)                                   # noqa: E731
P = lambda s: ('text', s, {'italic': True, 'color': GREY})  # noqa: E731  principle line


def sm(text) -> list:
    """Bank text -> parts. Bare-superscript fragments like ``ms$^{-1}$`` hand
    pandoc the invalid latex ``^{-1}``; give them an empty base first."""
    return R.split_math(str(text or "").replace("$^", "${}^"))


ROMANS = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6}


def sorted_parts(row) -> list:
    """Parts arrive scrambled sometimes — sort by label, roman-aware."""
    parts = [p for p in R._parts(row) if isinstance(p, dict)]
    labels = [str(p.get("label") or "").strip().lower() for p in parts]
    if parts and all(l in ROMANS for l in labels):
        return sorted(parts, key=lambda p: ROMANS[str(p["label"]).strip().lower()])
    return sorted(parts, key=lambda p: str(p.get("label") or "").strip().lower())


def pad_label(lab) -> str:
    lab = str(lab).strip().strip("()")
    width = 6 if lab.lower() in ROMANS else 4
    return f"({lab})".ljust(width)


def lit_part(ws, lab, parts, marks=None):
    """A Practice part with a LITERAL label at 1.0 cm, text at 2.0 cm — the
    geometry SQ produces natively, without SQ's per-question restart."""
    p = ws.para([("text", f"({str(lab).strip().strip('()')})\t")] + parts, marks=marks)
    pf = p.paragraph_format
    pf.left_indent = Cm(2.0)
    pf.first_line_indent = Cm(-1.0)
    pf.tab_stops.add_tab_stop(Cm(2.0), WD_TAB_ALIGNMENT.LEFT)
    return p


def hoist_Q(ws, lab, parts, marks=None):
    """Parts-only question (empty stem): the first part rides the number line
    as ``1.  (a)  text`` instead of leaving the auto-number alone."""
    p = ws.Q([("text", f"({str(lab).strip().strip('()')})\t")] + parts, marks=marks)
    pf = p.paragraph_format
    pf.left_indent = Cm(2.0)
    pf.first_line_indent = Cm(-2.0)
    pf.tab_stops.add_tab_stop(Cm(1.0), WD_TAB_ALIGNMENT.LEFT)
    pf.tab_stops.add_tab_stop(Cm(2.0), WD_TAB_ALIGNMENT.LEFT)
    return p


def normalise_figure(fig: dict, stem: Path):
    """Re-encode a stored figure to PNG. python-docx only parses JFIF/EXIF JPEG
    headers and several bank JPEGs start with the quantisation table; Pillow
    reads them all. None if even Pillow cannot — the question is then laid out
    without its diagram rather than aborting the sheet."""
    from io import BytesIO
    out = stem.with_suffix(".png")
    try:
        from PIL import Image
        img = Image.open(BytesIO(fig["bytes"]))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.save(out, format="PNG")
        return out
    except Exception:
        return None


def figure_width_cm(fig: dict) -> float:
    px = fig.get("px") or (0, 0)
    return min(10.5, max(6.0, (px[0] or 600) / 96 * 2.54))
