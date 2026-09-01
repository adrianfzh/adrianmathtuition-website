#!/usr/bin/env python3
"""
revision_lib.py — build Adrian's revision worksheets.

Two kinds of sheet, both assembled the same way: CLONE a base .docx byte-for-byte
and append a fresh "Practice" section into its word/document.xml before <w:sectPr>.

  kind=notes   base = a notes-bank formula fragment
               ~/…/AdrianMathNotes/notes_bank/{S3_AM,S4_AM,S3_EM,S4_EM}/<Topic>.docx
  kind=worked  base = an existing worked-examples revision sheet
               ~/…/AdrianMathNotes/Revision/<AM|EM|S1|S2|JC|AM G2|EM G2>/…docx

Cloning (rather than rebuilding) is deliberate: Adrian's styles, numbering,
images, headers/footers and native OMML survive untouched. The appended
paragraphs therefore use INLINE run/paragraph properties only — never a
style-id or numId reference that could collide with the base document.

Equation rendering is NOT reimplemented here: LaTeX -> OMML goes through
worksheet_lib._latex_to_omml (the create-worksheet skill), same pandoc pipeline,
same house style. This module only adds a batched fast path over it.

CLI
    python3 revision_lib.py --kind notes  --bank S4_AM --topic "Binomial Theorem" -n 8
    python3 revision_lib.py --kind worked --folder AM  --topic "Binomial Theorem" -n 8
    python3 revision_lib.py --kind notes  --bank S4_AM --topic "Integration (Applications)"
    python3 revision_lib.py --kind notes  --bank S4_AM --fragment "Calculus Applications (All)" \
                            --practice-topic "Integration (Area)"

Run with --dry-run to resolve the base + pick questions without writing a file.
"""

from __future__ import annotations

import argparse
import copy
import difflib
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from lxml import etree

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

DROPBOX = Path.home() / "Library/CloudStorage/Dropbox/Apps/AdrianMathNotes"
REVISION_ROOT = DROPBOX / "Revision"
# The two kinds print to two different kiosk buttons, so they go to two folders:
# worked → Revision/<folder> (kiosk "Revise"), notes → Practice/<folder> (kiosk
# "Practice"). Both were writing into Revision/ until 2026-08-11, which put the
# summary+questions sheets in the worked-examples pile.
PRACTICE_ROOT = DROPBOX / "Practice"
# Fallback only (explicit --base with no bank/folder to place it beside).
DEFAULT_OUT_DIR = Path.home() / "Desktop"

BANKS = ["S3_AM", "S4_AM", "S3_EM", "S4_EM"]
WORKED_FOLDERS = ["AM", "EM", "S1", "S2", "JC", "AM G2", "EM G2"]

# Finished worksheets land in Revision/<folder>: a notes bank has no folder of
# its own, so S3/S4 of a subject share one.
BANK_OUT_FOLDER = {"S4_AM": "AM", "S3_AM": "AM", "S4_EM": "EM", "S3_EM": "EM"}


def bank_dir(bank: str) -> Path:
    """Where a notes bank's fragments live.

    Moved 2026-08-12 from a single top-level `notes_bank/` to one bank folder
    per practice folder, so the fragments sit beside the sheets they feed:

        Practice/AM/notes_bank/{S3_AM,S4_AM}
        Practice/EM/notes_bank/{S3_EM,S4_EM}

    Adrian: "put the notes_bank into the corresponding practice folders and
    their corresponding levels themselves, so it's easy to manage."

    The bank keeps its `S3_`/`S4_` folder name rather than collapsing to
    `S3`/`S4`: it stays self-describing if a folder is ever copied elsewhere in
    Dropbox, and it still matches the `--bank` value typed on the command line.

    Safe to nest under Practice/ because every base scan uses a NON-recursive
    `glob("*.docx")` — a recursive scan would pick the fragments up as bases and
    clone a formula sheet as if it were a worksheet.
    """
    folder = BANK_OUT_FOLDER.get(bank)
    if folder is None:
        raise ResolutionError(
            "Unknown bank %r (banks: %s)" % (bank, ", ".join(BANKS)))
    return PRACTICE_ROOT / folder / "notes_bank" / bank

# …which means this skill's own output sits in the folder it later scans for
# BASES. Without this filter, a second run clones the first run's worksheet and
# the Practice section compounds. Adrian's real sheets are "3 REV AM … (With
# Worked Examples)" / "O REV 08 …"; ours are exactly "REV <label> <topic>
# (Notes|Worked Examples)" — see default_out_path.
GENERATED_RE = re.compile(r"^REV .+\((?:Notes|Worked Examples)\)$")


def _is_generated(stem: str) -> bool:
    return bool(GENERATED_RE.match(stem))

# bank -> (primary questions.level, top-up level or None)
BANK_LEVELS = {
    "S4_AM": ("AM", None),
    "S3_AM": ("S3_AM", "AM"),
    "S4_EM": ("EM", None),
    "S3_EM": ("S3_EM", "EM"),
}
# Bank -> the level line Adrian puts at the top of his own worked sheets.
# A notes fragment has no title of its own (it opens straight on the topic name),
# so kind=notes builds this block to match them — Adrian, 2026-08-06.
# ── Syllabus order: which topics a Sec 3 student has been taught ─────────────
# Adrian, 2026-08-12: "For Sec 3 practice/revision worksheets, should not put
# other topics that they may not have learnt before. Okay for Sec 4 worksheets."
#
# A past-paper question carries EVERY topic it touches, so a question tagged
# ['Nature of Roots', 'Polynomials'] is a legitimate Nature-of-Roots question
# that a Sec 3 class cannot yet attempt. Matching on the requested topic alone
# lets it through; this map is what lets the picker see the second tag.
#
# Numbers are Adrian's own teaching order, taken from the filenames in
# Dropbox/Apps/AdrianMathNotes/Notes/AM (01 Quadratic Functions .. 31 Plane
# Geometry). Sec 3 runs to 20 (Applications of Trigonometry); Sec 4 picks up at
# 21 (Differentiation) and has the whole syllabus available.
AM_TOPIC_ORDER = {
    "Quadratic Functions": 1,
    "Simultaneous Equations": 2,
    "Quadratic Inequalities": 3,
    "Nature of Roots": 4,
    "Polynomials": 5,
    "Partial Fractions": 6,
    "Surds": 7,
    "Indices": 8,
    "Logarithms": 9,
    "Logarithmic and Exponential Functions": 9,
    "Power Graphs": 10,
    "Graphs of Functions": 10,
    "Coordinate Geometry": 11,
    "Circles": 12,
    "Binomial Theorem": 13,
    "Linear Law": 14,
    "Trigonometry (Ratios)": 15,
    "Trigonometry (Graphs)": 16,
    "Trigonometry (Identities)": 17,
    "Trigonometry (Equations)": 18,
    "Trigonometry (R-Formula)": 19,
    "Trigonometry (Applications)": 20,
    # ── Sec 4 from here ──
    "Differentiation (Techniques)": 21,
    "Differentiation (Tangents and Normals)": 22,
    "Differentiation (Increasing and Decreasing Functions)": 23,
    "Differentiation (Rates of Change)": 24,
    "Differentiation (Maximum and Minimum)": 25,
    "Differentiation (Product/Quotient/Chain Rule)": 26,
    "Differentiation (Trigonometric)": 26,
    "Differentiation (Logarithmic and Exponential)": 26,
    "Integration (Techniques)": 28,
    "Integration (Indefinite)": 28,
    "Integration (Area)": 29,
    "Integration (Definite Integrals)": 29,
    "Integration (Definite)": 29,
    "Integration (Applications)": 29,
    "Kinematics": 30,
    "Plane Geometry": 31,
}
# Deliberately NOT mapped, and both would do harm if they were:
#
#   "Proof"  — a KIND marker, not a syllabus position. Of 109 AM proof questions,
#              91 also carry "Plane Geometry" (so they are already caught by that
#              tag) and 15 carry a Trigonometry topic. Mapping Proof to 31 would
#              have blocked those 15 trig proofs from Sec 3 sheets while adding
#              nothing — the plane-geometry ones were covered either way.
#   "Modulus Functions", "Mensuration" — absent from Notes/AM, so there is no
#              teaching position to read off. The map mirrors that folder; a tag
#              it does not define is left to fail open.


# Last topic number taught, per notes bank. A bank absent from this map is never
# narrowed — EM's order is not yet established, and every Sec 4 bank has the
# whole syllabus by definition.
BANK_TOPIC_CAP = {
    "S3_AM": 20,
}


def out_of_scope(row, cap: int | None) -> str | None:
    """The topic that puts this question beyond what the class has been taught,
    or None when it is safe to use.

    Fails OPEN: a topic missing from AM_TOPIC_ORDER is allowed through. A new or
    renamed tag should not silently empty a worksheet, and the map is a hand-kept
    mirror of Adrian's notes folder rather than anything the DB guarantees.
    """
    if cap is None:
        return None
    for t in (row.get("topics") or []):
        n = AM_TOPIC_ORDER.get((t or "").strip())
        if n is not None and n > cap:
            return t
    return None


BANK_TITLES = {
    "S3_AM": "Sec 3 Additional Math",
    "S4_AM": "Sec 4 Additional Math",
    "S3_EM": "Sec 3 Elementary Math",
    "S4_EM": "Sec 4 Elementary Math",
}
# worked-sheet folder -> (primary level, top-up level or None)
FOLDER_LEVELS = {
    "AM": ("AM", None),
    "EM": ("EM", None),
    "S1": ("S1", None),
    "S2": ("S2", None),
    "JC": ("JC2", "JC1"),  # bank has no bare 'JC' level; JC2 = full H2, JC1 tops up pure-math topics
    "AM G2": ("AM", None),
    "EM G2": ("EM", None),
}

# --------------------------------------------------------------------------
# Sheet shape (Adrian's four rules, 2026-08-11)
# --------------------------------------------------------------------------

# A revision sheet is a SITTING, not a paper. 1.5 min/mark is the O-Level and
# H2 rate (EM P1: 80 marks in 2 h; AM P1: 80 in 2 h), so the 45-60 min sitting
# Adrian wants is 30-40 marks. The bands are advisory — the run report prints
# where the sheet landed and warns when it is outside; it never refuses.
MINUTES_PER_MARK = 1.5
SIZE_BAND_Q = (8, 14)           # questions
SIZE_BAND_MIN = (45, 60)        # estimated working minutes

# --------------------------------------------------------------------------
# House style (mirrors create-worksheet/worksheet_lib.py)
# --------------------------------------------------------------------------

FONT = "Times New Roman"
MATH_FONT = "Cambria Math"   # glyph font inside OMML; Word's own default
SZ_BODY = 19        # half-points -> 9.5 pt
# The "Practice" heading is ours, not the base's, so it follows the body: TNR
# bold 9.5, no colour. A big navy heading looked like a different document
# grafted onto Adrian's sheet.
SZ_HEAD = SZ_BODY
# The title block is the ONE place we depart from 9.5 pt, because it is copied
# glyph-for-glyph off Adrian's worked sheets: level line 9.5 bold, topic 11 bold,
# "Notes:" 10 bold underlined. It is written after the house-style pass for that
# reason — the normaliser would otherwise pull it back to 9.5.
SZ_TITLE = 22       # 11 pt
SZ_SECTION = 20     # 10 pt
COLOR_ORANGE = "843C0C"
LINE_15 = "360"     # 1.5 line spacing, w:lineRule="auto"
# Inside a worked-solution box the 1.5 that makes the question section readable
# is just height: nobody writes in a solution box, and Adrian asked for the
# examples to stop spilling onto a second page (2026-08-06). 1.15 is not an
# invented value — it is the tighter spacing HE already uses elsewhere on the
# same sheet, so it is known-readable, and it takes ~23 % off every box.
LINE_TABLE = "276"  # 1.15, for paragraphs inside tables
IND_Q_LEFT, IND_Q_HANG = 567, 567       # 1 cm
IND_SQ_LEFT, IND_SQ_HANG = 1134, 567    # 2 cm / 1 cm
# [n] is RIGHT-ALIGNED on a tab stop at 15.5 cm — Adrian's house position, set
# explicitly 2026-08-06 ("tab stops should be 15.5"). The text column is 16 cm
# (A4 less 2.5 cm margins), so every practice paragraph also carries a 0.5 cm
# RIGHT INDENT: that pulls the wrap width in to 15.5 cm, exactly where the mark
# lands, so a long question can never run under [n] and strand it on the next
# line — the failure mode of the first version, which tabbed to the 16 cm
# margin with no reserved gutter.
MARKS_TAB_POS = 8788                    # 15.5 cm in twips (15.5 x 567)
MARKS_RIGHT_IND = 283                   # 0.5 cm gutter: wrap width == tab stop
# A tab stop at or past this point in the CLONED base is one of Adrian's own
# right-margin stops (his sheets use 16 cm); _normalize_house_style pulls it
# back to MARKS_TAB_POS so base and appended practice line up.
FAR_TAB_MIN = 8000                      # 14.1 cm
TEXT_WIDTH = 9072                       # 16 cm: A4 less 2 x 2.5 cm margins

# Page setup forced onto the OUTPUT regardless of what the base carries: the
# notes fragments inherit formula-sheet layouts (wide/narrow margins, sometimes
# landscape) and a revision worksheet has to print consistently.
PG_MAR = {"top": 1134, "bottom": 567, "left": 1417, "right": 1417}   # 2 / 1 / 2.5 / 2.5 cm
PG_A4 = (11906, 16838)                  # A4 portrait, twips

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"


def w(tag: str) -> str:
    return "{%s}%s" % (W_NS, tag)


# --------------------------------------------------------------------------
# worksheet_lib import (equation rendering is reused, never reimplemented)
# --------------------------------------------------------------------------

def _import_worksheet_lib():
    try:
        import worksheet_lib  # noqa: F401
        return worksheet_lib
    except ImportError:
        pass
    here = Path(__file__).resolve().parent
    candidates = [
        here / "worksheet_lib.py",
        here.parent / "create-worksheet" / "worksheet_lib.py",
        Path.home() / ".claude/skills/create-worksheet/worksheet_lib.py",
        Path("/mnt/skills/user/create-worksheet/worksheet_lib.py"),
    ]
    for c in candidates:
        if c.exists():
            sys.path.insert(0, str(c.parent))
            import worksheet_lib  # noqa: F401
            return worksheet_lib
    raise ImportError(
        "worksheet_lib.py not found (searched: %s). revision-worksheet reuses the "
        "create-worksheet skill's OMML converter; copy worksheet_lib.py next to "
        "revision_lib.py or keep the create-worksheet skill installed."
        % ", ".join(str(c) for c in candidates)
    )


