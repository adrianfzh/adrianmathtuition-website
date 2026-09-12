#!/usr/bin/env python3
"""GCE paper JSON → Word, in Adrian's house style.

  python3 scripts/gce-paper/export-docx.py data/gce-generated/GCE-AM-P1-seed1-2026-09-08.json \
      --figures <dir holding Q<n>.png> --out <dir> [--space 3.0]

Writes <name>.docx (the paper: front page, formulae, questions with writing
space) and <name>-solutions.docx (every question with its boxed worked solution,
then an answer key). Everything comes from the assembled JSON — no model calls.
Typesetting goes through .claude/skills/create-worksheet/worksheet_lib.py
(python-docx + pandoc for native Word equations), so the output matches the
worksheets Adrian already edits.
"""
import argparse
import json
import os
import re
import sys
from os.path import abspath, basename, dirname, exists, join, splitext

ROOT = dirname(dirname(dirname(abspath(__file__))))
sys.path.insert(0, join(ROOT, '.claude', 'skills', 'create-worksheet'))

import worksheet_lib  # noqa: E402
from worksheet_lib import Worksheet  # noqa: E402
from docx.shared import Cm  # noqa: E402
from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: E402
from docx.oxml import OxmlElement  # noqa: E402
from docx.oxml.ns import qn  # noqa: E402

# ---------------------------------------------------------------- maths ----

_orig_omml = worksheet_lib._latex_to_omml
_omml_cache = {}
FAILED = []


def _memo_omml(latex, display=False):
    key = (latex, bool(display))
    if key not in _omml_cache:
        try:
            _omml_cache[key] = _orig_omml(latex, display)
        except Exception as e:  # pandoc refused it — keep the LaTeX visible, never drop it
            FAILED.append((latex, str(e)[:80]))
            _omml_cache[key] = None
    el = _omml_cache[key]
    if el is None:
        return None
    # pandoc hands back one lxml element; a second use in the document needs a copy
    import copy
    return copy.deepcopy(el)


worksheet_lib._latex_to_omml = _memo_omml

MATH_RE = re.compile(r'\$\$(.+?)\$\$|\\\[(.+?)\\\]|\$(.+?)\$', re.S)


def _clean(s):
    return s.replace('**', '')


def segs(text, attrs=None):
    """Split '$…$' / '$$…$$' / '\\[…\\]' out of a line into worksheet_lib parts."""
    out, pos = [], 0
    text = text or ''

    def txt(s):
        if not s:
            return
        out.append(('text', _clean(s), attrs) if attrs else ('text', _clean(s)))

    for m in MATH_RE.finditer(text):
        txt(text[pos:m.start()])
        if m.group(3) is not None:
            latex = m.group(3).strip()
            if _memo_omml(latex, False) is None:
                out.append(('text', latex, {'italic': True}))
            else:
                out.append(('math', latex))
        else:
            latex = (m.group(1) or m.group(2)).strip()
            if _memo_omml(latex, True) is None:
                out.append(('text', latex, {'italic': True}))
            else:
                out.append(('math_display', latex))
        pos = m.end()
    txt(text[pos:])
    return out


def whole_math(line):
    """A line that is exactly one $…$ (optionally ending in a full stop) is a display step."""
    m = re.fullmatch(r'\s*\$(.+?)\$\s*\.?\s*', line, re.S)
    if m and '$' not in m.group(1):
        return m.group(1).strip()
    return None


# --------------------------------------------------------------- layout ----

Q_TEXT_CM = 1.0   # numbering.xml puts question text at 567 twips
STEP_CM = 0.9     # each part level steps in by this much

LABEL_RE = re.compile(r'^\s*\(([a-z]{1,3})\)\s*(?:\(([ivx]{1,5})\))?\s*', re.I)
ROMAN = {'i', 'ii', 'iii', 'iv', 'v', 'vi'}


def split_label(label):
    m = LABEL_RE.match(label or '')
    if not m:
        return (label or '').strip(), ''
    return '(' + m.group(1) + ')', ('(' + m.group(2) + ')') if m.group(2) else ''


def indent(p, level, hang_levels):
    pf = p.paragraph_format
    text_cm = Q_TEXT_CM + STEP_CM * (level + 1)
    pf.left_indent = Cm(text_cm)
    pf.first_line_indent = Cm(-STEP_CM * hang_levels) if hang_levels else Cm(0)
    for lv in range(level + 1):
        pf.tab_stops.add_tab_stop(Cm(Q_TEXT_CM + STEP_CM * (lv + 1)))


