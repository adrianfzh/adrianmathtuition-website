#!/usr/bin/env python3
"""fit-examples.py — tighten an example that just misses fitting on its page.

13 Sep 2026: boxes FLOW now (a part is never cut, a new part may start on the next
page — Adrian's own notes break AM 18 Example 3b between (c) and (d) at the foot of a
full page), so a block whose tail is a whole part on the next page is fine and is
left alone; this script's job is the NEAR MISS — "if the solutions almost fit into a
page, just a little left hanging … if space management could be a little tighter to
fit, then do so" — and the stranded "Solution:" label.

    /usr/bin/python3 scripts/sheet-worker/fit-examples.py <sheet.docx> [--check] [--pdf out.pdf]

Adrian, 11 Sep 2026: "if possible, when there is just a little bit of the box
going across to another page, try to just reduce the white spaces for the
example/question, so that the entire example can stay within the page."

Word does the pagination, so the only honest way to know where a page ends is to
let Word lay the sheet out: this exports the DOCX to PDF through Word (the same
`render_sheet.export_pdf` the worker files with), reads where every "Example N"
block starts and ends with PyMuPDF, and looks for the two ways an example fails
to sit on one page:

  split   — the block starts on one page and a SMALL tail (under a third of it)
            runs onto the next: the old flow-mode sheets;
  jumped  — the block is the first thing on its page and the page before ends
            with enough blank paper to have held it, had it been a little
            shorter: what keep-together does to a block that misses by a line.

A candidate is tightened one step at a time — the box's line spacing 1.5 →
1.3 → 1.15 → 1.05, the gaps between its parts 8 pt → 3 pt, the question stem's
spacing, the breathing space above "Solution:" and below the box — re-exported,
and kept only if it now sits on one page (and, for a jumped block, on the
earlier page). A block that still does not fit after the last step is put
back exactly as it was: a tightened example that STILL straddles is the worst
of both. A skill's first example is never a "jumped" candidate — every skill
after the first opens a page on purpose (page_break_before on its heading).

A box TALLER than a page defeats every keep rule — Word abandons keep-with-next
and cannot-split for it and lets it flow — and the "Solution:" line above it is
then stranded at the foot of the page before (Adrian, 11 Sep 2026: "preferably,
'Solution' is on top of the box, instead of straddling across two pages"). The
second pass finds a "Solution:" whose box begins on a later page and puts a
page break before that line, so the label opens the page with its box; the
question stays where it was.

Nothing else is touched: no text, no equations, no figures. The DOCX is written
in place only when a block was tightened (`--check` reports and writes nothing).
Run it after the file is otherwise finished, before filing — every later edit
can move a page break.
"""
from __future__ import annotations

import argparse
import copy
import re
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent.parent / '.claude' / 'skills' / 'create-worksheet'))

import fitz                                            # noqa: E402  (PyMuPDF)
from docx import Document                              # noqa: E402
from docx.oxml.ns import qn                            # noqa: E402
from docx.shared import Pt                             # noqa: E402
from docx.table import Table                           # noqa: E402
from docx.text.paragraph import Paragraph              # noqa: E402

import render_sheet                                    # noqa: E402

HEADING = re.compile(r'^(Example \d+[a-z]?|Practice \d+)$')
PRACTICE = re.compile(r'^Practice \d+$')
EXAMPLE = re.compile(r'^Example \d+[a-z]?$')
#: the running header's two lines end at ~55 pt; the body's first line starts at ~57
HEADER_PT = 56
#: house bottom margin, 1 cm
BOTTOM_PT = 28.35
#: a jumped block is a candidate when the blank on the page before is at least this much of it
JUMP_ROOM = 0.8

#: the tightening ladder: (box/question line spacing, part gap pt, stem line spacing, figure scale)
#: The last two rungs shrink the block's diagrams a little (Adrian, 11 Sep 2026:
#: "we can also have the solutions and the example on one page, just reduce some
#: white space, or make the diagram (slightly) smaller").
STEPS = [(1.3, 4, 1.3, 1.0), (1.15, 3, 1.15, 1.0), (1.05, 2, 1.05, 1.0), (1.05, 2, 1.05, 0.85), (1.05, 2, 1.05, 0.72)]
#: a block up to this many pages tall is still worth a try on the ladder
OVERSIZE_TRY = 1.4
WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'