_WSLIB = None


def wslib():
    global _WSLIB
    if _WSLIB is None:
        _WSLIB = _import_worksheet_lib()
    return _WSLIB


# --------------------------------------------------------------------------
# .env.local  (dotenv-ESCAPED — never grep/sed it; see CLAUDE.md gotcha)
# --------------------------------------------------------------------------

def load_env(repo_root: Path | None = None) -> dict:
    """Parse the website repo's .env.local with a real dotenv parser.

    Values are stored escaped and carry trailing newlines; every value is
    whitespace-stripped and any literal ``\\n`` tail removed.
    """
    roots = []
    if repo_root:
        roots.append(Path(repo_root))
    roots += [
        Path.cwd(),
        Path.home() / "dev/adrianmathtuition-website",
        Path(__file__).resolve().parents[3],  # <repo>/.claude/skills/<skill>/
    ]
    env_path = None
    for r in roots:
        p = Path(r) / ".env.local"
        if p.exists():
            env_path = p
            break
    if env_path is None:
        raise FileNotFoundError(
            ".env.local not found (looked in: %s)" % ", ".join(str(r) for r in roots)
        )

    raw = env_path.read_text(encoding="utf-8")
    try:
        from dotenv import dotenv_values  # type: ignore
        vals = dict(dotenv_values(str(env_path)))
    except ImportError:
        vals = _parse_dotenv(raw)

    clean = {}
    for k, v in vals.items():
        if v is None:
            continue
        v = v.strip()
        while v.endswith("\\n") or v.endswith("\\r"):
            v = v[:-2].strip()
        clean[k] = v.strip()
    clean["__path__"] = str(env_path)
    return clean


def _parse_dotenv(raw: str) -> dict:
    """Minimal dotenv fallback (quotes, escapes, export prefix, comments)."""
    out = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            quote = v[0]
            v = v[1:-1]
            if quote == '"':
                v = v.replace("\\n", "\n").replace("\\r", "\r").replace('\\"', '"')
        else:
            v = v.split(" #", 1)[0].strip()
        out[k] = v
    return out


