# -*- coding: utf-8 -*-
"""Stage 1: make normalised WORKING COPIES of each source.  The originals in
Dropbox are never opened for writing (ADRIAN-STYLE s6 -- a sheet handed over in
Dropbox is his file)."""
import os, shutil, copy
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Pt, Cm, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH



W = qn('w:val')
def _w(tag): return qn('w:' + tag)

# ---------------------------------------------------------------- resolver --
MCTRLPR = '{http://schemas.openxmlformats.org/officeDocument/2006/math}ctrlPr'


class Resolver:
    """Effective run font / size and paragraph spacing, walking the same chain
    Word walks: docDefaults -> paragraph style (basedOn first) -> character
    style -> direct.  Used to BAKE Trigonometry's own Normal into the runs, so
    that landing on another document's Normal cannot restyle it."""
    def __init__(self, doc):
        self.styles = {}
        for st in doc.styles.element.findall(qn('w:style')):
            self.styles[st.get(qn('w:styleId'))] = st
        dd = doc.styles.element.find(qn('w:docDefaults'))
        rd = dd.find(qn('w:rPrDefault')) if dd is not None else None
        self.dflt_rpr = rd.find(qn('w:rPr')) if rd is not None else None
        pd = dd.find(qn('w:pPrDefault')) if dd is not None else None
        self.dflt_ppr = pd.find(qn('w:pPr')) if pd is not None else None
        self.default_style = None
        for sid, st in self.styles.items():
            if st.get(qn('w:type')) == 'paragraph' and st.get(qn('w:default')) == '1':
                self.default_style = sid

    def chain(self, style_id):
        out, seen = [], set()
        while style_id and style_id in self.styles and style_id not in seen:
            seen.add(style_id)
            out.append(self.styles[style_id])
            b = self.styles[style_id].find(qn('w:basedOn'))
            style_id = b.get(W) if b is not None else None
        return list(reversed(out))          # outermost ancestor first

    def rpr_layers(self, p, r):
        """Every rPr that applies to run r, weakest first."""
        layers = []
        if self.dflt_rpr is not None:
            layers.append(self.dflt_rpr)
        ppr = p.find(qn('w:pPr'))
        pstyle = None
        if ppr is not None:
            ps = ppr.find(qn('w:pStyle'))
            if ps is not None:
                pstyle = ps.get(W)
        for st in self.chain(pstyle or self.default_style):
            sp = st.find(qn('w:rPr'))
            if sp is not None:
                layers.append(sp)
        rpr = r.find(qn('w:rPr'))
        if rpr is not None:
            rs = rpr.find(qn('w:rStyle'))
            if rs is not None:
                for st in self.chain(rs.get(W)):
                    sp = st.find(qn('w:rPr'))
                    if sp is not None:
                        layers.append(sp)
            layers.append(rpr)
        return layers

    def mark_layers(self, p):
        """Every rPr that applies to the paragraph MARK, weakest first.

        The mark is a real character on the line: its size sets a floor under
        the line's height even when every run on the line is smaller.  It has no
        run of its own, so the chain ends at pPr/rPr instead of r/rPr.
        """
        layers = []
        if self.dflt_rpr is not None:
            layers.append(self.dflt_rpr)
        ppr = p.find(qn('w:pPr'))
        pstyle = None
        if ppr is not None:
            ps = ppr.find(qn('w:pStyle'))
            if ps is not None:
                pstyle = ps.get(W)
        for st in self.chain(pstyle or self.default_style):
            sp = st.find(qn('w:rPr'))
            if sp is not None:
                layers.append(sp)
        if ppr is not None:
            own = ppr.find(qn('w:rPr'))
            if own is not None:
                layers.append(own)
        return layers

    def ppr_layers(self, p):
        layers = []
        if self.dflt_ppr is not None:
            layers.append(self.dflt_ppr)
        ppr = p.find(qn('w:pPr'))
        pstyle = None
        if ppr is not None:
            ps = ppr.find(qn('w:pStyle'))
            if ps is not None:
                pstyle = ps.get(W)
        for st in self.chain(pstyle or self.default_style):
            sp = st.find(qn('w:pPr'))
            if sp is not None:
                layers.append(sp)
        if ppr is not None:
            layers.append(ppr)
        return layers

def _last(layers, tag):
    found = None
    for L in layers:
        e = L.find(qn('w:' + tag))
        if e is not None:
            found = e
    return found

