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
NOTES_BANK = DROPBOX / "notes_bank"
REVISION_ROOT = DROPBOX / "Revision"
DEFAULT_OUT_DIR = Path.home() / "Desktop"

BANKS = ["S3_AM", "S4_AM", "S3_EM", "S4_EM"]
WORKED_FOLDERS = ["AM", "EM", "S1", "S2", "JC", "AM G2", "EM G2"]

# bank -> (primary questions.level, top-up level or None)
BANK_LEVELS = {
    "S4_AM": ("AM", None),
    "S3_AM": ("S3_AM", "AM"),
    "S4_EM": ("EM", None),
    "S3_EM": ("S3_EM", "EM"),
}
# worked-sheet folder -> (primary level, top-up level or None)
FOLDER_LEVELS = {
    "AM": ("AM", None),
    "EM": ("EM", None),
    "S1": ("S1", None),
    "S2": ("S2", None),
    "JC": ("JC", None),
    "AM G2": ("AM", None),
    "EM G2": ("EM", None),
}

# --------------------------------------------------------------------------
# House style (mirrors create-worksheet/worksheet_lib.py)
# --------------------------------------------------------------------------

FONT = "Times New Roman"
SZ_BODY = 19        # half-points -> 9.5 pt
SZ_HEAD = 24        # 12 pt
COLOR_NAVY = "1F4E79"
COLOR_ORANGE = "843C0C"
LINE_15 = "360"     # 1.5 line spacing, w:lineRule="auto"
IND_Q_LEFT, IND_Q_HANG = 567, 567       # 1 cm
IND_SQ_LEFT, IND_SQ_HANG = 1134, 567    # 2 cm / 1 cm
MARKS_INSET = 283                       # 0.5 cm — marks sit just inside the margin
FALLBACK_TAB_TWIPS = 8789               # 15.5 cm, used if sectPr can't be read

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
    d = NOTES_BANK / bank
    if not d.is_dir():
        raise ResolutionError(
            "Notes bank %r not found at %s (banks: %s)" % (bank, d, ", ".join(BANKS)))
    return sorted(p.stem for p in d.glob("*.docx") if not p.name.startswith("~$"))


def resolve_fragment(bank: str, topic: str) -> Resolved:
    """exact filename -> fuzzy -> grouped '(All)' -> error with 5 closest names."""
    d = NOTES_BANK / bank
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
    return sorted(p.stem for p in d.glob("*.docx") if not p.name.startswith("~$"))


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
         "exam_type,paper,question_number,difficulty,has_image,verified")

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


def fetch_pool(env: dict, level: str, topic: str, page: int = 1000, cap: int = 4000) -> list:
    """All non-deleted, image-free rows tagged with `topic` at `level`.

    Paged with a STABLE order (id.asc) — paging without an explicit stable order
    silently drops and duplicates rows.
    """
    base, key = supabase_creds(env)
    headers = {"apikey": key, "Authorization": "Bearer " + key}
    topic_filter = urllib.parse.quote('{"%s"}' % topic, safe="")
    rows, offset = [], 0
    while offset < cap:
        url = (f"{base}/rest/v1/questions?select={QCOLS}"
               f"&deleted_at=is.null&has_image=is.false"
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


def usable(row) -> tuple[bool, str]:
    """v1 quality gate. Returns (ok, reason_if_not)."""
    parts = _parts(row)
    stem = (row.get("question_text") or "").strip()

    if parts:
        if any(not _nonempty(p.get("text")) for p in parts):
            return False, "a sub-part has no text (incomplete extraction)"
    elif not stem:
        return False, "no question text"

    has_ans = _nonempty(row.get("answer")) or any(_nonempty(p.get("answer")) for p in parts)
    if not has_ans:
        return False, "no answer"

    blob = " ".join([stem] + [str(p.get("text") or "") for p in parts])
    if FIGURE_REF.search(blob):
        return False, "refers to a figure/table we cannot render (v1: no figures)"
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
                     allow_ai: bool = True) -> tuple[list, dict]:
    """Tiered + diversity-spread selection, no duplicates."""
    rng = random.Random(seed)
    kept, rejected = [], {}
    for r in pool:
        ok, why = usable(r)
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


