#!/usr/bin/env python3
"""Word file -> a copy whose multi-line maths is one line per paragraph, for LibreOffice.

worksheet_lib draws an aligned block Adrian's way: ONE m:oMathPara holding one m:oMath
per line, the lines separated by a w:br run (Word stacks them, = signs aligned).
LibreOffice drops those w:br and runs every line of working together on one line
(Set 3 solutions page check, 9 Oct 2026; same fault on the sheet worker's PDFs).
This writes a PDF-only copy with each w:br-separated line in its own paragraph
(same paragraph properties, left-justified maths) so lo-pdf.sh prints one step
per line. The Word file itself is untouched — Word renders the original fine.
  usage: lo-split-math.py <in.docx> <out.docx>
"""
import copy, shutil, sys, zipfile
from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
M = 'http://schemas.openxmlformats.org/officeDocument/2006/math'


def is_br_run(el):
    return el.tag == f'{{{M}}}r' and el.find(f'{{{W}}}br') is not None and el.find(f'{{{M}}}t') is None


def split(xml):
    root = etree.fromstring(xml)
    n = 0
    for mp in list(root.iter(f'{{{M}}}oMathPara')):
        p = mp.getparent()
        if p is None or p.tag != f'{{{W}}}p':
            continue
        oms = mp.findall(f'{{{M}}}oMath')
        if len(oms) < 2:
            continue
        # group the oMaths into lines: a line ends at an oMath whose last run is a w:br
        lines, cur = [], []
        for om in oms:
            runs = [c for c in om if c.tag == f'{{{M}}}r']
            ends = bool(runs) and is_br_run(runs[-1])
            if ends:
                om.remove(runs[-1])
            cur.append(om)
            if ends:
                lines.append(cur); cur = []
        if cur:
            lines.append(cur)
        if len(lines) < 2:
            continue
        pr = mp.find(f'{{{M}}}oMathParaPr')
        ppr = p.find(f'{{{W}}}pPr')
        anchor = p
        for i, line in enumerate(lines):
            if i == 0:
                for om in oms:
                    mp.remove(om)
                for om in line:
                    mp.append(om)
                continue
            np_ = etree.Element(f'{{{W}}}p')
            if ppr is not None:
                np_.append(copy.deepcopy(ppr))
            nmp = etree.SubElement(np_, f'{{{M}}}oMathPara')
            if pr is not None:
                nmp.append(copy.deepcopy(pr))
            for om in line:
                nmp.append(om)
            anchor.addnext(np_)
            anchor = np_
        n += 1
    return etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True), n


def main(src, dst):
    shutil.copyfile(src, dst)
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == 'word/document.xml':
                data, n = split(data)
                print(f'lo-split-math: {n} maths blocks split into one line per paragraph')
            zout.writestr(item, data)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
