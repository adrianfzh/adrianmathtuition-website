#!/usr/bin/env python3
"""Finish a compiled practice-set PDF: strip the source header/footer, set the
house title on page 1, append a pre-built answer key.

    python3 make_set.py \
        --live "/Users/adrianfong/Dropbox/1 REVISION LESSONS/Prelim Practice Sets/2026 JC Promo Practice Set 4 (DHS 2025).pdf" \
        --title "JC1 H2 Math Promo Practice Set 4" \
        --footer-top 768 --header-bot 60 --content-top 64.4 \
        --key /tmp/key4.pdf

Idempotent: the first run copies the live file to `originals/<name> (original).pdf`
and every run rebuilds from that copy, so re-running never double-shifts the
title or stacks a second key page.
"""
import argparse
import os
import shutil

import pymupdf

TITLE_SIZE = 18.37      # matches Set 1, the reference sheet
TITLE_BASELINE = 52.0   # title baseline, y from page top
SUBTITLE_DROP = 23.0    # second title line ("Paper 2"), baseline offset below the first
CONTENT_TOP = 96.0      # where the page-1 body starts after the nudge


def is_highlight(drawing):
    """A saturated FILL laid down behind the text by whoever compiled the source.

    Fill, not stroke: the source papers draw their own diagrams with saturated
    *strokes* (ACJC's curves are a dark slate blue), so keying on stroke colour
    would delete the figures. Highlighter marks are always filled rectangles.
    """
    f = drawing.get("fill")
    return bool(f) and (max(f) - min(f)) > 0.15


def strip_highlights(doc):
    """Drop the highlighter fills, keeping the text that sits on top.

    They are painted *behind* the glyphs, so a white cover-up would hide the
    words too. Redacting with TEXT_NONE + LINE_ART_REMOVE_IF_COVERED deletes the
    fill and nothing else; IF_COVERED (not IF_TOUCHED) means a fraction bar or
    diagram stroke that merely crosses the band survives.
    """
    n = 0
    for page in doc:
        rects = [d["rect"] for d in page.get_drawings() if is_highlight(d)]
        if not rects:
            continue
        for r in rects:
            page.add_redact_annot(r)
        page.apply_redactions(
            images=pymupdf.PDF_REDACT_IMAGE_NONE,
            graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
            text=pymupdf.PDF_REDACT_TEXT_NONE,
        )
        n += len(rects)
    return n


def parse_scrub(spec):
    """'10:45-73' -> (10, None) full-width band; '10:108,45,512,73' -> (10, rect)."""
    page, _, box = spec.partition(":")
    pno = int(page)
    if "," in box:
        x0, y0, x1, y1 = (float(v) for v in box.split(","))
        return pno, (x0, y0, x1, y1)
    y0, _, y1 = box.partition("-")
    return pno, (None, float(y0), None, float(y1))


def apply_scrubs(doc, scrubs):
    """Erase compiler callouts — a boxed comment, its leader line, its text.

    Unlike a highlight these carry their own text and are stroked, so they need
    an explicit band from the operator: a saturated stroke is indistinguishable
    from a diagram. IF_TOUCHED here because the leader line runs out of the box.
    """
    n = 0
    for spec in scrubs:
        pno, (x0, y0, x1, y1) = parse_scrub(spec)
        page = doc[pno - 1]
        rect = pymupdf.Rect(0 if x0 is None else x0, y0,
                            page.rect.width if x1 is None else x1, y1)
        page.add_redact_annot(rect)
        page.apply_redactions(
            images=pymupdf.PDF_REDACT_IMAGE_NONE,
            graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
            text=pymupdf.PDF_REDACT_TEXT_REMOVE,
        )
        n += 1
    return n