def bake(path):
    """Write Trigonometry's effective font / size / spacing onto the runs and
    paragraphs themselves, so the merge cannot change how it looks."""
    doc = Document(path)
    R = Resolver(doc)
    body = doc.element.body
    math_runs = set()
    for om in body.iter(qn('m:oMath')):
        for r in om.iter(qn('w:r')):
            math_runs.add(r)
    n_r = n_p = 0
    for p in body.iter(qn('w:p')):
        # ---- paragraph spacing
        pl = R.ppr_layers(p)
        sp = _last(pl, 'spacing')
        if sp is not None:
            ppr = p.find(qn('w:pPr'))
            if ppr is None:
                ppr = OxmlElement('w:pPr'); p.insert(0, ppr)
            own = ppr.find(qn('w:spacing'))
            if own is None:
                own = OxmlElement('w:spacing')
                ins = ppr.find(qn('w:pStyle'))
                ppr.insert(1 if ins is not None else 0, own)
            for a in ('w:after', 'w:before', 'w:line', 'w:lineRule',
                      'w:afterAutospacing', 'w:beforeAutospacing'):
                if own.get(qn(a)) is None and sp.get(qn(a)) is not None:
                    own.set(qn(a), sp.get(qn(a)))
            n_p += 1
        # ---- the paragraph MARK's own font and size
        # The mark carries no run, so with nothing of its own it takes its size
        # from Normal -- and after the merge that is the MASTER's Normal (12 pt),
        # not Trigonometry's (9.5 pt).  At Trigonometry's 1.5-line spacing the
        # mark alone then puts an 18 pt floor under every line instead of
        # 14.25 pt, and the section grew from 32 pages to 40 (measured,
        # 15 Sep 2026; 608 of its 713 paragraph marks had no size of their own).
        # Baking it writes back exactly what this document already resolves to,
        # so the sheet on its own is unchanged.
        ml = R.mark_layers(p)
        mrf, msz = _last(ml, 'rFonts'), _last(ml, 'sz')
        if mrf is not None or msz is not None:
            ppr = p.find(qn('w:pPr'))
            if ppr is None:
                ppr = OxmlElement('w:pPr'); p.insert(0, ppr)
            mrpr = ppr.find(qn('w:rPr'))
            if mrpr is None:
                mrpr = OxmlElement('w:rPr')
                # in pPr the mark's rPr sits just BEFORE sectPr -- appending
                # past a sheet's own sectPr would put it out of schema order
                sect = ppr.find(qn('w:sectPr'))
                if sect is not None:
                    sect.addprevious(mrpr)
                else:
                    ppr.append(mrpr)
            if mrpr.find(qn('w:rFonts')) is None and mrf is not None:
                mrpr.insert(0, copy.deepcopy(mrf))
            if mrpr.find(qn('w:sz')) is None and msz is not None:
                mrpr.append(copy.deepcopy(msz))

        # ---- run font and size
        for r in list(p.iter(qn('w:r'))):
            if r in math_runs:
                continue
            layers = R.rpr_layers(p, r)
            rf, sz = _last(layers, 'rFonts'), _last(layers, 'sz')
            rpr = r.find(qn('w:rPr'))
            if rpr is None:
                rpr = OxmlElement('w:rPr'); r.insert(0, rpr)
            if rpr.find(qn('w:rFonts')) is None and rf is not None:
                rpr.insert(0, copy.deepcopy(rf))
            if rpr.find(qn('w:sz')) is None and sz is not None:
                rpr.append(copy.deepcopy(sz))
            n_r += 1
        # ---- math runs: size only (the Cambria Math face is already explicit)
        for r in p.iter(qn('w:r')):
            if r not in math_runs:
                continue
            layers = R.rpr_layers(p, r)
            sz = _last(layers, 'sz')
            rpr = r.find(qn('w:rPr'))
            if rpr is None:
                rpr = OxmlElement('w:rPr'); r.insert(0, rpr)
            if rpr.find(qn('w:sz')) is None and sz is not None:
                rpr.append(copy.deepcopy(sz))
        # ---- the equations' control properties: size only
        # m:ctrlPr holds the run properties of the parts of an equation that are
        # not typed characters -- the fraction bar, the radical sign, the
        # delimiters -- and it is what scales the equation as a whole.  Left
        # without a size it takes Normal's, so after the merge every fraction in
        # the sheet was built at 12 pt around 9.5 pt text.  Trigonometry carries
        # 935 equations and 833 such ctrlPr, and baking them was worth one page
        # of the eight (38 -> 37, measured 15 Sep 2026); the paragraph marks above
        # took two, and the seven that remained needed a body style of their own
        # (see finish.py).  Size only: the Cambria Math face is already explicit,
        # as with the math runs above.
        for c in p.iter(MCTRLPR):
            layers = R.mark_layers(p)
            own = c.find(qn('w:rPr'))
            if own is not None:
                layers = layers + [own]
            sz = _last(layers, 'sz')
            if sz is None:
                continue
            if own is None:
                own = OxmlElement('w:rPr'); c.insert(0, own)
            if own.find(qn('w:sz')) is None:
                own.append(copy.deepcopy(sz))
    doc.save(path)
    return n_p, n_r

