#!/usr/bin/env python3
"""Shared plumbing for the generated revision worksheets.

Keeps the four build scripts to their real content -- notes and worked examples
-- rather than four copies of the same question-rendering and figure-embedding
code.
"""
import sys, tempfile, os
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
        parts = r.get("parts") or []
        has_parts = isinstance(parts, list) and any(isinstance(p, dict) for p in parts)
        ws.Q(R.split_math((r.get("question_text") or "").strip()),
             marks=None if has_parts else r.get("total_marks"))

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
                if not isinstance(p, dict):
                    continue
                ws.SQ(R.split_math((p.get("text") or "").strip()), marks=p.get("marks"))
        ws.ans(R.split_math((r.get("answer") or "").strip()))
    return n


def save(ws, level_folder: str, filename: str):
    out = DBX/"Revision"/level_folder/filename
    ws.save(str(out))
    print(f"saved: {out}")
    return out
