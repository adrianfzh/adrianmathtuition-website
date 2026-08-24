# -*- coding: utf-8 -*-
"""Give the title on each paper's first page room to breathe.

The title is not page content — it is a /Square annotation with an appearance
stream, sitting in front of the page.  So the two halves move independently:

  * the annotation is moved by translating its /Rect (same width and height,
    so the appearance maps across without scaling);
  * the page itself is moved by wrapping its whole content stream in
    `q  1 0 0 1 0 -D cm  ...  Q`, which shifts every mark on the page down
    without touching a single drawing operator.  Both streams were checked
    q/Q balanced first, so the outer save/restore cannot be popped early.

Measured off the rendered page rather than the object boxes, because the
annotation's /Rect is a bounding box that the title text does not fill, and
because page 1 carries white-out rectangles that make the content look 250 pt
taller than its actual ink.

Before:                       page 1        page 17
  space above title            25.0 pt        17.3 pt
  gap below title               5.8 pt        13.0 pt

Both titles were effectively touching question 1.
"""
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, DecodedStreamObject, FloatObject, ArrayObject

TOP_MARGIN = 34.0     # from the page edge to the top of the title's first line
GAP = 32.0            # from the bottom of the title to the first line of content

# (page number, title ink top, title ink bottom, content ink top) — all pt from
# the top of the page, measured from a 150 dpi render.
MEASURED = [
    (1,  25.0, 64.3, 70.1),
    (17, 17.3, 56.6, 69.6),
]


def plan():
    for pno, t_top, t_bot, c_top in MEASURED:
        d_title = TOP_MARGIN - t_top              # positive = move down the page
        d_content = (t_bot + d_title + GAP) - c_top
        yield pno, d_title, d_content


def apply(src, dst):
    writer = PdfWriter(clone_from=src)
    for pno, d_title, d_content in plan():
        page = writer.pages[pno - 1]

        # --- the title annotation: translate its rect down the page
        for a in page['/Annots']:
            o = a.get_object()
            if not o.get('/Contents'):        # the other Square carries no text
                continue
            x0, y0, x1, y1 = (float(v) for v in o['/Rect'])
            o[NameObject('/Rect')] = ArrayObject(
                [FloatObject(x0), FloatObject(y0 - d_title),
                 FloatObject(x1), FloatObject(y1 - d_title)])

        # --- the page content: one outer translation around the whole stream
        data = page.get_contents().get_data()
        new = DecodedStreamObject()
        new.set_data(b'q 1 0 0 1 0 %.4f cm\n' % (-d_content) + data + b'\nQ\n')
        page[NameObject('/Contents')] = page.pdf._add_object(new)

        print(f'  page {pno:>2}: title down {d_title:5.1f} pt, '
              f'content down {d_content:5.1f} pt')

    with open(dst, 'wb') as fh:
        writer.write(fh)


if __name__ == '__main__':
    import sys
    print('shifting:')
    apply(sys.argv[1], sys.argv[2])
    print(f'wrote {sys.argv[2]}')