def build(live, title, footer_top, header_bot, content_top, key_pdf,
          title_size=TITLE_SIZE, title_baseline=TITLE_BASELINE,
          content_target=CONTENT_TOP, keep_highlights=False, scrubs=(),
          subtitle=None):
    originals = os.path.join(os.path.dirname(live), "originals")
    os.makedirs(originals, exist_ok=True)
    backup = os.path.join(originals,
                          os.path.basename(live).replace(".pdf", " (original).pdf"))
    if not os.path.exists(backup):
        shutil.copy2(live, backup)
        print(f"  backed up -> originals/{os.path.basename(backup)}")

    doc = pymupdf.open(backup)          # always rebuild from the pristine source
    W, H = doc[0].rect.width, doc[0].rect.height

    if not keep_highlights:
        n = strip_highlights(doc)
        if n:
            print(f"  stripped {n} highlight(s)")
    if scrubs:
        print(f"  scrubbed {apply_scrubs(doc, scrubs)} callout band(s)")

    for pno, page in enumerate(doc):
        page.add_redact_annot(pymupdf.Rect(0, footer_top, W, H))
        if pno == 0 and header_bot:
            page.add_redact_annot(pymupdf.Rect(0, 0, W, header_bot))
        page.apply_redactions(
            images=pymupdf.PDF_REDACT_IMAGE_NONE,
            graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
            text=pymupdf.PDF_REDACT_TEXT_REMOVE,
        )

    dy = content_target - content_top

    out = pymupdf.open()
    p1 = out.new_page(width=W, height=H)
    p1.show_pdf_page(pymupdf.Rect(0, dy, W, H + dy), doc, 0)   # nudge body down
    tw = pymupdf.get_text_length(title, fontname="tibo", fontsize=title_size)
    p1.insert_text(((W - tw) / 2, title_baseline), title,
                   fontname="tibo", fontsize=title_size, color=(0, 0, 0))
    if subtitle:   # EM sets carry two papers: "... Practice Set 1" / "Paper 2"
        sw = pymupdf.get_text_length(subtitle, fontname="tibo", fontsize=title_size)
        p1.insert_text(((W - sw) / 2, title_baseline + SUBTITLE_DROP), subtitle,
                       fontname="tibo", fontsize=title_size, color=(0, 0, 0))
    if len(doc) > 1:
        out.insert_pdf(doc, from_page=1, to_page=len(doc) - 1)

    key = pymupdf.open(key_pdf)
    kw, kh = key[0].rect.width, key[0].rect.height
    if abs(kw - W) > 2 or abs(kh - H) > 2:
        print(f"  !! key page is {kw:.0f}x{kh:.0f} but the paper is {W:.0f}x{H:.0f}"
              f" — rebuild the key at the paper's size")
    out.insert_pdf(key)
    key.close()

    out.save(live, garbage=4, deflate=True)
    n = len(out)
    out.close()
    doc.close()
    print(f"  {n} pages ({n - 1} paper + key) | body nudged {dy:+.1f}pt | {W:.0f}x{H:.0f}")
    return live


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", required=True, help="the PDF to overwrite in place")
    ap.add_argument("--title", required=True)
    ap.add_argument("--subtitle", default=None,
                    help='second centred title line, e.g. "Paper 2"')
    ap.add_argument("--footer-top", type=float, required=True)
    ap.add_argument("--header-bot", type=float, default=0.0,
                    help="0 when page 1 has no header to strip")
    ap.add_argument("--content-top", type=float, required=True)
    ap.add_argument("--key", required=True, help="answer-key PDF to append")
    ap.add_argument("--keep-highlights", action="store_true",
                    help="leave the source's highlighter marks in place")
    ap.add_argument("--scrub", action="append", default=[], metavar="PAGE:Y0-Y1",
                    help="erase a compiler callout, e.g. --scrub 10:44-73 "
                         "or --scrub 10:108,44,512,73 (repeatable, 1-based page)")
    a = ap.parse_args()
    build(a.live, a.title, a.footer_top, a.header_bot, a.content_top, a.key,
          keep_highlights=a.keep_highlights, scrubs=a.scrub, subtitle=a.subtitle)


if __name__ == "__main__":
    main()
