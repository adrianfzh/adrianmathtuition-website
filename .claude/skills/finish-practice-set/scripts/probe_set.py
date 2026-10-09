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


def is_scanned(doc):
    """One big image per page and (almost) no text = a scanned compilation.

    The compiler overlays only its watermark and page number as text, so the
    text-based bands below would report "no header" and a footer that clears
    everything — while the school's footer sits untouched inside the picture.
    """
    hits = 0
    for p in doc:
        area = p.rect.width * p.rect.height
        big = any((pymupdf.Rect(i["bbox"]).get_area() / area) > 0.8
                  for i in p.get_image_info())
        if big and sum(1 for _ in spans(p)) <= 3:
            hits += 1
    return hits >= max(1, len(doc) * 0.8)


def dark_runs(page, y0, y1, thresh=170, merge_gap=3):
    """Runs of rows carrying dark pixels between y0 and y1 (pt), as (top, bottom, width).

    Rendered at 72 dpi so one pixel row is one point; a row counts when any
    pixel in it is darker than `thresh` (0 = black; 170 still catches a thin
    separator rule spread over two rows). Runs closer than `merge_gap` are one
    object — a glyph's counter would otherwise split a page number in two.
    """
    pix = page.get_pixmap(dpi=72, colorspace=pymupdf.csGRAY)
    w, buf = pix.width, pix.samples
    lo, hi = max(0, int(y0)), min(pix.height, int(y1))
    runs, start, last, cols = [], None, None, []
    for r in range(lo, hi):
        row = buf[r * w:(r + 1) * w]
        dark = min(row) < thresh
        if dark:
            if start is None:
                start = r
            last = r
            cols.extend(i for i, v in enumerate(row) if v < thresh)
        elif start is not None and r - last > merge_gap:
            runs.append((start, last, max(cols) - min(cols) + 1))
            start, cols = None, []
    if start is not None:
        runs.append((start, last, max(cols) - min(cols) + 1))
    return runs


def pixel_bands(doc):
    """Suggest header_bot / footer_top for a scanned set from the pixel rows.

    Header: a page number is a short run high on the page (<= 60pt wide, top
    <= 70pt); the body's first line is wide. The band sits midway between the
    lowest page number and the highest body start — and when no page has one,
    there is no header to strip (--header-bot 0). Footer: rows are scanned only ABOVE the
    compiler's overlay text (its watermark + page number, which the band takes
    anyway); the last run is the school's footer row when it starts inside the
    bottom 70pt, and the band sits midway between it and the content above.
    Suggestions only — read the runs printed with them before trusting either.
    """
    H = doc[0].rect.height
    print("\n  SCANNED pages — measuring the bands from the pixels (pt):")
    num_bot, body_top, foot_top, cont_bot = [], [], [], []
    for i, p in enumerate(doc):
        overlay = [sp["bbox"][1] for sp in spans(p) if sp["bbox"][1] > H * 0.85]
        cut = min(overlay) - 1 if overlay else H
        top = dark_runs(p, 0, H * 0.16)
        bot = dark_runs(p, H * 0.84, cut)
        fmt = lambda rs: [(a, b, f"w{wd}") for a, b, wd in rs]
        print(f"    p{i + 1:<3} top {fmt(top[:3])}   bottom {fmt(bot)}   (overlay from y={cut + 1:.0f})")
        if top and top[0][2] <= 60 and top[0][0] <= 70:      # a page number, not a body line
            num_bot.append(top[0][1])
            if len(top) >= 2:
                body_top.append(top[1][0])
        elif top:
            body_top.append(top[0][0])
        if bot and bot[-1][0] >= H - 70:
            foot_top.append(bot[-1][0])
            if len(bot) >= 2:
                cont_bot.append(bot[-2][1])
        elif bot:
            cont_bot.append(bot[-1][1])
    header_bot = round((max(num_bot) + min(body_top)) / 2) if num_bot and body_top else 0
    footer_top = round((max(cont_bot) + min(foot_top)) / 2) if cont_bot and foot_top else None
    if num_bot:
        print(f"    page numbers end by y={max(num_bot)}, the body starts at y={min(body_top)}"
              f" -> header_bot {header_bot} (every page carries one: --header-all-pages)")
    else:
        print("    no page number in the top band on any page -> header_bot 0 (nothing to strip)")
    if footer_top:
        print(f"    content ends by y={max(cont_bot)}, the footer row starts at y={min(foot_top)}"
              f" -> footer_top {footer_top}")
    print("    content_top = the body's first run on page 1 (top list above); build with --scanned")
    return header_bot, footer_top

