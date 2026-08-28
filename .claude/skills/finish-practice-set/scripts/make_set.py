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
CONTENT_TOP = 96.0      # where the page-1 body starts after the nudge


def build(live, title, footer_top, header_bot, content_top, key_pdf,
          title_size=TITLE_SIZE, title_baseline=TITLE_BASELINE,
          content_target=CONTENT_TOP):
    originals = os.path.join(os.path.dirname(live), "originals")
    os.makedirs(originals, exist_ok=True)
    backup = os.path.join(originals,
                          os.path.basename(live).replace(".pdf", " (original).pdf"))
    if not os.path.exists(backup):
        shutil.copy2(live, backup)
        print(f"  backed up -> originals/{os.path.basename(backup)}")

    doc = pymupdf.open(backup)          # always rebuild from the pristine source
    W, H = doc[0].rect.width, doc[0].rect.height

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
    ap.add_argument("--footer-top", type=float, required=True)
    ap.add_argument("--header-bot", type=float, default=0.0,
                    help="0 when page 1 has no header to strip")
    ap.add_argument("--content-top", type=float, required=True)
    ap.add_argument("--key", required=True, help="answer-key PDF to append")
    a = ap.parse_args()
    build(a.live, a.title, a.footer_top, a.header_bot, a.content_top, a.key)


if __name__ == "__main__":
    main()
