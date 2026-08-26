# -*- coding: utf-8 -*-
"""Add a house-style title to a paper's first page and open a gap beneath it.

Style measured off the papers Adrian had already titled by hand, so a new
title is indistinguishable from those: Times-Bold 18 pt, centred, first line
on a baseline 47 pt below the page edge, second 69.5 pt, and the body starting
at 103.2 pt. Those numbers reproduce the 34 pt / 30 pt spacing the earlier
batch was set to.

Drawn into the content stream rather than added as an annotation: these files
have no annotation layer to match, and a Type1 base-14 font needs no
embedding, so the title survives any downstream tool. The drawing is appended
AFTER the wrapped body, where the CTM is back to identity — the body's own
transforms cannot drag the title with them.
"""
import pikepdf
from pikepdf import ContentStreamInstruction, Operator, Name, Dictionary, String
from reportlab.pdfbase import pdfmetrics

SIZE = 18.0
BASE1 = 47.0        # baseline of line 1, from the page top
BASE2 = 69.5        # baseline of line 2
BODY_TOP = 103.2    # where the first line of content should land


def _w(text):
    return pdfmetrics.stringWidth(text, 'Times-Bold', SIZE)


def add(pdf, page_no, lines, content_top):
    pg = pdf.pages[page_no - 1]
    W = float(pg.mediabox[2]) - float(pg.mediabox[0])
    H = float(pg.mediabox[3]) - float(pg.mediabox[1])
    d = BODY_TOP - content_top

    pg.contents_coalesce()
    ops = pikepdf.parse_content_stream(pg)
    out = [ContentStreamInstruction([], Operator('q')),
           ContentStreamInstruction([1, 0, 0, 1, 0, -d], Operator('cm'))]
    out.extend(ops)
    out.append(ContentStreamInstruction([], Operator('Q')))

    res = pg.obj.get('/Resources')
    if res is None:
        res = pdf.make_indirect(Dictionary())
        pg.obj['/Resources'] = res
    fonts = res.get('/Font')
    if fonts is None:
        fonts = pdf.make_indirect(Dictionary())
        res['/Font'] = fonts
    fonts['/AMTitle'] = pdf.make_indirect(Dictionary(
        Type=Name('/Font'), Subtype=Name('/Type1'),
        BaseFont=Name('/Times-Bold'), Encoding=Name('/WinAnsiEncoding')))

    out.append(ContentStreamInstruction([], Operator('q')))
    out.append(ContentStreamInstruction([0, 0, 0], Operator('rg')))
    out.append(ContentStreamInstruction([], Operator('BT')))
    out.append(ContentStreamInstruction([Name('/AMTitle'), SIZE], Operator('Tf')))
    for text, base in zip(lines, (BASE1, BASE2)):
        x = (W - _w(text)) / 2.0
        out.append(ContentStreamInstruction(
            [1, 0, 0, 1, round(x, 2), round(H - base, 2)], Operator('Tm')))
        out.append(ContentStreamInstruction([String(text)], Operator('Tj')))
    out.append(ContentStreamInstruction([], Operator('ET')))
    out.append(ContentStreamInstruction([], Operator('Q')))

    pg.Contents = pdf.make_stream(pikepdf.unparse_content_stream(out))
    return d
