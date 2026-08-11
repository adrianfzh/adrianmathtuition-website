"""
worksheet_lib.py — single helper module for building Adrian's math worksheets.

Usage:
  1. Copy this file (or import from the skill folder) alongside your worksheet author script.
  2. In your author script, import the helpers and write your questions:

        from worksheet_lib import Worksheet

        ws = Worksheet()
        ws.title('My Worksheet')
        ws.subtitle('IP4 / Sec 4 Mathematics')

        ws.Q([('text', '(Topic)  Find '), ('math', 'A^2'), ('text', '.')], marks=3)
        ws.ans([('math', 'A^2 = ...')])

        ws.save('my_worksheet.docx')

  3. Run: python3 author_script.py

Everything (reference style setup, numbering definitions, OMML conversion,
inline numPr patching) is handled internally. Only one script to run.
"""
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from lxml import etree
import subprocess, tempfile, os, zipfile, io

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

NUMBERING_XML = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="100">
    <w:multiLevelType w:val="singleLevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="567" w:hanging="567"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="101">
    <w:multiLevelType w:val="singleLevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="lowerLetter"/>
      <w:lvlText w:val="(%1)"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="1134" w:hanging="567"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="100"/></w:num>
'''
# 30 sub-question numIds, each with startOverride so (a)(b)(c) restarts per question
for _i in range(30):
    NUMBERING_XML += (
        f'  <w:num w:numId="{10+_i}">'
        f'<w:abstractNumId w:val="101"/>'
        f'<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>'
        f'</w:num>\n'
    )
NUMBERING_XML += '</w:numbering>'


def _latex_to_omml(latex_expr, display=False):
    """Convert a LaTeX math expression to an OMML element via pandoc."""
    md = f"$${latex_expr}$$" if display else f"${latex_expr}$"
    with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
        f.write(md)
        md_path = f.name
    docx_path = md_path.replace('.md', '.docx')
    try:
        subprocess.run(['pandoc', md_path, '-o', docx_path], check=True, capture_output=True)
        with zipfile.ZipFile(docx_path) as z:
            doc_xml = z.read('word/document.xml')
        tree = etree.fromstring(doc_xml)
        if display:
            elem = tree.find(f'.//{{{M_NS}}}oMathPara')
            if elem is None:
                elem = tree.find(f'.//{{{M_NS}}}oMath')
        else:
            elem = tree.find(f'.//{{{M_NS}}}oMath')
        return elem
    finally:
        os.unlink(md_path)
        if os.path.exists(docx_path):
            os.unlink(docx_path)


class Worksheet:
    """Builder for a single worksheet docx with Adrian's house style."""

    def __init__(self):
        self.doc = Document()
        self._auto_subq_id = 9   # increments to 10, 11, ... per Q with sub-parts
        self._current_subq_id = None
        self._setup_page()
        self._setup_styles()

    # ---------- private setup ----------
    def _setup_page(self):
        s = self.doc.sections[0]
        s.page_width = Cm(21)
        s.page_height = Cm(29.7)
        s.top_margin = Cm(2)
        s.bottom_margin = Cm(1)
        s.left_margin = Cm(2.5)
        s.right_margin = Cm(2.5)

    def _setup_styles(self):
        # Normal: TNR 9.5pt 1.5 line spacing
        n = self.doc.styles['Normal']
        n.font.name = 'Times New Roman'
        n.font.size = Pt(9.5)
        n.paragraph_format.line_spacing = 1.5
        n.paragraph_format.space_before = Pt(0)
        n.paragraph_format.space_after = Pt(0)
        rPr = n.element.get_or_add_rPr()
        rFonts = rPr.find(qn('w:rFonts'))
        if rFonts is None:
            rFonts = OxmlElement('w:rFonts')
            rPr.append(rFonts)
        for attr in ['ascii', 'hAnsi', 'eastAsia', 'cs']:
            rFonts.set(qn(f'w:{attr}'), 'Times New Roman')

        # WSTitle
        t = self.doc.styles.add_style('WSTitle', WD_STYLE_TYPE.PARAGRAPH)
        t.base_style = self.doc.styles['Normal']
        t.font.name = 'Times New Roman'
        t.font.size = Pt(12)
        t.font.bold = True
        t.font.color.rgb = RGBColor(0x1F, 0x4E, 0x79)
        t.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
        t.paragraph_format.space_after = Pt(6)

        # WSSubtitle
        st = self.doc.styles.add_style('WSSubtitle', WD_STYLE_TYPE.PARAGRAPH)
        st.base_style = self.doc.styles['Normal']
        st.font.name = 'Times New Roman'
        st.font.size = Pt(10)
        st.font.italic = True
        st.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
        st.paragraph_format.space_after = Pt(8)

        # Answer
        a = self.doc.styles.add_style('Answer', WD_STYLE_TYPE.PARAGRAPH)
        a.base_style = self.doc.styles['Normal']
        a.font.color.rgb = RGBColor(0x84, 0x3C, 0x0C)
        a.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.RIGHT

        # Question, SubQuestion (no inline numbering — applied per paragraph)
        self.doc.styles.add_style('Question', WD_STYLE_TYPE.PARAGRAPH).base_style = self.doc.styles['Normal']
        self.doc.styles.add_style('SubQuestion', WD_STYLE_TYPE.PARAGRAPH).base_style = self.doc.styles['Normal']

        # Set zoom
        zoom = self.doc.settings.element.find(qn('w:zoom'))
        if zoom is None:
            z = etree.SubElement(self.doc.settings.element, qn('w:zoom'))
            z.set(qn('w:percent'), '100')
        else:
            zoom.set(qn('w:percent'), '100')

    # ---------- private paragraph builder ----------
    def _add(self, parts, style=None, num_id=None, marks=None, alignment=None):
        p = self.doc.add_paragraph()
        if style:
            p.style = self.doc.styles[style]
        if alignment is not None:
            p.alignment = alignment

        if num_id is not None:
            pPr = p._element.get_or_add_pPr()
            existing = pPr.find(qn('w:numPr'))
            if existing is not None:
                pPr.remove(existing)
            numPr = OxmlElement('w:numPr')
            ilvl = OxmlElement('w:ilvl')
            ilvl.set(qn('w:val'), '0')
            nId = OxmlElement('w:numId')
            nId.set(qn('w:val'), str(num_id))
            numPr.append(ilvl)
            numPr.append(nId)
            pPr.append(numPr)

        for part in parts:
            kind = part[0]
            if kind == 'text':
                text = part[1]
                attrs = part[2] if len(part) > 2 else {}
                run = p.add_run(text)
                run.font.name = 'Times New Roman'
                run.font.size = Pt(9.5)
                if attrs.get('bold'):
                    run.bold = True
                if attrs.get('italic'):
                    run.italic = True
                if attrs.get('color'):
                    run.font.color.rgb = attrs['color']
            elif kind == 'math':
                elem = _latex_to_omml(part[1], display=False)
                if elem is not None:
                    p._element.append(elem)
            elif kind == 'math_display':
                elem = _latex_to_omml(part[1], display=True)
                if elem is not None:
                    p._element.append(elem)

        if marks is not None:
            p.paragraph_format.tab_stops.add_tab_stop(Cm(15.5), WD_TAB_ALIGNMENT.RIGHT)
            run = p.add_run(f'\t[{marks}]')
            run.font.name = 'Times New Roman'
            run.font.size = Pt(9.5)
        return p

    # ---------- public API ----------
    def title(self, text):
        p = self.doc.add_paragraph()
        p.style = self.doc.styles['WSTitle']
        p.add_run(text)

    def subtitle(self, text):
        p = self.doc.add_paragraph()
        p.style = self.doc.styles['WSSubtitle']
        p.add_run(text)

    def Q(self, parts, marks=None):
        """Main question. Auto-numbered 1. 2. 3. ..."""
        # Bump the sub-question id pool for this question; reset on each Q call
        self._auto_subq_id += 1
        self._current_subq_id = self._auto_subq_id
        # Apply inline numId=1 directly so MS Word picks it up reliably
        return self._add(parts, style='Question', num_id=1, marks=marks)

    def SQ(self, parts, marks=None):
        """Sub-question (a)(b)(c) ... auto-tracks under the current main question."""
        if self._current_subq_id is None:
            raise RuntimeError('SQ() called before any Q(). Add a main question first.')
        return self._add(parts, style='SubQuestion',
                         num_id=self._current_subq_id, marks=marks)

    def para(self, parts, marks=None):
        """Plain paragraph (no numbering)."""
        return self._add(parts, marks=marks)

    def math_block(self, latex_expr):
        """Centred display equation."""
        p = self.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elem = _latex_to_omml(latex_expr, display=True)
        if elem is not None:
            p._element.append(elem)
        return p

    def ans(self, parts):
        """[Ans: ...] right-aligned orange line."""
        full = [('text', '[Ans: ')] + list(parts) + [('text', ']')]
        return self._add(full, style='Answer', alignment=WD_ALIGN_PARAGRAPH.RIGHT)

    def figure(self, path, width_cm=10.5):
        """Embed a rendered figure (see figure_lib.py) under the current question.

        Centred, capped at width_cm (16 cm is the text column) and never
        upscaled past the image's natural 96-dpi size — a small render should
        stay small, not blur.
        """
        from PIL import Image  # python-docx already depends on Pillow
        with Image.open(path) as im:
            natural_cm = im.width / 96 * 2.54
        p = self.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(4)
        run = p.add_run()
        run.add_picture(path, width=Cm(min(width_cm, 16, natural_cm)))
        return p

    def page_break(self):
        self.doc.add_page_break()

    def save(self, path):
        """Save the worksheet, injecting clean numbering.xml."""
        # Save to a temp buffer first, then rewrite numbering.xml
        buf = io.BytesIO()
        self.doc.save(buf)
        buf.seek(0)

        with zipfile.ZipFile(buf, 'r') as zin:
            items = {name: zin.read(name) for name in zin.namelist()}

        items['word/numbering.xml'] = NUMBERING_XML.encode('utf-8')

        # Schema fix: pandoc emits <m:mcJc> before <m:count> inside <m:mcPr>,
        # but OOXML requires count first (matrices fail strict validation otherwise).
        import re as _re
        items['word/document.xml'] = _re.sub(
            rb'(<m:mcJc m:val="[^"]*"/>)(<m:count m:val="[^"]*"/>)',
            rb'\2\1',
            items['word/document.xml'])

        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as zout:
            for name, data in items.items():
                zout.writestr(name, data)

        print(f'Saved {path}')
