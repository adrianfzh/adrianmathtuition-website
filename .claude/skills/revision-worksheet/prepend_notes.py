#!/usr/bin/env python3
"""Prepend a notes fragment to an EXISTING practice worksheet, and open up
working space under each question.

This is the reverse of `revision_lib.py`. That one clones a notes fragment and
appends FRESH questions from the bank. This one keeps Adrian's own worksheet —
its questions, its answers, its numbering — and only adds to it:

    [notes fragment: formulas + Reminders]
    [his questions, each followed by blank writing space, then its [Ans: …] line]

WHY THE PRACTICE SHEET IS THE BASE, not the notes fragment
----------------------------------------------------------
His practice sheets are Word-AUTONUMBERED: the question number is not in the
text, it lives in `w:numPr` pointing at a numId defined in that file's own
`word/numbering.xml`. Copy those paragraphs into a different document and every
number silently breaks, because the target's numbering.xml defines different
ids. Measured on 04 Nature of Roots Practice (S4 Prelim): 18 numId references.

The notes fragment has ZERO numbering references — its Reminders bullets are
literal `•` glyphs (reminders_to_equations.py writes them that way). So it
transplants cleanly in the other direction.

Hence: byte-clone the worksheet, mutate only `word/document.xml`, and insert the
notes paragraphs at the top. numbering.xml, styles and every other part are
carried over untouched, exactly as revision_lib's clone_with_practice does.

WORKING SPACE
-------------
Adrian's sheets ship with essentially none — questions run back-to-back with the
answer line immediately under them. Space goes BETWEEN the question and its
`[Ans: …]` line (his choice, 2026-08-12): the student writes first and the answer
sits below their working, rather than being visible while they attempt it.

Size is `marks + 2` blank lines, the same rule revision_lib uses, where `marks`
is the sum of every `[n]` in that question block.
"""

from __future__ import annotations
import argparse, os, re, shutil, sys, zipfile
from copy import deepcopy
from lxml import etree

# Reuse revision_lib rather than reimplementing: the house style (9.5 pt on every
# run, 1.5 line spacing, marks on the 15.5 cm stop) and Adrian's two-line title
# block already live there, and a second implementation would drift from them.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import revision_lib as R  # noqa: E402

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
def q(tag: str) -> str: return f"{{{W}}}{tag}"

ANS_RE = re.compile(r"^\s*\[?\s*Ans\s*:", re.I)
MARKS_RE = re.compile(r"\[(\d{1,2})\]")
DEFAULT_EXTRA = 2          # blank lines beyond the mark count
# Adrian, 2026-08-12: revision_lib's `marks + 2` is too tight on a printed sheet
# — scale it by half again. 3 marks -> 8 lines, 6 marks -> 12.
DEFAULT_FACTOR = 1.5
MIN_SPACE, MAX_SPACE = 4, 18   # clamps AFTER the factor


def para_text(p) -> str:
    return "".join(t.text or "" for t in p.iter(q("t")))


def body_of(path: str):
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = etree.fromstring(xml)
    return root, root.find(q("body"))


def blank_para(template=None):
    """An empty paragraph. Copies the template's paragraph properties (minus
    numbering) so the writing space inherits the sheet's own line spacing —
    a blank at the document default would be a different height."""
    p = etree.Element(q("p"))
    if template is not None:
        src = template.find(q("pPr"))
        if src is not None:
            pPr = deepcopy(src)
            for bad in pPr.findall(q("numPr")):   # never renumber on a blank
                pPr.remove(bad)
            p.append(pPr)
    return p


def strip_styles(p):
    """Drop style-id references from an imported paragraph.

    A `w:pStyle` that happens to exist in the target with different settings
    silently restyles the content — revision_lib hits the same hazard and
    solves it the same way: inline properties only.
    """
    pPr = p.find(q("pPr"))
    if pPr is not None:
        for tag in ("pStyle", "numPr"):
            for el in pPr.findall(q(tag)):
                pPr.remove(el)
    for r in p.findall(q("r")):
        rPr = r.find(q("rPr"))
        if rPr is not None:
            for el in rPr.findall(q("rStyle")):
                rPr.remove(el)
    return p