# ── the DOCX side: example blocks ────────────────────────────────────────────

def body_items(doc):
    """(kind, element) for every body child, in order — 'p' or 'tbl'."""
    out = []
    for el in doc.element.body.iterchildren():
        if el.tag == qn('w:p'):
            out.append(('p', el))
        elif el.tag == qn('w:tbl'):
            out.append(('tbl', el))
    return out


def para_text(el, doc):
    return Paragraph(el, doc).text.strip()


def has_page_break_before(el):
    pPr = el.find(qn('w:pPr'))
    return pPr is not None and pPr.find(qn('w:pageBreakBefore')) is not None


def example_blocks(doc):
    """Every Example block and every Practice block, in document order.

    An Example block runs from its heading to its box (inclusive). A Practice
    block runs from its heading to the last paragraph before the next heading
    or the next skill (a paragraph with page_break_before) — the set's items,
    their Remember lines and [Ans] lines (Adrian, 11 Sep 2026: "if question 2
    can be on the same page as question 1, just reduce some white space").
    `opens_page`: a page break sits between the previous block and this one."""
    items = body_items(doc)
    blocks = []
    last_end = -1
    for i, (kind, el) in enumerate(items):
        if kind != 'p':
            continue
        text = para_text(el, doc)
        if EXAMPLE.match(text):
            j = i + 1
            box = None
            while j < len(items):
                k2, e2 = items[j]
                if k2 == 'tbl':
                    box = j
                    break
                if k2 == 'p' and HEADING.match(para_text(e2, doc)):
                    break
                j += 1
            if box is None:
                continue                   # an example without a box — nothing to fit
            opens_page = any(k == 'p' and has_page_break_before(e) for k, e in items[last_end + 1:i + 1])
            blocks.append({'label': text, 'kind': 'example', 'start': i, 'end': box, 'opens_page': opens_page, 'end_prefix': None})
            last_end = box
        elif PRACTICE.match(text):
            j = i + 1
            end = i
            while j < len(items):
                k2, e2 = items[j]
                if k2 == 'p' and (HEADING.match(para_text(e2, doc)) or has_page_break_before(e2)):
                    break
                if k2 == 'tbl' or para_text(e2, doc).strip():
                    end = j
                j += 1
            if end == i:
                continue
            opens_page = any(k == 'p' and has_page_break_before(e) for k, e in items[last_end + 1:i + 1])
            last_txt = para_text(items[end][1], doc) if items[end][0] == 'p' else ''
            blocks.append({'label': text, 'kind': 'practice', 'start': i, 'end': end, 'opens_page': opens_page,
                           'end_prefix': re.sub(r'\s+', ' ', last_txt)[:14] or None})
            last_end = end
    return blocks, items


def _scale_drawings(elements, factor):
    """Shrink every inline picture in the given XML elements by `factor` (of its
    stored size — the caller always starts from the untouched copy)."""
    if factor >= 0.999:
        return
    for el in elements:
        for ext in el.iter(f'{{{WP_NS}}}extent'):
            for k in ('cx', 'cy'):
                v = ext.get(k)
                if v: ext.set(k, str(int(int(v) * factor)))
        for ext in el.iter(f'{{{A_NS}}}ext'):
            for k in ('cx', 'cy'):
                v = ext.get(k)
                if v: ext.set(k, str(int(int(v) * factor)))


