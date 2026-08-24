# -*- coding: utf-8 -*-
"""Strip the running header and footer from Practice Set 4.

Measured with pdfplumber on the source (A4, height 841.89, `top` = distance
from the page top):

    header   page number            top  41.3
    body     real question content  top  67.4 .. 736.3
    footer   "2025 Prelim ... [Turn over"   top 785.0
             "www.KiasuExamPaper.com"       top 797.3
             booklet page number            top 810.2

So everything above top=60 and below top=760 is furniture, and the bands are
comfortably clear of real content.

Rather than paint white boxes over the furniture (which leaves the watermark
in the text layer), whole BT..ET text objects are dropped when the text they
position falls inside a band.  A BT..ET block is self-contained, so removing
one cannot corrupt the graphics state of anything that follows.
"""
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, NameObject, DecodedStreamObject

HEADER_MAX_TOP = 60.0    # drop text whose top is above this
FOOTER_MIN_TOP = 760.0   # drop text whose top is below this


def _band_hit(y_from_bottom, page_height):
    """True when a text object at this y sits in the header or footer band."""
    top = page_height - y_from_bottom
    return top < HEADER_MAX_TOP or top > FOOTER_MIN_TOP


def scrub_page(page):
    """Remove header/footer BT..ET blocks. Returns how many were dropped."""
    height = float(page.mediabox.height)
    cs = ContentStream(page.get_contents(), page.pdf)

    out, block, in_text = [], [], False
    # y carried by the text matrix / line-positioning operators in this block
    block_y = None
    dropped = 0

    for operands, op in cs.operations:
        if op == b'BT':
            in_text, block, block_y = True, [(operands, op)], None
            continue
        if in_text:
            block.append((operands, op))
            if op == b'Tm' and len(operands) >= 6:
                if block_y is None:
                    block_y = float(operands[5])
            elif op in (b'Td', b'TD') and len(operands) >= 2:
                if block_y is None:
                    block_y = float(operands[1])
            if op == b'ET':
                in_text = False
                if block_y is not None and _band_hit(block_y, height):
                    dropped += 1
                else:
                    out.extend(block)
                block = []
            continue
        out.append((operands, op))

    if in_text:            # unterminated BT — keep it, do not risk a corrupt stream
        out.extend(block)

    cs.operations = out
    new = DecodedStreamObject()
    new.set_data(cs.get_data())
    page[NameObject('/Contents')] = page.pdf._add_object(new)
    return dropped


def strip(src, dst):
    reader = PdfReader(src)
    writer = PdfWriter(clone_from=src)
    total = 0
    for page in writer.pages:
        total += scrub_page(page)
    with open(dst, 'wb') as fh:
        writer.write(fh)
    return total, len(reader.pages)


if __name__ == '__main__':
    import sys
    n, pages = strip(sys.argv[1], sys.argv[2])
    print(f'dropped {n} header/footer text objects across {pages} pages')