def supabase_creds(env: dict) -> tuple[str, str]:
    url = env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL")
    key = (env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SECRET_KEY")
           or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
    if not url or not key:
        raise RuntimeError("Supabase URL/key missing from %s" % env.get("__path__"))
    return url.rstrip("/"), key


# --------------------------------------------------------------------------
# Fuzzy name matching
# --------------------------------------------------------------------------

_PUNCT = re.compile(r"[^\w\s]")
_WS = re.compile(r"\s+")


def norm(s: str) -> str:
    """Case / punctuation / bracket-insensitive key for a topic or filename."""
    s = unicodedata.normalize("NFKD", str(s))
    s = s.replace("&", " and ")
    s = _PUNCT.sub(" ", s.lower())
    return _WS.sub(" ", s).strip()


def norm_nogroup(s: str) -> str:
    """norm() with a trailing 'all' group marker dropped."""
    n = norm(s)
    return re.sub(r"\s*\ball\b\s*$", "", n).strip()


def tokens(s: str) -> set:
    return set(norm(s).split())


def ratio(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


def closest(name: str, pool: list, k: int = 5) -> list:
    """Top-k closest entries from pool (list of display names)."""
    key = norm(name)
    scored = sorted(pool, key=lambda p: -ratio(key, norm(p)))
    return scored[:k]


# --------------------------------------------------------------------------
# Notes-bank fragment resolution
# --------------------------------------------------------------------------

class ResolutionError(RuntimeError):
    def __init__(self, message, candidates=None, elsewhere=None):
        super().__init__(message)
        self.candidates = candidates or []
        self.elsewhere = elsewhere or []


@dataclass
class Resolved:
    path: Path
    name: str          # display name (filename without .docx)
    how: str           # exact | fuzzy | grouped | explicit
    detail: str = ""   # human note, e.g. which group file matched


# Head words that live under a shared "(All)" grid on the formula sheets.
# These are HINTS ONLY — the filenames on disk are the registry. A hint that
# has no matching file is simply skipped.
GROUP_HINTS = {
    "differentiation": ["Calculus", "Calculus Techniques", "Calculus Applications"],
    "integration": ["Calculus", "Calculus Techniques", "Calculus Applications"],
    "kinematics": ["Calculus Applications", "Calculus"],
    "trigonometry": ["Trigonometry"],
    "trig": ["Trigonometry"],
    "plane": ["Plane Geometry"],
    "circle": ["Circle Properties", "Plane Geometry"],
    "congruency": ["Plane Geometry"],
    "similarity": ["Plane Geometry"],
    "distance": ["Distance and Speed Time Graphs"],
    "shape": ["Shape of Graphs"],
}
# qualifier word -> group suffix, applied on top of the hint bases above
QUALIFIER_HINTS = {
    "techniques": "Techniques",
    "applications": "Applications",
    "area": "Applications",
    "definite integrals": "Applications",
    "tangents and normals": "Applications",
    "maximum and minimum": "Applications",
    "rates of change": "Applications",
    "increasing and decreasing functions": "Applications",
}


def list_fragments(bank: str) -> list:
    d = bank_dir(bank)
    if not d.is_dir():
        raise ResolutionError(
            "Notes bank %r not found at %s (banks: %s)" % (bank, d, ", ".join(BANKS)))
    return sorted(p.stem for p in d.glob("*.docx")
                  if not p.name.startswith("~$") and not _is_generated(p.stem))


def resolve_fragment(bank: str, topic: str) -> Resolved:
    """exact filename -> fuzzy -> grouped '(All)' -> error with 5 closest names."""
    d = bank_dir(bank)
    names = list_fragments(bank)
    by_norm = {norm(n): n for n in names}

    # 1. exact filename
    if topic in names:
        return Resolved(d / f"{topic}.docx", topic, "exact")

    # 2. fuzzy: normalized equality, then containment, then difflib
    key = norm(topic)
    if key in by_norm:
        n = by_norm[key]
        return Resolved(d / f"{n}.docx", n, "fuzzy", "normalized match for %r" % topic)

    key_ng = norm_nogroup(topic)
    for n in names:
        if norm_nogroup(n) == key_ng:
            return Resolved(d / f"{n}.docx", n, "fuzzy", "bracket-insensitive match for %r" % topic)

    best, best_score = None, 0.0
    for n in names:
        s = ratio(key, norm(n))
        if s > best_score:
            best, best_score = n, s
    if best is not None and best_score >= 0.86:
        return Resolved(d / f"{best}.docx", best, "fuzzy",
                        "closest filename (%.2f) for %r" % (best_score, topic))

    # 3. grouped "(All)" fallback
    grouped = _grouped_fallback(d, names, topic)
    if grouped:
        return grouped

    # 4. give up, loudly
    raise ResolutionError(
        "No notes fragment for %r in %s." % (topic, bank),
        candidates=closest(topic, names, 5),
        elsewhere=_found_in_other_banks(bank, topic),
    )


def _grouped_fallback(d: Path, names: list, topic: str) -> Resolved | None:
    all_files = [n for n in names if re.search(r"\(all\)\s*$", n, re.I)]
    if not all_files:
        return None
    by_norm_all = {norm_nogroup(n): n for n in all_files}

    head = re.split(r"[(\[]", topic)[0].strip()
    m = re.search(r"[(\[]([^)\]]+)[)\]]", topic)
    qual = m.group(1).strip() if m else ""

    cands = []
    if head:
        cands.append(head)                                   # "Trigonometry (All)"
        if qual:
            cands.append(f"{head} {qual}")                    # "Integration Applications (All)"
    for base in GROUP_HINTS.get(norm(head).split(" ")[0], []):
        cands.append(base)
        suffix = QUALIFIER_HINTS.get(norm(qual))
        if suffix:
            cands.append(f"{base} {suffix}")                  # "Calculus Applications (All)"
    if qual:
        suffix = QUALIFIER_HINTS.get(norm(qual))
        if suffix and head:
            cands.append(f"{head} {suffix}")

    seen = set()
    for c in cands:
        k = norm_nogroup(c)
        if not k or k in seen:
            continue
        seen.add(k)
        if k in by_norm_all:
            n = by_norm_all[k]
            return Resolved((d / f"{n}.docx"), n, "grouped",
                            "%r has no fragment of its own; it lives inside the grouped sheet %r"
                            % (topic, n))

    # last resort inside the group files: token overlap
    t = tokens(topic)
    scored = []
    for n in all_files:
        nt = tokens(n) - {"all"}
        if not nt:
            continue
        overlap = len(t & nt) / len(nt)
        scored.append((overlap, ratio(norm(topic), norm_nogroup(n)), n))
    scored.sort(reverse=True)
    if scored and (scored[0][0] >= 0.5 or scored[0][1] >= 0.8):
        n = scored[0][2]
        return Resolved((d / f"{n}.docx"), n, "grouped",
                        "%r matched the grouped sheet %r on topic words" % (topic, n))
    return None


def _found_in_other_banks(bank: str, topic: str) -> list:
    out = []
    for b in BANKS:
        if b == bank:
            continue
        try:
            names = list_fragments(b)
        except ResolutionError:
            continue
        for n in names:
            if norm(n) == norm(topic) or norm_nogroup(n) == norm_nogroup(topic):
                out.append(f"{b}/{n}.docx")
    return out


# --------------------------------------------------------------------------
# Worked-examples sheet resolution
# --------------------------------------------------------------------------

_WORKED_NOISE = re.compile(
    r"\b(rev|revision|n level|o level|jc1|jc2|am|em|jc|s1|s2|g2|copy|amended|amending|"
    r"with worked examples|wtih worked examples|with examples|just examples|practice|"
    r"without graphs|optional|version|all topics|overall)\b", re.I)


def _worked_key(filename_stem: str) -> str:
    s = filename_stem
    s = re.sub(r"\([^)]*\)", " ", s)          # drop bracketed decoration
    s = _WORKED_NOISE.sub(" ", s)
    s = re.sub(r"\b\d+[a-z]?\b", " ", s)      # ordering numbers: "3", "01", "2a"
    return norm(s)


def list_worked(folder: str) -> list:
    d = REVISION_ROOT / folder
    if not d.is_dir():
        raise ResolutionError(
            "Revision folder %r not found at %s (folders: %s)"
            % (folder, d, ", ".join(WORKED_FOLDERS)))
    return sorted(p.stem for p in d.glob("*.docx")
                  if not p.name.startswith("~$") and not _is_generated(p.stem))


def resolve_worked(folder: str, topic: str) -> Resolved:
    d = REVISION_ROOT / folder
    names = list_worked(folder)
    if not names:
        raise ResolutionError("Revision folder %r has no .docx sheets." % folder, candidates=[])

    if topic in names:
        return Resolved(d / f"{topic}.docx", topic, "exact")

    key = norm(topic)
    scored = []
    for n in names:
        wk = _worked_key(n)
        r = ratio(key, wk)
        t, nt = tokens(topic), set(wk.split())
        contain = 1.0 if (t and t <= nt) else 0.0
        bonus = 0.06 if re.search(r"worked examples", n, re.I) else 0.0
        bonus -= 0.03 * len(re.findall(r"\([^)]*\)", n))   # prefer the least-decorated file
        bonus -= 0.001 * len(n)
        scored.append((contain * 1.0 + r + bonus, contain, r, n))
    scored.sort(reverse=True)
    top = scored[0]
    if top[1] == 1.0 or top[2] >= 0.72:
        alts = [s[3] for s in scored[1:4] if s[1] == 1.0 or s[2] >= 0.72]
        detail = "fuzzy match (score %.2f)" % top[2]
        if alts:
            detail += "; other candidates: " + ", ".join(repr(a) for a in alts)
        return Resolved(d / f"{top[3]}.docx", top[3], "exact" if top[2] > 0.98 else "fuzzy", detail)

    raise ResolutionError(
        "No worked-examples sheet for %r in Revision/%s." % (topic, folder),
        candidates=[s[3] for s in scored[:5]],
    )


# --------------------------------------------------------------------------
# Practice questions — Supabase `questions` via PostgREST
# --------------------------------------------------------------------------

QCOLS = ("id,question_text,answer,parts,total_marks,topics,level,school,year,"
         "exam_type,paper,question_number,difficulty,has_image,verified,"
         "image_url,image_size")

AI_SCHOOL = "ai generated"

# References to a figure/table the row cannot supply (v1 has no verified-figure gate)
FIGURE_REF = re.compile(
    r"(the (diagram|figure|grid|graph|table|sketch)\b)"
    r"|((diagram|figure|grid|table|graph|axes|triangle|circle) (below|above|shown))"
    r"|(shown in the (diagram|figure))|(see (diagram|figure))|(in the figure)"
    r"|(the following (diagram|figure|table))",
    re.I)
MD_TABLE = re.compile(r"^\s*\|.*\|\s*$", re.M)
MD_IMAGE = re.compile(r"!\[[^\]]*\]\(")


def _http_json(url: str, headers: dict):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8")), dict(r.headers)


def fetch_pool(env: dict, level: str, topic, page: int = 1000, cap: int = 4000,
               figures: bool = True) -> list:
    """All non-deleted rows tagged with `topic` at `level`.

    `figures=False` restores the pre-2026-08-12 behaviour: figure questions are
    excluded at the query. By default they are INCLUDED — their stored images
    are embedded into the sheet (see fetch_figures / FigureStore).

    `topic` may be a list, in which case `cs` means "tagged with ALL of them" —
    that is how the linking question (rule 4) is found.

    Paged with a STABLE order (id.asc) — paging without an explicit stable order
    silently drops and duplicates rows.
    """
    base, key = supabase_creds(env)
    headers = {"apikey": key, "Authorization": "Bearer " + key}
    topics = [topic] if isinstance(topic, str) else list(topic)
    topic_filter = urllib.parse.quote("{%s}" % ",".join('"%s"' % t for t in topics), safe="")
    img_filter = "" if figures else "&has_image=is.false"
    rows, offset = [], 0
    while offset < cap:
        url = (f"{base}/rest/v1/questions?select={QCOLS}"
               f"&deleted_at=is.null{img_filter}"
               f"&level=eq.{urllib.parse.quote(level, safe='')}"
               f"&topics=cs.{topic_filter}"
               f"&order=id.asc&offset={offset}&limit={page}")
        batch, _ = _http_json(url, headers)
        if not isinstance(batch, list):
            raise RuntimeError("Supabase error: %s" % json.dumps(batch)[:400])
        rows += batch
        if len(batch) < page:
            break
        offset += page
    return rows


def list_topics(env: dict, level: str) -> list:
    """Distinct topic names present at a level (used for 'did you mean')."""
    base, key = supabase_creds(env)
    headers = {"apikey": key, "Authorization": "Bearer " + key}
    seen, offset = {}, 0
    while offset < 20000:
        url = (f"{base}/rest/v1/questions?select=topics&deleted_at=is.null"
               f"&level=eq.{urllib.parse.quote(level, safe='')}"
               f"&order=id.asc&offset={offset}&limit=1000")
        batch, _ = _http_json(url, headers)
        if not isinstance(batch, list) or not batch:
            break
        for r in batch:
            for t in (r.get("topics") or []):
                seen[t] = seen.get(t, 0) + 1
        if len(batch) < 1000:
            break
        offset += 1000
    return sorted(seen, key=lambda t: -seen[t])


def _parts(row) -> list:
    p = row.get("parts")
    if isinstance(p, str):
        try:
            p = json.loads(p)
        except Exception:
            return []
    return p if isinstance(p, list) else []


def _nonempty(s) -> bool:
    return bool(s and str(s).strip())


_IMG_PUBLIC_PREFIX = re.compile(r"^https?://[^/]+/storage/v1/object/public/", re.I)


def _norm_img_path(v):
    """One image entry → bucket-relative path, or None if unrecognisable."""
    if isinstance(v, dict):
        v = v.get("url") or v.get("path")
    if not isinstance(v, str):
        return None
    return _IMG_PUBLIC_PREFIX.sub("", v.strip()) or None


def _images(row) -> list:
    """Storage paths of the row's question figures.

    `image_url` grew several shapes across extractor generations: a JSON array
    of bucket-relative paths ("question_images/<uuid>.png"), a bare relative
    path, a bare full public-bucket URL, and a JSON array of {url, mm} objects.
    Normalise ALL of them to bucket-relative paths — accepting only the first
    shape silently rejected 287 stored figures as "no stored image file"
    (caught 2026-08-13). Anything unrecognisable counts as no images.
    """
    v = row.get("image_url")
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return []
        try:
            v = json.loads(s)
        except Exception:
            v = [s]  # bare path or bare URL, not JSON
    if isinstance(v, (str, dict)):
        v = [v]
    if not isinstance(v, list):
        return []
    return [p for p in (_norm_img_path(item) for item in v) if p]


def usable(row, figures: bool = True) -> tuple[bool, str]:
    """Quality gate. Returns (ok, reason_if_not).

    With `figures` on (the default since 2026-08-12), a question whose diagram
    is stored in the bank is USABLE — the sheet embeds it. The old exclusions
    remain for rows that NEED a picture we do not have: flagged with no stored
    file, or text that references a figure with nothing behind it.
    """
    parts = _parts(row)
    stem = (row.get("question_text") or "").strip()
    imgs = _images(row) if figures else []

    if row.get("has_image") and not imgs:
        return False, ("figure question (--no-figures)" if not figures
                       else "figure flagged but no stored image file")

    if parts:
        if any(not _nonempty(p.get("text")) for p in parts):
            return False, "a sub-part has no text (incomplete extraction)"
    elif not stem and not imgs:
        return False, "no question text"

    has_ans = _nonempty(row.get("answer")) or any(_nonempty(p.get("answer")) for p in parts)
    if not has_ans:
        return False, "no answer"

    blob = " ".join([stem] + [str(p.get("text") or "") for p in parts])
    if not imgs and FIGURE_REF.search(blob):
        return False, "refers to a figure/table it has no stored image for"
    if MD_TABLE.search(blob) or MD_IMAGE.search(blob):
        return False, "contains a markdown table/image"
    return True, ""


def _tier(row) -> int:
    ai = norm(row.get("school") or "") == AI_SCHOOL
    ver = bool(row.get("verified"))
    if not ai and ver:
        return 0
    if not ai:
        return 1
    return 2 if ver else 3


def _marks_bucket(row) -> str:
    m = row.get("total_marks") or 0
    try:
        m = int(m)
    except Exception:
        m = 0
    if m <= 3:
        return "short"
    if m <= 6:
        return "medium"
    return "long"


def select_questions(pool: list, n: int, seed: int | None = None,
                     allow_ai: bool = True, figures: bool = True) -> tuple[list, dict]:
    """Tiered + diversity-spread selection, no duplicates."""
    rng = random.Random(seed)
    kept, rejected = [], {}
    for r in pool:
        ok, why = usable(r, figures=figures)
        if ok:
            kept.append(r)
        else:
            rejected[why] = rejected.get(why, 0) + 1

    tiers = {0: [], 1: [], 2: [], 3: []}
    for r in kept:
        t = _tier(r)
        if t >= 2 and not allow_ai:
            continue
        tiers[t].append(r)
    for t in tiers:
        rng.shuffle(tiers[t])

    chosen, seen_ids = [], set()
    counts = {"marks": {}, "difficulty": {}, "school": {}}

    def score(r):
        return (counts["marks"].get(_marks_bucket(r), 0) * 2
                + counts["difficulty"].get(r.get("difficulty") or "?", 0)
                + counts["school"].get(r.get("school") or "?", 0) * 3)

    for t in (0, 1, 2, 3):
        avail = [r for r in tiers[t] if r["id"] not in seen_ids]
        while avail and len(chosen) < n:
            avail.sort(key=lambda r: (score(r), rng.random()))
            pick = avail.pop(0)
            chosen.append(pick)
            seen_ids.add(pick["id"])
            counts["marks"][_marks_bucket(pick)] = counts["marks"].get(_marks_bucket(pick), 0) + 1
            d = pick.get("difficulty") or "?"
            counts["difficulty"][d] = counts["difficulty"].get(d, 0) + 1
            s = pick.get("school") or "?"
            counts["school"][s] = counts["school"].get(s, 0) + 1
        if len(chosen) >= n:
            break

    chosen.sort(key=lambda r: (r.get("total_marks") or 0, str(r.get("year") or "")))
    stats = {"pool": len(pool), "usable": len(kept), "rejected": rejected,
             "tiers": {k: len(v) for k, v in tiers.items()}}
    return chosen, stats


def _marks_of(row) -> int:
    try:
        return int(row.get("total_marks") or 0)
    except Exception:
        return 0


def trim_to_minutes(questions: list, minutes: int, floor: int) -> tuple[list, str]:
    """Rule 1 — spend the sitting, then stop.

    Questions arrive sorted ascending by marks, so trimming from the END drops
    the longest first and leaves the ramp intact. `floor` is the number of
    questions below which we stop trimming and warn instead: a 40-mark topic
    should not turn into a 3-question sheet just to hit a clock.
    """
    if not minutes or not questions:
        return questions, ""
    kept = list(questions)
    dropped = 0
    while len(kept) > floor and sum(_marks_of(q) for q in kept) * MINUTES_PER_MARK > minutes:
        kept.pop()
        dropped += 1
    if not dropped:
        return kept, ""
    return kept, ("trimmed %d question(s) to fit a %d min sitting (%d left, %d marks)"
                  % (dropped, minutes, len(kept), sum(_marks_of(q) for q in kept)))


def size_budget(questions: list) -> dict:
    """Rule 1 — is this a sitting or a paper? Advisory, never enforced."""
    marks = sum(_marks_of(q) for q in questions)
    minutes = int(round(marks * MINUTES_PER_MARK))
    warn = []
    if len(questions) < SIZE_BAND_Q[0]:
        warn.append("only %d questions (house band %d-%d)"
                    % (len(questions), *SIZE_BAND_Q))
    elif len(questions) > SIZE_BAND_Q[1]:
        warn.append("%d questions — over the %d-question band; this reads as a paper, not a sitting"
                    % (len(questions), SIZE_BAND_Q[1]))
    if minutes > SIZE_BAND_MIN[1]:
        warn.append("~%d min of working — over the %d min sitting"
                    % (minutes, SIZE_BAND_MIN[1]))
    elif minutes < SIZE_BAND_MIN[0]:
        warn.append("~%d min of working — under the %d min sitting"
                    % (minutes, SIZE_BAND_MIN[0]))
    return {"questions": len(questions), "marks": marks, "minutes": minutes, "warnings": warn}


def _norm_label(raw) -> str:
    """'(a)' / 'a.' / ' A ' all key on 'a'."""
    return re.sub(r"[^a-z0-9]", "", str(raw or "").lower())


def parse_drop_parts(spec: str) -> dict:
    """Rule 3 — '3:a,b; 7:a' -> {3: {'a','b'}, 7: {'a'}} (keys are SHEET numbers)."""
    out = {}
    for chunk in re.split(r"[;\s]+", str(spec or "").strip()):
        if not chunk:
            continue
        if ":" not in chunk:
            raise ValueError("--drop-parts wants 'Q:labels', got %r" % chunk)
        qn, labels = chunk.split(":", 1)
        try:
            q = int(qn.strip())
        except ValueError:
            raise ValueError("--drop-parts question number must be an integer, got %r" % qn)
        got = {_norm_label(l) for l in labels.split(",") if _norm_label(l)}
        if not got:
            raise ValueError("--drop-parts has no labels for question %d" % q)
        out.setdefault(q, set()).update(got)
    return out


def apply_scope(questions: list, drop: dict) -> tuple[list, list]:
    """Rule 3 — take the sub-parts a student has been taught, drop the rest.

    Returns (questions, notes). Rows are COPIED, never mutated in place: the
    same row object can sit in the pool and in another run's report.

    Two things travel with a dropped part and are easy to forget:
      * the marks total, which drives the writing space and the size budget;
      * the answer line. `_answer_parts` prefers a row-level `answer`, which
        covers parts we just removed — so it is cleared when every surviving
        part carries its own answer, and kept (with a loud note) when it is the
        only answer there is.
    """
    if not drop:
        return questions, []
    out, notes = [], []
    for i, row in enumerate(questions, 1):
        wanted = drop.get(i)
        if not wanted:
            out.append(row)
            continue
        parts = _parts(row)
        if not parts:
            notes.append("Q%d has no sub-parts — --drop-parts %s ignored"
                         % (i, ",".join(sorted(wanted))))
            out.append(row)
            continue
        keep = [p for p in parts if _norm_label(p.get("label")) not in wanted]
        gone = [p for p in parts if _norm_label(p.get("label")) in wanted]
        missing = wanted - {_norm_label(p.get("label")) for p in parts}
        if missing:
            notes.append("Q%d has no part(s) %s — its parts are %s"
                         % (i, ", ".join("(%s)" % m for m in sorted(missing)),
                            ", ".join(_label(p.get("label")) for p in parts)))
        if not gone:
            out.append(row)
            continue
        if not keep:
            notes.append("Q%d: dropping %s would leave nothing — question kept whole"
                         % (i, ", ".join(_label(p.get("label")) for p in gone)))
            out.append(row)
            continue
        new = dict(row)
        new["parts"] = keep
        part_marks = [p.get("marks") for p in keep]
        if all(m for m in part_marks):
            new["total_marks"] = sum(int(m) for m in part_marks)
        if _nonempty(row.get("answer")):
            if all(_nonempty(p.get("answer")) for p in keep):
                new["answer"] = ""      # rebuild from the surviving parts
            else:
                notes.append("Q%d: the [Ans: …] line is the whole question's — it still "
                             "answers the dropped part(s). Check it." % i)
        notes.append("Q%d: dropped %s, kept %s"
                     % (i, ", ".join(_label(p.get("label")) for p in gone),
                        ", ".join(_label(p.get("label")) for p in keep)))
        out.append(new)
    return out, notes


# --------------------------------------------------------------------------
# Question figures — fetched from Supabase Storage, embedded as inline drawings
# --------------------------------------------------------------------------
# The bank stores every extracted diagram in the public `question_images`
# bucket (image_url = JSON array of paths, image_size = sm|md|lg print hint).
# The sheet embeds them under the question stem; a question whose figure cannot
# be fetched is SWAPPED for another rather than printed diagram-less.

EMU_PER_CM = 360000
EMU_PER_PX = 9525            # Word assumes 96 dpi for pixel-dimensioned images
FIG_WIDTH_CM = {"sm": 7.0, "md": 10.5, "lg": 14.0}

NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"
NS_R_OD = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS_CT = "http://schemas.openxmlformats.org/package/2006/content-types"


def _png_dims(b: bytes):
    if len(b) > 24 and b[:8] == b"\x89PNG\r\n\x1a\n":
        return int.from_bytes(b[16:20], "big"), int.from_bytes(b[20:24], "big")
    return None


def _jpeg_dims(b: bytes):
    if len(b) < 4 or b[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 9 < len(b):
        if b[i] != 0xFF:
            i += 1
            continue
        marker = b[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                      0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            return (int.from_bytes(b[i + 7:i + 9], "big"),
                    int.from_bytes(b[i + 5:i + 7], "big"))
        i += 2 + int.from_bytes(b[i + 2:i + 4], "big")
    return None


def _img_dims(b: bytes, ext: str):
    return _png_dims(b) if ext == "png" else _jpeg_dims(b)


def fetch_figures(env: dict, rows: list) -> list:
    """Download each row's figures in place (row['_figures']).

    A row ends with `_figures` = list of {bytes, ext, px} on success, [] when it
    has no figures, or None when ANY of its figures failed — half a diagram is
    worse than swapping the question out. Returns human-readable failure notes.
    """
    base, _ = supabase_creds(env)
    notes = []
    for row in rows:
        if row.get("_figures") is not None:
            continue
        paths = _images(row)
        if not paths:
            row["_figures"] = []
            continue
        who = provenance(row) or str(row.get("id"))
        figs = []
        for p in paths:
            ext = (p.rsplit(".", 1)[-1] if "." in p else "png").lower()
            ext = {"jpeg": "jpg"}.get(ext, ext)
            if ext not in ("png", "jpg"):
                notes.append("%s: unsupported figure type .%s" % (who, ext))
                figs = None
                break
            url = "%s/storage/v1/object/public/%s" % (base, urllib.parse.quote(p))
            try:
                with urllib.request.urlopen(urllib.request.Request(url), timeout=30) as r:
                    data = r.read()
            except Exception as e:
                notes.append("%s: figure fetch failed (%s)" % (who, e))
                figs = None
                break
            dims = _img_dims(data, ext)
            if not dims or not dims[0] or not dims[1]:
                notes.append("%s: could not read figure dimensions" % who)
                figs = None
                break
            figs.append({"bytes": data, "ext": ext, "px": dims})
        row["_figures"] = figs
    return notes


class FigureStore:
    """Media the finished docx must carry.

    build_practice adds entries while laying questions out (each add returns the
    relationship id the drawing references); clone_with_practice then writes the
    bytes into word/media/, the relationships into document.xml.rels and the
    content-type defaults — the two halves can never disagree about a name.
    """

    def __init__(self):
        self.entries = []        # {relid, name, bytes, ext}
        self._docpr = 9000       # drawing ids, clear of anything in the base docx

    def add(self, data: bytes, ext: str) -> tuple:
        n = len(self.entries) + 1
        relid = "rIdRevFig%d" % n
        self.entries.append({"relid": relid, "name": "revfig%d.%s" % (n, ext),
                             "bytes": data, "ext": ext})
        self._docpr += 1
        return relid, self._docpr


def _fig_emu(hint, px) -> tuple:
    """Print size in EMU: the image_size hint caps the width; never upscale a
    small scan past its natural 96-dpi size (it would only blur)."""
    w_px, h_px = px
    cap = int(FIG_WIDTH_CM.get(hint or "", FIG_WIDTH_CM["md"]) * EMU_PER_CM)
    cx = min(cap, w_px * EMU_PER_PX)
    return cx, max(1, round(cx * h_px / w_px))


def _figure_para(relid: str, docpr: int, cx: int, cy: int, left: int):
    """One paragraph holding one inline picture at the question's text column.

    Namespaces are declared locally on <wp:inline> — the base document.xml never
    declares the drawingml prefixes on its root, and touching the root risks
    re-serialising every paragraph of Adrian's notes.
    """
    p = _para(left=left, keep_next=True, space_after=120)
    r = etree.SubElement(p, w("r"))
    drawing = etree.SubElement(r, w("drawing"))
    inline = etree.SubElement(drawing, "{%s}inline" % NS_WP,
                              nsmap={"wp": NS_WP, "a": NS_A, "pic": NS_PIC, "r": NS_R_OD})
    for k in ("distT", "distB", "distL", "distR"):
        inline.set(k, "0")
    etree.SubElement(inline, "{%s}extent" % NS_WP, cx=str(cx), cy=str(cy))
    etree.SubElement(inline, "{%s}effectExtent" % NS_WP, l="0", t="0", r="0", b="0")
    etree.SubElement(inline, "{%s}docPr" % NS_WP, id=str(docpr), name="Figure %d" % docpr)
    fr = etree.SubElement(inline, "{%s}cNvGraphicFramePr" % NS_WP)
    etree.SubElement(fr, "{%s}graphicFrameLocks" % NS_A, noChangeAspect="1")
    g = etree.SubElement(inline, "{%s}graphic" % NS_A)
    gd = etree.SubElement(g, "{%s}graphicData" % NS_A, uri=NS_PIC)
    pic = etree.SubElement(gd, "{%s}pic" % NS_PIC)
    nv = etree.SubElement(pic, "{%s}nvPicPr" % NS_PIC)
    etree.SubElement(nv, "{%s}cNvPr" % NS_PIC, id=str(docpr), name="Figure %d" % docpr)
    etree.SubElement(nv, "{%s}cNvPicPr" % NS_PIC)
    bf = etree.SubElement(pic, "{%s}blipFill" % NS_PIC)
    etree.SubElement(bf, "{%s}blip" % NS_A, {"{%s}embed" % NS_R_OD: relid})
    st = etree.SubElement(bf, "{%s}stretch" % NS_A)
    etree.SubElement(st, "{%s}fillRect" % NS_A)
    sp = etree.SubElement(pic, "{%s}spPr" % NS_PIC)
    xf = etree.SubElement(sp, "{%s}xfrm" % NS_A)
    etree.SubElement(xf, "{%s}off" % NS_A, x="0", y="0")
    etree.SubElement(xf, "{%s}ext" % NS_A, cx=str(cx), cy=str(cy))
    pg = etree.SubElement(sp, "{%s}prstGeom" % NS_A, prst="rect")
    etree.SubElement(pg, "{%s}avLst" % NS_A)
    return p


def find_link_question(env: dict, levels: list, topics: list, exclude: set,
                       allow_ai: bool = True, figures: bool = True):
    """Rule 4 — one question tagged with BOTH topics, best tier first.

    Returns (row, level) or (None, None). The bank tags every topic a question
    touches, so "contains both" is exactly the cross-topic question Adrian wants
    as the capstone; there is no need to infer the link from the text.
    """
    best, best_level = None, None
    for lv in levels:
        rows = fetch_pool(env, lv, topics, figures=figures)
        for r in rows:
            if r["id"] in exclude:
                continue
            ok, _ = usable(r, figures=figures)
            if not ok:
                continue
            t = _tier(r)
            if t >= 2 and not allow_ai:
                continue
            if best is None or t < _tier(best):
                best, best_level = r, lv
        if best is not None and _tier(best) == 0:
            break
    return best, best_level


def provenance(row) -> str:
    bits = [str(row.get("school") or "").strip(), str(row.get("year") or "").strip(),
            str(row.get("exam_type") or "").strip()]
    if _nonempty(row.get("paper")):
        bits.append("P%s" % row["paper"])
    if _nonempty(row.get("question_number")):
        bits.append("Q%s" % row["question_number"])
    return " ".join(b for b in bits if b)


# --------------------------------------------------------------------------
# LaTeX splitting + batched OMML conversion
# --------------------------------------------------------------------------

MATH_SPLIT = re.compile(
    r"(?<!\\)\$\$(?P<disp>.+?)(?<!\\)\$\$"
    r"|(?<!\\)\$(?P<inl>.+?)(?<!\\)\$"
    r"|\\\((?P<pi>.+?)\\\)"
    r"|\\\[(?P<pd>.+?)\\\]", re.S)
BOLD_MD = re.compile(r"\*\*(.+?)\*\*", re.S)


def split_math(text: str) -> list:
    """'text with $x^2$' -> [('text', ...), ('math', 'x^2'), ...]"""
    out, pos = [], 0
    text = text or ""
    for m in MATH_SPLIT.finditer(text):
        if m.start() > pos:
            out += _split_bold(text[pos:m.start()])
        expr = m.group("disp") or m.group("inl") or m.group("pi") or m.group("pd")
        display = bool(m.group("disp") or m.group("pd"))
        out.append(("math_display" if display else "math", expr.strip()))
        pos = m.end()
    if pos < len(text):
        out += _split_bold(text[pos:])
    return out


def _split_bold(chunk: str) -> list:
    out, pos = [], 0
    for m in BOLD_MD.finditer(chunk):
        if m.start() > pos:
            out.append(("text", chunk[pos:m.start()]))
        out.append(("text", m.group(1), {"bold": True}))
        pos = m.end()
    if pos < len(chunk):
        out.append(("text", chunk[pos:]))
    return [p for p in out if p[1] != ""]


class OmmlCache:
    """LaTeX -> OMML with a one-shot pandoc batch, per-expression retry, and
    a plain-text fallback that never aborts the worksheet."""

    def __init__(self):
        self.cache = {}          # (latex, display) -> element or None
        self.fallbacks = []      # latex strings that could not be converted

    def prime(self, exprs: list):
        todo = [e for e in dict.fromkeys(exprs) if e not in self.cache]
        if not todo:
            return
        got = self._batch([e for (e, _d) in todo], [d for (_e, d) in todo])
        for key, elem in zip(todo, got):
            self.cache[key] = elem
        # retry the misses one at a time (batch misalignment vs real failure)
        for key, elem in list(self.cache.items()):
            if elem is None and key in todo:
                latex, display = key
                try:
                    self.cache[key] = wslib()._latex_to_omml(latex, display=display)
                except Exception:
                    self.cache[key] = None

    def get(self, latex: str, display: bool = False):
        key = (latex, display)
        if key not in self.cache:
            try:
                self.cache[key] = wslib()._latex_to_omml(latex, display=display)
            except Exception:
                self.cache[key] = None
        elem = self.cache[key]
        if elem is None:
            if latex not in self.fallbacks:
                self.fallbacks.append(latex)
            return None
        return copy.deepcopy(elem)

    @staticmethod
    def _batch(exprs: list, displays: list):
        """One pandoc call for many expressions; markers keep them aligned."""
        if not exprs:
            return []
        lines = []
        for i, (e, d) in enumerate(zip(exprs, displays)):
            wrap = "$$%s$$" % e if d else "$%s$" % e
            lines.append("Zx%dZx %s" % (i, wrap))
        md = "\n\n".join(lines) + "\n"
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
            f.write(md)
            md_path = f.name
        docx_path = md_path.replace(".md", ".docx")
        out = [None] * len(exprs)
        try:
            subprocess.run(["pandoc", md_path, "-o", docx_path], check=True, capture_output=True)
            with zipfile.ZipFile(docx_path) as z:
                tree = etree.fromstring(z.read("word/document.xml"))
            for p in tree.iter(w("p")):
                txt = "".join(t.text or "" for t in p.iter(w("t")))
                m = re.match(r"\s*Zx(\d+)Zx", txt)
                if not m:
                    continue
                idx = int(m.group(1))
                if idx >= len(exprs):
                    continue
                node = p.find(".//{%s}oMathPara" % M_NS) if displays[idx] else None
                if node is None:
                    node = p.find(".//{%s}oMath" % M_NS)
                out[idx] = node
        except Exception:
            pass
        finally:
            for p in (md_path, docx_path):
                if os.path.exists(p):
                    os.unlink(p)
        return out


# --------------------------------------------------------------------------
# Practice section — inline properties only, no style-id / numId references
# --------------------------------------------------------------------------

def _sub(parent, tag, **attrs):
    el = etree.SubElement(parent, w(tag))
    for k, v in attrs.items():
        el.set(w(k), str(v))
    return el


def _rpr(run, bold=False, italic=False, color=None, size=SZ_BODY, track=0):
    """CT_RPr child order: rFonts, b, i, color, spacing, sz, szCs."""
    rPr = etree.SubElement(run, w("rPr"))
    rf = etree.SubElement(rPr, w("rFonts"))
    for a in ("ascii", "hAnsi", "eastAsia", "cs"):
        rf.set(w(a), FONT)
    if bold:
        _sub(rPr, "b", val="1")
    if italic:
        _sub(rPr, "i", val="1")
    if color:
        _sub(rPr, "color", val=color)
    if track:
        _sub(rPr, "spacing", val=track)      # character spacing, 20ths of a point
    _sub(rPr, "sz", val=size)
    _sub(rPr, "szCs", val=size)
    return rPr


# CT_RPr is a sequence, not a bag: children out of order make Word declare the
# file unreadable. Used to slot size/colour into run properties pandoc wrote.
_RPR_ORDER = ["rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps",
              "strike", "dstrike", "outline", "shadow", "emboss", "imprint",
              "noProof", "snapToGrid", "vanish", "webHidden", "color", "spacing",
              "w", "kern", "position", "sz", "szCs", "highlight", "u", "effect",
              "bdr", "shd", "fitText", "vertAlign", "rtl", "cs", "em", "lang",
              "eastAsianLayout", "specVanish", "oMath"]


def _order_rpr(rPr):
    kids = list(rPr)
    kids.sort(key=lambda e: _RPR_ORDER.index(etree.QName(e).localname)
              if etree.QName(e).localname in _RPR_ORDER else len(_RPR_ORDER))
    for k in kids:
        rPr.append(k)          # stable: re-appending in sorted order


# OMML elements that draw a glyph of their OWN — brackets, fraction bar, radical
# sign, big operators — rather than through an <m:r>. Word takes that glyph's
# size/colour from the element's <m:ctrlPr>, and pandoc emits no ctrlPr at all,
# so those glyphs silently fell back to the BASE document's default (12 pt: the
# tall parentheses and √ in a 9.5 pt equation). Every one of these has its
# properties element named <tag>Pr, always first child, with ctrlPr last inside.
_CTRL_TAGS = ("acc", "bar", "borderBox", "box", "d", "eqArr", "f", "func",
              "groupChr", "limLow", "limUpp", "m", "nary", "phant", "rad",
              "sPre", "sSub", "sSubSup", "sSup")


def _style_math_rpr(rPr, size, color):
    for tag in ("sz", "szCs") + (("color",) if color else ()):
        for old in rPr.findall(w(tag)):
            rPr.remove(old)
    if rPr.find(w("rFonts")) is None:
        # what Word itself writes on a math run; pandoc leaves it off, which
        # makes the glyphs inherit the base document's body font
        rf = etree.SubElement(rPr, w("rFonts"))
        rf.set(w("ascii"), MATH_FONT)
        rf.set(w("hAnsi"), MATH_FONT)
    if color:
        _sub(rPr, "color", val=color)
    _sub(rPr, "sz", val=size)
    _sub(rPr, "szCs", val=size)
    _order_rpr(rPr)


def style_omml(elem, size=SZ_BODY, color=None):
    """Force size (and optionally colour) onto everything inside an OMML tree.

    Pandoc emits <m:r> whose <w:rPr> names Cambria Math but carries no w:sz, so
    the equation inherits the BASE document's default size and comes out bigger
    than the 9.5 pt text beside it. Colour is the same story: an orange [Ans: …]
    label left its converted math black. Cambria Math stays (Word's normal math
    font); only sz/szCs/color are imposed — on the runs AND on the control
    properties that size delimiters, fraction bars and radicals.
    """
    if elem is None:
        return elem
    for r in elem.iter("{%s}r" % M_NS):
        rPr = r.find(w("rPr"))
        if rPr is None:
            rPr = etree.Element(w("rPr"))
            mrPr = r.find("{%s}rPr" % M_NS)      # m:rPr must stay first
            r.insert(list(r).index(mrPr) + 1 if mrPr is not None else 0, rPr)
        _style_math_rpr(rPr, size, color)
    for tag in _CTRL_TAGS:
        for node in elem.iter("{%s}%s" % (M_NS, tag)):
            pr_tag = "{%s}%sPr" % (M_NS, tag)
            pr = node.find(pr_tag)
            if pr is None:
                pr = etree.Element(pr_tag)
                node.insert(0, pr)               # <tag>Pr is always first child
            ctrl_tag = "{%s}ctrlPr" % M_NS
            ctrl = pr.find(ctrl_tag)
            if ctrl is None:
                ctrl = etree.SubElement(pr, ctrl_tag)   # …and ctrlPr last in it
            rPr = ctrl.find(w("rPr"))
            if rPr is None:
                rPr = etree.SubElement(ctrl, w("rPr"))
            _style_math_rpr(rPr, size, color)
    return elem


def _run(p, text, bold=False, italic=False, color=None, size=SZ_BODY, track=0):
    r = etree.SubElement(p, w("r"))
    _rpr(r, bold, italic, color, size, track)
    t = etree.SubElement(r, w("t"))
    t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text
    return r


def _marks_run(p, marks):
    """`[n]` right-aligned on the 15.5 cm tab stop, on the SAME line as the text.

    The paragraph reserves a 0.5 cm right gutter (see MARKS_RIGHT_IND), so the
    text wraps exactly at the stop and the mark can never be pushed off the line.
    """
    r = etree.SubElement(p, w("r"))
    _rpr(r)
    etree.SubElement(r, w("tab"))
    _run(p, "[%s]" % marks)


def _tab_run(p):
    r = etree.SubElement(p, w("r"))
    _rpr(r)
    etree.SubElement(r, w("tab"))
    return r


def _page_break_para():
    """A dedicated <w:br w:type="page"/> paragraph.

    Preferred over pageBreakBefore: every renderer honours an explicit break run,
    and it survives being appended after an arbitrary base document.
    """
    p = _para()
    r = etree.SubElement(p, w("r"))
    _rpr(r)
    br = etree.SubElement(r, w("br"))
    br.set(w("type"), "page")
    return p


# Set by clone_with_practice() when the base's default paragraph style carries
# numbering — only then do our paragraphs need an explicit numId=0 to shed it.
# Emitting numId=0 unconditionally is legal OOXML but makes some importers
# (macOS textutil among them) draw a phantom bullet, so it stays opt-in.
CLEAR_NUMBERING = False


def _para(left=0, hanging=0, align=None, space_after=0, space_before=0,
          keep_next=False, page_break_before=False, left_tabs=()):
    """Blank paragraph with fully inline properties.

    CT_PPr child order matters: keepNext, pageBreakBefore, numPr, tabs,
    spacing, ind, jc, rPr.
    """
    p = etree.Element(w("p"))
    pPr = etree.SubElement(p, w("pPr"))
    if keep_next:
        _sub(pPr, "keepNext", val="1")
    if page_break_before:
        _sub(pPr, "pageBreakBefore", val="1")
    if CLEAR_NUMBERING:
        numPr = etree.SubElement(pPr, w("numPr"))
        _sub(numPr, "ilvl", val="0")
        _sub(numPr, "numId", val="0")
    # Tab stops, ascending. The LEFT stop at the paragraph's left indent is
    # explicit on purpose: a hanging indent gives Word an implicit stop there,
    # but a custom tab stop also clears the default stops before it, so spelling
    # every column out makes the number/label layout renderer-independent.
    # The RIGHT stop at 15.5 cm is where [n] lands (see _marks_run); it is on
    # every paragraph, marked or not, so the column is identical down the page.
    stops = [("right", MARKS_TAB_POS)]
    if hanging and left:
        stops.append(("left", left))
    for pos in left_tabs:                 # intermediate columns, e.g. the (a) column
        if pos and pos != left:
            stops.append(("left", pos))
    if stops:
        tabs = etree.SubElement(pPr, w("tabs"))
        for val, pos in sorted(stops, key=lambda s: s[1]):
            tab = etree.SubElement(tabs, w("tab"))
            tab.set(w("val"), val)
            tab.set(w("pos"), str(pos))
    sp = etree.SubElement(pPr, w("spacing"))
    sp.set(w("before"), str(space_before))
    sp.set(w("after"), str(space_after))
    sp.set(w("line"), LINE_15)
    sp.set(w("lineRule"), "auto")
    # right indent is unconditional: it reserves the gutter that keeps the wrap
    # width equal to the marks tab stop.
    ind = etree.SubElement(pPr, w("ind"))
    ind.set(w("right"), str(MARKS_RIGHT_IND))
    if left or hanging:
        ind.set(w("left"), str(left))
        if hanging:
            ind.set(w("hanging"), str(hanging))
    if align:
        _sub(pPr, "jc", val=align)
    # paragraph-mark run properties (last child of pPr): keeps empty
    # working-space lines at the right font size instead of the base's default
    _rpr(pPr)
    return p


def _emit_parts(p, parts, omml: OmmlCache, color=None):
    for part in parts:
        kind = part[0]
        if kind == "text":
            attrs = part[2] if len(part) > 2 else {}
            _run(p, part[1], bold=attrs.get("bold", False), italic=attrs.get("italic", False),
                 color=attrs.get("color", color))
        else:
            display = (kind == "math_display")
            elem = style_omml(omml.get(part[1], display=display), color=color)
            if elem is not None:
                p.append(elem)
            else:
                _run(p, part[1], italic=True, color=color)  # plain text, never abort


def _text_blocks(text: str) -> list:
    """Split on blank lines; collapse soft newlines inside a block."""
    text = (text or "").replace("\r\n", "\n").strip()
    if not text:
        return []
    return [re.sub(r"\s*\n\s*", " ", b).strip()
            for b in re.split(r"\n\s*\n", text) if b.strip()]


def _label(raw) -> str:
    s = str(raw or "").strip()
    if not s:
        return ""
    if s.startswith("(") and s.endswith(")"):
        return s
    return "(%s)" % s.strip(".) ")


def _working_lines(marks, extra=2, minimum=3, maximum=12) -> int:
    """Blank ruled lines under a question — roughly one per mark, plus slack."""
    try:
        m = int(marks or 0)
    except Exception:
        m = 0
    return max(minimum, min(maximum, m + extra))


def _keep_with_next(p) -> None:
    pPr = p.find(w("pPr"))
    if pPr is None:
        pPr = etree.Element(w("pPr"))
        p.insert(0, pPr)
    if pPr.find(w("keepNext")) is None:
        _sub(pPr, "keepNext", val="1")
        _order_ppr(pPr)


def _unit(paras: list, closed: bool = True) -> list:
    """Bind a question or part to its writing space so a page break can't split it.

    Adrian: "questions or parts of questions should start on a new page, do not
    want writing space to span across two pages" (2026-08-06). keepNext on every
    paragraph but the last makes Word move the whole block down rather than
    break inside it; the last one stays free so breaks CAN fall between units,
    which is where they belong. A unit taller than a page still breaks — Word
    drops keepNext when it has no choice, and that is the wanted behaviour.

    `closed=False` keeps the final paragraph bound too, for a group that must
    stay with whatever follows: a bare stem has no writing space of its own and
    belongs with part (a).
    """
    for p in (paras if not closed else paras[:-1]):
        _keep_with_next(p)
    return paras


def build_title(level_label: str, topic: str) -> list:
    """Adrian's own two-line heading, copied off his worked-examples sheets."""
    lvl = _para(align="center")
    _run(lvl, "%s Revision" % level_label, bold=True)
    top = _para(align="center", space_after=60)
    _run(top, topic, bold=True, size=SZ_TITLE)
    return [lvl, top]


def _notes_label():
    p = _para()
    r = _run(p, "Notes:", bold=True, size=SZ_SECTION)
    _sub(r.find(w("rPr")), "u", val="single")
    _order_rpr(r.find(w("rPr")))
    return p


def _optional_divider():
    """Rule 2 — ONE line that says "everything below here is extra".

    Deliberately not a per-question tag. A "(Challenge)" hung off individual
    questions tells a student mid-sheet that they may skip this one; a single
    divider tells them where the sheet they must finish ends, which is the thing
    Adrian actually wants them to know. Bold and short, so _bind_section_heads
    treats it as a heading and chains it to the question below — a divider
    stranded at the foot of a page marks the wrong boundary.
    """
    p = _para(space_after=120, space_before=180, keep_next=True)
    _run(p, "(Optional)", bold=True)
    return p


def build_practice(questions: list, omml: OmmlCache,
                   heading: str = "Practice", show_source: bool = False,
                   page_break: bool = True, space: int = 2,
                   optional_from: int | None = None,
                   figures: "FigureStore | None" = None) -> list:
    """Return the list of <w:p> elements forming the Practice section.

    `optional_from` is the 1-based number of the first question below the
    `(Optional)` divider. `figures` collects embedded images (fetched onto the
    rows by fetch_figures) so clone_with_practice can write them into the zip.
    """
    def _fig_paras(row, indent):
        out = []
        if figures is None:
            return out
        for f in (row.get("_figures") or []):
            relid, docpr = figures.add(f["bytes"], f["ext"])
            cx, cy = _fig_emu(row.get("image_size"), f["px"])
            out.append(_figure_para(relid, docpr, cx, cy, left=indent))
        return out

    els = []
    if page_break:
        els.append(_page_break_para())
    else:
        # A blank line between the fragment's last Reminder and the heading —
        # without it "Practice" sits flush under the bullets (Adrian, 2026-08-06).
        els.append(_para())

    h = _para(space_after=180, keep_next=True)
    _run(h, heading, bold=True, size=SZ_HEAD)
    els.append(h)

    for i, row in enumerate(questions, 1):
        if optional_from and i == optional_from:
            els.append(_optional_divider())

        # Paragraphs are collected per unit — a question or part together with
        # its writing space — and bound by _unit() before they reach `els`.
        units = []
        parts = _parts(row)
        stem_blocks = _text_blocks(row.get("question_text") or "")
        marks_here = None if parts else row.get("total_marks")

        # The number never sits alone on a line. When a question is all
        # sub-parts (no stem text — the common shape in this bank), "(a)" rides
        # up onto the number's line: "1.<tab>(a)<tab>text", with the hanging
        # indent set to the text column so wraps and (b), (c) … line up under it.
        merged = bool(parts) and not stem_blocks
        if merged:
            head, parts = parts[0], parts[1:]
            blocks = _text_blocks(head.get("text") or "")
            pm = head.get("marks")
            first = _para(left=IND_SQ_LEFT, hanging=IND_SQ_LEFT,
                          left_tabs=(IND_Q_LEFT,), keep_next=True)
            _run(first, "%d." % i)
            _tab_run(first)
            _run(first, _label(head.get("label")))
            _tab_run(first)
            if blocks:
                _emit_parts(first, split_math(blocks[0]), omml)
            if show_source:
                src = provenance(row)
                if src:
                    _run(first, "  [%s]" % src, italic=True, color="808080")
            if pm:
                _marks_run(first, pm)
            unit = [first]
            for extra in blocks[1:]:
                p = _para(left=IND_SQ_LEFT, keep_next=True)
                _emit_parts(p, split_math(extra), omml)
                unit.append(p)
            unit.extend(_fig_paras(row, IND_SQ_LEFT))
            for _ in range(_working_lines(pm, extra=space)):
                unit.append(_para(left=IND_SQ_LEFT))
            units.append(unit)
        else:
            # -- stem
            first = _para(left=IND_Q_LEFT, hanging=IND_Q_HANG, keep_next=True)
            _run(first, "%d." % i)
            _tab_run(first)
            if stem_blocks:
                _emit_parts(first, split_math(stem_blocks[0]), omml)
            if show_source:
                src = provenance(row)
                if src:
                    _run(first, "  [%s]" % src, italic=True, color="808080")
            if marks_here:
                _marks_run(first, marks_here)
            unit = [first]

            for extra in stem_blocks[1:]:
                p = _para(left=IND_Q_LEFT, keep_next=True)
                _emit_parts(p, split_math(extra), omml)
                unit.append(p)

            # The figure sits with the stem — students read it before part (a).
            unit.extend(_fig_paras(row, IND_Q_LEFT))

            if not parts:
                for _ in range(_working_lines(row.get("total_marks"), extra=space + 1)):
                    unit.append(_para(left=IND_Q_LEFT))
                units.append(unit)
            else:
                # A stem with sub-parts has no writing space of its own, so it
                # is not a unit — it rides with part (a).
                units.append(_unit(unit, closed=False))

        # -- remaining sub-parts, each starting at the (a) column
        for part in parts:
            blocks = _text_blocks(part.get("text") or "")
            pm = part.get("marks")
            sp = _para(left=IND_SQ_LEFT, hanging=IND_SQ_HANG, keep_next=True)
            _run(sp, _label(part.get("label")))
            _tab_run(sp)
            if blocks:
                _emit_parts(sp, split_math(blocks[0]), omml)
            if pm:
                _marks_run(sp, pm)
            unit = [sp]
            for extra in blocks[1:]:
                p = _para(left=IND_SQ_LEFT, keep_next=True)
                _emit_parts(p, split_math(extra), omml)
                unit.append(p)
            for _ in range(_working_lines(pm, extra=space)):
                unit.append(_para(left=IND_SQ_LEFT))
            units.append(unit)

        # -- answer: right-aligned and orange all the way through, math included.
        # It belongs to the last unit: stranded at the top of the next page on
        # its own it reads as the answer to the wrong question.
        a = _para(align="right", space_after=180)
        _run(a, "[Ans: ", color=COLOR_ORANGE)
        _emit_parts(a, _answer_parts(row), omml, color=COLOR_ORANGE)
        _run(a, "]", color=COLOR_ORANGE)
        units[-1].append(a)

        for unit in units:
            els += _unit(unit)

    return els


def _answer_parts(row) -> list:
    # display math would break out of the right-aligned answer line, so any
    # $$…$$ in an answer is rendered inline
    def inline(bits):
        return [(("math" if k == "math_display" else k), *rest) for k, *rest in bits]

    top = (row.get("answer") or "").strip()
    if top:
        return inline(split_math(top))
    out = []
    for part in _parts(row):
        a = (part.get("answer") or "").strip()
        if not a:
            continue
        if out:
            out.append(("text", "; "))
        lab = _label(part.get("label"))
        if lab:
            out.append(("text", lab + " "))
        out += inline(split_math(a))
    return out or [("text", "see solution")]


def collect_latex(questions: list) -> list:
    """Every (latex, display) pair the practice section will need."""
    need = []
    for row in questions:
        blobs = [row.get("question_text") or ""]
        for p in _parts(row):
            blobs.append(p.get("text") or "")
        for b in blobs:
            for kind, *rest in split_math(b):
                if kind in ("math", "math_display"):
                    need.append((rest[0], kind == "math_display"))
        # answers go through _answer_parts, which forces display math inline —
        # ask for the same (latex, display) keys the renderer will look up
        for kind, *rest in _answer_parts(row):
            if kind == "math":
                need.append((rest[0], False))
    return list(dict.fromkeys(need))


# --------------------------------------------------------------------------
# Assembly — clone base docx, inject before <w:sectPr>
# --------------------------------------------------------------------------

# CT_PPr is an ordered sequence too (same trap as CT_RPr): a <w:spacing>
# appended in the wrong place makes Word declare the file unreadable.
_PPR_ORDER = ["pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr",
              "widowControl", "numPr", "suppressLineNumbers", "pBdr", "shd",
              "tabs", "suppressAutoHyphens", "kinsoku", "wordWrap",
              "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN",
              "bidi", "adjustRightInd", "snapToGrid", "spacing", "ind",
              "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc",
              "textDirection", "textAlignment", "textboxTightWrap", "outlineLvl",
              "divId", "cnfStyle", "rPr", "sectPr", "pPrChange"]


def _order_ppr(pPr):
    kids = list(pPr)
    kids.sort(key=lambda e: _PPR_ORDER.index(etree.QName(e).localname)
              if etree.QName(e).localname in _PPR_ORDER else len(_PPR_ORDER))
    for k in kids:
        pPr.append(k)


# "[3]" / "[ 12 ]" — a marks label, the only thing that belongs on the far stop.
_MARK_RE = re.compile(r"^\[\s*\d+\s*\]$")
# the same label sitting at the END of a run of ordinary text
_TRAIL_MARK_RE = re.compile(r"[ \t\u00a0]*(\[\s*\d+\s*\])$")


def _ensure_marks_stop(pPr) -> bool:
    """Give a paragraph the 15.5 cm right stop AND the gutter that protects it.

    Returns True if anything changed. The gutter is the whole point: a stop at
    15.5 cm with text free to wrap at 16 cm leaves the tab nowhere to go, and
    Word drops [n] onto the next line by itself.
    """
    changed = False
    ind = pPr.find(w("ind"))
    try:
        cur_right = int(ind.get(w("right")) or 0) if ind is not None else 0
    except ValueError:
        cur_right = 0
    if cur_right < MARKS_RIGHT_IND:
        if ind is None:
            ind = etree.SubElement(pPr, w("ind"))
        ind.set(w("right"), str(MARKS_RIGHT_IND))
        cur_right = MARKS_RIGHT_IND
        changed = True
    want = min(MARKS_TAB_POS, TEXT_WIDTH - cur_right)
    tabs = pPr.find(w("tabs"))
    if tabs is None:
        tabs = etree.SubElement(pPr, w("tabs"))
        changed = True
    far = [t for t in tabs.findall(w("tab"))
           if (t.get(w("pos")) or "0").isdigit() and int(t.get(w("pos"))) >= FAR_TAB_MIN]
    if not far:
        t = etree.SubElement(tabs, w("tab"))
        far = [t]
        changed = True
    for t in far:
        if t.get(w("pos")) != str(want) or t.get(w("val")) != "right":
            t.set(w("val"), "right")
            t.set(w("pos"), str(want))
            changed = True
    for extra in far[1:]:
        tabs.remove(extra)
    # tabs must sort ascending, and pPr children must sit in schema order
    kids = sorted(tabs.findall(w("tab")), key=lambda t: int(t.get(w("pos")) or 0))
    for k in kids:
        tabs.append(k)
    _order_ppr(pPr)
    return changed


def _normalize_house_style(root) -> dict:
    """Impose font size, line spacing and the marks tab stop on the WHOLE body.

    Everything above the Practice heading is byte-cloned from Adrian's own
    formula sheet or worked-examples sheet, and those carry their author's
    formatting: the S4 AM fragment renders its heading and base-level equation
    runs at 6.5 pt, some paragraphs are single-spaced, and his marks stop sits
    at 16 cm — i.e. at the wrap width, which is what pushed [n] onto the next
    line. Generating a house-style practice block and leaving the base alone
    produced a two-formats worksheet, so the normaliser now covers both.

    Superscripts stay smaller: Word derives OMML script sizes from the base run
    size automatically (the fragment proves it — base `a` and exponent `n` are
    both stored at 6.5 pt and render at different sizes), so pinning every run
    to 9.5 pt scales the whole equation rather than flattening it.
    """
    st = {"sizes": 0, "spacing": 0, "tabs": 0, "math": 0}

    for m in root.iter("{%s}oMath" % M_NS):          # incl. ctrlPr glyph sizing
        style_omml(m, size=SZ_BODY)
        st["math"] += 1

    for tag in ("sz", "szCs"):
        for e in root.iter(w(tag)):
            if e.get(w("val")) != str(SZ_BODY):
                e.set(w("val"), str(SZ_BODY))
                st["sizes"] += 1

    # runs with no explicit size inherit the base's docDefaults (11 pt in some
    # fragments) — pin them rather than rewriting styles.xml
    for r in root.iter(w("r")):
        rPr = r.find(w("rPr"))
        if rPr is None:
            rPr = etree.Element(w("rPr"))
            r.insert(0, rPr)
        if rPr.find(w("sz")) is None:
            _sub(rPr, "sz", val=SZ_BODY)
            _sub(rPr, "szCs", val=SZ_BODY)
            _order_rpr(rPr)
            st["sizes"] += 1

    # 1.5 spacing is for reading and for writing space, NOT for the insides of
    # Adrian's worked-solution boxes: nobody writes in a solution box, so there
    # the extra half-line is pure height, and it is what pushed a box's tail
    # onto a second page ("they should not span two pages if they can fit into
    # one", 2026-08-06). Table paragraphs are tightened to 1.15 instead — his
    # own tighter spacing from the same sheet, ~23 % shorter than 1.5. They
    # still get the 9.5 pt pass above, so the document stays one document.
    for para in root.iter(w("p")):
        pPr = para.find(w("pPr"))
        if pPr is None:
            pPr = etree.Element(w("pPr"))
            para.insert(0, pPr)
        want = LINE_TABLE if _in_table(para) else LINE_15
        sp = pPr.find(w("spacing"))
        if sp is None:
            sp = etree.SubElement(pPr, w("spacing"))
        if sp.get(w("line")) != want or sp.get(w("lineRule")) != "auto":
            sp.set(w("line"), want)
            sp.set(w("lineRule"), "auto")
            st["spacing"] += 1
        _order_ppr(pPr)

    # Every paragraph that ENDS in a marks label reached by a tab gets the stop,
    # whether or not the base ever defined one: Adrian's sheets sometimes tab to
    # the document default grid, which put a [4] at 1.6 cm instead of 15.5 cm.
    for para in root.iter(w("p")):
        runs = para.findall(w("r"))
        if not runs:
            continue
        last = runs[-1]
        tail_t = [t for t in last.iter(w("t"))]
        tail = "".join(t.text or "" for t in tail_t)
        # ANY tab run in the paragraph, including the last one: Adrian's sheets
        # put <w:tab/> and the [n] text inside a SINGLE run, so checking only
        # runs[:-1] read those as untabbed and added a second tab, which wrapped
        # 54 marks onto their own line.
        tabbed = any(r.find(w("tab")) is not None for r in runs)
        m = _TRAIL_MARK_RE.search(tail)
        if not (tabbed and _MARK_RE.match(tail.strip())) and not m:
            continue
        if m and not tabbed:
            # Adrian typed "…show that k = -2. [4]" — a plain space, so the mark
            # wraps with the sentence and lands wherever the line breaks. Split
            # it onto the marks stop like every other [n] on the sheet.
            t = tail_t[-1]
            t.text = (t.text or "")[: len(t.text or "") - len(m.group(0))]
            if not t.text:
                t.text = ""
            idx = list(para).index(last)
            tabr = etree.Element(w("r"))
            rpr = last.find(w("rPr"))
            if rpr is not None:
                tabr.append(copy.deepcopy(rpr))
            etree.SubElement(tabr, w("tab"))
            markr = etree.Element(w("r"))
            if rpr is not None:
                markr.append(copy.deepcopy(rpr))
            mt = etree.SubElement(markr, w("t"))
            mt.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
            mt.text = m.group(1)
            para.insert(idx + 1, tabr)
            para.insert(idx + 2, markr)
            st["inline_marks"] = st.get("inline_marks", 0) + 1
        pPr = para.find(w("pPr"))
        if pPr is None:
            pPr = etree.Element(w("pPr"))
            para.insert(0, pPr)
        if _ensure_marks_stop(pPr):
            st["tabs"] += 1

    # …and any other far stop the base carries is pulled onto the same column.
    for tabs in root.iter(w("tabs")):
        if any((t.get(w("pos")) or "0").isdigit() and int(t.get(w("pos"))) >= FAR_TAB_MIN
               for t in tabs.findall(w("tab"))):
            pPr = tabs.getparent()
            if pPr is not None and etree.QName(pPr).localname == "pPr":
                if _ensure_marks_stop(pPr):
                    st["tabs"] += 1
    return st


def _in_table(p) -> bool:
    """Is this paragraph inside a table cell?

    Walks ancestors rather than pre-collecting the paragraphs of every table:
    lxml hands out element PROXIES, so a set of `id(p)` built in a comprehension
    is meaningless the moment those proxies are collected — the ids get recycled
    and the test silently answers at random. That bug made the whole table
    exemption a no-op while looking like it worked.
    """
    for anc in p.iterancestors():
        if etree.QName(anc).localname == "tbl":
            return True
    return False


def _is_blank_para(p) -> bool:
    """No text, no equation, no picture, no break — a pure spacer."""
    if p.find(".//{%s}oMath" % M_NS) is not None:
        return False
    for tag in ("drawing", "pict", "object", "br", "tab"):
        if p.find(".//" + w(tag)) is not None:
            return False
    return not "".join(t.text or "" for t in p.iter(w("t"))).strip()


def _compact_blanks(body, keep: int = 1) -> int:
    """Collapse runs of empty spacer paragraphs in the BASE document.

    Adrian's sheets are padded with stacks of empty paragraphs — the tail of a
    page he was writing into. They cost vertical space that pushes worked
    examples over a page boundary, and unlike his real content they carry no
    meaning. Runs longer than `keep` are trimmed to `keep`.

    Must run BEFORE the practice block is inserted: our writing space is made of
    exactly these paragraphs, and collapsing it would delete the space students
    write in.
    """
    removed, run = 0, []
    for el in list(body) + [None]:
        if el is not None and etree.QName(el).localname == "p" and _is_blank_para(el):
            run.append(el)
            continue
        for extra in run[keep:]:
            body.remove(extra)
            removed += 1
        run = []
    return removed


_Q_START_RE = re.compile(r"^\s*\(?\d{1,2}[.)]")   # "3.", "12.", "(4)" — a question number
_WALK_LIMIT = 40                                  # runaway guard on the backward walk
_HEAD_CHARS = 60                                  # longer than this is prose, not a heading
_SECTION_LIMIT = 10                               # cap on the run bound to one heading


def _para_plain_text(p) -> str:
    return "".join(t.text or "" for t in p.iter(w("t")))


def _is_item_start(p) -> bool:
    """True when this paragraph opens a new top-level question.

    Adrian's practice questions are Word-autonumbered, so the number is not in
    the text at all — it lives in <w:numPr>, and only ilvl 0 is a question (the
    deeper levels are its (i)/(ii) parts). Our own generated questions spell the
    number out, hence the text fallback.
    """
    pPr = p.find(w("pPr"))
    numPr = pPr.find(w("numPr")) if pPr is not None else None
    if numPr is not None:
        ilvl = numPr.find(w("ilvl"))
        if ilvl is None or ilvl.get(w("val")) == "0":
            return True
    return bool(_Q_START_RE.match(_para_plain_text(p)))


def _is_section_head(p) -> bool:
    """A short, fully bold line that introduces what follows.

    That covers "Binomial Theorem Practice", "Finding n", "Solution:" and the
    bracketed source tags — everything Adrian sets in bold to open a block.
    """
    text = _para_plain_text(p).strip()
    if not text or len(text) > _HEAD_CHARS or _is_item_start(p):
        return False
    runs = [r for r in p.findall(w("r"))
            if "".join(t.text or "" for t in r.iter(w("t"))).strip()]
    if not runs:
        return False
    return all(r.find(w("rPr")) is not None and r.find(w("rPr")).find(w("b")) is not None
               for r in runs)


def _bind_section_heads(body) -> int:
    """Move a heading to the next page when its first question won't fit under it.

    Adrian's own "Binomial Theorem Practice" heading landed in the last ~60 pt of
    page 3 with question 1 wrapping and its [Ans: …] alone on page 4 — "the
    practice could be on a new page so that it is not cluttered" (2026-08-06).
    There is no OOXML "start on a new page if short of room"; the way to say it
    is keepNext, so the heading is chained to the whole of question 1 and Word
    relocates the group as a unit.

    The run ends at question 2, at the next heading, or at a table (from there
    `_example_head` owns the chain), and the last paragraph of the run is left
    unbound so the block does not drag question 2 along behind it.
    """
    bound = 0
    for head in list(body):
        if etree.QName(head).localname != "p" or not _is_section_head(head):
            continue
        run, el, seen_item = [], head.getnext(), False
        while el is not None and len(run) < _SECTION_LIMIT:
            if etree.QName(el).localname != "p":
                break                              # the solution table
            if _is_section_head(el) and run:
                break
            if _is_item_start(el):
                if seen_item:
                    break                          # question 2 — the block is done
                seen_item = True
            run.append(el)
            el = el.getnext()
        if not run:
            continue
        for p in [head] + run[:-1]:
            _keep_with_next(p)
        bound += 1
    return bound


def _example_head(tbl):
    """The paragraphs above a solution table that belong to the same example.

    A worked example is question stem + "Solution:" + the bordered box, and
    binding only the paragraph directly above the table left the stem stranded
    at the foot of the previous page (Q3 on 2026-08-06: "3. (i) Write down…" on
    page 2, its whole solution on page 3). So the walk runs backwards to the
    numbered question paragraph and takes one more line if that is a short
    section heading like "Finding n".

    It stops at the previous table or an explicit page break so examples never
    chain into one another, and gives up after `_WALK_LIMIT` paragraphs rather
    than swallowing the document if a sheet has no question numbers at all.
    """
    head, el = [], tbl.getprevious()
    while el is not None and len(head) < _WALK_LIMIT:
        if etree.QName(el).localname != "p":
            break                                  # previous table / sectPr
        if el.find(".//" + w("br")) is not None and any(
                b.get(w("type")) == "page" for b in el.iter(w("br"))):
            break
        head.append(el)
        if _Q_START_RE.match(_para_plain_text(el)):
            prev = el.getprevious()                # optional "Finding n" heading
            if (prev is not None and etree.QName(prev).localname == "p"
                    and 0 < len(_para_plain_text(prev).strip()) <= 60
                    and not _Q_START_RE.match(_para_plain_text(prev))):
                head.append(prev)
            break
        el = el.getprevious()
    return head


def _keep_blocks_together(body) -> int:
    """Stop a worked example from being split across a page break.

    Adrian's worked solutions are bordered tables, and Word breaks one mid-row
    without hesitation — which is how the tail of a solution ended up alone at
    the top of the next page. OOXML has no "keep this table together" property,
    so it is spelled out: every row is marked cantSplit, every paragraph up to
    the last row keeps with the next, and the question stem above the table
    (see `_example_head`) joins the block. A block taller than a page still
    breaks — Word drops keepNext when it cannot honour it, which is exactly the
    "unless it's a really big example" escape Adrian asked for.
    """
    bound = 0
    for tbl in body.iter(w("tbl")):
        rows = tbl.findall(w("tr"))
        if not rows:
            continue
        for tr in rows:
            trPr = tr.find(w("trPr"))
            if trPr is None:
                trPr = etree.Element(w("trPr"))
                tr.insert(0, trPr)
            if trPr.find(w("cantSplit")) is None:
                etree.SubElement(trPr, w("cantSplit"))
        for tr in rows[:-1]:
            for p in tr.iter(w("p")):
                _keep_with_next(p)
        for p in _example_head(tbl):
            _keep_with_next(p)
        bound += 1
    return bound


def _normalize_page(root) -> dict:
    """Impose the worksheet page setup on EVERY sectPr in the document.

    The base is whatever Adrian's fragment/sheet happened to use — formula
    sheets carry odd margins, some are US Letter, and a landscape section turns
    up now and then. Margins are forced unconditionally; page size is rewritten
    to A4 portrait whenever it isn't already that (landscape, Letter, …).
    Mid-document section breaks live in w:pPr/w:sectPr, so iterate, don't just
    take the body-level one.
    """
    changed = {"sections": 0, "resized": []}
    for sect in root.iter(w("sectPr")):
        changed["sections"] += 1
        mar = sect.find(w("pgMar"))
        if mar is None:
            mar = etree.SubElement(sect, w("pgMar"))
        for k, v in PG_MAR.items():
            mar.set(w(k), str(v))
        # keep header/footer bands inside the new margins
        for band, limit in (("header", PG_MAR["top"]), ("footer", PG_MAR["bottom"])):
            try:
                cur = int(mar.get(w(band)) or 0)
            except ValueError:
                cur = 0
            if cur >= limit or not mar.get(w(band)):
                mar.set(w(band), str(max(0, limit // 2)))
        pg = sect.find(w("pgSz"))
        if pg is None:
            pg = etree.Element(w("pgSz"))
            sect.insert(0, pg)
        try:
            pw, ph = int(pg.get(w("w")) or 0), int(pg.get(w("h")) or 0)
        except ValueError:
            pw = ph = 0
        # 30 twips (0.05 cm) of slack: several fragments carry 11900x16840,
        # which is A4 rounded to the nearest 10 and not worth rewriting.
        near_a4 = abs(pw - PG_A4[0]) <= 30 and abs(ph - PG_A4[1]) <= 30
        if pg.get(w("orient")) == "landscape" or not near_a4:
            was = ("landscape %dx%d" % (pw, ph) if pg.get(w("orient")) == "landscape" or pw > ph
                   else "%dx%d" % (pw, ph))
            pg.set(w("w"), str(PG_A4[0]))
            pg.set(w("h"), str(PG_A4[1]))
            if pg.get(w("orient")) is not None:
                del pg.attrib[w("orient")]
            changed["resized"].append(was)
    return changed


def _default_style_numbers(styles_xml: bytes) -> bool:
    """True when the base's docDefaults / default paragraph style carry numbering."""
    try:
        r = etree.fromstring(styles_xml)
    except Exception:
        return False
    dd = r.find(w("docDefaults"))
    if dd is not None and dd.find(".//" + w("numPr")) is not None:
        return True
    for s in r.findall(w("style")):
        if s.get(w("type")) == "paragraph" and s.get(w("default")) == "1":
            if s.find(".//" + w("numPr")) is not None:
                return True
    return False


def _apply_title(body, level_label: str, topic: str, base_stem: str = "") -> str:
    """Put Adrian's two-line heading on a notes fragment, and label the notes.

    A fragment opens on its own bold topic name and nothing else. That line is
    what the title's second line says, so it is REPLACED by the "Notes:" label
    rather than left to repeat the title two lines further down. A fragment that
    opens on something else keeps it, and gets the label inserted above.
    """
    kids = list(body)
    first = next((el for el in kids if etree.QName(el).localname == "p"), None)
    head = ""
    if first is not None:
        head = "".join(t.text or "" for t in first.iter(w("t"))).strip()

    # …or the grouped sheet's own name, when the topic resolved into one:
    # 'Integration (Applications)' lands in 'Calculus Applications (All)'.
    same = {norm(topic), norm(base_stem)} - {""}
    label = _notes_label()
    if first is not None and head and norm(head) in same:
        body.replace(first, label)
        mode = "replaced the fragment's %r heading" % head
    else:
        at = kids.index(first) if first is not None else 0
        body.insert(at, label)
        mode = "inserted above %r" % (head[:40] or "the fragment")

    for offset, el in enumerate(build_title(level_label, topic)):
        body.insert(offset, el)
    return mode


def clone_with_practice(base_path: Path, out_path: Path, questions: list,
                        omml: OmmlCache, heading="Practice",
                        show_source=False, page_break=True, space=2,
                        title: tuple | None = None,
                        optional_from: int | None = None,
                        figures: "FigureStore | None" = None) -> dict:
    """Byte-clone the base docx and append the practice paragraphs to its body."""
    global CLEAR_NUMBERING
    with zipfile.ZipFile(base_path) as z:
        names = z.namelist()
        items = {n: z.read(n) for n in names}

    CLEAR_NUMBERING = _default_style_numbers(items.get("word/styles.xml", b""))

    root = etree.fromstring(items["word/document.xml"])
    body = root.find(w("body"))
    if body is None:
        raise RuntimeError("base docx has no <w:body>: %s" % base_path)

    page = _normalize_page(root)
    # Trim the base's own padding BEFORE the practice block goes in — after, it
    # would eat the writing space, which is made of the same empty paragraphs.
    blanks = _compact_blanks(body)
    omml.prime(collect_latex(questions))
    els = build_practice(questions, omml, heading=heading,
                         show_source=show_source, page_break=page_break, space=space,
                         optional_from=optional_from, figures=figures)

    sect = body.find(w("sectPr"))
    insert_at = list(body).index(sect) if sect is not None else len(body)
    for offset, el in enumerate(els):
        body.insert(insert_at + offset, el)

    tables = _keep_blocks_together(body)
    heads = _bind_section_heads(body)
    house = _normalize_house_style(root)
    house.update(blanks_removed=blanks, tables_bound=tables, heads_bound=heads)
    # The title is written last: it is the one block that is deliberately not
    # 9.5 pt, so the house-style pass must already be behind us.
    if title:
        house["title"] = _apply_title(body, *title)

    xml = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    # same OOXML schema fix create-worksheet applies: <m:count> must precede <m:mcJc>
    xml = re.sub(rb'(<m:mcJc m:val="[^"]*"/>)(<m:count m:val="[^"]*"/>)', rb"\2\1", xml)
    items["word/document.xml"] = xml

    # Embedded figures: bytes into word/media/, one Relationship per image, and
    # content-type defaults for extensions the base doc never carried. All three
    # come from the SAME FigureStore entries the drawings reference.
    if figures and figures.entries:
        rels_name = "word/_rels/document.xml.rels"
        rels = (etree.fromstring(items[rels_name]) if rels_name in items
                else etree.fromstring(
                    ('<Relationships xmlns="%s"/>' % NS_REL).encode()))
        for e in figures.entries:
            etree.SubElement(
                rels, "{%s}Relationship" % NS_REL, Id=e["relid"],
                Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
                Target="media/%s" % e["name"])
            media = "word/media/%s" % e["name"]
            items[media] = e["bytes"]
            if media not in names:
                names.append(media)
        items[rels_name] = etree.tostring(rels, xml_declaration=True,
                                          encoding="UTF-8", standalone=True)
        if rels_name not in names:
            names.append(rels_name)

        ct = etree.fromstring(items["[Content_Types].xml"])
        have = {d.get("Extension") for d in ct
                if etree.QName(d).localname == "Default"}
        need = {e["ext"] for e in figures.entries}
        for ext, mime in (("png", "image/png"), ("jpg", "image/jpeg")):
            if ext in need and ext not in have:
                etree.SubElement(ct, "{%s}Default" % NS_CT,
                                 Extension=ext, ContentType=mime)
        items["[Content_Types].xml"] = etree.tostring(
            ct, xml_declaration=True, encoding="UTF-8", standalone=True)

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, items[n])

    return {"paragraphs": len(els), "page": page, "house": house,
            "equations": sum(1 for v in omml.cache.values() if v is not None),
            "fallbacks": list(omml.fallbacks),
            "figures": len(figures.entries) if figures else 0}


# --------------------------------------------------------------------------
# End-to-end
# --------------------------------------------------------------------------

@dataclass
class RunReport:
    base: Resolved
    kind: str
    level_used: dict = field(default_factory=dict)
    questions: list = field(default_factory=list)
    stats: dict = field(default_factory=dict)
    build: dict = field(default_factory=dict)
    out_path: str = ""
    size: dict = field(default_factory=dict)
    scope_notes: list = field(default_factory=list)
    link_note: str = ""
    optional_from: int | None = None
    figure_notes: list = field(default_factory=list)

    def selection_json(self) -> str:
        """The chosen questions, in full, for deciding sub-part scope (rule 3).

        The sheet numbers here are the ones --drop-parts takes.
        """
        out = []
        for i, q in enumerate(self.questions, 1):
            out.append({
                "n": i, "id": q.get("id"), "source": provenance(q),
                "marks": q.get("total_marks"), "difficulty": q.get("difficulty"),
                "topics": q.get("topics"),
                "question_text": q.get("question_text"),
                "parts": [{"label": p.get("label"), "marks": p.get("marks"),
                           "text": p.get("text")} for p in _parts(q)],
            })
        return json.dumps(out, indent=2, ensure_ascii=False)

    def text(self) -> str:
        L = []
        L.append("Base      : %s  (%s)" % (self.base.path, self.base.how))
        L.append("Fragment  : %s" % self.base.name if self.kind == "notes"
                 else "Sheet     : %s" % self.base.name)
        if self.base.detail:
            L.append("            ^ %s" % self.base.detail)
        lv = ", ".join("%s:%d" % (k, v) for k, v in self.level_used.items())
        L.append("Practice  : %d question(s)  [levels %s]" % (len(self.questions), lv))
        L.append("            pool %s -> usable %s"
                 % (self.stats.get("pool"), self.stats.get("usable")))
        for why, cnt in sorted(self.stats.get("rejected", {}).items(), key=lambda x: -x[1]):
            L.append("            skipped %2d: %s" % (cnt, why))
        for i, q in enumerate(self.questions, 1):
            L.append("   %2d.%s %-56s %s marks, %s%s"
                     % (i, " *" if self.optional_from and i >= self.optional_from else "  ",
                        provenance(q) or "(no provenance)", q.get("total_marks"),
                        q.get("difficulty") or "?",
                        ", verified" if q.get("verified") else ""))
        if self.size:
            L.append("Size      : %d question(s), %d marks, ~%d min of working"
                     % (self.size["questions"], self.size["marks"], self.size["minutes"]))
            for warn in self.size.get("warnings", []):
                L.append("            !! %s" % warn)
        nfig = sum(len(q.get("_figures") or []) for q in self.questions)
        nq = sum(1 for q in self.questions if q.get("_figures"))
        if nfig or self.figure_notes:
            L.append("Figures   : %d image(s) embedded on %d question(s)" % (nfig, nq))
            for note in self.figure_notes:
                L.append("            ~ %s" % note)
        if self.optional_from:
            L.append("Optional  : divider before Q%d — Q%d-%d marked * above are the tail"
                     % (self.optional_from, self.optional_from, len(self.questions)))
        if self.link_note:
            L.append("Link      : %s" % self.link_note)
        for note in self.scope_notes:
            L.append("Scope     : %s" % note)
        if self.build:
            pg = self.build.get("page") or {}
            L.append("Page      : margins 2/1/2.5/2.5 cm forced on %d section(s)%s"
                     % (pg.get("sections", 0),
                        "; page size %s -> A4 portrait" % ", ".join(pg["resized"])
                        if pg.get("resized") else ""))
            hs = self.build.get("house") or {}
            if "tables_bound" in hs or "heads_bound" in hs:
                # keepNext leaves no trace in the render, so say it out loud here
                L.append("Keep      : %d solution box(es), %d section heading(s) bound to "
                         "what follows" % (hs.get("tables_bound", 0), hs.get("heads_bound", 0)))
            L.append("Equations : %d converted, %d fallback(s)"
                     % (self.build.get("equations", 0), len(self.build.get("fallbacks", []))))
            for f in self.build.get("fallbacks", []):
                L.append("            FALLBACK (plain text): %s" % f[:120])
        if self.out_path:
            L.append("Output    : %s" % self.out_path)
        return "\n".join(L)


def out_folder(kind: str, bank: str | None = None, folder: str | None = None) -> Path:
    """Where a finished sheet lands, per kind — these are the folders the kiosk
    reads, so the kind decides the button a student finds it under:
      worked -> Revision/<folder>, beside the source sheet   (kiosk "Revise")
      notes  -> Practice/<folder>, S3/S4 collapsed onto the  (kiosk "Practice")
                subject folder (S4_AM|S3_AM -> AM, S4_EM|S3_EM -> EM)
    """
    if kind == "worked":
        return REVISION_ROOT / folder if folder else DEFAULT_OUT_DIR
    name = BANK_OUT_FOLDER.get(bank or "")
    return PRACTICE_ROOT / name if name else DEFAULT_OUT_DIR


def default_out_path(bank_label: str, topic: str, kind: str,
                     bank: str | None = None, folder: str | None = None) -> Path:
    tag = "Notes" if kind == "notes" else "Worked Examples"
    safe = re.sub(r"[/:]", "-", topic)
    return out_folder(kind, bank, folder) / f"REV {bank_label} {safe} ({tag}).docx"


def make_worksheet(kind: str, topic: str, bank: str | None = None, folder: str | None = None,
                   n: int = 8, out: str | Path | None = None, practice_topic: str | None = None,
                   fragment: str | None = None, base: str | Path | None = None,
                   seed: int | None = None, allow_ai: bool = True, show_source: bool = False,
                   page_break: bool | None = None, level: str | None = None,
                   env: dict | None = None, dry_run: bool = False,
                   suffix: str = "", space: int = 2, optional: int = 0,
                   drop_parts: str | None = None, link: str | None = None,
                   minutes: int = 0, figures: bool = True) -> RunReport:
    env = env or load_env()
    # notes: the fragment is short, keep the practice on the same page so the
    # formulas stay in view while the student works. worked: the sheet already
    # runs pages, so start the practice cleanly on a new one.
    if page_break is None:
        page_break = (kind == "worked")

    # ---- base document
    if base:
        bp = Path(base).expanduser()
        if not bp.exists():
            raise ResolutionError("base docx not found: %s" % bp)
        resolved = Resolved(bp, bp.stem, "explicit", "explicit --base")
        label = bank or folder or "CUSTOM"
    elif kind == "notes":
        if not bank:
            raise ValueError("kind=notes needs --bank (%s)" % ", ".join(BANKS))
        resolved = resolve_fragment(bank, fragment or topic)
        label = bank
    elif kind == "worked":
        if not folder:
            raise ValueError("kind=worked needs --folder (%s)" % ", ".join(WORKED_FOLDERS))
        resolved = resolve_worked(folder, topic)
        label = folder
    else:
        raise ValueError("kind must be 'notes' or 'worked'")

    # ---- practice questions
    ptopic = practice_topic or topic
    if level:
        levels = [level]
    elif kind == "notes" and bank:
        primary, topup = BANK_LEVELS.get(bank, (None, None))
        levels = [l for l in (primary, topup) if l]
    else:
        primary, topup = FOLDER_LEVELS.get(folder or "", (None, None))
        levels = [l for l in (primary, topup) if l]
    if not levels:
        raise ValueError("could not infer a questions.level; pass --level")

    # Sec 3 banks drop any question that also carries a topic taught later —
    # see AM_TOPIC_ORDER. Sec 4 banks have the whole syllabus, so cap is None.
    cap = BANK_TOPIC_CAP.get((bank or "").upper())
    scope_skips: dict[str, int] = {}

    pool, level_used = [], {}
    seen = set()
    for lv in levels:
        rows = fetch_pool(env, lv, ptopic, figures=figures)
        if cap is not None:
            kept = []
            for r in rows:
                bad = out_of_scope(r, cap)
                if bad:
                    scope_skips[bad] = scope_skips.get(bad, 0) + 1
                else:
                    kept.append(r)
            rows = kept
        fresh = [r for r in rows if r["id"] not in seen]
        seen.update(r["id"] for r in fresh)
        pool += fresh
        level_used[lv] = len(fresh)
        chosen, stats = select_questions(pool, n, seed=seed, allow_ai=allow_ai, figures=figures)
        if len(chosen) >= n:
            break
    chosen, stats = select_questions(pool, n, seed=seed, allow_ai=allow_ai, figures=figures)

    if not chosen:
        hint = ""
        try:
            topics = list_topics(env, levels[0])
            hint = ("\nClosest topics at level %s: %s"
                    % (levels[0], ", ".join(repr(t) for t in closest(ptopic, topics, 5))))
        except Exception:
            pass
        if scope_skips:
            hint += ("\nSec 3 scope dropped %d question(s) that also need: %s"
                     % (sum(scope_skips.values()),
                        ", ".join("%s (%d)" % (t, n) for t, n in
                                  sorted(scope_skips.items(), key=lambda kv: -kv[1]))))
        raise RuntimeError("No usable practice questions for topic %r at level(s) %s.%s"
                           % (ptopic, "/".join(levels), hint))

    # ---- figures: download BEFORE anything numbers the sheet (dry-run included,
    # so --drop-parts numbers from a dry run stay valid). A question whose figure
    # cannot be fetched is swapped for the next usable candidate, never printed
    # without its diagram.
    figure_notes = []
    if figures:
        figure_notes += fetch_figures(env, chosen)
        broken = [r for r in chosen if r.get("_figures") is None]
        if broken:
            kept = [r for r in chosen if r.get("_figures") is not None]
            used = {r["id"] for r in chosen}
            spares, _ = select_questions([r for r in pool if r["id"] not in used],
                                         len(broken) + 4, seed=seed,
                                         allow_ai=allow_ai, figures=figures)
            for s in spares:
                if len(kept) >= len(chosen):
                    break
                figure_notes += fetch_figures(env, [s])
                if s.get("_figures") is not None:
                    kept.append(s)
                    figure_notes.append("swapped in %s" % (provenance(s) or s["id"]))
            if len(kept) < len(chosen):
                figure_notes.append("%d question(s) dropped — no fetchable replacement"
                                    % (len(chosen) - len(kept)))
            # Restore the ascending-marks ramp the swaps disturbed (same key as
            # select_questions).
            kept.sort(key=lambda r: (r.get("total_marks") or 0, str(r.get("year") or "")))
            chosen = kept

    # ---- rule 1: spend the sitting, then stop. Before the link question, which
    # is a deliberate addition and must survive the trim.
    trim_note = ""
    if minutes:
        chosen, trim_note = trim_to_minutes(chosen, minutes, min(n, SIZE_BAND_Q[0]))

    # ---- rule 4: one question that links this topic to another named one.
    # Force-placed LAST, after the ascending-marks sort, so it reads as the
    # capstone rather than turning up third and unbalancing the ramp.
    link_note = ""
    if link:
        row, lv = find_link_question(env, levels, [ptopic, link],
                                     {r["id"] for r in chosen}, allow_ai=allow_ai,
                                     figures=figures)
        if row is not None and figures:
            figure_notes += fetch_figures(env, [row])
            if row.get("_figures") is None:
                figure_notes.append("link question %s dropped — its figure would not fetch"
                                    % (provenance(row) or row["id"]))
                row = None
        if row is None:
            link_note = ("no question in the bank is tagged with both %r and %r — "
                         "none added (pick the link topic from the sheet's own topics, "
                         "or write one with create-worksheet)" % (ptopic, link))
        else:
            if len(chosen) >= n and n > 0:
                chosen = chosen[:n - 1]
            chosen.append(row)
            link_note = "Q%d links %s + %s  [%s, level %s]" % (
                len(chosen), ptopic, link, provenance(row) or "no provenance", lv)

    # ---- rule 3: scope to what the student has been taught
    scope_notes = [trim_note] if trim_note else []
    if drop_parts:
        chosen, notes = apply_scope(chosen, parse_drop_parts(drop_parts))
        scope_notes += notes

    # ---- rule 2: where the optional tail starts (1-based question number)
    optional_from = None
    if optional:
        if optional >= len(chosen):
            scope_notes.append("--optional %d covers the whole sheet — divider not written"
                               % optional)
        else:
            optional_from = len(chosen) - optional + 1

    if scope_skips:
        scope_notes.append(
            "Sec 3 scope: dropped %d question(s) needing a later topic — %s"
            % (sum(scope_skips.values()),
               ", ".join("%s (%d)" % (t, n) for t, n in
                         sorted(scope_skips.items(), key=lambda kv: -kv[1])[:6])))

    report = RunReport(base=resolved, kind=kind, level_used=level_used,
                       questions=chosen, stats=stats, size=size_budget(chosen),
                       scope_notes=scope_notes, link_note=link_note,
                       optional_from=optional_from, figure_notes=figure_notes)
    if dry_run:
        return report

    # --suffix decorates the DEFAULT filename; an explicit --out is taken verbatim
    if out:
        out_path = Path(out).expanduser()
    else:
        out_path = default_out_path(label, topic, kind, bank=bank, folder=folder)
        if suffix:
            out_path = out_path.with_name(out_path.stem + suffix + out_path.suffix)
    # Worked sheets already carry Adrian's title; notes fragments never do.
    lvl = BANK_TITLES.get(bank or "") if kind == "notes" else None
    omml = OmmlCache()
    store = FigureStore() if figures else None
    report.build = clone_with_practice(resolved.path, out_path, chosen, omml,
                                       show_source=show_source, page_break=page_break,
                                       space=space, optional_from=optional_from,
                                       title=(lvl, topic, resolved.path.stem) if lvl else None,
                                       figures=store)
    report.out_path = str(out_path)
    return report


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(description="Build a revision worksheet (notes | worked).")
    ap.add_argument("--kind", choices=["notes", "worked"], required=True)
    ap.add_argument("--topic", required=True, help="canonical topic, e.g. 'Binomial Theorem'")
    ap.add_argument("--bank", choices=BANKS, help="notes bank (kind=notes)")
    ap.add_argument("--folder", help="Revision folder (kind=worked): " + ", ".join(WORKED_FOLDERS))
    ap.add_argument("-n", "--questions", type=int, default=8)
    ap.add_argument("--out", help="override the output path (default: "
                                  "Dropbox/Apps/AdrianMathNotes/Revision/<AM|EM|folder>/)")
    ap.add_argument("--suffix", default="", help="appended to the default filename, e.g. ' (TEST)'")
    ap.add_argument("--practice-topic", help="DB topic if different from the fragment topic")
    ap.add_argument("--fragment", help="force a specific notes fragment by name")
    ap.add_argument("--base", help="force an explicit base .docx path")
    ap.add_argument("--level", help="force questions.level (AM, S3_AM, EM, S3_EM, S1, S2, JC1, JC2)")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--no-ai", action="store_true", help="exclude AI Generated questions")
    ap.add_argument("--show-source", action="store_true", help="print school/year on the sheet")
    ap.add_argument("--page-break", dest="page_break", action="store_true", default=None,
                    help="force a page break before Practice (default: worked only)")
    ap.add_argument("--no-page-break", dest="page_break", action="store_false")
    ap.add_argument("--space", type=int, default=2,
                    help="extra blank working lines per sub-part (default 2)")
    ap.add_argument("--minutes", type=int, default=0, metavar="M",
                    help="trim the sheet to ~M minutes of working (%g min/mark); "
                         "never below %d questions" % (MINUTES_PER_MARK, SIZE_BAND_Q[0]))
    ap.add_argument("--optional", type=int, default=0, metavar="N",
                    help="put an '(Optional)' divider before the last N questions")
    ap.add_argument("--drop-parts", metavar="SPEC",
                    help="scope sub-parts, e.g. '3:a,b 7:a' (numbers are sheet numbers "
                         "from a --dry-run with the same --seed)")
    ap.add_argument("--link", metavar="TOPIC",
                    help="add one question tagged with BOTH --topic and this one, last")
    ap.add_argument("--json", action="store_true",
                    help="print the selected questions in full as JSON (with --dry-run, "
                         "this is what you read to choose --drop-parts)")
    ap.add_argument("--no-figures", action="store_true",
                    help="exclude figure questions instead of embedding their images "
                         "(pre-2026-08-12 behaviour)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--list", action="store_true", help="list fragments / sheets and exit")
    a = ap.parse_args(argv)

    if a.list:
        if a.kind == "notes":
            for b in ([a.bank] if a.bank else BANKS):
                print("== %s ==" % b)
                for n in list_fragments(b):
                    print("   ", n)
        else:
            for f in ([a.folder] if a.folder else WORKED_FOLDERS):
                print("== %s ==" % f)
                for n in list_worked(f):
                    print("   ", n)
        return 0

    try:
        rep = make_worksheet(
            kind=a.kind, topic=a.topic, bank=a.bank, folder=a.folder, n=a.questions,
            out=a.out, practice_topic=a.practice_topic, fragment=a.fragment, base=a.base,
            seed=a.seed, allow_ai=not a.no_ai, show_source=a.show_source,
            page_break=a.page_break, level=a.level, dry_run=a.dry_run,
            suffix=a.suffix, space=a.space, optional=a.optional,
            drop_parts=a.drop_parts, link=a.link, minutes=a.minutes,
            figures=not a.no_figures)
    except ValueError as e:
        print("BAD ARGUMENT: %s" % e, file=sys.stderr)
        return 2
    except ResolutionError as e:
        print("RESOLUTION FAILED: %s" % e, file=sys.stderr)
        if e.candidates:
            print("Closest names:", file=sys.stderr)
            for c in e.candidates:
                print("   %s" % c, file=sys.stderr)
        if e.elsewhere:
            print("Present in another bank: %s" % ", ".join(e.elsewhere), file=sys.stderr)
        return 2
    print(rep.text())
    if a.json:
        print("\n--- selected questions (sheet numbers are what --drop-parts takes) ---")
        print(rep.selection_json())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