def notes_paragraphs(notes_path: str):
    """Body-level paragraphs of the notes fragment, minus its trailing sectPr
    and any wholly empty tail."""
    _, body = body_of(notes_path)
    out = []
    for child in body:
        if child.tag == q("sectPr"):
            continue
        out.append(deepcopy(child))
    while out and out[-1].tag == q("p") and not para_text(out[-1]).strip():
        out.pop()
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--worksheet", required=True, help="existing practice .docx (the base)")
    ap.add_argument("--notes", required=True, help="notes fragment .docx to prepend")
    ap.add_argument("--out", required=True)
    ap.add_argument("--extra", type=int, default=DEFAULT_EXTRA,
                    help=f"blank lines beyond the mark count (default {DEFAULT_EXTRA})")
    ap.add_argument("--factor", type=float, default=DEFAULT_FACTOR,
                    help=f"scale the space (default {DEFAULT_FACTOR})")
    ap.add_argument("--no-keep", action="store_true",
                    help="don't bind blocks with keepNext (allows page splits)")
    ap.add_argument("--bank", help="S3_AM|S4_AM|S3_EM|S4_EM — sets the title's first line")
    ap.add_argument("--topic", help="topic name for the title's second line (default: notes filename)")
    ap.add_argument("--no-title", action="store_true", help="skip the title block and Notes: label")
    ap.add_argument("--no-space", action="store_true", help="prepend notes only")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    for p in (a.worksheet, a.notes):
        if not os.path.isfile(p):
            print(f"NOT FOUND: {p}", file=sys.stderr); return 2

    root, body = body_of(a.worksheet)
    children = [c for c in body]

    # ── 1. working space: walk the body, tracking marks since the last answer ──
    inserts: list[tuple[int, int]] = []   # (index of the [Ans:] para, n blanks)
    marks = 0
    n_ans = 0
    for i, c in enumerate(children):
        if c.tag != q("p"):
            continue
        txt = para_text(c)
        if ANS_RE.match(txt.strip()):
            n_ans += 1
            if not a.no_space:
                raw = round((marks + a.extra) * a.factor) if marks else MIN_SPACE
                n = min(MAX_SPACE, max(MIN_SPACE, raw))
                inserts.append((i, n))
            marks = 0
        else:
            marks += sum(int(m) for m in MARKS_RE.findall(txt))

    if a.dry_run:
        print(f"worksheet : {os.path.basename(a.worksheet)}")
        print(f"notes     : {os.path.basename(a.notes)}")
        print(f"answers   : {n_ans} answer line(s) found")
        print(f"space     : {sum(n for _, n in inserts)} blank line(s) across "
              f"{len(inserts)} question block(s)")
        if inserts:
            print("            per block: " + ", ".join(str(n) for _, n in inserts))
        print(f"notes body: {len(notes_paragraphs(a.notes))} paragraph(s) to prepend")
        return 0

    # Insert from the end so earlier indices stay valid.
    for idx, n in reversed(inserts):
        tmpl = children[idx]
        for _ in range(n):
            body.insert(idx, blank_para(tmpl))

    # ── 1b. bind each block so a page break can't land inside it ──────────────
    # Adrian, 2026-08-12: "should not have working spaces straddled across two
    # pages, have the question be on a new page (unless a very large working
    # space is required)". A block runs from just after the previous [Ans:] to
    # the next one; keepNext goes on everything except that [Ans:] line, so the
    # question, its space and its answer travel together and breaks fall only
    # BETWEEN blocks. Word drops keepNext when a block genuinely exceeds a page,
    # which is the "very large working space" escape working by itself.
    bound = 0
    if not a.no_keep:
        block: list = []
        for c in list(body):
            if c.tag != q("p"):
                continue
            if ANS_RE.match(para_text(c).strip()):
                block.append(c)
                if len(block) > 1:
                    R._unit(block)          # keepNext on all but the [Ans:] line
                    bound += 1
                block = []
            else:
                block.append(c)

    # ── 2. prepend the notes fragment ─────────────────────────────────────────
    npars = notes_paragraphs(a.notes)
    first = body[0] if len(body) else None
    # Forward order, each inserted directly before the sheet's first paragraph:
    # that appends to the growing prefix and preserves document order. Iterating
    # `reversed()` here writes the notes out backwards — title last, the
    # Reminders heading under its own bullets.
    for el in npars:
        el = strip_styles(el) if el.tag == q("p") else el
        if first is not None:
            first.addprevious(el)
        else:
            body.append(el)
    # one blank line between the notes and the first question
    if npars and first is not None:
        first.addprevious(blank_para())

    # ── 3. house style, then the title ────────────────────────────────────────
    # Order is load-bearing and mirrors clone_with_practice: normalise FIRST so
    # the fragment's own sizes and the worksheet's are forced to the same 9.5 pt,
    # THEN add the title — it is the one deliberate departure from body size, and
    # normalising after would flatten it back down.
    house = R._normalize_house_style(root)
    title_mode = ""
    if not a.no_title:
        lvl = R.BANK_TITLES.get((a.bank or "").upper())
        topic = a.topic or os.path.splitext(os.path.basename(a.notes))[0]
        if lvl:
            title_mode = R._apply_title(body, lvl, topic, topic)

    # ── 4. byte-clone every other part ────────────────────────────────────────
    new_xml = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    tmp = a.out + ".tmp"
    with zipfile.ZipFile(a.worksheet) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():                     # original namelist order
            data = zin.read(item.filename)
            if item.filename == "word/document.xml":
                data = new_xml
            zout.writestr(item, data)
    shutil.move(tmp, a.out)

    print(f"Base      : {a.worksheet}")
    print(f"Notes     : {a.notes}  ({len(npars)} paragraph(s) prepended)")
    print(f"Space     : {sum(n for _, n in inserts)} blank line(s) across {len(inserts)} question block(s)")
    print(f"Keep      : {bound} block(s) bound — question + space + answer move together")
    print(f"House     : {house}")
    if title_mode:
        print(f"Title     : {title_mode}")
    print(f"Parts     : {len(zipfile.ZipFile(a.worksheet).infolist())} in -> "
          f"{len(zipfile.ZipFile(a.out).infolist())} out (numbering.xml carried over)")
    print(f"Output    : {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
