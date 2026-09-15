# -*- coding: utf-8 -*-
"""Stage 1d (E Math book): keep each sheet's own Normal once it is in the book.

docxcompose keeps the MASTER's styles.xml, so every paragraph that leaves
something to Normal is re-resolved against Quadratic Equations' Normal once it
is inside the book.  Ten of the fourteen sheets have a bare Normal and the
master's own docDefaults, so nothing moves.  The four that worksheet_lib wrote
-- Linear Inequalities, Graphs of Functions, Graphs on Graph Paper, Distance and
Speed-Time -- declare Normal as Times New Roman 9.5 pt at 1.5 line spacing with
no space before or after, and in the book they lose it.  Measured against the
standalone exports: +1, +2, +2 and +2 pages, which is Adrian's page breaks
moved.  (Proved by substitution: the book's styles.xml alone reproduces the
growth, and putting this one Normal back into it removes it again.)

All four declare an identical Normal, so it is copied out here as a style of its
own, SheetNormalWS, applied to every plain paragraph in those four sheets, and
made the base of the three styles that were based on Normal.  Nothing else is
touched: a paragraph's own direct formatting still wins over the style.
"""
import os, re, zipfile, glob
from docx import Document
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsmap

B = os.path.dirname(os.path.abspath(__file__))
PREP = os.path.join(B, "prepped")
NAME = "SheetNormalWS"
SHEETS = ["REV 3 Linear Inequalities.docx", "REV 3 Graphs of Functions.docx",
          "REV 3 Graphs on Graph Paper.docx",
          "REV 3 Distance and Speed Time Graphs.docx"]
REBASE = ("SubQuestion", "WSTitle", "WSSubtitle")
W = nsmap['w']

def normal_of(path):
    st = zipfile.ZipFile(path).read("word/styles.xml").decode("utf8")
    m = re.search(r'<w:style [^>]*w:styleId="Normal".*?</w:style>', st, re.S)
    return re.sub(r'<w:rsid[^/]*/>', '', m.group(0))

seen = {normal_of(os.path.join(PREP, s)) for s in SHEETS}
assert len(seen) == 1, "the four sheets no longer share one Normal"
body = re.search(r'<w:style [^>]*>(.*)</w:style>', seen.pop(), re.S).group(1)
body = body.replace('<w:name w:val="Normal"/>', '<w:name w:val="%s"/>' % NAME)
STYLE = ('<w:style xmlns:w="%s" w:type="paragraph" w:customStyle="1" '
         'w:styleId="%s">%s</w:style>' % (W, NAME, body))

for name in SHEETS:
    path = os.path.join(PREP, name)
    doc = Document(path)
    styles = doc.styles.element
    if styles.find(qn('w:style') + '[@%s="%s"]' % (qn('w:styleId'), NAME)) is None:
        styles.append(parse_xml(STYLE))
    rebased = 0
    for st in styles.findall(qn('w:style')):
        if st.get(qn('w:styleId')) in REBASE:
            b = st.find(qn('w:basedOn'))
            if b is not None and b.get(qn('w:val')) == 'Normal':
                b.set(qn('w:val'), NAME); rebased += 1
    applied = 0
    for p in doc.element.body.iter(qn('w:p')):
        ppr = p.find(qn('w:pPr'))
        if ppr is None:
            ppr = OxmlElement('w:pPr'); p.insert(0, ppr)
        if ppr.find(qn('w:pStyle')) is not None:
            continue
        e = OxmlElement('w:pStyle'); e.set(qn('w:val'), NAME)
        ppr.insert(0, e); applied += 1
    doc.save(path)
    print("%-46s applied=%-4d rebased=%d" % (name[:46], applied, rebased))