def tighten(doc, block, items, step):
    """Apply one rung of the ladder to a block. The caller hands in the UNTOUCHED
    copy every time, so every value here is absolute."""
    ls, gap_pt, stem_ls, fig = STEPS[step]
    start, end = block['start'], block['end']
    last = end if block['kind'] == 'practice' else end - 1
    for k, el in items[start:last + 1]:
        if k == 'tbl':
            # a data table inside a practice question, or the example's box
            for row in Table(el, doc).rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        p.paragraph_format.line_spacing = ls
                        p.paragraph_format.space_after = Pt(0)
            continue
        p = Paragraph(el, doc)
        pf = p.paragraph_format
        if not p.text.strip() and el.find(f'.//{{{WP_NS}}}extent') is None:
            # a breathing-space paragraph: shrink it to a sliver, never remove it
            pf.line_spacing = Pt(4)
            pf.space_before = Pt(0)
            pf.space_after = Pt(0)
            for r in p.runs:
                r.font.size = Pt(2)
            continue
        pf.space_before = Pt(0) if pf.space_before is None or pf.space_before > Pt(0) else pf.space_before
        pf.space_after = Pt(0)
        pf.line_spacing = stem_ls
    if block['kind'] == 'example':
        table = Table(items[end][1], doc)
        for ri, row in enumerate(table.rows):
            for cell in row.cells:
                for pi, p in enumerate(cell.paragraphs):
                    pf = p.paragraph_format
                    pf.line_spacing = ls
                    if pi == 0:
                        pf.space_before = Pt(2) if ri == 0 else Pt(gap_pt)
        # the breathing space right after the box
        if end + 1 < len(items) and items[end + 1][0] == 'p':
            p = Paragraph(items[end + 1][1], doc)
            if not p.text.strip():
                p.paragraph_format.line_spacing = Pt(4)
                p.paragraph_format.space_before = Pt(0)
                p.paragraph_format.space_after = Pt(0)
    _scale_drawings([el for _k, el in items[start:end + 1]], fig)


def pdf_lines(pdf_path):
    """[(page, y0, y1, text)] for every body text line, document order."""
    out = []
    heights = []
    with fitz.open(str(pdf_path)) as pdf:
        for pno, page in enumerate(pdf):
            heights.append(page.rect.height)
            lines = []
            for b in page.get_text('dict')['blocks']:
                for ln in b.get('lines', []):
                    text = ''.join(s['text'] for s in ln['spans']).strip()
                    if not text:
                        continue
                    y0, y1 = ln['bbox'][1], ln['bbox'][3]
                    if y1 < HEADER_PT:
                        continue           # the running header
                    lines.append((pno, y0, y1, text))
            lines.sort(key=lambda t: (t[1], t[0]))
            out.extend(lines)
    return out, heights


def locate_blocks(lines, heights, blocks):
    """For each block (document order): page/y of its heading and of its last
    line. An Example ends at the line before the next heading; a Practice set
    ends at its own last paragraph (matched by text prefix — the next thing after
    it may be a skill title the heading regex does not know), else likewise."""
    heads = [(i, ln) for i, ln in enumerate(lines) if HEADING.match(ln[3])]
    found = {}
    cursor = 0
    for b in blocks:
        label = b['label']
        hit = next(((i, ln) for i, ln in heads if ln[3] == label and i >= cursor), None)
        if not hit:
            found[label] = None
            continue
        i, ln = hit
        cursor = i + 1
        nxt = next((j for j, l2 in heads if j > i), len(lines))
        last = lines[nxt - 1] if nxt - 1 > i else ln
        prefix = b.get('end_prefix')
        if prefix:
            norm = lambda t: re.sub(r'\s+', ' ', t)
            # the LAST such line before the next heading — every question's [Ans] line shares the prefix
            # A fraction in the [Ans] line breaks it into fragments in the PDF, so
            # only the opening "[Ans: (a)" is safe to match on.
            key = norm(prefix).rstrip()[:9]
            k = next((k for k in range(nxt - 1, i, -1) if norm(lines[k][3]).startswith(key)), None)
            if k is not None:
                last = lines[k]
        page_first = next(l2 for l2 in lines if l2[0] == ln[0])
        prev_page_last = None
        if ln[0] > 0:
            prev_lines = [l2 for l2 in lines if l2[0] == ln[0] - 1]
            prev_page_last = prev_lines[-1] if prev_lines else None
        found[label] = {
            'page': ln[0], 'top': ln[1], 'end_page': last[0], 'bottom': last[2],
            'first_on_page': page_first is ln or page_first[1] >= ln[1] - 0.5,
            'page_top_y': page_first[1],
            'prev_blank': (heights[ln[0] - 1] - BOTTOM_PT - prev_page_last[2]) if prev_page_last else None,
        }
    return found


