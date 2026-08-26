# -*- coding: utf-8 -*-
"""Remove the running header and footer from a compiled past-paper PDF.

Furniture is identified by repetition, not by position alone: a line in the
top or bottom band whose text — with its digits normalised away, so "Page 3 of
24" and "Page 4 of 24" count as the same line — recurs on a large share of the
pages. That keeps a genuine question that happens to sit high on one page from
being mistaken for a header.

Whole BT..ET blocks are dropped, so the text leaves the text layer entirely
rather than being painted over, and a block is self-contained so removing one
cannot disturb the graphics state of what follows. The content stream is drawn
under page-level transforms in some of these files, so each block's real
position is computed by tracking the CTM through q/Q/cm rather than trusting a
raw text-matrix y.
"""
import re
import pdfplumber
import pikepdf
from breathe import _blocks

NORM = re.compile(r'\d+')
TOP_BAND = 95.0
BOT_BAND = 110.0


def furniture_rows(path, share=0.30):
    """{page_index: [(top, bottom), ...]} for every repeating header/footer line."""
    with pdfplumber.open(path) as pdf:
        H = float(pdf.pages[0].height)
        n = len(pdf.pages)
        per_page, tally = [], {}
        for pg in pdf.pages:
            rows = {}
            for w in pg.extract_words():
                if w['top'] < TOP_BAND or w['top'] > H - BOT_BAND:
                    rows.setdefault(round(w['top']), []).append(w)
            entry = {}
            for top, ws in rows.items():
                txt = ' '.join(x['text'] for x in sorted(ws, key=lambda x: x['x0']))
                key = (top, NORM.sub('#', txt).strip())
                entry[key] = (min(x['top'] for x in ws), max(x['bottom'] for x in ws))
                tally[key] = tally.get(key, 0) + 1
            per_page.append(entry)

        need = max(3, int(n * share))
        keep = {k for k, c in tally.items() if c >= need}
        return {i: [span for k, span in e.items() if k in keep]
                for i, e in enumerate(per_page)}, H, n


def strip(src, dst, share=0.30, report=True):
    rows, H, n = furniture_rows(src, share)
    dropped = 0
    with pikepdf.open(src) as pdf:
        for i, pg in enumerate(pdf.pages):
            spans = rows.get(i, [])
            if not spans:
                continue
            pg.contents_coalesce()
            ops = pikepdf.parse_content_stream(pg)
            height = float(pg.mediabox[3]) - float(pg.mediabox[1])
            kill = set()
            for s, e, dev in _blocks(ops, height):
                if any(t - 3.0 <= dev <= b + 5.0 for t, b in spans):
                    kill.update(range(s, e + 1))
            if not kill:
                continue
            dropped += 1
            keep = [o for j, o in enumerate(ops) if j not in kill]
            pg.Contents = pdf.make_stream(pikepdf.unparse_content_stream(keep))
        pdf.save(dst)
    if report:
        print(f'   stripped furniture on {dropped}/{n} pages -> {dst}')
    return dropped
