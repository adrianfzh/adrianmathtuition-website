# -*- coding: utf-8 -*-
"""Page-break hygiene helpers, lifted from the A Math book build."""
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
def body_child(body, el):
    while el is not None and el.getparent() is not body:
        el = el.getparent()
    return el

def set_break_before(el):
    """pageBreakBefore on a block.  On a table it belongs to the first
    paragraph of the first cell -- that is where Word reads it."""
    if el.tag == qn('w:tbl'):
        first = el.find(qn('w:tr'))
        if first is None:
            return False
        cell = first.find(qn('w:tc'))
        if cell is None:
            return False
        el = cell.find(qn('w:p'))
        if el is None:
            return False
    ppr = el.find(qn('w:pPr'))
    if ppr is None:
        ppr = OxmlElement('w:pPr'); el.insert(0, ppr)
    if ppr.find(qn('w:pageBreakBefore')) is None:
        ppr.insert(0, OxmlElement('w:pageBreakBefore'))
    return True


def break_onto_next(doc, body, msg):
    """A page break alone in its own paragraph costs a line at the TOP of the
    page it makes: the break fires, then what is left of that empty paragraph
    takes the first line of the new page.  Carried on the next block as
    pageBreakBefore it does exactly the same job and the page starts at the top.

    Twenty-two of these across the thirteen sheets, twelve of them in
    Trigonometry.  One in Circles was printing a wholly BLANK page: the content
    before it happened to fill its page exactly, so the empty paragraph's own
    line opened a page of its own and the break then pushed the real content to
    the page after that (merged p47, 15 Sep 2026).
    """
    n = 0
    while True:
        kids = [e for e in body if e.tag != qn('w:sectPr')]
        for i, el in enumerate(kids):
            if el.tag != qn('w:p'):
                continue
            if "".join(t.text or "" for t in el.iter(qn('w:t'))).strip():
                continue
            brs = [b for b in el.iter(qn('w:br')) if b.get(qn('w:type')) == 'page']
            if len(brs) != 1:
                continue
            if next(el.iter(qn('w:drawing')), None) is not None or any(el.iter(qn('w:pict'))):
                continue
            if i + 1 >= len(kids) or not set_break_before(kids[i + 1]):
                continue          # nothing to carry it -- leave it alone
            body.remove(el); n += 1
            break                 # the list is stale now; walk again
        else:
            break
    if n:
        msg.append("moved %d lone page break(s) onto the next block" % n)


def has_break_before(el):
    if el.tag == qn('w:tbl'):
        first = el.find(qn('w:tr'))
        el = first.find(qn('w:tc')).find(qn('w:p')) if first is not None else None
        if el is None:
            return False
    ppr = el.find(qn('w:pPr'))
    return ppr is not None and ppr.find(qn('w:pageBreakBefore')) is not None


def is_blank_para(el):
    return (el.tag == qn('w:p')
            and not "".join(t.text or "" for t in el.iter(qn('w:t'))).strip()
            and next(el.iter(qn('w:drawing')), None) is None
            and next(el.iter(qn('w:pict')), None) is None
            and next(el.iter(qn('w:br')), None) is None)


def drop_before_break(doc, body, msg):
    """An empty paragraph sitting immediately before a forced page break is
    never seen -- it is the last line of the page it is on, and an empty line at
    the foot of a page shows nothing.  Left in, it can be pushed onto a page of
    its own when the block before it happens to fill its page exactly, and then
    it prints a wholly BLANK page: that is Circles' merged p47 (15 Sep 2026),
    an empty paragraph between the last solution table and the page break in
    front of "Miscellaneous Question".
    """
    n = 0
    while True:
        kids = [e for e in body if e.tag != qn('w:sectPr')]
        for i, el in enumerate(kids[:-1]):
            if is_blank_para(el) and has_break_before(kids[i + 1]):
                body.remove(el); n += 1
                break
        else:
            break
    if n:
        msg.append("dropped %d empty paragraph(s) before a page break" % n)


def find(doc, body, text):
    for p in doc.paragraphs:
        if p.text.strip() == text:
            return body_child(body, p._p)
    return None

def drop_trailing_breaks(body, msg):
    """A page break left dangling at the end would print a blank page."""
    for el in reversed([e for e in body if e.tag != qn('w:sectPr')]):
        txt = "".join(t.text or "" for t in el.iter(qn('w:t')))
        n = strip_page_breaks(el)
        if n:
            msg.append("dropped %d trailing page break(s)" % n)
        if txt.strip():
            break

def strip_page_breaks(el):
    n = 0
    for br in list(el.iter(qn('w:br'))):
        if br.get(qn('w:type')) == 'page':
            br.getparent().remove(br); n += 1
    ppr = el.find(qn('w:pPr'))
    if ppr is not None:
        pbb = ppr.find(qn('w:pageBreakBefore'))
        if pbb is not None:
            ppr.remove(pbb); n += 1
    return n

