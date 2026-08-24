# -*- coding: utf-8 -*-
"""Drop the source-paper line and the date line from page 1 of a worked-solutions PDF.

Page 1 header of these documents:

    top  47.4   ADRIAN'S MATH TUITION      keep
    top  70.5   WORKED SOLUTIONS           keep
    top  93.6   TJC 2025 P2                remove
    top 113.2   24 Aug 2026 · N questions  remove
    top 133.6   first question             keep

The content stream is drawn under a page-level `cm` of
(0.24, 0, 0, -0.24, 0, 841.92) — a flip and scale — so a raw text-matrix y
means nothing on its own.  The CTM stack is tracked through q/Q/cm and each
BT..ET block's real position on the page is computed before deciding.

Whole BT..ET blocks are dropped, so the text leaves the text layer entirely
rather than being painted over; a block is self-contained, so removing one
cannot disturb the graphics state of anything after it.
"""
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, NameObject, DecodedStreamObject

BAND_TOP = 86.0     # just under "WORKED SOLUTIONS" (70.5)
BAND_BOTTOM = 126.0  # just above the first question (133.6)


def _mul(m, n):
    """m x n for PDF 2x3 affine matrices [a b c d e f]."""
    a1, b1, c1, d1, e1, f1 = m
    a2, b2, c2, d2, e2, f2 = n
    return (a1 * a2 + b1 * c2,
            a1 * b2 + b1 * d2,
            c1 * a2 + d1 * c2,
            c1 * b2 + d1 * d2,
            e1 * a2 + f1 * c2 + e2,
            e1 * b2 + f1 * d2 + f2)


def _blocks(cs, height):
    """Yield (start, end, device_top) for every BT..ET block in the stream."""
    ctm = (1, 0, 0, 1, 0, 0)
    stack = []
    start = None
    tm = None
    for i, (ops, op) in enumerate(cs.operations):
        if op == b'q':
            stack.append(ctm)
        elif op == b'Q':
            ctm = stack.pop() if stack else (1, 0, 0, 1, 0, 0)
        elif op == b'cm' and len(ops) >= 6:
            ctm = _mul(tuple(float(x) for x in ops[:6]), ctm)
        elif op == b'BT':
            start, tm = i, None
        elif op == b'Tm' and len(ops) >= 6 and tm is None:
            tm = tuple(float(x) for x in ops[:6])
        elif op in (b'Td', b'TD') and len(ops) >= 2 and tm is None:
            tm = (1, 0, 0, 1, float(ops[0]), float(ops[1]))
        elif op == b'ET' and start is not None:
            if tm is not None:
                dev = _mul(tm, ctm)
                yield start, i, height - dev[5]
            start, tm = None, None


def strip(src, dst, page_index=0, report=False):
    reader = PdfReader(src)
    writer = PdfWriter(clone_from=src)
    page = writer.pages[page_index]
    height = float(page.mediabox.height)
    cs = ContentStream(page.get_contents(), page.pdf)

    drop = set()
    found = []
    for s, e, top in _blocks(cs, height):
        if BAND_TOP <= top <= BAND_BOTTOM:
            drop.update(range(s, e + 1))
            found.append(round(top, 1))
    if report:
        print(f'  blocks in band: {len(found)}  tops: {sorted(set(found))}')

    cs.operations = [o for i, o in enumerate(cs.operations) if i not in drop]
    new = DecodedStreamObject()
    new.set_data(cs.get_data())
    page[NameObject('/Contents')] = page.pdf._add_object(new)
    with open(dst, 'wb') as fh:
        writer.write(fh)
    return len(found), len(reader.pages)


if __name__ == '__main__':
    import sys
    n, pages = strip(sys.argv[1], sys.argv[2], report=True)
    print(f'  dropped {n} text blocks from page 1 of {pages}')
