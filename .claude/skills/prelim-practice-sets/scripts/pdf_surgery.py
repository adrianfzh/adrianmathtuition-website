#!/usr/bin/env python3
"""Surgical edits to a finished practice-set PDF.

Every function here is written for the traps these particular files carry:
titles that are annotations rather than content, white masks that hide school
footers, annotation objects shared between pages, and text that stays in the
text layer after you paint over it.

Requires: pikepdf, numpy, Pillow, and poppler's pdftoppm on PATH.

Typical use:

    pdf  = Pdf.open("set.pdf")
    page = pdf.pages[17]
    rule = find_rule("set.pdf", 18, page_height(page))
    strip_text_band(pdf, page, rule.y + 5, rule.y + 60)      # remove old heading
    add_answer_heading(pdf, page, rule.y, rule.x0, 1, "2026 EM Prelim Practice Set 2")
    pdf.save("out.pdf")
    assert verify_unchanged("set.pdf", "out.pdf", changed={18})
"""
from collections import Counter, namedtuple
import subprocess

import numpy as np
import pikepdf
from PIL import Image
from pikepdf import Dictionary, Name, Pdf

Rule = namedtuple("Rule", "y x0 x1 from_top")

# Answer-heading offsets above the rule (see references/house-format.md).
BOLD_DY, BOLD_SIZE = 30.0, 15.5
ITAL_DY, ITAL_SIZE = 11.0, 10.0


# ---------------------------------------------------------------- geometry --
def page_height(page):
    mb = [float(v) for v in page.MediaBox]
    return mb[3] - mb[1]


def _render(pdf_path, pg, dpi, tag="s"):
    pre = f"/tmp/_surg_{tag}{pg}_{dpi}"
    subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-f", str(pg), "-l", str(pg),
                    "-singlefile", pdf_path, pre], check=True,
                   stderr=subprocess.DEVNULL)
    return np.asarray(Image.open(pre + ".png").convert("L"))


def ink_bands(pdf_path, pg, dpi=300, gap=3, thresh=200):
    """Contiguous bands of ink, as (top_pt, bottom_pt) measured from the page top."""
    a = _render(pdf_path, pg, dpi, "b")
    rows = np.where((a < thresh).sum(1) > 0)[0]
    if not len(rows):
        return []
    out, cur = [], [rows[0]]
    for r in rows[1:]:
        if r - cur[-1] <= gap:
            cur.append(r)
        else:
            out.append((cur[0] / dpi * 72, cur[-1] / dpi * 72)); cur = [r]
    out.append((cur[0] / dpi * 72, cur[-1] / dpi * 72))
    return out


def lowest_ink(pdf_path, pg, dpi=300):
    a = _render(pdf_path, pg, dpi, "l")
    rows = np.where((a < 200).sum(1) > 0)[0]
    return rows[-1] / dpi * 72 if len(rows) else 0.0


def find_rule(pdf_path, pg, height, dpi=300, search=(0.02, 0.25)):
    """Locate the horizontal rule under an answer-key heading.

    Returns its y in PDF coordinates plus its x extent. Rules drawn inside a
    `cm` transform have meaningless raw coordinates, so this measures pixels.
    """
    a = _render(pdf_path, pg, dpi, "r")
    dark = a < 120
    for r in range(int(search[0] * a.shape[0]), int(search[1] * a.shape[0])):
        cs = np.where(dark[r])[0]
        if len(cs) > 0.5 * a.shape[1]:
            from_top = r / dpi * 72
            return Rule(height - from_top, cs.min() / dpi * 72,
                        cs.max() / dpi * 72, from_top)
    raise LookupError(f"no rule found on {pdf_path} page {pg}")


# ------------------------------------------------------- content rewriting --
def _mul(m, n):
    """Row-vector matrix concatenation: apply m, then n."""
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return (a * A + b * C, a * B + b * D,
            c * A + d * C, c * B + d * D,
            e * A + f * C + E, e * B + f * D + F)


def strip_text_band(pdf, page, ylo, yhi, dry_run=False):
    """Delete text-showing operators whose device-space y lies in [ylo, yhi].

    Painting a white box over text leaves it searchable and copyable; for
    anonymising, the operators have to go. Tracks the CTM through q/Q/cm and the
    text matrix through Tm/Td/TD so it works whether the producer positions text
    absolutely (LaTeX) or inside a scaling transform (Word/Acrobat).

    Returns [(device_y, text)] for what was removed.
    """
    ctm, stack = (1, 0, 0, 1, 0, 0), []
    tm = tlm = None
    kept, removed = [], []

    for ins in pikepdf.parse_content_stream(page):
        op, a = str(ins.operator), ins.operands
        keep = True
        if op == "q":
            stack.append(ctm)
        elif op == "Q":
            if stack:
                ctm = stack.pop()
        elif op == "cm":
            ctm = _mul(tuple(float(v) for v in a), ctm)
        elif op == "BT":
            tm = tlm = (1, 0, 0, 1, 0, 0)
        elif op == "ET":
            tm = tlm = None
        elif op == "Tm":
            tm = tlm = tuple(float(v) for v in a)
        elif op in ("Td", "TD") and tlm is not None:
            tm = tlm = _mul((1, 0, 0, 1, float(a[0]), float(a[1])), tlm)
        elif op in ("Tj", "TJ", "'", '"') and tm is not None:
            y = _mul(tm, ctm)[5]
            if ylo <= y <= yhi:
                items = a[0] if op == "TJ" else [a[-1]]
                txt = "".join(str(x) for x in items
                              if isinstance(x, pikepdf.String))
                removed.append((round(y, 2), txt))
                keep = False
        if keep:
            kept.append(ins)

    if not dry_run and removed:
        page.Contents = pdf.make_stream(pikepdf.unparse_content_stream(kept))
    return removed


