#!/usr/bin/env python3
"""Rewrite the notes-bank Reminders bullets as real Word equations.

The Reminders sections were authored as plain text with Unicode stand-ins for
mathematics — `(a+b)ⁿ`, `(2x)³ = 8x³`, `T(r+1)`. Beside a fragment whose
formulas are genuine OMML, they read as a different document: no italic
variables, superscripts that are one glyph rather than a raised base, and
nothing Word can restyle. Adrian asked for real equations (2026-08-06).

The bullets were LaTeX-marked once by a model pass and the result frozen in
`reminders_latex.json` next to this file — a fragment-keyed map of bullet
strings where mathematics sits inside `$…$`. This script is the deterministic
half: it reads that map and rebuilds each bullet paragraph as TNR 9.5 text runs
interleaved with OMML from the same pandoc converter the practice section uses.

It is safe to re-run. A bullet is only rewritten when the LaTeX maps to the same
prose (see `prose_words`), and `--dry-run` reports without touching anything.

    python3 reminders_to_equations.py --dry-run
    python3 reminders_to_equations.py
    python3 reminders_to_equations.py --only S4_AM/Binomial

Back up the bank before the first real run — these are Adrian's editable
sources, not generated output:

    tar -czf notes_bank_backup.tar.gz notes_bank
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

from lxml import etree

import revision_lib as R
from revision_lib import M_NS, OmmlCache, SZ_BODY, w

HERE = Path(__file__).resolve().parent
LATEX_MAP = HERE / "reminders_latex.json"

BULLET = "•"
BULLET_PREFIX = "%s  " % BULLET
HEADING = "Reminders"

# Unicode Adrian typed for mathematics, folded back to ASCII words so a bullet
# can be compared with its LaTeX rewrite. Only what actually occurs in the bank.
# Every replacement is padded: unpadded, `√a` folded to the "word" sqrta and
# `aⁿ` to an, neither of which the LaTeX side can produce.
_UNI_FOLD = str.maketrans({k: " %s " % v for k, v in {
    "ⁿ": "n", "²": "2", "³": "3", "¹": "1", "⁰": "0",
    "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8",
    "⁹": "9", "₀": "0", "₁": "1", "₂": "2", "₃": "3",
    "½": "1/2", "√": "sqrt", "×": "times", "÷": "/",
    "≤": "leq", "≥": "geq", "≠": "neq", "°": "circ",
    "θ": "theta", "π": "pi", "Δ": "Delta", "∠": "angle",
    "△": "triangle", "→": "to", "±": "pm",
}.items()})

_TEX_CMD = re.compile(r"\\([a-zA-Z]+)")
_WORD = re.compile(r"[a-z]{2,}")


def math_vocabulary(mapping: dict) -> frozenset:
    """Every `\\command` name used anywhere in the map, e.g. sqrt, log, theta.

    These read as ordinary words once the markup is stripped, and the same
    mathematics is spelled without a backslash on the document side (`√`, `log`,
    `θ`). Dropping the names from BOTH sides is what keeps the comparison from
    flagging a correct rewrite. It costs a little sensitivity — a genuinely
    prose "times" or "angle" is dropped too — but a misaligned bullet differs in
    far more than one word, so the gate still does its job.
    """
    names = set()
    for bullets in mapping.values():
        for b in bullets:
            names |= set(_TEX_CMD.findall(b))
    return frozenset(n.lower() for n in names)


def prose_words(s: str, drop: frozenset = frozenset()) -> list:
    """The ordinary words of a bullet, with mathematics and markup removed.

    This is the gate that decides whether a LaTeX bullet really is the rewrite
    of the bullet sitting in the document — it catches a shifted or mismatched
    map, which would otherwise silently swap one topic's reminders for
    another's. It deliberately ignores symbols: those are exactly what the
    rewrite is allowed to change.
    """
    s = _TEX_CMD.sub(" ", s.translate(_UNI_FOLD))
    return [word for word in _WORD.findall(s.lower()) if word not in drop]


def para_text(p) -> str:
    return "".join(t.text or "" for t in p.iter(w("t")))


def has_math(p) -> bool:
    return p.find(".//{%s}oMath" % M_NS) is not None


def has_latex_math(latex: str) -> bool:
    """A real `$…$` span — an escaped `\\$` on its own is not mathematics."""
    return any(part[0].startswith("math") for part in R.split_math(latex))


def find_reminders(body) -> tuple:
    """(heading index, [bullet paragraphs]) or (None, []) if the block is absent."""
    kids = list(body)
    for i, el in enumerate(kids):
        if etree.QName(el).localname != "p" or para_text(el).strip() != HEADING:
            continue
        bullets = []
        for nxt in kids[i + 1:]:
            if etree.QName(nxt).localname != "p":
                break
            if not para_text(nxt).lstrip().startswith(BULLET):
                break
            bullets.append(nxt)
        if bullets:
            return i, bullets
    return None, []


# Outside a math span the map is markdown, so a character that would otherwise
# open mathematics is backslash-escaped — `\$` for the dollar in the Money
# reminder. Emitted verbatim that backslash reaches the page.
_ESCAPE = re.compile(r"\\([$\\_*#{}&%~^])")


def unescape_text(s: str) -> str:
    return _ESCAPE.sub(r"\1", s)


def bullet_parts(latex: str) -> list:
    parts = R.split_math(latex)
    return [(p[0], unescape_text(p[1])) + tuple(p[2:]) if p[0] == "text" else p
            for p in parts]


def latex_prose(latex: str) -> str:
    """The text outside every `$…$` span — the part a rewrite leaves alone."""
    return "".join(part[1] for part in bullet_parts(latex) if part[0] == "text")


def bullet_matches(p, latex: str, drop: frozenset) -> bool:
    """Is `latex` the rewrite of the bullet sitting in the document?

    Which halves are comparable depends on whether the bullet has been converted
    yet. Before conversion its mathematics is Unicode text, so the whole string
    is compared. After conversion the mathematics lives in OMML, which
    `para_text` does not read — an identifier like `CP` disappears from the
    document side — so there only the prose outside the maths is compared. Get
    this wrong and a re-run reports every such bullet as a mismatch.
    """
    doc = prose_words(para_text(p), drop)
    if has_math(p):
        return doc == prose_words(latex_prose(latex), drop)
    return doc == prose_words(latex, drop)


def rebuild_bullet(p, latex: str, omml: OmmlCache) -> None:
    """Replace a bullet's runs with `•  ` + text/OMML, keeping its properties."""
    pPr = p.find(w("pPr"))
    for child in list(p):
        if child is not pPr:
            p.remove(child)
    R._run(p, BULLET_PREFIX, size=SZ_BODY)
    R._emit_parts(p, bullet_parts(latex), omml)