def _rpr(run, bold=False, italic=False, color=None, size=SZ_BODY):
    """CT_RPr child order: rFonts, b, i, color, sz, szCs."""
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
    _sub(rPr, "sz", val=size)
    _sub(rPr, "szCs", val=size)
    return rPr


def _run(p, text, bold=False, italic=False, color=None, size=SZ_BODY):
    r = etree.SubElement(p, w("r"))
    _rpr(r, bold, italic, color, size)
    t = etree.SubElement(r, w("t"))
    t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text
    return r


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


def _para(left=0, hanging=0, align=None, tab_at=None, space_after=0,
          keep_next=False, page_break_before=False):
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
    # but a custom tab stop also clears the default stops before it, so without
    # this the label tab could shoot straight to the right-aligned marks stop.
    # Spelling both out makes the label/marks layout renderer-independent.
    stops = []
    if hanging and left:
        stops.append(("left", left))
    if tab_at:
        stops.append(("right", tab_at))
    if stops:
        tabs = etree.SubElement(pPr, w("tabs"))
        for val, pos in sorted(stops, key=lambda s: s[1]):
            tab = etree.SubElement(tabs, w("tab"))
            tab.set(w("val"), val)
            tab.set(w("pos"), str(pos))
    sp = etree.SubElement(pPr, w("spacing"))
    sp.set(w("before"), "0")
    sp.set(w("after"), str(space_after))
    sp.set(w("line"), LINE_15)
    sp.set(w("lineRule"), "auto")
    if left or hanging:
        ind = etree.SubElement(pPr, w("ind"))
        ind.set(w("left"), str(left))
        if hanging:
            ind.set(w("hanging"), str(hanging))
        ind.set(w("right"), "0")
    if align:
        _sub(pPr, "jc", val=align)
    # paragraph-mark run properties (last child of pPr): keeps empty
    # working-space lines at the right font size instead of the base's default
    _rpr(pPr)
    return p


def _emit_parts(p, parts, omml: OmmlCache):
    for part in parts:
        kind = part[0]
        if kind == "text":
            attrs = part[2] if len(part) > 2 else {}
            _run(p, part[1], bold=attrs.get("bold", False), italic=attrs.get("italic", False),
                 color=attrs.get("color"))
        else:
            display = (kind == "math_display")
            elem = omml.get(part[1], display=display)
            if elem is not None:
                p.append(elem)
            else:
                _run(p, part[1], italic=True)   # plain-text fallback, never abort


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


