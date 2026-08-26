# -*- coding: utf-8 -*-
"""Give each paper's title room to breathe, without disturbing page furniture.

The title is a /Square annotation floating in front of the page, so the title
and the page move independently: the annotation by translating its /Rect, the
page by wrapping its whole content stream in one outer translation.

Two things must NOT move with the page:

  * a running footer that sits at the same place on every page — shifting it
    on page 1 alone would knock that page out of alignment with the rest
    (SAJC's "[Turn Over");
  * text that a white-out rectangle is covering — the original school header
    and footer. Slide those down and they walk out from under their cover and
    become visible again (CJC's paper carries both).

Both are handled the same way: the block is wrapped in the exact inverse of
the outer translation, so it lands back where it started. Furniture is
identified by repetition — a line that appears at the same y, with the same
text, on an adjacent page is furniture, not content. Requiring the text to
match too matters: on TJC's first page real question content happens to share
a y with the next page, and a position-only test would have pinned it.
"""
import pdfplumber
import pikepdf
from pikepdf import ContentStreamInstruction, Operator, Name

TOP_MARGIN = 34.0    # page edge -> top of the title's first line
GAP = 30.0           # bottom of the title -> first line of content


# ------------------------------------------------------------- matrix helpers
def _mul(m, n):
    a1, b1, c1, d1, e1, f1 = m
    a2, b2, c2, d2, e2, f2 = n
    return (a1*a2 + b1*c2, a1*b2 + b1*d2,
            c1*a2 + d1*c2, c1*b2 + d1*d2,
            e1*a2 + f1*c2 + e2, e1*b2 + f1*d2 + f2)


def _blocks(ops, height):
    """(start, end, device_baseline_top) for each BT..ET block."""
    ctm, stack, start, tm = (1, 0, 0, 1, 0, 0), [], None, None
    for i, ins in enumerate(ops):
        op = str(ins.operator)
        o = ins.operands
        if op == 'q':
            stack.append(ctm)
        elif op == 'Q':
            ctm = stack.pop() if stack else (1, 0, 0, 1, 0, 0)
        elif op == 'cm' and len(o) >= 6:
            ctm = _mul(tuple(float(x) for x in o[:6]), ctm)
        elif op == 'BT':
            start, tm = i, None
        elif op == 'Tm' and len(o) >= 6 and tm is None:
            tm = tuple(float(x) for x in o[:6])
        elif op in ('Td', 'TD') and len(o) >= 2 and tm is None:
            tm = (1, 0, 0, 1, float(o[0]), float(o[1]))
        elif op == 'ET' and start is not None:
            if tm is not None:
                yield start, i, height - _mul(tm, ctm)[5]
            start, tm = None, None


# ------------------------------------------------------------------ furniture
def furniture_spans(path, page, height, band=170.0):
    """y-spans on `page` that repeat verbatim at the same height on a neighbour.

    Only the top and bottom bands are considered; a repeated line in the middle
    of a page would be a coincidence, not a running head.
    """
    with pdfplumber.open(path) as pdf:
        if len(pdf.pages) < 2:
            return []
        pg = pdf.pages[page - 1]
        others = [pdf.pages[i] for i in (page - 2, page)
                  if 0 <= i < len(pdf.pages) and i != page - 1]

        def lines(p):
            rows = {}
            for w in p.extract_words():
                rows.setdefault(round(w['top'], 0), []).append(w)
            return rows

        mine = lines(pg)
        theirs = [lines(p) for p in others]
        spans = []
        for top, ws in mine.items():
            if band < top < height - band:
                continue
            text = ' '.join(w['text'] for w in sorted(ws, key=lambda w: w['x0']))
            for other in theirs:
                for otop, ows in other.items():
                    if abs(otop - top) > 1.5:
                        continue
                    otext = ' '.join(w['text'] for w in sorted(ows, key=lambda w: w['x0']))
                    if otext == text:
                        spans.append((min(w['top'] for w in ws),
                                      max(w['bottom'] for w in ws), text))
                        break
                else:
                    continue
                break
        return spans


# ---------------------------------------------------------------------- apply
def shift_page(pdf, page_no, d_title, d_content, hold_spans):
    pg = pdf.pages[page_no - 1]
    height = float(pg.mediabox[3]) - float(pg.mediabox[1])

    for a in pg.get('/Annots', []):
        if a.get('/Contents'):
            x0, y0, x1, y1 = (float(v) for v in a['/Rect'])
            a['/Rect'] = [x0, y0 - d_title, x1, y1 - d_title]

    pg.contents_coalesce()
    ops = pikepdf.parse_content_stream(pg)

    held = set()
    for s, e, dev in _blocks(ops, height):
        if any(t - 3.0 <= dev <= b + 5.0 for t, b, _ in hold_spans):
            held.update(range(s, e + 1))
            for i in (s, e):
                held.add(i)

    def cm(dy):
        return ContentStreamInstruction([1, 0, 0, 1, 0, dy], Operator('cm'))

    out = [ContentStreamInstruction([], Operator('q')), cm(-d_content)]
    i, n = 0, len(ops)
    starts = {s: e for s, e, dev in _blocks(ops, height)
              if any(t - 3.0 <= dev <= b + 5.0 for t, b, _ in hold_spans)}
    while i < n:
        if i in starts:
            end = starts[i]
            out.append(ContentStreamInstruction([], Operator('q')))
            out.append(cm(d_content))            # exact inverse: stays put
            out.extend(ops[i:end + 1])
            out.append(ContentStreamInstruction([], Operator('Q')))
            i = end + 1
        else:
            out.append(ops[i])
            i += 1
    out.append(ContentStreamInstruction([], Operator('Q')))

    pg.Contents = pdf.make_stream(pikepdf.unparse_content_stream(out))