def stranded_solutions(lines, labels, heights=None, pin=()):
    """Labels of the Example blocks whose "Solution:" line sits on an earlier
    page than the first line of the box under it — plus, for the blocks in
    `pin` (examples taller than a page, where Word abandons every keep rule),
    a "Solution:" at the foot of a page or already carried to the top of one,
    so a page break can hold it where a re-export cannot drift it."""
    heads = [(i, ln) for i, ln in enumerate(lines) if HEADING.match(ln[3])]
    out = []
    cursor = 0
    for label in labels:
        hit = next(((i, ln) for i, ln in heads if ln[3] == label and i >= cursor), None)
        if not hit:
            continue
        i, _ = hit
        cursor = i + 1
        nxt = next((j for j, l2 in heads if j > i), len(lines))
        sol = next((k for k in range(i + 1, nxt) if lines[k][3] == 'Solution:'), None)
        if sol is None or sol + 1 >= nxt:
            continue
        if lines[sol + 1][0] > lines[sol][0]:
            out.append(label)
            continue
        # Word's pagination drifts by a line between two exports of the SAME
        # file (Kiara, 11 Sep 2026: the worker's PDF had the label stranded, a
        # re-export did not). A "Solution:" within three lines of the page foot
        # under a box taller than the page is one drift away from stranded, so
        # it is treated as stranded now rather than in the student's copy.
        if heights and label in pin:
            near_foot = lines[sol][2] > heights[lines[sol][0]] - BOTTOM_PT - 3 * 14
            # Already carried to the top of a page by keep-with-next: pin it
            # there with a real page break, so the next export cannot drift it
            # back to the foot of the page before (a break before a paragraph
            # already at the top of a page changes nothing on the page).
            at_top = sol > 0 and lines[sol - 1][0] < lines[sol][0]
            if near_foot or at_top:
                out.append(label)
    return out


def break_before_solution(doc, block, items):
    """page_break_before on the block's "Solution:" paragraph (the last text paragraph before its box)."""
    for k, el in reversed(items[block['start']:block['end']]):
        if k == 'p' and para_text(el, doc) == 'Solution:':
            Paragraph(el, doc).paragraph_format.page_break_before = True
            return True
    return False


def diagnose(block, loc, heights):
    """'ok' | 'split' | 'jumped' | 'oversize' | 'too-big' | 'unknown'.

    split    — on two pages, yet short enough to sit on one: tighten.
    jumped   — opens a page while the page before had room for it: tighten.
    oversize — taller than a page but by less than OVERSIZE_TRY: try the ladder,
               the last rungs shrink its diagrams (Adrian, 11 Sep 2026).
    too-big  — beyond that: left alone."""
    if not loc:
        return 'unknown', ''
    usable = heights[loc['page']] - BOTTOM_PT - HEADER_PT
    if loc['end_page'] == loc['page']:
        if block['opens_page'] or not loc['first_on_page'] or loc['prev_blank'] is None:
            return 'ok', ''
        height = loc['bottom'] - loc['page_top_y']
        if loc['prev_blank'] >= JUMP_ROOM * height:
            return 'jumped', f'{height:.0f}pt block, {loc["prev_blank"]:.0f}pt blank on the page before'
        return 'ok', ''
    if loc['end_page'] > loc['page'] + 1:
        return 'too-big', 'spans three pages'
    head_part = heights[loc['page']] - BOTTOM_PT - loc['top']
    tail = loc['bottom'] - HEADER_PT
    total = head_part + tail
    if total <= 0.97 * usable:
        return 'split', f'{tail:.0f}pt of {total:.0f}pt runs onto the next page'
    if total <= OVERSIZE_TRY * usable:
        return 'oversize', f'{total:.0f}pt block on a {usable:.0f}pt page — trying the ladder, diagrams included'
    return 'too-big', f'{total:.0f}pt block on a {usable:.0f}pt page — no spacing rung can hold it'


def survey(docx_path, pdf_path):
    doc = Document(str(docx_path))
    blocks, _items = example_blocks(doc)
    render_sheet.export_pdf(Path(docx_path), Path(pdf_path))
    lines, heights = pdf_lines(pdf_path)
    locs = locate_blocks(lines, heights, blocks)
    return blocks, locs, heights