def build_practice(questions: list, omml: OmmlCache, tab_at: int,
                   heading: str = "Practice", show_source: bool = False,
                   page_break: bool = True, space: int = 2) -> list:
    """Return the list of <w:p> elements forming the Practice section."""
    els = []
    if page_break:
        els.append(_page_break_para())

    h = _para(space_after=180, keep_next=True)
    _run(h, heading, bold=True, color=COLOR_NAVY, size=SZ_HEAD)
    els.append(h)

    for i, row in enumerate(questions, 1):
        parts = _parts(row)
        stem_blocks = _text_blocks(row.get("question_text") or "")
        marks_here = None if parts else row.get("total_marks")

        # -- stem
        first = _para(left=IND_Q_LEFT, hanging=IND_Q_HANG,
                            tab_at=tab_at if marks_here else None, keep_next=True)
        _run(first, "%d." % i)
        _tab_run(first)
        if stem_blocks:
            _emit_parts(first, split_math(stem_blocks[0]), omml)
        if show_source:
            src = provenance(row)
            if src:
                _run(first, "  [%s]" % src, italic=True, color="808080")
        if marks_here:
            _tab_run(first)
            _run(first, "[%s]" % marks_here)
        els.append(first)

        for extra in stem_blocks[1:]:
            p = _para(left=IND_Q_LEFT, keep_next=True)
            _emit_parts(p, split_math(extra), omml)
            els.append(p)

        # -- sub-parts
        if parts:
            for part in parts:
                blocks = _text_blocks(part.get("text") or "")
                pm = part.get("marks")
                sp = _para(left=IND_SQ_LEFT, hanging=IND_SQ_HANG,
                                 tab_at=tab_at if pm else None, keep_next=True)
                _run(sp, _label(part.get("label")))
                _tab_run(sp)
                if blocks:
                    _emit_parts(sp, split_math(blocks[0]), omml)
                if pm:
                    _tab_run(sp)
                    _run(sp, "[%s]" % pm)
                els.append(sp)
                for extra in blocks[1:]:
                    p = _para(left=IND_SQ_LEFT, keep_next=True)
                    _emit_parts(p, split_math(extra), omml)
                    els.append(p)
                for _ in range(_working_lines(pm, extra=space)):
                    els.append(_para(left=IND_SQ_LEFT))
        else:
            for _ in range(_working_lines(row.get("total_marks"), extra=space + 1)):
                els.append(_para(left=IND_Q_LEFT))

        # -- answer
        ans_parts = _answer_parts(row)
        a = _para(align="right", space_after=180)
        _run(a, "[Ans: ", color=COLOR_ORANGE)
        for kind, *rest in ans_parts:
            if kind == "text":
                _run(a, rest[0], color=COLOR_ORANGE,
                     bold=(rest[1].get("bold", False) if len(rest) > 1 else False))
            else:
                elem = omml.get(rest[0], display=False)
                if elem is not None:
                    a.append(elem)
                else:
                    _run(a, rest[0], color=COLOR_ORANGE, italic=True)
        _run(a, "]", color=COLOR_ORANGE)
        els.append(a)

    return els


def _answer_parts(row) -> list:
    top = (row.get("answer") or "").strip()
    if top:
        return split_math(top)
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
        out += split_math(a)
    return out or [("text", "see solution")]


def collect_latex(questions: list) -> list:
    """Every (latex, display) pair the practice section will need."""
    need = []
    for row in questions:
        blobs = [row.get("question_text") or ""]
        for p in _parts(row):
            blobs.append(p.get("text") or "")
        blobs.append(row.get("answer") or "")
        for p in _parts(row):
            blobs.append(p.get("answer") or "")
        for b in blobs:
            for kind, *rest in split_math(b):
                if kind in ("math", "math_display"):
                    need.append((rest[0], kind == "math_display"))
    return list(dict.fromkeys(need))


# --------------------------------------------------------------------------
# Assembly — clone base docx, inject before <w:sectPr>
# --------------------------------------------------------------------------

def _tab_from_sectpr(body) -> int:
    try:
        sect = body.find(w("sectPr"))
        pg = sect.find(w("pgSz"))
        mar = sect.find(w("pgMar"))
        width = int(pg.get(w("w")))
        left = int(mar.get(w("left")))
        right = int(mar.get(w("right")))
        span = width - left - right - MARKS_INSET
        if 2000 < span < 20000:
            return span
    except Exception:
        pass
    return FALLBACK_TAB_TWIPS


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


def clone_with_practice(base_path: Path, out_path: Path, questions: list,
                        omml: OmmlCache, heading="Practice",
                        show_source=False, page_break=True, space=2) -> dict:
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

    tab_at = _tab_from_sectpr(body)
    omml.prime(collect_latex(questions))
    els = build_practice(questions, omml, tab_at, heading=heading,
                         show_source=show_source, page_break=page_break, space=space)

    sect = body.find(w("sectPr"))
    insert_at = list(body).index(sect) if sect is not None else len(body)
    for offset, el in enumerate(els):
        body.insert(insert_at + offset, el)

    xml = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    # same OOXML schema fix create-worksheet applies: <m:count> must precede <m:mcJc>
    xml = re.sub(rb'(<m:mcJc m:val="[^"]*"/>)(<m:count m:val="[^"]*"/>)', rb"\2\1", xml)
    items["word/document.xml"] = xml

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, items[n])

    return {"paragraphs": len(els), "tab_twips": tab_at,
            "equations": sum(1 for v in omml.cache.values() if v is not None),
            "fallbacks": list(omml.fallbacks)}


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
            L.append("   %2d. %-58s %s marks, %s%s"
                     % (i, provenance(q) or "(no provenance)", q.get("total_marks"),
                        q.get("difficulty") or "?",
                        ", verified" if q.get("verified") else ""))
        if self.build:
            L.append("Equations : %d converted, %d fallback(s)"
                     % (self.build.get("equations", 0), len(self.build.get("fallbacks", []))))
            for f in self.build.get("fallbacks", []):
                L.append("            FALLBACK (plain text): %s" % f[:120])
        if self.out_path:
            L.append("Output    : %s" % self.out_path)
        return "\n".join(L)


