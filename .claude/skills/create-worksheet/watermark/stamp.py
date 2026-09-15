"""Put a tile grid UNDER the content of an existing PDF.

merge_page(over=False) draws the stamp first and the page's own content on top,
which is exactly what a watermark is: the grey never covers a digit, and the
opaque white the picture carries is the page's own colour anyway.
"""
import sys
from PIL import Image
from pypdf import PdfReader, PdfWriter, Transformation

src, png, out, pages = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
want = [int(p) for p in pages.split(',')]

im = Image.open(png)
flat = Image.new('RGB', im.size, 'white')
flat.paste(im, mask=im.split()[-1])
stamp_pdf = out + '.stamp.pdf'
flat.save(stamp_pdf, 'PDF', resolution=200.0)

r = PdfReader(src)
sr = PdfReader(stamp_pdf)
w = PdfWriter()
for n in want:
    page = r.pages[n - 1]
    stamp = PdfReader(stamp_pdf).pages[0]
    # the stamp is A4 at 200 dpi; scale it onto whatever this page measures
    sx = float(page.mediabox.width) / float(stamp.mediabox.width)
    sy = float(page.mediabox.height) / float(stamp.mediabox.height)
    stamp.add_transformation(Transformation().scale(sx, sy))
    page.merge_page(stamp, over=False)
    w.add_page(page)
with open(out, 'wb') as f:
    w.write(f)
print('wrote', out, len(want), 'pages')
