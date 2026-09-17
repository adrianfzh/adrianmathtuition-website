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
        _hoist_inline_figures(rows)
        notes = R.fetch_figures(env, rows)
        notes += _fetch_part_figures(env, rows)
        for n in notes:
            print(f"  figure note: {n}")
    return {r["id"]: r for r in rows}, env


_INLINE_IMG = re.compile(r"\{\{\s*IMG\s*:\s*([^}]+?)\s*\}\}")


def _hoist_inline_figures(rows: list) -> None:
    """A figure the extractor left sitting INSIDE the question text.

    A handful of rows carry the picture as a `{{IMG:question_images/<uuid>.png}}`
    marker in the middle of the stem or of a part instead of in `image_url`.
    Nothing downstream reads the marker, so it used to print on the page as that
    literal text (Presbyterian High 2025 P1 Q25 and Ngee Ann 2025 P2 Q7 in the
    speed-time pool).  Lift the path out to where the figure machinery looks for
    it -- the row's own list for a stem marker, the part's `image_url_after` for
    a part marker -- and take the marker out of the words.  A path that is also
    stored on the row proper is dropped by `_drop_repeats` before it prints.
    """
    for row in rows:
        stem = row.get("question_text") or ""
        found = _INLINE_IMG.findall(stem)
        if found:
            row["question_text"] = _INLINE_IMG.sub("", stem).strip()
            row["image_url"] = R._images(row) + found
        for p in (row.get("parts") or []):
            if not isinstance(p, dict):
                continue
            for key in ("text", "answer"):
                txt = p.get(key) or ""
                hits = _INLINE_IMG.findall(txt)
                if not hits:
                    continue
                p[key] = _INLINE_IMG.sub("", txt).strip()
                if key == "text":
                    have = p.get("image_url_after") or []
                    if isinstance(have, str):
                        have = [have]
                    p["image_url_after"] = have + hits


def _fetch_part_figures(env: dict, rows: list) -> list:
    """Figures a row stores against ONE part rather than against the question.

    A paper that prints a picture beside (a) and a different one beside (b) is
    kept that way: `image_url` is empty and each part carries `image_url_after`.
    Reading only `image_url` printed the question with no picture at all --
    Anglican High 2024 P1 Q15 asked a student to read a sketch that was not
    there.  Each part's figure is downloaded through the same fetcher, by
    handing it a stand-in row that holds the one path.
    """
    shims, owners = [], []
    for row in rows:
        for p in (row.get("parts") or []):
            if not isinstance(p, dict) or p.get("_figures") is not None:
                continue
            path = p.get("image_url_after")
            if not path:
                p["_figures"] = []
                continue
            shims.append({"id": row["id"], "image_url": path, "_row": row})
            owners.append(p)
    if not shims:
        return []
    notes = R.fetch_figures(env, shims)
    for p, shim in zip(owners, shims):
        p["_figures"] = _drop_repeats(shim.get("_figures"), shim["_row"])
    return notes


def _drop_repeats(figs, row):
    """The same picture stored twice -- once on the row, once on a part.

    Methodist Girls 2025 P1 Q18 keeps its speed-time graph as the question's
    figure AND again as part (a)'s, so printing both put the identical graph on
    the page twice.  Cedar Girls 2025 P1 Q23 looks the same in the data but its
    part figure is the BLANK axes (b) asks the student to draw on -- a second
    picture that has to print.  The two cases are told apart by the pictures
    themselves: each is reduced to a 32 x 32 grey thumbnail, stretched to the
    same contrast, and compared point by point.  Across the three graph pools
    the repeats score 0 and 7 while every genuine second figure scores 21 or
    more, so 12 sits in the gap.
    """
    if not figs:
        return figs
    own = [_thumb(f.get("bytes")) for f in (row.get("_figures") or [])]
    own = [g for g in own if g]
    if not own:
        return figs
    kept = []
    for f in figs:
        g = _thumb(f.get("bytes"))
        if g and min(_thumb_gap(g, o) for o in own) < 12:
            continue                      # the question already prints this one
        kept.append(f)
    return kept