def default_out_path(bank_label: str, topic: str, kind: str) -> Path:
    tag = "Notes" if kind == "notes" else "Worked Examples"
    safe = re.sub(r"[/:]", "-", topic)
    return DEFAULT_OUT_DIR / f"REV {bank_label} {safe} ({tag}).docx"


def make_worksheet(kind: str, topic: str, bank: str | None = None, folder: str | None = None,
                   n: int = 8, out: str | Path | None = None, practice_topic: str | None = None,
                   fragment: str | None = None, base: str | Path | None = None,
                   seed: int | None = None, allow_ai: bool = True, show_source: bool = False,
                   page_break: bool | None = None, level: str | None = None,
                   env: dict | None = None, dry_run: bool = False,
                   suffix: str = "", space: int = 2) -> RunReport:
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

    pool, level_used = [], {}
    seen = set()
    for lv in levels:
        rows = fetch_pool(env, lv, ptopic)
        fresh = [r for r in rows if r["id"] not in seen]
        seen.update(r["id"] for r in fresh)
        pool += fresh
        level_used[lv] = len(fresh)
        chosen, stats = select_questions(pool, n, seed=seed, allow_ai=allow_ai)
        if len(chosen) >= n:
            break
    chosen, stats = select_questions(pool, n, seed=seed, allow_ai=allow_ai)

    if not chosen:
        hint = ""
        try:
            topics = list_topics(env, levels[0])
            hint = ("\nClosest topics at level %s: %s"
                    % (levels[0], ", ".join(repr(t) for t in closest(ptopic, topics, 5))))
        except Exception:
            pass
        raise RuntimeError("No usable practice questions for topic %r at level(s) %s.%s"
                           % (ptopic, "/".join(levels), hint))

    report = RunReport(base=resolved, kind=kind, level_used=level_used,
                       questions=chosen, stats=stats)
    if dry_run:
        return report

    out_path = Path(out).expanduser() if out else default_out_path(label, topic, kind)
    if suffix:
        out_path = out_path.with_name(out_path.stem + suffix + out_path.suffix)
    omml = OmmlCache()
    report.build = clone_with_practice(resolved.path, out_path, chosen, omml,
                                       show_source=show_source, page_break=page_break,
                                       space=space)
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
    ap.add_argument("--out")
    ap.add_argument("--suffix", default="", help="appended to the default filename, e.g. ' (TEST)'")
    ap.add_argument("--practice-topic", help="DB topic if different from the fragment topic")
    ap.add_argument("--fragment", help="force a specific notes fragment by name")
    ap.add_argument("--base", help="force an explicit base .docx path")
    ap.add_argument("--level", help="force questions.level (AM, S3_AM, EM, S3_EM, S1, S2, JC)")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--no-ai", action="store_true", help="exclude AI Generated questions")
    ap.add_argument("--show-source", action="store_true", help="print school/year on the sheet")
    ap.add_argument("--page-break", dest="page_break", action="store_true", default=None,
                    help="force a page break before Practice (default: worked only)")
    ap.add_argument("--no-page-break", dest="page_break", action="store_false")
    ap.add_argument("--space", type=int, default=2,
                    help="extra blank working lines per sub-part (default 2)")
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
            suffix=a.suffix, space=a.space)
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