def add_answer_heading(pdf, page, rule_y, x, paper_no, subtitle):
    """Draw the house answer-key heading above an existing rule."""
    res = page.Resources
    if "/Font" not in res:
        res.Font = Dictionary()
    for tag, base in (("/AMtibo", "/Times-Bold"), ("/AMtiit", "/Times-Italic")):
        res.Font[tag] = pdf.make_indirect(Dictionary(
            Type=Name.Font, Subtype=Name.Type1,
            BaseFont=Name(base), Encoding=Name.WinAnsiEncoding))
    ov = (f"q 0 0 0 rg BT 1 0 0 1 {x:.2f} {rule_y + BOLD_DY:.2f} Tm "
          f"/AMtibo {BOLD_SIZE} Tf (Answers  -  Paper {paper_no}) Tj ET Q\n"
          f"q 0 0 0 rg BT 1 0 0 1 {x:.2f} {rule_y + ITAL_DY:.2f} Tm "
          f"/AMtiit {ITAL_SIZE} Tf ({subtitle}) Tj ET Q\n")
    page.contents_add(pdf.make_stream(ov.encode("latin-1")), prepend=False)


def qQ_balanced(page):
    """True when the content stream can safely be wrapped in `q … Q`."""
    depth = lo = 0
    for ins in pikepdf.parse_content_stream(page):
        op = str(ins.operator)
        if op == "q":
            depth += 1
        elif op == "Q":
            depth -= 1
            lo = min(lo, depth)
    return depth == 0 and lo >= 0


def annot_refcounts(pdf):
    """How many pages reference each annotation object — check before editing one."""
    refs = Counter()
    for p in pdf.pages:
        for a in p.get("/Annots", []):
            refs[a.objgen] += 1
    return refs


def shift_body(pdf, page, dy, refs=None, mask_below=700.0):
    """Move page content down by `dy` pt, leaving the title annotation in place.

    Bottom white masks (annotations whose top edge sits below `mask_below` in PDF
    y) hide the school footer and must travel with the content, or content slides
    under them. Shared annotation objects are copied first so other pages that
    reference the same object are not disturbed.

    Requires qQ_balanced(page); assert it before calling.
    """
    c = page.Contents
    old = (b"\n".join(bytes(s.read_bytes()) for s in c)
           if isinstance(c, pikepdf.Array) else bytes(c.read_bytes()))
    page.Contents = pdf.make_stream(b"q 1 0 0 1 0 -%.4f cm\n" % dy + old + b"\nQ\n")

    if "/Annots" not in page:
        return 0
    refs = refs if refs is not None else annot_refcounts(pdf)
    moved, out = 0, []
    for a in page.Annots:
        r = [float(v) for v in a.Rect]
        if r[3] < mask_below:
            if refs[a.objgen] > 1:                      # copy-on-write
                a = pdf.make_indirect(pikepdf.Dictionary(a))
            a.Rect = pikepdf.Array([r[0], r[1] - dy, r[2], r[3] - dy])
            moved += 1
        out.append(a)
    page.Annots = pikepdf.Array(out)
    return moved


# ------------------------------------------------------------ verification --
def verify_unchanged(orig, new, changed, n_pages, dpi=72):
    """Every page outside `changed` must render pixel-identical. Returns offenders."""
    bad = []
    for pg in range(1, n_pages + 1):
        if pg in changed:
            continue
        a = _render(orig, pg, dpi, "va").astype(int)
        b = _render(new, pg, dpi, "vb").astype(int)
        if a.shape != b.shape or np.abs(a - b).max() > 0:
            bad.append(pg)
    return bad


def text_leaks(pdf_path, needles):
    """Strings that survive in the text layer — run before declaring a set anonymous."""
    t = subprocess.run(["pdftotext", pdf_path, "-"], capture_output=True,
                       text=True).stdout
    return {n: t.count(n) for n in needles if n in t}


def marks_per_page(pdf_path, pages):
    """Sum of [n] mark tags per page, for checking a paper still totals 90."""
    import re
    all_pages = subprocess.run(["pdftotext", "-layout", pdf_path, "-"],
                               capture_output=True, text=True).stdout.split("\f")
    return {pg: sum(int(m) for m in re.findall(r"\[(\d+)\]", all_pages[pg - 1]))
            for pg in pages}