def band_pixels(doc, header_bot, footer_top, thresh=128):
    """Count dark pixels the STORED page images carry inside the two bands.

    A text-only redaction leaves the picture untouched, so this decides the
    mode: a few stray pixels per page are scan specks and text-only mode keeps
    the images byte-identical; hundreds mean the school's footer or page
    number is in the picture and the bands must be applied with --scanned.
    """
    table = bytes(1 if v < thresh else 0 for v in range(256))
    worst_h = worst_f = (-1, 0)
    for i, page in enumerate(doc):
        for inf in page.get_image_info(xrefs=True):
            if pymupdf.Rect(inf["bbox"]).get_area() / page.rect.get_area() < 0.8:
                continue
            pix = pymupdf.Pixmap(doc, inf["xref"])
            if pix.n > 1:
                pix = pymupdf.Pixmap(pymupdf.csGRAY, pix)
            buf, w, h = pix.samples, pix.width, pix.height
            x0, y0, x1, y1 = inf["bbox"]
            scale = h / (y1 - y0)

            def count(a, b):
                ra, rb = max(0, int((a - y0) * scale)), min(h, int((b - y0) * scale))
                return buf[ra * w:rb * w].translate(table).count(b"\x01") if rb > ra else 0

            hc = count(0, header_bot) if header_bot else 0
            fc = count(footer_top, page.rect.height) if footer_top else 0
            worst_h = max(worst_h, (hc, i + 1))
            worst_f = max(worst_f, (fc, i + 1))
    return worst_h, worst_f


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

    scanned = is_scanned(doc)
    if scanned:
        print("  !! SCANNED compilation: one image per page, the only text is the compiler's overlay")
        print("     the text bands below see just that overlay — use the pixel bands further down")

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

    def lowest_content(cut):
        """Bottom of everything that is NOT part of the footer band at `cut`."""
        worst, pg = 0, None
        for i, p in enumerate(doc):
            for sp in spans(p):
                if cut and sp["bbox"][1] >= cut:
                    continue
                if sp["bbox"][3] > worst:
                    worst, pg = sp["bbox"][3], i + 1
            for d in p.get_drawings():
                if cut and d["rect"].y0 >= cut:
                    continue
                if d["rect"].y1 > worst:
                    worst, pg = d["rect"].y1, i + 1
        return worst, pg

    # A repeating row is only a footer if no real content sits below it. Tall
    # brackets and fraction bars repeat at the same y across pages too, and
    # picking one of those as the cut would redact half the last question.
    footer_top = worst = worst_pg = None
    for k in repeated:
        cand = k - 3
        w, pg = lowest_content(cand)
        if w < cand:
            footer_top, worst, worst_pg = cand, w, pg
            break
        print(f"    y={k} rejected — real content reaches y={w:.1f} (page {pg})")
    if worst is None:
        worst, worst_pg = lowest_content(None)
    print(f"\n  lowest real content: y={worst:.1f} (page {worst_pg})")
    if footer_top:
        print(f"    footer_top = {footer_top:.1f}   (clear by {footer_top - worst:.1f}pt)")
    elif repeated:
        print("    !! no candidate clears the content — set footer_top by eye, or redact per page")

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

    sat = lambda c: c is not None and (max(c) - min(c)) > 0.15
    fills, strokes = [], []
    for i, p in enumerate(doc):
        for d in p.get_drawings():
            txt = p.get_textbox(d["rect"]).strip().replace("\n", " ")[:45]
            if sat(d.get("fill")):
                fills.append((i + 1, txt))
            elif sat(d.get("color")):
                strokes.append((i + 1, d["rect"], txt))
    if fills:
        print(f"\n  {len(fills)} highlighter fill(s) — make_set.py removes these automatically:")
        for pg, t in fills:
            print(f"    p{pg}: {t!r}")
    if strokes:
        print(f"\n  {len(strokes)} saturated STROKE(s) — YOUR CALL, look at each:")
        print("    a diagram drawn in colour (keep) vs a compiler callout box (scrub)")
        for pg, r, t in strokes:
            print(f"    p{pg} {r} {t!r}")
        print("    to erase one:  --scrub <page>:<y0>-<y1>   (check nothing real is in the band)")

    flags = ""
    if scanned:
        hb, ft = pixel_bands(doc)
        header_bot, footer_top = hb, ft or footer_top
        (hc, hp), (fc, fp) = band_pixels(doc, header_bot, footer_top)
        dirty = max(hc, fc) > 50
        print(f"\n  dark pixels the scan itself carries inside the bands: header max {hc} (p{hp}),"
              f" footer max {fc} (p{fp})")
        print("    -> the school's marks are in the picture: build with --scanned" if dirty else
              "    -> specks only: text-only mode (no --scanned) keeps the images byte-identical")
        flags = ("  --header-all-pages" if header_bot else "") + ("  --scanned" if dirty else "")

    print("\n  suggested config:")
    print(f"    --footer-top {footer_top}  --header-bot {header_bot}  --content-top {content_top}{flags}")
    doc.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
