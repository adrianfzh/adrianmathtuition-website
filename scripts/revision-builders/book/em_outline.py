"""Stage 4 -- give the PDF a sidebar.

Word for Mac exports through Quartz.  It keeps the cover's internal hyperlinks
(14 /Link annotations) but it writes NO /Outlines at all, whatever the
document's Heading 1s say -- so the PDF opens with an empty bookmark sidebar in
Preview, Acrobat and every phone reader.

The destinations, though, are already in the file: the cover's fourteen links
carry explicit /Dest arrays pointing at the first page of each section.  The
outline is built from those, so it can never disagree with the contents page --
it IS the contents page, read back out of the exported PDF.
"""
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import Fit

TITLES = [
    "Quadratic Equations",
    "Quadratic Equations: Applications",
    "Quadratic Graphs",
    "Linear Inequalities",
    "Indices",
    "Standard Form",
    "Coordinate Geometry",
    "Graphs of Functions",
    "Graphs on Graph Paper",
    "Distance and Speed-Time Graphs",
    "Trigonometry",
    "Arc Length and Sector Area",
    "Congruency and Similarity",
    "Geometrical Properties of Circles",
]


def main(src, dst):
    r = PdfReader(src)
    pageno = {p.indirect_reference.idnum: i for i, p in enumerate(r.pages)}

    dests = []
    for a in (r.pages[0].get('/Annots') or []):
        o = a.get_object()
        if o.get('/Subtype') != '/Link':
            continue
        d = o.get('/Dest')
        if d is None and o.get('/A'):
            d = o['/A'].get('/D')
        if d is None:
            continue
        dests.append((pageno[d[0].idnum], float(d[2]), float(d[3])))

    assert len(dests) == len(TITLES), "%d links, %d titles" % (len(dests), len(TITLES))
    assert dests == sorted(dests), "the cover's links are out of page order"

    w = PdfWriter(clone_from=src)
    for title, (pg, left, top) in zip(TITLES, dests):
        w.add_outline_item(title, pg, fit=Fit.xyz(left=left, top=top))
    with open(dst, 'wb') as fh:
        w.write(fh)

    back = PdfReader(dst)
    print("  outline: %d entries -> pages %s"
          % (len(back.outline), [d[0] + 1 for d in dests]))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
