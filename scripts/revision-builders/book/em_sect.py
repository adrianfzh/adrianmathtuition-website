# -*- coding: utf-8 -*-
"""Stage 1c (E Math book): give every sheet its own Word SECTION.

docxcompose collapses the fourteen sectPr into the master's one, so Trigonometry
and Arc Length (side margins 2.21 cm, their line length preserved when they came
off US Letter) and the three sheets with a 1.5 cm bottom margin would be
re-wrapped to the master's page setup.  A sectPr carried in the LAST paragraph
of a sheet is that sheet's own section and survives the append -- and a nextPage
section break starts the next sheet on a fresh page by itself, which is why the
pageBreakBefore from the cut stage comes back off.
"""
import os, copy
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

B = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(B, "prepped")
ORDER = [
 "REV 3 Quadratic Equations.docx", "REV 3 Quadratic Equations (Applications).docx",
 "REV 3 Quadratic Graphs.docx", "REV 3 Linear Inequalities.docx", "REV 3 Indices.docx",
 "REV 3 Standard Form.docx", "REV 3 Coordinate Geometry.docx",
 "REV 3 Graphs of Functions.docx", "REV 3 Graphs on Graph Paper.docx",
 "REV 3 Distance and Speed Time Graphs.docx", "REV 3 Trigonometry.docx",
 "REV 3 Arc Length and Sector Area.docx", "REV 3 Congruency and Similarity.docx",
 "REV 3 Geometrical Properties of Circles.docx",
]


def strip_hf_refs(body):
    """Drop every header/footer reference from every sectPr in the sheet.

    prep.py emptied the header and footer parts but left their references
    behind, and docxcompose renumbers the appended sheet's relationship ids
    without knowing about a reference riding inside a paragraph's sectPr -- in
    the A Math merge three sheets' headerReference ended up pointing at
    media/image42 and Word refused to OPEN the document at all (no error, no
    dialog, simply no document).  Nothing here has a running head, so they go.
    """
    n = 0
    for sect in body.iter(qn('w:sectPr')):
        for tag in ('w:headerReference', 'w:footerReference'):
            for ref in sect.findall(qn(tag)):
                sect.remove(ref); n += 1
    return n


for k, fn in enumerate(ORDER):
    path = os.path.join(P, fn)
    doc = Document(path)
    body = doc.element.body
    n_ref = strip_hf_refs(body)
    if k > 0:
        ppr = doc.paragraphs[0]._p.find(qn('w:pPr'))
        if ppr is not None:
            for pbb in ppr.findall(qn('w:pageBreakBefore')):
                ppr.remove(pbb)
    note = "last section, sectPr left at body level"
    if k < len(ORDER) - 1:
        # COPY, never move: a body-level sectPr is mandatory, and docxcompose
        # drops the appended document's one while keeping the master's.
        sect = copy.deepcopy(body.find(qn('w:sectPr')))
        t = sect.find(qn('w:type'))
        if t is None:
            t = OxmlElement('w:type'); sect.insert(0, t)
        t.set(qn('w:val'), 'nextPage')
        kids = [e for e in body if e.tag != qn('w:sectPr')]
        if kids and kids[-1].tag == qn('w:p'):
            host = kids[-1]; note = "sectPr into the last paragraph"
        else:
            host = OxmlElement('w:p'); body.append(host)
            note = "sectPr into a new final paragraph (sheet ended on a table)"
        hppr = host.find(qn('w:pPr'))
        if hppr is None:
            hppr = OxmlElement('w:pPr'); host.insert(0, hppr)
        hppr.append(sect)
    doc.save(path)
    print("%-46s %d h/f refs stripped; %s" % (fn[:46], n_ref, note))