def labelled(ws, labels, text, marks, level):
    """One part: `labels` is the list of label strings to lay across the hanging
    tab stops (['(c)', '(i)'] or ['', '(ii)'] or ['(a)']), text may span lines."""
    lines = [l for l in (text or '').split('\n') if l.strip()] or ['']
    for i, line in enumerate(lines):
        last = i == len(lines) - 1
        head = [('text', '\t'.join(labels) + '\t')] if i == 0 else []
        p = ws._add(head + segs(line), marks=marks if last else None)
        indent(p, level, len(labels) if i == 0 else 0)


def stem_paras(ws, q, marks_on_stem):
    lines = [l for l in q['stem'].split('\n') if l.strip()]
    for i, line in enumerate(lines):
        last = i == len(lines) - 1
        m = marks_on_stem if last else None
        if i == 0:
            ws.Q(segs(line), marks=m)
        else:
            p = ws.para(segs(line), marks=m)
            p.paragraph_format.left_indent = Cm(Q_TEXT_CM)


def figure_para(ws, q, pos, figures):
    # figure.mjs writes Q<n>.figure.png beside the draft; a hand-made Q<n>.png also counts
    path = None
    for name in (f'Q{pos}.figure.png', f'Q{pos}.png'):
        cand = join(figures, name) if figures else None
        if cand and exists(cand):
            path = cand
            break
    if path:
        width_cm = 9.5
        spec = join(figures, f'Q{pos}.figure.json') if figures else None
        if spec and exists(spec):
            try:
                if json.load(open(spec)).get('family') == 'graph-paper':
                    width_cm = 15.0   # a grid the candidate draws on prints near the full text width
            except Exception:
                pass
        ws.figure(path, width_cm=width_cm)
        return True
    if q.get('needs_figure'):
        p = ws.para([('text', '[Figure to be drawn: ' + (q.get('figure_description') or '') + ']', {'italic': True})])
        p.paragraph_format.left_indent = Cm(Q_TEXT_CM)
    return False


def question(ws, s, figures, with_marks=True):
    q = s.get('question') or s.get('draft')
    parts = q.get('parts') or []
    stem_paras(ws, q, s['target'] if (with_marks and not parts) else None)
    figure_para(ws, q, s['pos'], figures)
    prev_outer = None
    for part in parts:
        outer, inner = split_label(part.get('label', ''))
        subs = part.get('subparts') or []
        marks = part.get('marks') if with_marks else None
        if inner:
            labels = [outer if outer != prev_outer else '', inner]
            labelled(ws, labels, part.get('text', ''), None if subs else marks, level=1)
        else:
            labelled(ws, [outer], part.get('text', ''), None if subs else marks, level=0)
        prev_outer = outer
        for sub in subs:
            so, si = split_label(sub.get('label', ''))
            labelled(ws, [si or so], sub.get('text', ''), sub.get('marks') if with_marks else None, level=1)
    return q


# ----------------------------------------------------------- solutions ----


def split_long_math(latex, limit=70):
    """A display line longer than `limit` chars with 2+ top-level '=' signs
    becomes an aligned block, one '=' per line, so it stacks instead of
    running off the solution box (OMML display math never wraps)."""
    if len(latex) <= limit:
        return latex
    pieces, depth, cur = [], 0, ''
    for ch in latex:
        if ch in '{([':
            depth += 1
        elif ch in '})]':
            depth -= 1
        if ch == '=' and depth == 0:
            pieces.append(cur)
            cur = ''
        else:
            cur += ch
    pieces.append(cur)
    if len(pieces) < 3:
        return latex
    first, rest = pieces[0].strip(), [q.strip() for q in pieces[1:]]
    return '\\begin{aligned} ' + first + ' &= ' + ' \\\\ &= '.join(rest) + ' \\end{aligned}'

def solution_rows(sol):
    rows, label, steps, prev_outer = [], None, [], None

    def flush():
        if label is not None or steps:
            rows.append((label or '', steps or [[('text', '')]]))

    for raw in (sol or '').split('\n'):
        line = raw.strip()
        if not line:
            continue
        m = LABEL_RE.match(line)
        if m and (m.end() < len(line) or not steps):
            g1, g2 = m.group(1).lower(), (m.group(2) or '').lower()
            if g1 in ROMAN and prev_outer:
                new = prev_outer + '(' + g1 + ')'
            else:
                new = '(' + g1 + ')' + (('(' + g2 + ')') if g2 else '')
                prev_outer = '(' + g1 + ')'
            if new != label:
                flush()
                label, steps = new, []
            line = line[m.end():].strip()
            if not line:
                continue
        chk = re.match(r'^\(?\s*Check\s*:\s*(.*?)\)?\s*$', line, re.I | re.S)
        if chk:
            steps.append(('check', segs(chk.group(1))))
            continue
        disp = whole_math(line)
        if disp is not None:
            disp = split_long_math(disp)
        if disp is not None and _memo_omml(disp, True) is not None:
            steps.append(disp)
        else:
            steps.append(segs(line))
    flush()
    return rows or [('', [[('text', '(no worked solution recorded)')]])]