def _thumb(data, n: int = 32):
    """A picture reduced to n x n grey values, stretched to full contrast."""
    from io import BytesIO
    if not data:
        return None
    try:
        from PIL import Image
        im = Image.open(BytesIO(data)).convert("L").resize((n, n), Image.LANCZOS)
    except Exception:
        return None
    px = list(im.getdata())
    lo, hi = min(px), max(px)
    span = max(hi - lo, 1)
    return [(v - lo) * 255 // span for v in px]


def _thumb_gap(a, b) -> float:
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


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
_SQUASHED_LABEL = re.compile(r"\(([a-h])(i|ii|iii|iv|v)\)")


def _letter_labels(answer: str, has_parts: bool) -> str:
    """An answer keyed (i) (ii) beside parts printed (a) (b) is renumbered to match.

    Schools label the same question both ways and the bank keeps whichever the
    paper used, so a sheet can end up printing "(a)" over an answer that says
    "(i)".  Only a label opening the string or a clause is touched.

    A two-level label the bank squashed into one bracket -- "(ai)", "(aii)" --
    is opened out to the "(a)(i)" the question itself prints (15 Sep 2026, HCI
    2025 INSPIRATION on the JC2 P&C manual).
    """
    answer = _SQUASHED_LABEL.sub(lambda m: f"({m.group(1)})({m.group(2)})",
                                 answer or "")
    if not has_parts or "(i)" not in answer:
        return answer
    return _ROMAN_LABEL.sub(lambda m: f"{m.group(1)}({_ROMAN[m.group(2)]})", answer)


def fig_cm(px, cap_w: float = 10.5, cap_h: float = 8.0) -> float:
    """The width to place a stored figure at, in cm.

    A bank figure is never upscaled, and -- because a tall narrow sketch placed
    at full width swallows a whole page -- it is also held to a maximum HEIGHT,
    which for a tall picture is what decides the width.
    """
    w_px, h_px = (px or (0, 0))[0] or 600, (px or (0, 0))[1] or 0
    w = min(cap_w, max(6.0, w_px / 96 * 2.54))
    if h_px:
        h = w * h_px / w_px
        if h > cap_h:
            w *= cap_h / h
    return round(w, 2)


def place_figures(ws, row, figdir: Path, side_by_side: bool = False,
                  cap_w: float = 10.5, cap_h: float = 8.0):
    """Every stored figure for one question, between its stem and its parts."""
    if figdir is None:
        return
    shots = []
    for j, f in enumerate(row.get("_figures") or []):
        fp = _normalise(f, figdir/f"{row['id'][:8]}_{j}")
        if fp is None:
            print(f"  !! figure unreadable, question kept without it: {row['id'][:8]}")
            continue
        shots.append((fp, f.get("px")))
    if side_by_side and len(shots) > 1:
        w = round(16.0/len(shots), 2)
        ws.columns([[('figure', str(fp), fig_cm(px, w - 0.7, cap_h))]
                    for fp, px in shots], [w]*len(shots))
        return
    for fp, px in shots:
        ws.figure(str(fp), width_cm=fig_cm(px, cap_w, cap_h))


_part_fig_n = 0


def _part_figure(ws, part, figdir: Path, cap_w: float, cap_h: float):
    """A figure the paper printed beside this part alone."""
    global _part_fig_n
    if figdir is None:
        return
    for f in (part.get("_figures") or []):
        _part_fig_n += 1
        fp = _normalise(f, figdir/f"part_{_part_fig_n}")
        if fp is None:
            print("  !! part figure unreadable, part kept without it")
            continue
        ws.figure(str(fp), width_cm=fig_cm(f.get("px"), cap_w, cap_h))


_TRAILING_MARKS = re.compile(r"\s*\[\s*\d{1,2}\s*\]?\s*$")


def strip_marks(text):
    """Drop a marks tag the bank left INSIDE a part's own text.

    Most rows keep the marks in `marks`/`total_marks` and the sheet prints them
    right-aligned in their own column.  Some rows also carry a literal "[2]" at
    the end of the part text, so the part printed its marks twice (15 Sep 2026,
    Fairfield Methodist 2023 P2 Q8 on the graph-paper sheet).  The closing
    bracket is optional because an extractor sometimes stops mid-tag -- HCI
    2025's INSPIRATION part (a)(i) ends "there are no restrictions, [1" (15 Sep
    2026, the JC2 P&C manual).  Only a tag at the very end is dropped, and maths
    is always inside `$ $`, so a real expression is never touched.
    """
    return _TRAILING_MARKS.sub("", text or "")


def render_parts(ws, parts, roman_level: int = 2, figdir: Path = None,
                 cap_w: float = 10.5, cap_h: float = 8.0):
    """A question's sub-parts, and the (i) (ii) under a part that has them.

    A bank row keeps a two-level question as parts[].subparts[]. Printing only
    the parts leaves a lead-in -- "(a) The sketch shows the graph of y = ka^x"
    -- with nothing under it to do, so the roman sub-parts are printed as their
    own real Word list, one step further in. The lead-in then drops its marks,
    because the sub-parts carry them and a paper prints each figure once.

    `roman_level` is 2 under a numbered practice question, whose (a) already
    sits one tab in, and 1 under an Example, whose (a) sits at the margin.
    """
    for p in parts:
        if not isinstance(p, dict):
            continue                       # a hole the extractor left in parts[]
        subs = [s for s in (p.get("subparts") or []) if isinstance(s, dict)]
        ws.SQ(R.split_math(strip_marks((p.get("text") or "").strip())),
              marks=None if subs else p.get("marks"))
        _part_figure(ws, p, figdir, cap_w, cap_h)
        if subs:
            # the lead-in and the first (i) under it are the same part, and a
            # part is never cut across two pages -- a row whose lead-in text is
            # empty would otherwise leave a bare "(d)" at the foot of a page
            ws.keep_with_next()
        for j, s in enumerate(subs):
            ws.numbered(R.split_math(strip_marks((s.get("text") or "").strip())),
                        level=roman_level, fmt='roman', restart=(j == 0),
                        marks=s.get("marks"))


_MD_ROW = re.compile(r"^\s*\|.*\|\s*$")
_MD_RULE = re.compile(r"^[\s:\-]+$")
_ARRAY = re.compile(r"\$\$\s*\\begin\{array\}\{[^}]*\}(.*?)\\end\{array\}\s*\$\$",
                    re.S)


def _md_cells(line):
    """The cells of one markdown table row, outer pipes dropped."""
    return [c.strip() for c in line.strip().strip("|").split("|")]


def stem_blocks(stem):
    """Split a question stem into prose and TABLES OF VALUES.

    The bank stores a table of corresponding values two ways -- a markdown pipe
    table, and a LaTeX `\begin{array}` inside `$$ $$`. Left alone, the first
    reaches the page as literal pipe characters and the second as a grid with no
    rules, so both are pulled out here and handed to `ws.data_table`, which draws
    a real table (15 Sep 2026).

    Returns a list of ('text', str) and ('table', rows) blocks in the order they
    appear, where a row is a list of cells and a cell is a parts list.
    """
    blocks, buf = [], []

    def flush():
        text = "\n".join(buf).strip()
        buf.clear()
        if text:
            blocks.append(("text", text))

    # the LaTeX arrays first -- they can sit inside a line of prose
    pos = 0
    pieces = []
    for m in _ARRAY.finditer(stem):
        pieces.append(("text", stem[pos:m.start()]))
        body = m.group(1).replace(r"\hline", " ")
        rows = []
        for line in body.split(r"\\"):
            cells = [c.strip() for c in line.split("&")]
            if any(cells):
                rows.append([[('math', c)] if c else [] for c in cells])
        if rows:
            pieces.append(("table", rows))
        pos = m.end()
    pieces.append(("text", stem[pos:]))

    for kind, payload in pieces:
        if kind == "table":
            flush()
            blocks.append(("table", payload))
            continue
        for line in payload.split("\n"):
            if _MD_ROW.match(line):
                cells = _md_cells(line)
                if all(_MD_RULE.match(c or "-") for c in cells):
                    continue          # the |---|---| rule row
                if blocks and blocks[-1][0] == "table" and not buf:
                    blocks[-1][1].append([R.split_math(c) if c else []
                                          for c in cells])
                else:
                    flush()
                    blocks.append(("table",
                                   [[R.split_math(c) if c else []
                                     for c in cells]]))
            else:
                buf.append(line)
        flush()
    return [b for b in blocks if b[0] == "table" or b[1].strip()]


def render_stem(ws, stem, marks=None, numbered=True, figure_next=False):
    """Print a question stem, its tables of values drawn as real tables.

    `figure_next`: a figure prints between this stem and the parts, so an empty
    stem keeps its bare number line above the figure."""
    blocks = stem_blocks(stem)
    # the marks belong on the LAST line of prose, so they sit at the foot of the
    # question rather than above a table
    last_text = max((i for i, b in enumerate(blocks) if b[0] == "text"),
                    default=-1)
    first = numbered
    if numbered and not blocks and not figure_next:
        # no stem at all: the first part rides the number's line, "1.  (a) Find ..."
        # (Adrian, 17 Sep 2026, on the S4 AM Circles sheet: "questions should be
        # level horizontally with the question number"). Q([]) is the library's
        # stemless form; Q([('text', '')]) printed a bare "1." over the parts.
        ws.Q([])
        return
    if numbered and (not blocks or blocks[0][0] == "table"):
        ws.Q([('text', '')])    # the question number, then its table
        first = False
    for i, (kind, payload) in enumerate(blocks):
        if kind == "table":
            ws.data_table(payload)
            continue
        m = marks if i == last_text else None
        payload = strip_marks(payload)
        if first:
            ws.Q(R.split_math(payload), marks=m)
            first = False
        else:
            ws.para(R.split_math(payload), marks=m)


def render_practice(ws, by_id: dict, ids: list, figdir: Path = None,
                    side_by_side: bool = False, cap_w: float = 10.5,
                    cap_h: float = 8.0, answers: dict = None,
                    stems: dict = None, part_texts: dict = None) -> int:
    """Lay out the practice half from live bank rows.

    Questions are rendered from the database rather than transcribed, so a stem
    or an answer key here cannot drift from what the bank actually holds.

    `answers` is the one exception: {question id: the answer to print} for a row
    whose stored key is WRONG.  A worksheet may not go out carrying an answer
    the question's own figure contradicts, and a build script may not quietly
    write to the production bank either, so the correction is made here, in the
    open, and printed at build time for Adrian to carry back to the bank.
    Every override needs a comment at its call site saying what is wrong.

    `stems` is the same channel for the QUESTION rather than the key:
    {question id: the stem to print} for a row whose stored `question_text`
    carries something a student may not see -- an answer written under the
    table, a part label the parts list repeats.  Same discipline: a comment at
    the call site, and both the stored stem and the printed one at build time.

    `part_texts` is that channel one level down: {question id: {part label: the
    text to print}} for a row whose PART the extraction mangled -- a line that
    landed after the marks instead of before them, markdown the renderer shows
    raw, a Cyrillic letter standing in for a Latin one.  Same discipline again
    (15 Sep 2026, NJC 2025 Q7(b) on the JC2 P&C manual).
    """
    n = 0
    for qid in ids:
        r = by_id.get(qid)
        if r is None:
            print(f"  !! not in pool, skipped: {qid}")
            continue
        n += 1
        stem = (r.get("question_text") or "").strip()
        if stems and qid in stems:
            print(f"  ** stem OVERRIDDEN (bank stem is unusable): {qid[:8]}")
            print(f"     bank: {stem[:90]}...")
            print(f"     used: {stems[qid][:90]}...")
            stem = stems[qid].strip()
        parts = [p for p in (r.get("parts") or []) if isinstance(p, dict)]
        for lab, text in ((part_texts or {}).get(qid) or {}).items():
            for i, p in enumerate(parts):
                if (p.get("label") or "").strip("() ") == lab:
                    print(f"  ** part ({lab}) OVERRIDDEN "
                          f"(bank part is unusable): {qid[:8]}")
                    print(f"     bank: {(p.get('text') or '')[:90]}...")
                    print(f"     used: {text[:90]}...")
                    parts[i] = dict(p, text=text)
                    break
            else:
                print(f"  !! part ({lab}) override found no such part: "
                      f"{qid[:8]}")
        # a bank row holding ONE part under an empty stem is not a question with
        # sub-parts -- it is the question itself, so it loses the "(a)" label
        if len(parts) == 1 and not stem:
            stem = (parts[0].get("text") or "").strip()
            marks = parts[0].get("marks") or r.get("total_marks")
            parts = []
        else:
            marks = None if parts else r.get("total_marks")
        has_parts = bool(parts)
        # an answer keyed (i) (ii) is only renumbered when the printed labels
        # really are (a) (b); a question that prints (a)(i) keeps its own keys
        flat_parts = has_parts and not any(p.get("subparts") for p in parts)
        render_stem(ws, stem, marks=marks, figure_next=bool(figdir and r.get("_figures")))

        # figure between the stem and the sub-parts, as in Adrian's own sheets
        place_figures(ws, r, figdir, side_by_side, cap_w, cap_h)

        if has_parts:
            render_parts(ws, parts, figdir=figdir, cap_w=cap_w, cap_h=cap_h)
        key = (r.get("answer") or "").strip()
        if answers and qid in answers:
            print(f"  ** answer OVERRIDDEN (bank key is wrong): {qid[:8]}")
            print(f"     bank: {key}")
            print(f"     used: {answers[qid]}")
            key = answers[qid]
        ws.ans(R.split_math(_letter_labels(key, flat_parts)))
    return n


def save(ws, level_folder: str, filename: str):
    out = DBX/"Revision"/level_folder/filename
    ws.save(str(out))
    print(f"saved: {out}")
    return out
