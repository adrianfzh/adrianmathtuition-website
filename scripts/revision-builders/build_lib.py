#!/usr/bin/env python3
"""Shared plumbing for the generated revision worksheets.

Keeps the four build scripts to their real content -- notes and worked examples
-- rather than four copies of the same question-rendering and figure-embedding
code.
"""
import re, sys, tempfile, os
from pathlib import Path

SKILL = Path.home()/"dev/adrianmathtuition-website/.claude/skills"
sys.path.insert(0, str(SKILL/"copy-revision-worksheet-with-different-practice"))
sys.path.insert(0, str(SKILL/"create-worksheet"))
import revision_lib as R                      # noqa: E402
from worksheet_lib import Worksheet           # noqa: E402

DBX = Path.home()/"Library/CloudStorage/Dropbox/Apps/AdrianMathNotes"

T = lambda s: ('text', s)                     # noqa: E731
B = lambda s: ('text', s, {'bold': True})     # noqa: E731
I = lambda s: ('text', s, {'italic': True})   # noqa: E731
M = lambda s: ('math', s)                     # noqa: E731


def sheet(level_line: str, topic: str) -> Worksheet:
    ws = Worksheet()
    ws.title(level_line)
    ws.subtitle(topic)
    return ws


def fetch(level: str, topic, figures: bool = False) -> dict:
    """id -> row, for one topic at one level."""
    env = R.load_env()
    rows = R.fetch_pool(env, level, topic, figures=figures)
    if figures:
        notes = R.fetch_figures(env, rows)
        for n in notes:
            print(f"  figure note: {n}")
    return {r["id"]: r for r in rows}, env


def _normalise(fig: dict, stem: Path):
    """Re-encode a stored figure to a plain PNG.

    python-docx parses image headers itself and only understands JFIF/EXIF
    JPEGs. Several bank figures start `ffd8ffdb` -- a JPEG whose first marker is
    the quantisation table -- and raise UnrecognizedImageError. Pillow reads them
    all, so every figure is rewritten to PNG rather than special-casing formats.
    Returns None if even Pillow cannot read it; the question is then laid out
    without its diagram rather than aborting the whole sheet.
    """
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
        try:                                    # last resort: write it as-is
            raw = stem.with_suffix("." + fig["ext"])
            raw.write_bytes(fig["bytes"])
            return raw
        except Exception:
            return None


_ROMAN = {"i": "a", "ii": "b", "iii": "c", "iv": "d", "v": "e"}
_ROMAN_LABEL = re.compile(r"(?:(?<=^)|(?<=[;\n]))(\s*)\((i|ii|iii|iv|v)\)")


def _letter_labels(answer: str, has_parts: bool) -> str:
    """An answer keyed (i) (ii) beside parts printed (a) (b) is renumbered to match.

    Schools label the same question both ways and the bank keeps whichever the
    paper used, so a sheet can end up printing "(a)" over an answer that says
    "(i)".  Only a label opening the string or a clause is touched.
    """
    if not has_parts or "(i)" not in answer:
        return answer
    return _ROMAN_LABEL.sub(lambda m: f"{m.group(1)}({_ROMAN[m.group(2)]})", answer)


def render_practice(ws, by_id: dict, ids: list, figdir: Path = None) -> int:
    """Lay out the practice half from live bank rows.

    Questions are rendered from the database rather than transcribed, so a stem
    or an answer key here cannot drift from what the bank actually holds.
    """
    n = 0
    for qid in ids:
        r = by_id.get(qid)
        if r is None:
            print(f"  !! not in pool, skipped: {qid}")
            continue
        n += 1
        stem = (r.get("question_text") or "").strip()
        parts = [p for p in (r.get("parts") or []) if isinstance(p, dict)]
        # a bank row holding ONE part under an empty stem is not a question with
        # sub-parts -- it is the question itself, so it loses the "(a)" label
        if len(parts) == 1 and not stem:
            stem = (parts[0].get("text") or "").strip()
            marks = parts[0].get("marks") or r.get("total_marks")
            parts = []
        else:
            marks = None if parts else r.get("total_marks")
        has_parts = bool(parts)
        ws.Q(R.split_math(stem), marks=marks)

        # figure between the stem and the sub-parts, as in Adrian's own sheets
        figs = r.get("_figures") or []
        if figs and figdir is not None:
            for j, f in enumerate(figs):
                fp = _normalise(f, figdir/f"{qid[:8]}_{j}")
                if fp is None:
                    print(f"  !! figure unreadable, question kept without it: {qid[:8]}")
                    continue
                px = f.get("px") or (0, 0)
                # never upscale: cap at 10.5 cm but shrink small images
                width = min(10.5, max(6.0, (px[0] or 600)/96*2.54))
                ws.figure(str(fp), width_cm=width)

        if has_parts:
            for p in parts:
                ws.SQ(R.split_math((p.get("text") or "").strip()), marks=p.get("marks"))
        ws.ans(R.split_math(_letter_labels((r.get("answer") or "").strip(), has_parts)))
    return n


def save(ws, level_folder: str, filename: str):
    out = DBX/"Revision"/level_folder/filename
    ws.save(str(out))
    print(f"saved: {out}")
    return out