# ------------------------------------------------------------ front page ----

INSTRUCTIONS = [
    'Answer all the questions.',
    'Write your answers in the spaces provided.',
    'If working is needed for any question it must be shown with the answer.',
    'Omission of essential working will result in loss of marks.',
    'The use of an approved scientific calculator is expected, where appropriate.',
    'If the degree of accuracy is not specified in the question, and if the answer is not exact, '
    'give the answer to three significant figures. Give answers in degrees to one decimal place.',
    'For $\\pi$, use either your calculator value or 3.142, unless the question requires the answer in terms of $\\pi$.',
    'The number of marks is given in brackets [ ] at the end of each question or part question.',
]

FORMULAE_AM = [
    ('1.  ALGEBRA', None),
    ('Quadratic Equation', 'For the equation $ax^2 + bx + c = 0$, $x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$'),
    ('Binomial expansion',
     '$(a + b)^n = a^n + \\binom{n}{1}a^{n-1}b + \\binom{n}{2}a^{n-2}b^2 + \\cdots + \\binom{n}{r}a^{n-r}b^r + \\cdots + b^n$, '
     'where $n$ is a positive integer and $\\binom{n}{r} = \\dfrac{n!}{r!(n-r)!} = \\dfrac{n(n-1)\\cdots(n-r+1)}{r!}$'),
    ('2.  TRIGONOMETRY', None),
    ('Identities', '$\\sin^2 A + \\cos^2 A = 1$'),
    ('', '$\\sec^2 A = 1 + \\tan^2 A$'),
    ('', '$\\operatorname{cosec}^2 A = 1 + \\cot^2 A$'),
    ('', '$\\sin(A \\pm B) = \\sin A \\cos B \\pm \\cos A \\sin B$'),
    ('', '$\\cos(A \\pm B) = \\cos A \\cos B \\mp \\sin A \\sin B$'),
    ('', '$\\tan(A \\pm B) = \\dfrac{\\tan A \\pm \\tan B}{1 \\mp \\tan A \\tan B}$'),
    ('', '$\\sin 2A = 2 \\sin A \\cos A$'),
    ('', '$\\cos 2A = \\cos^2 A - \\sin^2 A = 2\\cos^2 A - 1 = 1 - 2\\sin^2 A$'),
    ('', '$\\tan 2A = \\dfrac{2 \\tan A}{1 - \\tan^2 A}$'),
    ('Formulae for $\\triangle ABC$', '$\\dfrac{a}{\\sin A} = \\dfrac{b}{\\sin B} = \\dfrac{c}{\\sin C}$'),
    ('', '$a^2 = b^2 + c^2 - 2bc \\cos A$'),
    ('', '$\\Delta = \\dfrac{1}{2} bc \\sin A$'),
]

# 4052 (E Math): the formula list printed on the real paper.
FORMULAE_EM = [
    ('Compound interest', 'Total amount $= P\\left(1 + \\dfrac{r}{100}\\right)^{n}$'),
    ('Mensuration', 'Curved surface area of a cone $= \\pi r l$'),
    ('', 'Surface area of a sphere $= 4\\pi r^2$'),
    ('', 'Volume of a cone $= \\dfrac{1}{3}\\pi r^2 h$'),
    ('', 'Volume of a sphere $= \\dfrac{4}{3}\\pi r^3$'),
    ('', 'Area of triangle $ABC = \\dfrac{1}{2} ab \\sin C$'),
    ('', 'Arc length $= r\\theta$, where $\\theta$ is in radians'),
    ('', 'Sector area $= \\dfrac{1}{2} r^2 \\theta$, where $\\theta$ is in radians'),
    ('Trigonometry', '$\\dfrac{a}{\\sin A} = \\dfrac{b}{\\sin B} = \\dfrac{c}{\\sin C}$'),
    ('', '$a^2 = b^2 + c^2 - 2bc \\cos A$'),
    ('Statistics', 'Mean $= \\dfrac{\\sum fx}{\\sum f}$'),
    ('', 'Standard deviation $= \\sqrt{\\dfrac{\\sum fx^2}{\\sum f} - \\left(\\dfrac{\\sum fx}{\\sum f}\\right)^2}$'),
]


def formulae_for(shape):
    """The formula list the real paper of this syllabus prints (4049 → A Math, 4052 → E Math)."""
    return FORMULAE_EM if str(shape.get('code', '')) == '4052' else FORMULAE_AM


