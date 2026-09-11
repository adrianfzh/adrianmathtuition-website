#!/usr/bin/env python3
"""Render a Practice Again sheet from a JSON spec — DOCX (and the PDF).

    /usr/bin/python3 scripts/sheet-worker/render_sheet.py <spec.json> --out <dir>

The writer's job becomes writing the sheet's CONTENT as a spec
(`scripts/sheet-worker/SHEET-SPEC.md`); this script turns it into the file.
Every paragraph is built through the SAME `worksheet_lib` helpers the sheet
worker calls today — `.claude/skills/create-worksheet/worksheet_lib.py` is
imported, never reimplemented — so the house style stays where it lives and a
change there reaches the renderer with no edit here.

What it does, in order:

  1. validates the spec against `sheet-spec.schema.json`;
  2. renders every `figure_lib` figure the spec asks for, into `<out>/figures/`;
  3. builds the docx with `worksheet_lib.Worksheet`;
  4. runs `repair-sheet.py`'s own `repair()` — a worksheet_lib sheet scores one
     `gap_above_box` per solution box every time, so the repair pass is a build
     step, not a safety net (three of the September sheets were filed without
     it and carry the un-backspaceable gap Adrian sent Klaire's sheet back for);
  5. runs the pre-filing lints — `find_plain_maths`, the `never`/idiom sweep,
     linear fractions, one `[Ans:]` per question, an empty last cell paragraph;
  6. exports the PDF through Microsoft Word (`--pdf`, the default when Word is
     installed), from inside Word's own sandbox container so no Grant File
     Access dialog reaches Adrian.

Deterministic: the same spec gives the same docx bytes, entry for entry, apart
from the two timestamps Word/python-docx stamp into `docProps/core.xml`
(`--check-determinism` renders twice and proves it).

Flags:
    --out DIR          where to write (default: beside the spec)
    --name NAME        base name (default "3 Practice Again")
    --pdf / --no-pdf   export the PDF through Word (default: auto)
    --no-repair        skip step 4 — for reproducing a sheet filed without it
    --strict           any lint hit is a non-zero exit
    --check-determinism  render twice and compare
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SKILL_DIR = REPO / '.claude' / 'skills' / 'create-worksheet'
sys.path.insert(0, str(SKILL_DIR))
sys.path.insert(0, str(HERE))

from docx.enum.text import WD_ALIGN_PARAGRAPH        # noqa: E402
from docx.shared import Cm, Pt, RGBColor             # noqa: E402
from docx.text.paragraph import Paragraph            # noqa: E402

import worksheet_lib                                 # noqa: E402
from worksheet_lib import Worksheet, find_plain_maths, tag  # noqa: E402

SCHEMA_PATH = HERE / 'sheet-spec.schema.json'

# ── the sheet's ink, in one place ───────────────────────────────────────────
# Every one of these is read off the sheets already filed in Dropbox; the
# spec's blocks are named after them so a writer never types a hex code.
SKILL_NAVY = '1F4E79'      # the Title Case section heading
NAME_BLUE = '8EAADB'       # the faded "For <Full Name>" subtitle
PAPERS_GREY = '7F7F7F'     # the batch sheet's list of papers, under the title
WHERE_GREY = '7F7F7F'      # "Where it showed: …"
KEYMOVE_BLUE = '0432FF'    # the one blue key-move line under a heading
REMEMBER_GREY = 'A6A6A6'   # "[Remember: …]" under a practice question
PRINCIPLE_GREY = '7F7F7F'  # the grey italic principle lines opening a box
ERROR_RED = 'EE0000'       # the single red Common Error line

SUBJECT_HEADER = {
    'AM': "Additional Mathematics",
    'EM': "Elementary Mathematics",
    'JC': "H2 Mathematics",
}

#: the three instruction lines, fixed since 31 Aug 2026 (SKILL.md §The opening
#: block is fixed) — bolding only **Example** and **Practice**.
DEFAULT_INSTRUCTIONS = [
    [{'t': 'Read through each '}, {'t': 'Example', 'b': True}],
    [{'t': 'Then do the '}, {'t': 'Practice', 'b': True},
     {'t': ' under it on your own, before you look at the answers.'}],
    [{'t': 'When you have finished, photograph your work and submit it for marking.'}],
]


class SpecError(Exception):
    pass


# ── spec → worksheet_lib parts ──────────────────────────────────────────────

def _rgb(hex_rgb):
    return RGBColor.from_string(str(hex_rgb).lstrip('#').upper())


def parts_of(items, base=None):
    """A spec `parts` array → a worksheet_lib parts list.

    `base` is the block's own ink ({'italic': True, 'color': '7F7F7F'}); it
    applies to TEXT pieces only, which is what the filed sheets do — the maths
    inside a grey principle line or a blue key-move line is black unless the
    piece says otherwise.
    """
    base = base or {}
    out = []
    for it in items or []:
        if not isinstance(it, dict):
            raise SpecError(f'a part must be an object, got {it!r}')
        if 't' in it:
            attrs = {}
            if it.get('b', base.get('bold')):
                attrs['bold'] = True
            if it.get('i', base.get('italic')):
                attrs['italic'] = True
            if it.get('u'):
                attrs['underline'] = True
            colour = it.get('color', base.get('color'))
            if colour:
                attrs['color'] = _rgb(colour)
            out.append(('text', it['t'], attrs))
        elif 'm' in it:
            attrs = {}
            if it.get('color'):
                attrs['color'] = str(it['color']).lstrip('#').upper()
            if it.get('b'):
                attrs['bold'] = True
            kind = 'math_display' if it.get('display') else 'math'
            out.append((kind, it['m'], attrs))
        elif 'tag' in it:
            pieces = []
            for p in it['tag']:
                if isinstance(p, str):
                    pieces.append(p)
                elif isinstance(p, dict) and 'm' in p:
                    pieces.append(('math', p['m']))
                elif isinstance(p, dict) and 't' in p:
                    pieces.append(('text', p['t']))
                else:
                    raise SpecError(f'a tag piece is a string or {{"m": latex}}, got {p!r}')
            out.append(('__tag__', pieces, {
                'color': str(it.get('color', worksheet_lib.RULE_GREEN)).lstrip('#').upper(),
                'brackets': it.get('brackets', True),
                'bold': it.get('bold', True),
            }))
        else:
            raise SpecError(f'a part needs "t", "m" or "tag", got {sorted(it)}')
    # splice the tags out into their own runs
    flat = []
    for p in out:
        if p[0] == '__tag__':
            flat.extend(tag(*p[1], color=p[2]['color'], bold=p[2]['bold'],
                            brackets=p[2]['brackets']))
        else:
            flat.append(p)
    return flat


# ── figures ─────────────────────────────────────────────────────────────────

class Figures:
    """Every figure the spec names, rendered once into <out>/figures/."""

    def __init__(self, out_dir: Path, spec_dir: Path):
        self.dir = out_dir / 'figures'
        self.spec_dir = spec_dir
        self._n = 0
        self._cache = {}

    def path_for(self, source) -> str:
        key = json.dumps(source, sort_keys=True)
        if key in self._cache:
            return self._cache[key]
        self.dir.mkdir(parents=True, exist_ok=True)
        self._n += 1
        if 'file' in source:
            src = (self.spec_dir / source['file']).resolve()
            if not src.is_file():
                raise SpecError(f'figure file not found: {source["file"]}')
            dest = self.dir / f'fig{self._n:02d}{src.suffix.lower() or ".png"}'
            shutil.copyfile(src, dest)
            # A row of the bank carries a JPEG under a .png name and python-docx
            # then raises a bare UnrecognizedImageError with no hint which file
            # it choked on; PIL opens them happily.
            try:
                from PIL import Image
                with Image.open(dest) as im:
                    fmt = im.format
                    if dest.suffix.lower() == '.png' and fmt != 'PNG':
                        im.convert('RGB').save(dest, 'PNG')
            except Exception:
                pass
        elif 'figure_lib' in source:
            import figure_lib
            dest = self.dir / f'fig{self._n:02d}.png'
            figure_lib.render(source['figure_lib'], str(dest))
        else:
            raise SpecError('a figure source is {"file": …} or {"figure_lib": …}')
        self._cache[key] = str(dest)
        return str(dest)


# ── the build ───────────────────────────────────────────────────────────────

def add_header(ws: Worksheet, lines):
    """The two grey centred running-header lines.

    `worksheet_lib` owns the body, not the header; this is the only piece of
    page furniture the sheets add on top of it, and it has been byte-identical
    on every sheet filed since 31 Aug 2026 apart from the subject line.
    """
    section = ws.doc.sections[0]
    header = section.header
    header.is_linked_to_previous = False
    paras = [header.paragraphs[0]]
    while len(paras) < len(lines):
        paras.append(header.add_paragraph())
    for p, text in zip(paras, lines):
        pf = p.paragraph_format
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        pf.line_spacing = 1.0
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(text)
        run.font.name = 'Times New Roman'
        run.font.size = Pt(8)
        run.font.color.rgb = _rgb(PAPERS_GREY)


def tight_title_block(ws: Worksheet, title, papers, student):
    """Title → (papers) → For <Name>, tight (Adrian, 2 Sep 2026: "don't leave
    such a large gap"). The name sits directly under the title and the first
    instruction line directly under the name."""
    ws.title(title)
    p = ws.doc.paragraphs[-1]
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.0

    if papers:
        pp = ws.doc.add_paragraph()
        pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pp.paragraph_format.space_before = Pt(0)
        pp.paragraph_format.space_after = Pt(2)
        pp.paragraph_format.line_spacing = 1.0
        pp.paragraph_format.space_after = Pt(1)
        run = pp.add_run(' · '.join(papers))
        run.font.name = 'Times New Roman'
        run.font.size = Pt(9)
        run.font.color.rgb = _rgb(PAPERS_GREY)

    np = ws.doc.add_paragraph()
    np.alignment = WD_ALIGN_PARAGRAPH.CENTER
    np.paragraph_format.space_before = Pt(0)
    np.paragraph_format.space_after = Pt(3)
    np.paragraph_format.line_spacing = 1.0
    run = np.add_run(f'For {student}')
    run.font.name = 'Times New Roman'
    run.font.size = Pt(10)
    run.font.color.rgb = _rgb(NAME_BLUE)


def set_size(p, pt):
    """`worksheet_lib._fill` writes every run at the 9.5 pt body size; the two
    lines that are not body size — the section heading and the title-block
    lines — are set here, after the paragraph is built."""
    for run in p.runs:
        run.font.size = Pt(pt)
    return p


def marks_gap(p):
    """Two spaces before the marks tab.

    Every sheet Adrian has vetted carries `'  \\t[3]'`, not the library's bare
    `'\\t[3]'` — a minimum gap before the bracket when a question's text runs
    close to the 15.5 cm tab stop. The tab stop, font and size still come from
    `worksheet_lib`; only the two spaces are added here."""
    if not p.runs:
        return p
    last = p.runs[-1]
    if re.match(r'^\t\[\d+\]$', last.text or ''):
        last.text = '  ' + last.text
    return p


def data_table(ws: Worksheet, block):
    """A plain data table — the two-way frequency tables and ingredient lists
    that arrive with an E-Math question. Full TableGrid borders (unlike a
    solution box, which shows only its outer edge), a bold header row and a
    bold stub column, every other cell centred."""
    rows = block['rows']
    ncols = max(len(r) for r in rows)
    table = ws.doc.add_table(rows=len(rows), cols=ncols)
    table.style = ws.doc.styles['Table Grid']
    table.autofit = False
    widths = block.get('widths_cm')
    if not widths:
        widths = [round(16.0 / ncols, 3)] * ncols
    # only the CELL widths are set: python-docx's own even split stays in
    # w:tblGrid, and Word sizes the columns from w:tcW. (A solution box sets
    # both, because the GCE solutions export is also read by LibreOffice.)
    aligns = block.get('align') or (['left'] + ['center'] * (ncols - 1))
    header = block.get('header', True)
    stub_bold = block.get('stub_bold', True)
    for ri, (row, trow) in enumerate(zip(rows, table.rows)):
        for ci in range(ncols):
            cell = trow.cells[ci]
            cell.width = Cm(widths[ci])
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(1)
            # every row but the last keeps with the one below, so a table is
            # never split — the last must NOT, or it drags the page after it
            p.paragraph_format.keep_with_next = True if ri < len(rows) - 1 else None
            p.alignment = {'left': WD_ALIGN_PARAGRAPH.LEFT,
                           'center': WD_ALIGN_PARAGRAPH.CENTER,
                           'right': WD_ALIGN_PARAGRAPH.RIGHT}[aligns[ci]]
            value = row[ci] if ci < len(row) else ''
            items = value if isinstance(value, list) else ([{'t': str(value)}] if value != '' else [])
            bold = (header and ri == 0) or (stub_bold and ci == 0 and ri > 0)
            ws._fill(p, parts_of(items, base={'bold': True} if bold else None))
    # the row above a table is glued to it, so a table can never be orphaned
    # from the sentence that introduces it
    if ws._block_paras:
        ws._block_paras[-1].paragraph_format.keep_with_next = True
    ws._block_paras = []
    ws.doc.add_paragraph()
    return table


def solution_rows(ws, figures, rows_spec):
    """A `solution` block's rows → the (label, steps) list `solution_box` takes."""
    rows = []
    for row in rows_spec:
        steps = []
        for step in row.get('steps', []):
            kind = step.get('step')
            if kind == 'math':
                steps.append(step['latex'])
            elif kind == 'note':
                steps.append(parts_of(step['parts'],
                                      base={'italic': True, 'color': PRINCIPLE_GREY}))
            elif kind == 'prose':
                steps.append(parts_of(step['parts']))
            elif kind == 'error':
                steps.append([('text', 'Common Error: ', {'bold': True, 'color': _rgb(ERROR_RED)})]
                             + parts_of(step['parts'], base={'color': ERROR_RED}))
            elif kind == 'check':
                steps.append(('check', parts_of(step['parts'])))
            elif kind == 'figure':
                steps.append(('figure', figures.path_for(step['source']),
                              float(step.get('width_cm', 8.0))))
            else:
                raise SpecError(f'unknown solution step {kind!r}')
        rows.append((row.get('label', ''), steps))
    return rows


def build(spec, out_dir: Path, spec_dir: Path, name: str, repair: bool):
    sheet = spec['sheet']
    figures = Figures(out_dir, spec_dir)

    ws = Worksheet(working_space=float(sheet.get('working_space', 0.0)))
    header = sheet.get('header')
    if header is None:
        subject = sheet.get('subject', 'AM')
        header = ["ADRIAN'S MATH TUITION", SUBJECT_HEADER.get(subject, subject)]
    add_header(ws, header)
    tight_title_block(ws, sheet['title'], sheet.get('papers'), sheet['student'])
    for line in sheet.get('instructions', DEFAULT_INSTRUCTIONS):
        ws.para(parts_of(line))
    ws.doc.add_paragraph()          # the one blank line after the instructions

    n_skills = 0

    def glue(p, block):
        if block.get('glue') and p is not None:
            p.paragraph_format.keep_with_next = True

    for block in spec['body']:
        kind = block['block']
        p = None
        if kind == 'skill':
            p = set_size(ws.para(parts_of(block['parts'],
                                          base={'bold': True, 'color': SKILL_NAVY})), 11)
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.keep_with_next = True     # a heading is never stranded
            # "Page break before each new skill" (SKILL.md) — every skill after
            # the first opens a page, so a section is read whole.
            n_skills += 1
            if block.get('new_page', n_skills > 1):
                p.paragraph_format.page_break_before = True
        elif kind == 'where':
            style = block.get('style') or {}
            p = set_size(ws.para(parts_of(block['parts'], base={
                'italic': style.get('italic', True),
                'bold': style.get('bold', False),
                'color': style.get('color', WHERE_GREY)})), 9)
            p.paragraph_format.keep_with_next = True
        elif kind == 'keymove':
            style = block.get('style') or {}
            p = ws.para(parts_of(block['parts'], base={
                'italic': style.get('italic', True),
                'bold': style.get('bold', False),
                'color': style.get('color', KEYMOVE_BLUE)}))
            p.paragraph_format.keep_with_next = True
        elif kind == 'example':
            p = ws.example(block.get('label'))
        elif kind == 'para':
            p = marks_gap(ws.para(parts_of(block['parts']), marks=block.get('marks')))
            if block.get('indent_cm'):
                p.paragraph_format.left_indent = Cm(float(block['indent_cm']))
        elif kind == 'parts_start':
            ws.parts()
        elif kind == 'part':
            p = marks_gap(ws.SQ(parts_of(block['parts']), marks=block.get('marks')))
        elif kind == 'item':
            p = marks_gap(ws.Q(parts_of(block['parts']), marks=block.get('marks')))
        elif kind == 'practice':
            p = ws.para([('text', block['label'], {'bold': True})])
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.keep_with_next = True
            ws.restart_numbering()
        elif kind == 'remember':
            style = block.get('style') or {}
            base = {'italic': style.get('italic', True),
                    'color': style.get('color', REMEMBER_GREY)}
            inner = parts_of(block['parts'], base=base)
            # the maths in a Remember line takes the same grey as the words
            inner = [(k, v, dict(a, color=base['color']) if k != 'text' else a)
                     for k, v, a in inner]
            p = ws.para([('text', '[Remember: ', {'italic': base['italic'], 'color': _rgb(base['color'])})]
                        + inner
                        + [('text', ']', {'italic': base['italic'], 'color': _rgb(base['color'])})])
            if style.get('size_pt'):
                set_size(p, style['size_pt'])
            if block.get('indent_cm'):
                p.paragraph_format.left_indent = Cm(float(block['indent_cm']))
        elif kind == 'answer':
            p = ws.ans(parts_of(block['parts']))
        elif kind == 'figure':
            p = ws.figure(figures.path_for(block['source']),
                          width_cm=float(block.get('width_cm', 10.5)))
        elif kind == 'solution':
            table = ws.solution_box(solution_rows(ws, figures, block['rows']),
                                    keep_together=block.get('keep_together', False))
            if block.get('glue'):
                # the "Solution:" label travels with the box below it
                label = table._tbl.getprevious()
                if label is not None:
                    Paragraph(label, ws.doc).paragraph_format.keep_with_next = True
        elif kind == 'table':
            data_table(ws, block)
        elif kind == 'blank':
            p = ws.doc.add_paragraph()
            ws._block_paras.append(p)
        elif kind == 'page_break':
            ws.page_break()
        else:
            raise SpecError(f'unknown block {kind!r}')
        glue(p, block)

    out_dir.mkdir(parents=True, exist_ok=True)
    docx_path = out_dir / f'{name}.docx'
    ws.save(str(docx_path))
    if repair:
        counts = run_repair(docx_path)
        if sum(counts.values()):
            print('  repaired: ' + ', '.join(f'{k}={v}' for k, v in counts.items() if v))
    return docx_path


def run_repair(path: Path):
    """repair-sheet.py's own repair(), in-process. A worksheet_lib sheet scores
    one `gap_above_box` per solution box every time, so this is a build step."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('repair_sheet', HERE / 'repair-sheet.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    from xml.etree import ElementTree as ET

    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        parts = {n: z.read(n) for n in names}
    original = parts['word/document.xml']
    mod.register_all_namespaces(original)
    root, counts = mod.repair(original)
    if not sum(counts.values()):
        return counts
    rewritten = mod.restore_root_tag(
        original, ET.tostring(root, encoding='UTF-8', xml_declaration=True))
    problems = mod.check_prefixes_survived(original, rewritten)
    for t, label in ((b'<a:blip', 'figures'), (b'<m:oMath', 'equations'), (b'<w:tbl>', 'boxes')):
        if original.count(t) != rewritten.count(t):
            problems.append(f'{label}: {original.count(t)} before, {rewritten.count(t)} after')
    if problems:
        raise SpecError('repair refused to write: ' + '; '.join(problems))
    parts['word/document.xml'] = rewritten
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.writestr(n, parts[n])
    return counts


# ── the pre-filing lints (WORKER_PROMPT.md §3b) ─────────────────────────────

IDIOMS = re.compile(
    r'\b(surviv\w*|hands? you|buys? you|for free|heavy lifting|nail(?:s|ed)? down'
    r'|unlocks?|the trick is|kills?|gets? rid of|knocks? out|left standing|clears? it)\b',
    re.I)


def lint(path: Path):
    problems, notes = [], []
    xml = zipfile.ZipFile(path).read('word/document.xml').decode('utf8', 'ignore')
    text = re.sub(r'<[^>]+>', ' ', xml)

    hits = find_plain_maths(str(path))
    for run, why in hits:
        problems.append(f'maths typed as text ({why}): {run!r}')

    lin = len(re.findall(r'<m:type m:val="(?:lin|skw)"/>', xml))
    if lin:
        problems.append(f'{lin} linear fraction(s) — every fraction is stacked')

    n_never = len(re.findall(r'\bnever\b', text, re.I))
    if n_never:
        problems.append(f'the word "never" appears {n_never}x — say not / does not / only when')

    idioms = sorted(set(m.group(0).lower() for m in IDIOMS.finditer(text)))
    if idioms:
        problems.append('idioms Adrian has banned: ' + ', '.join(idioms))

    n_ce = text.count('Common Error')
    if n_ce > 2:
        notes.append(f'{n_ce} Common Error lines — two per sheet is plenty')

    # an empty last paragraph in a table cell is the space Word will not let
    # Adrian delete
    from xml.etree import ElementTree as ET
    W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    M = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
    root = ET.fromstring(zipfile.ZipFile(path).read('word/document.xml'))
    empty_cells = 0
    for tc in root.iter(f'{{{W}}}tc'):
        paras = tc.findall(f'{{{W}}}p')
        if len(paras) > 1:
            last = paras[-1]
            txt = ''.join(t.text or '' for t in last.iter()
                          if t.tag in (f'{{{W}}}t', f'{{{M}}}t'))
            if not txt.strip() and last.find('.//' + f'{{{W}}}drawing') is None:
                empty_cells += 1
    if empty_cells:
        problems.append(f'{empty_cells} table cell(s) end on an empty paragraph')

    return problems, notes


# ── PDF through Microsoft Word ──────────────────────────────────────────────

WORD_CONTAINER = Path.home() / ('Library/Containers/com.microsoft.Word/Data/'
                                'Documents/adrianmath-export')

EXPORT_SCRIPT = '''
tell application "Microsoft Word"
    set n to count documents
    set idx to 0
    repeat with i from 1 to n
        if (name of document i) contains "{stem}" then set idx to i
    end repeat
    if idx is 0 then error "my document is not open among " & n
    save as (document idx) file name "{pdf}" file format format PDF
end tell
'''


def word_available():
    return Path('/Applications/Microsoft Word.app').exists()


def export_pdf(docx_path: Path, pdf_path: Path, timeout=240):
    """DOCX → PDF through Word, from inside Word's own sandbox container.

    Word is App-Sandboxed: an open or a save-as into a folder outside its
    container puts a "Grant File Access" dialog in front of Adrian, and for a
    script-opened file that grant does not survive the next Word launch. Inside
    the container it never asks. The staging name carries a uuid, because two
    sheet slots share one Word instance and `active document` is a race that
    has exported a peer's sheet before now — hence the index loop and the name
    guard, not `active document`.
    """
    WORD_CONTAINER.mkdir(parents=True, exist_ok=True)
    stem = f'sheet-{uuid.uuid4().hex[:8]}'
    staged = WORD_CONTAINER / f'{stem}.docx'
    staged_pdf = WORD_CONTAINER / f'{stem}.pdf'
    shutil.copyfile(docx_path, staged)
    subprocess.run(['xattr', '-c', str(staged)], check=False, capture_output=True)

    def osa(script):
        return subprocess.run(['osascript', '-e', script],
                              capture_output=True, text=True, timeout=timeout)

    probe = osa('tell application "Microsoft Word" to count documents')
    if probe.returncode != 0:
        raise SpecError(f'Word is not answering: {probe.stderr.strip()[:200]}')

    opened = osa(f'tell application "Microsoft Word" to open file name "{staged}"')
    if opened.returncode != 0:
        raise SpecError(f'Word could not open the staged docx: {opened.stderr.strip()[:200]}')

    res = osa(EXPORT_SCRIPT.format(stem=stem, pdf=staged_pdf))
    if res.returncode != 0 or not staged_pdf.exists():
        raise SpecError(f'Word could not export the PDF: {res.stderr.strip()[:300]}')
    osa(f'tell application "Microsoft Word" to close (every document whose name '
        f'contains "{stem}") saving no')
    shutil.copyfile(staged_pdf, pdf_path)
    for f in (staged, staged_pdf):
        try:
            f.unlink()
        except OSError:
            pass
    return pdf_path


# ── determinism ─────────────────────────────────────────────────────────────

#: the two entries that legitimately differ between two renders of one spec
VOLATILE = {'docProps/core.xml'}


def docx_fingerprint(path: Path):
    with zipfile.ZipFile(path) as z:
        return {n: z.read(n) for n in sorted(z.namelist()) if n not in VOLATILE}


def compare_docx(a: Path, b: Path):
    fa, fb = docx_fingerprint(a), docx_fingerprint(b)
    diffs = []
    for n in sorted(set(fa) | set(fb)):
        if n not in fa:
            diffs.append(f'only in {b.name}: {n}')
        elif n not in fb:
            diffs.append(f'only in {a.name}: {n}')
        elif fa[n] != fb[n]:
            diffs.append(f'differs: {n} ({len(fa[n])} vs {len(fb[n])} bytes)')
    return diffs


# ── main ────────────────────────────────────────────────────────────────────

def validate(spec):
    try:
        import jsonschema
    except ImportError:
        print('  (jsonschema not installed — schema check skipped)')
        return
    schema = json.loads(SCHEMA_PATH.read_text())
    jsonschema.validate(spec, schema)


EXAMPLE_SPEC = HERE / 'sheet-spec.example.json'


def selftest():
    """Render the example spec and check what the house style guarantees.

    It is the one test this renderer can carry on its own: the repo's vitest
    suite only looks at `src/**`, and the thing worth pinning here is the OOXML
    a spec turns into, not a TypeScript function. Run it after touching this
    file or `worksheet_lib`."""
    from xml.etree import ElementTree as ET
    W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    spec = json.loads(EXAMPLE_SPEC.read_text())
    validate(spec)
    failures = []
    with tempfile.TemporaryDirectory() as td:
        out = Path(td)
        docx_path = build(spec, out, EXAMPLE_SPEC.parent, 'selftest', repair=True)
        problems, _notes = lint(docx_path)
        if problems:
            failures += [f'lint: {p}' for p in problems]

        again = build(spec, out / 'again', EXAMPLE_SPEC.parent, 'selftest', repair=True)
        diffs = compare_docx(docx_path, again)
        if diffs:
            failures.append('not deterministic: ' + '; '.join(diffs))

        with zipfile.ZipFile(docx_path) as z:
            names = z.namelist()
            xml = z.read('word/document.xml').decode('utf8', 'ignore')
            header = next((n for n in names if n.startswith('word/header')), None)
            hdr = z.read(header).decode() if header else ''

        # the repair pass re-serialises through ElementTree, which writes
        # `<w:tag />` where python-docx wrote `<w:tag/>` — count with a regex
        def n(pattern):
            return len(re.findall(pattern, xml))

        checks = [
            ('every equation is an equation object', xml.count('<m:oMath') >= 40),
            ('no linear fraction', not re.search(r'<m:type m:val="(?:lin|skw)"\s*/>', xml)),
            ('the figure is embedded', any(n.startswith('word/media/') for n in names)),
            ('the running header names the subject',
             "ADRIAN'S MATH TUITION" in hdr and 'Additional Mathematics' in hdr),
            ('the batch papers line is there', '2025 Paper 1 · 2025 Paper 2' in xml),
            ('the name is the faded-blue subtitle', 'For Example Student' in xml and '8EAADB' in xml),
            ('one [Ans: …] per practice question', xml.count('[Ans: ') == 3),
            ('the marks sit at the 15.5 cm right tab', n(r'w:pos="8787"') >= 6),
            ('each skill after the first opens a page', n(r'<w:pageBreakBefore\s*/>') == 1),
            ('the practice numbering restarts per set',
             'w:val="50"' in xml and 'w:val="51"' in xml),
            ('the solution boxes show only their outer border',
             n(r'<w:insideH w:val="none"') == 2),
            ('the data table keeps its gridlines',
             n(r'<w:tblStyle w:val="TableGrid"\s*/>') == 3),
            ('the check line is green', '2E7D32' in xml and '✓ Check: ' in xml),
            ('the Common Error line is red', 'EE0000' in xml and 'Common Error: ' in xml),
            ('the green rule tag is green', '00B050' in xml),
        ]
        for label, ok in checks:
            print(f'  {"ok  " if ok else "FAIL"} {label}')
            if not ok:
                failures.append(label)

    if failures:
        print(f'selftest FAILED ({len(failures)})')
        sys.exit(1)
    print('selftest ok')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('spec', nargs='?')
    ap.add_argument('--out')
    ap.add_argument('--name', default='3 Practice Again')
    ap.add_argument('--pdf', dest='pdf', action='store_true', default=None)
    ap.add_argument('--no-pdf', dest='pdf', action='store_false')
    ap.add_argument('--no-repair', dest='repair', action='store_false', default=True)
    ap.add_argument('--strict', action='store_true')
    ap.add_argument('--check-determinism', action='store_true')
    ap.add_argument('--selftest', action='store_true')
    args = ap.parse_args()

    if args.selftest:
        selftest()
        return
    if not args.spec:
        ap.error('a spec path is required (or --selftest)')

    spec_path = Path(args.spec).resolve()
    spec = json.loads(spec_path.read_text())
    out_dir = Path(args.out).resolve() if args.out else spec_path.parent

    validate(spec)
    docx_path = build(spec, out_dir, spec_path.parent, args.name, args.repair)
    print(f'  docx  {docx_path}')

    problems, notes = lint(docx_path)
    for n in notes:
        print(f'  note  {n}')
    for p in problems:
        print(f'  LINT  {p}')
    if problems and args.strict:
        sys.exit(1)

    if args.check_determinism:
        with tempfile.TemporaryDirectory() as td:
            again = build(spec, Path(td), spec_path.parent, args.name, args.repair)
            diffs = compare_docx(docx_path, again)
        print('  determinism: ' + ('IDENTICAL' if not diffs else 'DIFFERS — ' + '; '.join(diffs)))
        if diffs:
            sys.exit(1)

    want_pdf = args.pdf if args.pdf is not None else word_available()
    if want_pdf:
        pdf_path = out_dir / f'{args.name}.pdf'
        export_pdf(docx_path, pdf_path)
        print(f'  pdf   {pdf_path}')
    else:
        print('  pdf   skipped')


if __name__ == '__main__':
    main()