# -------------------------------------------------------------- tab stops --
# defaultTabStop lives in settings.xml, and a merged book can only have ONE of
# them.  Twelve of the thirteen sheets are at Word's 720 twips (1.27 cm); Circles
# alone was written at 397 (0.7 cm), so in the book every tabbed line in it
# advanced nearly twice as far as it was written to -- the "[1]" and "[2]" mark
# counts at the end of each part were pushed past the right margin and wrapped
# onto lines of their own.  Three extra lines on the Tangents page were enough
# to split the solution table, and the sliver that spilled printed as a BLANK
# page 47 (15 Sep 2026; Circles was the one section running a page long).
#
# The sheet's own ladder is written onto its paragraphs instead, which is what
# baking a default always means here: the document on its own is unchanged, and
# the merge can no longer reach the setting.  A cell's stops are measured from
# the cell's left edge exactly as the default ones were, so a ladder wide enough
# for the page serves the tables too -- the stops past a cell's width are simply
# never reached.
BOOK_TAB = 720   # the book's defaultTabStop; finish.py writes the same value

# pPr keeps its children in schema order, and w:tabs sits before all of these
AFTER_TABS = ('suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct',
              'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi',
              'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing',
              'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection',
              'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId',
              'cnfStyle', 'rPr', 'sectPr', 'pPrChange')


def bake_tabs(path):
    """Write the sheet's own default tab ladder onto every tabbed paragraph."""
    doc = Document(path)
    st = doc.settings.element.find(qn('w:defaultTabStop'))
    own = int(st.get(W)) if st is not None and st.get(W) else BOOK_TAB
    if own == BOOK_TAB:
        return 0, own
    s = doc.sections[0]
    width = int((s.page_width - s.left_margin - s.right_margin) / 635)   # twips
    n = 0
    for p in doc.element.body.iter(qn('w:p')):
        if not any(r.find(qn('w:tab')) is not None for r in p.findall(qn('w:r'))):
            continue
        ppr = p.find(qn('w:pPr'))
        if ppr is None:
            ppr = OxmlElement('w:pPr'); p.insert(0, ppr)
        tabs = ppr.find(qn('w:tabs'))
        if tabs is None:
            tabs = OxmlElement('w:tabs')
            nxt = None
            for t in AFTER_TABS:
                nxt = ppr.find(qn('w:' + t))
                if nxt is not None:
                    break
            if nxt is not None:
                nxt.addprevious(tabs)
            else:
                ppr.append(tabs)
        # keep whatever the paragraph already asks for; Word only falls back to
        # the default stops PAST the last explicit one, so that is where the
        # ladder starts
        floor = 0
        for t in tabs.findall(qn('w:tab')):
            try:
                floor = max(floor, int(t.get(qn('w:pos'))))
            except (TypeError, ValueError):
                pass
        ind = ppr.find(qn('w:ind'))
        if ind is not None and ind.get(qn('w:left')):
            try:
                floor = max(floor, int(ind.get(qn('w:left'))))
            except ValueError:
                pass
        pos = own
        while pos <= width:
            if pos > floor:
                t = OxmlElement('w:tab')
                t.set(qn('w:val'), 'left'); t.set(qn('w:pos'), str(pos))
                tabs.append(t)
            pos += own
        n += 1
    doc.save(path)
    return n, own


# ------------------------------------------------------------ title block --
def title_block(doc, line1, line2):
    """The two centred lines every topic sheet opens with, put in front of a
    sheet that has none (Trigonometry, which was built by worksheet_lib)."""
    first = doc.paragraphs[0]
    for text, pt in ((line1, 9.5), (line2, 11)):
        p = copy.deepcopy(first._p)
        for child in list(p):
            if child.tag != qn('w:pPr'):
                p.remove(child)
        ppr = p.find(qn('w:pPr'))
        if ppr is None:
            ppr = OxmlElement('w:pPr'); p.insert(0, ppr)
        for tag in ('w:pStyle', 'w:numPr', 'w:ind', 'w:jc'):
            e = ppr.find(qn(tag))
            if e is not None:
                ppr.remove(e)
        jc = OxmlElement('w:jc'); jc.set(W, 'center'); ppr.append(jc)
        r = OxmlElement('w:r')
        rpr = OxmlElement('w:rPr')
        f = OxmlElement('w:rFonts')
        for a in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
            f.set(qn(a), 'Times New Roman')
        rpr.append(f)
        rpr.append(OxmlElement('w:b'))
        sz = OxmlElement('w:sz'); sz.set(W, str(int(pt * 2))); rpr.append(sz)
        r.append(rpr)
        t = OxmlElement('w:t'); t.text = text; t.set(qn('xml:space'), 'preserve')
        r.append(t)
        p.append(r)
        first._p.addprevious(p)

def strip_headers(doc):
    for s in doc.sections:
        s.different_first_page_header_footer = False
        for part in ('header', 'footer', 'even_page_header', 'even_page_footer',
                     'first_page_header', 'first_page_footer'):
            try:
                h = getattr(s, part)
            except Exception:
                continue
            for p in list(h.paragraphs):
                p._p.getparent().remove(p._p)
            for tb in list(h.tables):
                tb._tbl.getparent().remove(tb._tbl)