def apply(bank_root: Path, mapping: dict, only: str | None, dry_run: bool) -> dict:
    drop = math_vocabulary(mapping)
    omml = OmmlCache()
    if not dry_run:
        exprs = []
        for bullets in mapping.values():
            for b in bullets:
                exprs += [(part[1], part[0] == "math_display")
                          for part in R.split_math(b) if part[0].startswith("math")]
        omml.prime(exprs)

    report = {"written": [], "skipped": [], "problems": [], "equations": 0}

    for key in sorted(mapping):
        if only and only.lower() not in key.lower():
            continue
        path = bank_root / key
        if not path.exists():
            report["problems"].append("%s — file not found" % key)
            continue

        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            blobs = {n: z.read(n) for n in names}
        root = etree.fromstring(blobs["word/document.xml"])
        body = root.find(w("body"))

        _idx, bullets = find_reminders(body)
        want = mapping[key]
        if not bullets:
            report["problems"].append("%s — no Reminders block" % key)
            continue
        if len(bullets) != len(want):
            report["problems"].append(
                "%s — %d bullets in document, %d in map" % (key, len(bullets), len(want)))
            continue

        mismatched = [i for i, (p, tex) in enumerate(zip(bullets, want))
                      if not bullet_matches(p, tex, drop)]
        if mismatched:
            # Already-converted bullets fold back to the same prose, so a
            # mismatch here is a real disagreement, never a second run.
            report["problems"].append(
                "%s — bullet %s does not match the map"
                % (key, ", ".join(str(i + 1) for i in mismatched)))
            continue

        todo = [i for i, p in enumerate(bullets)
                if not has_math(p) and has_latex_math(want[i])]
        if not todo:
            report["skipped"].append(key)
            continue
        if dry_run:
            report["written"].append("%s — %d/%d bullets" % (key, len(todo), len(bullets)))
            continue

        for i in todo:
            rebuild_bullet(bullets[i], want[i], omml)
        report["equations"] += sum(
            len(bullets[i].findall("{%s}oMath" % M_NS)) for i in todo)

        blobs["word/document.xml"] = etree.tostring(
            root, xml_declaration=True, encoding="UTF-8", standalone=True)
        tmp = path.with_suffix(".docx.tmp")
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as out:
            for n in names:                      # original order, nothing dropped
                out.writestr(n, blobs[n])
        shutil.move(str(tmp), str(path))
        report["written"].append("%s — %d/%d bullets" % (key, len(todo), len(bullets)))

    report["fallbacks"] = list(omml.fallbacks)
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--map", default=str(LATEX_MAP), help="fragment -> bullets JSON")
    ap.add_argument("--bank", default=str(R.NOTES_BANK), help="notes_bank root")
    ap.add_argument("--only", help="substring filter on the fragment key")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    mapping = json.loads(Path(args.map).read_text(encoding="utf-8"))
    rep = apply(Path(args.bank), mapping, args.only, args.dry_run)

    verb = "would rewrite" if args.dry_run else "rewrote"
    print("%s %d fragment(s), %d already converted" % (verb, len(rep["written"]), len(rep["skipped"])))
    if not args.dry_run:
        print("%d equations written" % rep["equations"])
    for line in rep["written"]:
        print("  ok    %s" % line)
    for line in rep["problems"]:
        print("  SKIP  %s" % line)
    if rep["fallbacks"]:
        print("  %d expression(s) fell back to plain text:" % len(rep["fallbacks"]))
        for f in rep["fallbacks"]:
            print("    %s" % f)
    return 1 if rep["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())