def page_numbers(doc):
    p = doc.sections[0].footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), 'PAGE')
    r = OxmlElement('w:r')
    t = OxmlElement('w:t')
    t.text = '1'
    r.append(t)
    fld.append(r)
    p._element.append(fld)


def front_page(ws, paper, total):
    shape = paper.get('shape', {})
    code = f"{shape.get('code', '')}/0{paper.get('paperNo', '')}"
    ws.title(f"{shape.get('subject', 'Additional Mathematics').upper()}  {code}")
    ws.subtitle(f"Paper {paper.get('paperNo', '')}  ·  {shape.get('duration', '')}  ·  {total} marks")
    ws.para([('text', f"Practice paper in the style of the GCE O-Level, set {paper.get('seed', '')}. "
                      'Newly written questions, not a past-year paper.', {'italic': True})])
    ws.para([('text', '')])
    ws.para([('text', 'READ THESE INSTRUCTIONS FIRST', {'bold': True})])
    for line in INSTRUCTIONS:
        ws.para(segs(line))
    ws.para(segs(f'The total number of marks for this paper is {total}.'))
    ws.page_break()
    ws.para([('text', 'Mathematical Formulae', {'bold': True})])
    ws.para([('text', '')])
    for head, body in formulae_for(shape):
        if body is None:
            p = ws.para([('text', head, {'bold': True})])
            p.paragraph_format.space_before = Cm(0.3)
            continue
        p = ws.para((segs(head, {'italic': True}) if head else []) + [('text', '\t')] + segs(body))
        p.paragraph_format.left_indent = Cm(4.0)
        p.paragraph_format.first_line_indent = Cm(-4.0)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(4.0))
    ws.page_break()


# ----------------------------------------------------------------- main ----

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('paper')
    ap.add_argument('--figures', default=None, help='directory holding Q<n>.png')
    ap.add_argument('--out', default=None, help='output directory (default: beside the JSON)')
    ap.add_argument('--space', type=float, default=3.0, help='writing lines per mark on the paper')
    a = ap.parse_args()

    paper = json.load(open(a.paper))
    slots = [s for s in paper['questions'] if s.get('accepted', True) and (s.get('question') or s.get('draft'))]
    total = sum(s['target'] for s in slots)
    name = splitext(basename(a.paper))[0]
    out_dir = a.out or dirname(abspath(a.paper))
    os.makedirs(out_dir, exist_ok=True)

    # --- the paper
    ws = Worksheet(working_space=a.space)
    front_page(ws, paper, total)
    for s in slots:
        q = question(ws, s, a.figures)
        got = sum((p.get('marks') or 0) if not p.get('subparts') else sum(x.get('marks') or 0 for x in p['subparts'])
                  for p in (q.get('parts') or [])) or s['target']
        if got != s['target']:
            print(f"  ⚠ Q{s['pos']} parts sum to {got}, slot target {s['target']}")
    page_numbers(ws.doc)
    paper_path = join(out_dir, name + '.docx')
    ws.save(paper_path)

    # --- worked solutions + answer key
    ws2 = Worksheet(working_space=0)
    shape = paper.get('shape', {})
    ws2.title(f"{shape.get('subject', 'Additional Mathematics').upper()}  {shape.get('code', '')}/0{paper.get('paperNo', '')}  ·  WORKED SOLUTIONS")
    ws2.subtitle(f"Paper {paper.get('paperNo', '')}  ·  set {paper.get('seed', '')}  ·  {total} marks")
    for s in slots:
        q = question(ws2, s, a.figures)
        ws2.solution_box(solution_rows(q.get('solution')), keep_together=False)
    ws2.section('Answers')
    for s in slots:
        q = s.get('question') or s.get('draft')
        p = ws2.para([('text', f"{s['pos']}\t", {'bold': True})] + segs(q.get('answer') or ''))
        p.paragraph_format.left_indent = Cm(Q_TEXT_CM)
        p.paragraph_format.first_line_indent = Cm(-Q_TEXT_CM)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(Q_TEXT_CM))
    page_numbers(ws2.doc)
    sol_path = join(out_dir, name + '-solutions.docx')
    ws2.save(sol_path)

    if FAILED:
        print(f'  ⚠ {len(FAILED)} LaTeX fragment(s) pandoc could not convert were left as italic text:')
        for latex, err in FAILED[:10]:
            print('     ', latex[:90], '—', err)
    print(json.dumps({'paper': paper_path, 'solutions': sol_path, 'questions': len(slots), 'marks': total,
                      'math_fragments': len(_omml_cache), 'failed': len(FAILED)}))


if __name__ == '__main__':
    main()
