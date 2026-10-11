"""Two small helpers for hand-picked practice sheets built on worksheet_lib
(10 Oct 2026, the logs / calculus / circles sheets).

P('Find $x$ when …')   -> a parts list: text outside $…$, maths inside.
eqs(ws, [latex, …], marks=n) -> equations the bank itself prints on their own lines,
as plain indented paragraphs (no table), marks on the last.
Questions keep the bank's own sentence, expression inside it (11 Oct 2026: "why does the
question look different from question bank?" — the lead-ins "the expression below",
"Integrate the following" were ours, and are gone).
"""
import re
from docx.shared import Cm
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH


def P(s):
    out = []
    for i, bit in enumerate(re.split(r'\$(.+?)\$', s)):
        if bit:
            out.append(('math', bit) if i % 2 else ('text', bit))
    return out


def eqs(ws, lines, marks=None, indent=1.6):
    """Equation(s) the bank prints on lines of their own (a pair of simultaneous
    equations): one plain paragraph each, set in from the question's text, the
    marks on the last one. NOT a table — Adrian, 11 Oct 2026, on the borderless
    two-cell row this used to be: "can you don't put in table form?"."""
    ws.doc.paragraphs[-1].paragraph_format.keep_with_next = True
    out = []
    for i, latex in enumerate(lines):
        last = i == len(lines) - 1
        # the zero-width space keeps Word from centring a line that holds only an equation
        p = ws.cont([('math', latex), ('text', '\u200b')], marks=marks if last else None, level=0)
        p.paragraph_format.left_indent = Cm(indent)
        p.paragraph_format.first_line_indent = Cm(0)
        p.paragraph_format.keep_with_next = True
        out.append(p)
    return out


M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'


def full_size_fractions(ws, body_pt=9.5, scale=0.72):
    """Inside a sentence Word prints a fraction's top and bottom at script size
    (about 70%), which at 9.5 pt is too small to read. Give those runs a larger
    font so they PRINT at the body size — the sentence stays the bank's, and no
    table or display line is needed. Answer lines (right-aligned) are left alone.
    Call just before save()."""
    half_pts = str(int(round(body_pt / scale * 2)))
    for p in ws.doc.paragraphs:
        if p.alignment == WD_ALIGN_PARAGRAPH.RIGHT:
            continue
        for f in p._element.iter(f'{{{M_NS}}}f'):
            if any(a.tag == f'{{{M_NS}}}f' or a.tag in (f'{{{M_NS}}}sup', f'{{{M_NS}}}sub') for a in f.iterancestors()):
                continue          # a fraction in an index or inside another fraction stays small
            for r in f.iter(f'{{{M_NS}}}r'):
                rpr = r.find(f'{{{W_NS}}}rPr')
                if rpr is None:
                    rpr = OxmlElement('w:rPr')
                    mrpr = r.find(f'{{{M_NS}}}rPr')
                    r.insert(0 if mrpr is None else list(r).index(mrpr) + 1, rpr)
                if rpr.find(f'{{{W_NS}}}rFonts') is None:
                    fonts = OxmlElement('w:rFonts'); fonts.set(qn('w:ascii'), 'Cambria Math'); fonts.set(qn('w:hAnsi'), 'Cambria Math')
                    rpr.insert(0, fonts)
                for old in rpr.findall(f'{{{W_NS}}}sz'):
                    rpr.remove(old)
                sz = OxmlElement('w:sz'); sz.set(qn('w:val'), half_pts); rpr.append(sz)
