# -*- coding: utf-8 -*-
"""Put a new centred title into the slot the old source line occupied.

Measured off the originals with pdfplumber, so the replacement lands in
exactly the same place and weight as the line it replaces:

    font      OpenSans-Bold, 13.0 pt
    colour    (0.067, 0.067, 0.067)  ~ #111111
    centre    x = 297.48  (page is 594.96 wide, so dead centre)
    baseline  y = 739.22  from the foot of the page

The embedded OpenSans-Bold in these PDFs is subsetted to the glyphs the old
header needed and carries no lowercase at all, so the real TTF is registered
and drawn as an overlay instead of trying to reuse the embedded resource.
"""
import io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_PATH = '/usr/share/fonts/truetype/open-sans/OpenSans-Bold.ttf'
FONT = 'OpenSansBold'
SIZE = 13.0
COLOR = (0.067, 0.067, 0.067)
CENTRE_X = 297.48
BASELINE_Y = 739.22

pdfmetrics.registerFont(TTFont(FONT, FONT_PATH))


def add_title(src, dst, title):
    reader = PdfReader(src)
    page0 = reader.pages[0]
    w = float(page0.mediabox.width)
    h = float(page0.mediabox.height)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w, h))
    c.setFont(FONT, SIZE)
    c.setFillColorRGB(*COLOR)
    c.drawCentredString(CENTRE_X, BASELINE_Y, title)
    c.save()
    buf.seek(0)

    overlay = PdfReader(buf).pages[0]
    writer = PdfWriter(clone_from=src)
    writer.pages[0].merge_page(overlay)
    with open(dst, 'wb') as fh:
        writer.write(fh)

    width = pdfmetrics.stringWidth(title, FONT, SIZE)
    return width, CENTRE_X - width / 2, CENTRE_X + width / 2


if __name__ == '__main__':
    import sys
    wdt, x0, x1 = add_title(sys.argv[1], sys.argv[2], sys.argv[3])
    print(f'  "{sys.argv[3]}"  width {wdt:.1f}pt  spans x {x0:.1f}..{x1:.1f}')
