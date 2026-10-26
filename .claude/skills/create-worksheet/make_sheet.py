"""make_sheet.py — one call from questions to filed files (26 Oct 2026).

Adrian, 26 Oct 2026: "are we able to make it so that you can come up with the
docx/pdfs faster next time?" A 3-question sheet had taken several rounds: the
wrong python, a stem line at the left margin, two [Ans] lines that wrapped, a
question starting at the foot of a page, the PDF typed out by hand, and a second
build for the copy without working space. This does all of it in one run:

    import sys; sys.path.insert(0, '<repo>/.claude/skills/create-worksheet')
    from make_sheet import make_sheet

    def build(ws):                      # the questions, written ONCE
        ws.title('…'); ws.subtitle('JC2 H2 Mathematics')
        ws.Q([...]); ws.stem([...]); ws.SQ([...], marks=2); ws.ans([...])

    make_sheet(build, name='JC2 H2 Normal Distribution - Sum vs Multiple', level='JC')

What it does, in order:
  1. CHECKS before anything is saved — every [Ans] fits one line, no para()
     inside a numbered question (use ws.stem()), no glued run taller than a
     page, no maths typed as text. A failure stops the run with the list.
  2. Builds BOTH copies: with working space (default 4 lines a mark) and
     "(no working space)".
  3. PDFs through Word (scripts/sheet-worker/render_sheet.export_pdf — Word's
     own folder, no Grant-File-Access dialog, never interrupts Adrian).
  4. Looks at the write-on PDF: a question whose number lands in the bottom
     30 % of a page starts on a new page instead (rebuild, at most 2 passes).
  5. Files all four files in the ONE worksheet folder of the level,
     Dropbox/Apps/AdrianMathNotes/Practice/<level>/ — never over an existing
     file (a new copy gets " v2", " v3"). Worked-example and practice sheets
     share it since 26 Oct 2026; kind='revision' adds "(With Worked Examples)"
     to the name when it does not say so already (docs/KIOSK.md).
Prints the four paths at the end.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / 'scripts' / 'sheet-worker'))

import worksheet_lib  # noqa: E402  (re-runs the caller under /usr/bin/python3 if python-docx is missing)
from worksheet_lib import Worksheet, find_plain_maths  # noqa: E402

SHELF = Path.home() / 'Library' / 'CloudStorage' / 'Dropbox' / 'Apps' / 'AdrianMathNotes'
LEVELS = ('S1', 'S2', 'EM', 'AM', 'JC', 'EM G2', 'AM G2')
NO_SPACE = ' (no working space)'
LOW_ON_PAGE = 0.70          # a question number below 70 % of the page height starts a new page


class _Checked(Worksheet):
    """Worksheet that records layout faults instead of only printing them,
    and can start chosen questions on a new page."""

    def __init__(self, *a, breaks=(), **k):
        super().__init__(*a, **k)
        self.problems: list[str] = []
        self._breaks = set(breaks)
        self._qn = 0

    def Q(self, parts, marks=None):
        self._qn += 1
        if self._qn in self._breaks:
            self.page_break()
        return super().Q(parts, marks)

    def para(self, parts, marks=None):
        if self._qn and getattr(self, '_numbered_q_open', False):
            self.problems.append(f'Q{self._qn}: para() inside a numbered question prints at the left margin — use ws.stem()')
        return super().para(parts, marks)

    def ans(self, parts):
        p = super().ans(parts)
        w = worksheet_lib._para_width_cm(p)
        if w > self.ANS_CM:
            self.problems.append(f'Q{self._qn}: [Ans] line is {w:.1f} cm, wider than {self.ANS_CM} cm — shorten it')
        return p


def _build(build, working_space, breaks=()):
    ws = _Checked(working_space=working_space, breaks=breaks)
    build(ws)
    for i, h in enumerate(ws.glued_heights()):
        if h > ws.PAGE_CM:
            ws.problems.append(f'glued run {i} is {h:.1f} cm, taller than a page')
    return ws


def _low_questions(pdf: Path, n_questions: int) -> set[int]:
    """Question numbers whose '<n>.' sits low on its page (pdftotext word boxes)."""
    out = subprocess.run(['pdftotext', '-bbox', str(pdf), '-'], capture_output=True, text=True).stdout
    low, page_h = set(), 842.0
    for line in out.splitlines():
        m = re.search(r'<page width="[\d.]+" height="([\d.]+)"', line)
        if m:
            page_h = float(m.group(1))
            continue
        m = re.search(r'<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>(\d+)\.</word>', line)
        if m and float(m.group(1)) < 90:          # the number column at the left margin
            q = int(m.group(3))
            if 1 < q <= n_questions and float(m.group(2)) > LOW_ON_PAGE * page_h:
                low.add(q)
    return low


def _pdf(docx: Path) -> Path:
    import render_sheet
    pdf = docx.with_suffix('.pdf')
    render_sheet.export_pdf(docx, pdf)
    return pdf


def _free(path: Path) -> Path:
    if not path.exists():
        return path
    for v in range(2, 100):
        cand = path.with_name(f'{path.stem} v{v}{path.suffix}')
        if not cand.exists():
            return cand
    raise RuntimeError(f'too many copies of {path.name}')


def make_sheet(build, name: str, level: str, kind: str = 'practice', working_space: float = 4.0,
               out_dir: str | Path | None = None, file: bool = True, both: bool = True) -> list[Path]:
    """Build, check, PDF and file a worksheet. `build(ws)` writes the content.
    kind: 'practice' (questions, maybe answers) or 'revision' (worked examples).
    both=False makes only the write-on copy. file=False keeps the files in out_dir."""
    if level not in LEVELS:
        raise SystemExit(f'level must be one of {LEVELS}')
    if kind not in ('practice', 'revision'):
        raise SystemExit("kind must be 'practice' or 'revision'")
    # one folder per level for both kinds since 26 Oct 2026; the NAME says which it is
    if kind == 'revision' and not re.search(r'worked|example', name, re.I):
        name += ' (With Worked Examples)'
    shelf = SHELF / 'Practice' / level
    out = Path(out_dir) if out_dir else Path(sys.argv[0]).resolve().parent / 'out'
    out.mkdir(parents=True, exist_ok=True)

    # 1. checks, on both builds, before anything is written
    copies = [(name, working_space)] + ([(name + NO_SPACE, 0.0)] if both and working_space else [])
    sheets = {label: _build(build, ws_) for label, ws_ in copies}
    problems = sorted({p for s in sheets.values() for p in s.problems})
    if problems:
        print('Not built — fix these first:')
        for p in problems:
            print('  ✗ ' + p)
        raise SystemExit(1)

    made: list[Path] = []
    for label, space in copies:
        breaks: set[int] = set()
        for _ in range(3):
            ws = _build(build, space, breaks)
            docx = out / f'{label}.docx'
            ws.save(str(docx), strict_maths=True)
            bad = find_plain_maths(str(docx))
            if bad:
                raise SystemExit(f'maths typed as text in {docx.name}: {bad[:5]}')
            pdf = _pdf(docx)
            if not space:
                break
            low = _low_questions(pdf, ws._qn) - breaks
            if not low:
                break
            print(f'  {label}: Q{sorted(low)} start low on a page — starting them on a new page')
            breaks |= low
        pages = re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', str(pdf)], capture_output=True, text=True).stdout)
        print(f'  built {docx.name} + PDF ({pages.group(1) if pages else "?"} pages)')
        made += [docx, pdf]

    if not file:
        return made
    shelf.mkdir(parents=True, exist_ok=True)
    filed = []
    for f in made:
        dest = _free(shelf / f.name)
        shutil.copyfile(f, dest)
        filed.append(dest)
    print('\nFiled on the kiosk shelf:')
    for f in filed:
        print('  ' + str(f))
    return filed
