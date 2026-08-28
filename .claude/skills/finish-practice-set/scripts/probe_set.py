#!/usr/bin/env python3
"""Probe a compiled practice-set PDF and suggest the four geometry numbers
make_set.py needs. Read-only — never writes.

    python3 probe_set.py "/path/to/2026 JC Promo Practice Set 4 (DHS 2025).pdf"

Prints suggested footer_top / header_bot / content_top plus every warning worth
eyeballing before you commit to a redaction band.
"""
import sys
from collections import Counter

import pymupdf


def spans(page):
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for line in b["lines"]:
            for sp in line["spans"]:
                if sp["text"].strip():
                    yield sp


def main(path):
    doc = pymupdf.open(path)
    n = len(doc)
    W, H = doc[0].rect.width, doc[0].rect.height
    size = "A4" if abs(H - 841.9) < 2 else "Letter" if abs(H - 792) < 2 else f"custom {W:.0f}x{H:.0f}"
    print(f"{path}")
    print(f"  {n} pages | {W:.0f} x {H:.0f} pt | {size}")
    sizes = {(round(p.rect.width), round(p.rect.height)) for p in doc}
    if len(sizes) > 1:
        print(f"  !! MIXED PAGE SIZES {sizes} — build the key to match the majority and check the odd pages")

    # ---- footer: text near the bottom that repeats across most pages -------
    band = H * 0.85
    rows = Counter()
    sample = {}
    for p in doc:
        for sp in spans(p):
            if sp["bbox"][1] > band:
                k = round(sp["bbox"][1])
                rows[k] += 1
                sample.setdefault(k, sp["text"].strip()[:60])
    repeated = sorted(k for k, c in rows.items() if c >= max(2, n * 0.6))
    print("\n  FOOTER candidates (bottom text repeating on >=60% of pages):")
    for k in repeated:
        print(f"    y={k:>5}  x{rows[k]:<3} {sample[k]!r}")
    if not repeated:
        print("    none — this paper may have no footer to strip")
    footer_top = (min(repeated) - 3) if repeated else None

    # ---- body extent, so the footer band cannot eat real content ----------
    worst = 0
    worst_pg = None
    for i, p in enumerate(doc):
        for sp in spans(p):
            if footer_top and sp["bbox"][1] >= footer_top:
                continue
            if sp["bbox"][3] > worst:
                worst, worst_pg = sp["bbox"][3], i + 1
        for d in p.get_drawings():
            r = d["rect"]
            if footer_top and r.y0 >= footer_top:
                continue
            if r.y1 > worst:
                worst, worst_pg = r.y1, i + 1
    print(f"\n  lowest real content: y={worst:.1f} (page {worst_pg})")
    if footer_top:
        if worst >= footer_top:
            print(f"    !! footer_top={footer_top:.1f} would clip content — raise it or redact per page")
        else:
            print(f"    footer_top = {footer_top:.1f}   (clear by {footer_top - worst:.1f}pt)")

    # ---- page-1 header: top spans, and the first gap that looks like a break
    p1 = sorted(spans(doc[0]), key=lambda s: s["bbox"][1])
    print("\n  PAGE 1 top spans:")
    for sp in p1[:10]:
        b = sp["bbox"]
        print(f"    y {b[1]:6.1f}-{b[3]:5.1f}  x {b[0]:6.1f}  size {sp['size']:4.1f}  {sp['text'].strip()[:50]!r}")
    header_bot = content_top = None
    for a, b in zip(p1, p1[1:]):
        if b["bbox"][1] - a["bbox"][3] > 3 and a["bbox"][1] < 70:
            header_bot = round((a["bbox"][3] + b["bbox"][1]) / 2, 1)
            content_top = round(b["bbox"][1], 1)
            break
    if header_bot:
        print(f"\n    header_bot  = {header_bot}   (band 0..{header_bot} holds the running head / page number)")
        print(f"    content_top = {content_top}   (first line of question 1)")
    else:
        print("\n    !! no clear header/body gap on page 1 — set header_bot by eye from the list above")

    # ---- things that survive a text-only redaction ------------------------
    if header_bot:
        art = [d["rect"] for d in doc[0].get_drawings() if d["rect"].y1 <= header_bot]
        if art:
            print(f"\n  !! {len(art)} line-art object(s) inside the page-1 header band — e.g. {art[0]}")
            print("     make_set.py removes covered line art, so the header rule goes with it")

    hl = []
    for i, p in enumerate(doc):
        for d in p.get_drawings():
            f = d.get("fill")
            if f and f[0] > 0.8 and f[1] > 0.8 and f[2] < 0.5:
                hl.append((i + 1, p.get_textbox(d["rect"]).strip().replace("\n", " ")[:45]))
    if hl:
        print(f"\n  {len(hl)} yellow highlight(s) baked into the pages — kept unless Adrian says otherwise:")
        for pg, t in hl:
            print(f"    p{pg}: {t!r}")

    print("\n  suggested config:")
    print(f"    --footer-top {footer_top}  --header-bot {header_bot}  --content-top {content_top}")
    doc.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