def fit(docx_path: Path, check_only=False, pdf_out: Path | None = None):
    work = Path(tempfile.mkdtemp(prefix='fit-examples-'))
    cur = work / 'cur.docx'
    shutil.copyfile(docx_path, cur)
    report = []
    changed = 0
    too_big = set()
    blocks, locs, heights = survey(cur, work / 'cur.pdf')
    for bi, block in enumerate(blocks):
        verdict, why = diagnose(block, locs.get(block['label']), heights)
        if verdict == 'too-big' or (verdict == 'oversize' and block['kind'] == 'example'):
            too_big.add(block['label'])
        if verdict in ('ok', 'unknown', 'too-big'):
            report.append((block['label'], verdict, why))
            continue
        if check_only:
            report.append((block['label'], verdict, why + ' — would tighten'))
            continue
        before = work / f'before-{bi}.docx'
        shutil.copyfile(cur, before)
        fixed = None
        label = block['label']
        for step in range(len(STEPS)):
            shutil.copyfile(before, cur)              # every rung starts from the untouched copy
            doc = Document(str(cur))
            blocks_now, items = example_blocks(doc)
            blk = next((b for b in blocks_now if b['label'] == label), None)
            if not blk:
                break
            tighten(doc, blk, items, step)
            doc.save(str(cur))
            _b, locs2, heights2 = survey(cur, work / 'cur.pdf')
            loc2 = locs2.get(label)
            v2, _ = diagnose(blk, loc2, heights2)
            on_one_page = loc2 and loc2['end_page'] == loc2['page']
            moved_up = verdict != 'jumped' or (loc2 and loc2['page'] < locs[label]['page'])
            if on_one_page and moved_up and v2 == 'ok':
                fixed = step
                break
        if fixed is None:
            shutil.copyfile(before, cur)          # put it back exactly
            report.append((label, verdict, why + ' — no rung of the ladder fits it; left as it was'))
            blocks, locs, heights = survey(cur, work / 'cur.pdf')
        else:
            changed += 1
            too_big.discard(label)
            fig = STEPS[fixed][3]
            report.append((label, verdict, why + f' — fits after step {fixed + 1} (line spacing {STEPS[fixed][0]}' + (f', diagrams ×{fig}' if fig < 1 else '') + ')'))
            blocks, locs, heights = survey(cur, work / 'cur.pdf')
    # ── second pass: a "Solution:" left behind by a box taller than its page ──
    lines, heights = pdf_lines(work / 'cur.pdf')
    for label in stranded_solutions(lines, [b['label'] for b in blocks if b['kind'] == 'example'], heights, too_big):
        if check_only:
            report.append((label, 'stranded', '"Solution:" sits on the page before its box — would move it down'))
            continue
        doc = Document(str(cur))
        blocks_now, items = example_blocks(doc)
        blk = next((b for b in blocks_now if b['label'] == label), None)
        if not blk or not break_before_solution(doc, blk, items):
            report.append((label, 'stranded', 'could not find its "Solution:" paragraph'))
            continue
        doc.save(str(cur))
        render_sheet.export_pdf(Path(cur), Path(work / 'cur.pdf'))
        lines, heights = pdf_lines(work / 'cur.pdf')
        if label in stranded_solutions(lines, [label], heights, ()):
            report.append((label, 'stranded', 'still stranded after a page break — left for Adrian'))
        else:
            changed += 1
            report.append((label, 'stranded', '"Solution:" pinned to open the page with its box'))
    if changed and not check_only:
        shutil.copyfile(cur, docx_path)
        if pdf_out:
            shutil.copyfile(work / 'cur.pdf', pdf_out)
    elif pdf_out:
        shutil.copyfile(work / 'cur.pdf', pdf_out)
    return report, changed


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('docx')
    ap.add_argument('--check', action='store_true', help='report only, write nothing')
    ap.add_argument('--pdf', help='also write the final PDF here')
    args = ap.parse_args()
    report, changed = fit(Path(args.docx), check_only=args.check, pdf_out=Path(args.pdf) if args.pdf else None)
    for label, verdict, why in report:
        print(f'  {label:<12} {verdict:<8} {why}')
    print(f'{changed} example(s) tightened' + (' (check only — nothing written)' if args.check else ''))


if __name__ == '__main__':
    main()
