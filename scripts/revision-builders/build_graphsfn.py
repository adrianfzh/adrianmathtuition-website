#!/usr/bin/env python3
"""EM Graphs of Functions revision worksheet.

Verified in verify_graphs.py. The worked examples were chosen so their data is
in the TEXT (two named points), not only in the picture -- a worked example a
student cannot follow without the diagram teaches nothing on a printed sheet.
Practice keeps the diagrams, which is where they belong.
"""
from pathlib import Path
import tempfile
from build_lib import sheet, fetch, render_practice, save, T, B, I, M
import revision_lib as R

PRACTICE = [
    "a34a9b6a-3b03-4d80-8483-3f78b5787864",   # Greendale 2022, 1
    "6405f779-0ed1-406e-a100-4569d329f2fe",   # Tampines 2023, 1
    "771e7bd1-59cd-49aa-af63-8d4dae2d1123",   # Anglican High 2021, 2
    "c18ace7a-ed6f-422e-884a-b1ef6a7e5561",   # Cedar Girls 2025, 2
    "79944e37-a98d-4207-9b93-86e8daeea732",   # Chung Cheng (Yishun) 2023, 2
    "43817e6b-df57-49c7-b2ac-23c22fc24c5d",   # Deyi 2024, 2
    "8f549434-7618-480f-b822-38e43fbf2563",   # Dunman 2025, 2
    "c98d68d1-30c8-46b1-8484-3c480c412167",   # Hua Yi 2022, 2
    "586b2fed-aabe-4de4-a095-67786f526d02",   # Ngee Ann 2023, 2
    "780d4c91-8777-4dd4-bbe7-91603a58765e",   # Presbyterian High 2024, 2
    "1b560ce7-b442-4c6f-90c9-2ab89fd38814",   # St Joseph Institute 2024, 2
    "400d2aff-18db-4d2c-b748-6738d36d1a5f",   # Xinmin 2022, 2
    "60742a0b-cba8-434a-bd2e-0e138fc457a7",   # ACS (Barker Road) 2023, 3
    "3b9d871f-6840-4ba8-8c0f-2868841ff2c7",   # Chung Cheng (Main) 2024, 3
]


def notes(ws):
    ws.para([B('Notes:')])
    ws.para([B('The shapes you must recognise on sight')])
    ws.para([T('Every question in this topic starts with identifying the family. '
               'Learn the shape, then the detail.')])
    ws.para([M('y = ax + b'), T('  — a straight line.')])
    ws.para([M('y = ax^2 + bx + c'), T('  — a parabola. Opens '), I('upwards'), T(' when '),
             M('a > 0'), T(', '), I('downwards'), T(' when '), M('a < 0'), T('.')])
    ws.para([M('y = ax^3'), T('  — a cubic. Rises left to right when '), M('a > 0'),
             T('; falls when '), M('a < 0'), T('. It passes through the origin and flattens there.')])
    ws.para([M(r'y = \dfrac{a}{x}'), T('  — a hyperbola in two opposite quadrants, with the axes '
             'as asymptotes. Quadrants 1 and 3 when '), M('a > 0'), T('.')])
    ws.para([M(r'y = \dfrac{a}{x^2}'), T('  — two branches on the '), I('same'),
             T(' side of the '), M('x'), T('-axis, since '), M('x^2'), T(' is never negative.')])
    ws.para([M('y = ka^x'), T('  — exponential. Growing when '), M('a > 1'), T(', decaying when '),
             M('0 < a < 1'), T('.')])
    ws.para([B('Exponential graphs — the three facts that answer most questions')])
    ws.para([T('The curve '), M('y = ka^x'), T(' cuts the '), M('y'), T('-axis at '), M('y = k'),
             T(', because '), M('a^0 = 1'), T('. That single fact gives you '), M('k'),
             T(' immediately from the '), M('y'), T('-intercept.')])
    ws.para([T('It never touches the '), M('x'), T('-axis: '), M('y = 0'),
             T(' is an asymptote. If the graph is written '), M('y = ka^x + c'),
             T(', the asymptote moves to '), M('y = c'), T('.')])
    ws.para([T('The sign of '), M('k'), T(' decides which side of the asymptote the curve sits on.')])
    ws.para([B('Finding k and a from two points — the standard method')])
    ws.para([T('1.  Use the point on the '), M('y'), T('-axis first. Substituting '), M('x = 0'),
             T(' kills '), M('a'), T(' and leaves '), M('k'), T(' on its own.')])
    ws.para([T('2.  Substitute the second point, now that '), M('k'), T(' is known.')])
    ws.para([T('3.  Rearrange to '), M('a^n = \\text{number}'), T(' and take the '), M('n'),
             T('th root.')])
    ws.para([T('Never start with the harder point — you would be solving two unknowns at once '
               'for no reason.')])
    ws.para([B('Watch the exponent')])
    ws.para([M('y = ka^{-x}'), T(' is the mirror image of '), M('y = ka^{x}'), T(' in the '),
             M('y'), T('-axis. When you substitute '), M('x = -1'), T(' into '), M('y = ka^{-x}'),
             T(' the exponent becomes '), M('+1'), T(', not '), M('-1'), T('.')])
    ws.para([B('Water-in-a-container questions')])
    ws.para([T('These ask for the shape of depth against time. A '), I('narrow'),
             T(' container fills quickly, so the graph is '), I('steep'),
             T('; a wide one fills slowly and is shallow. A container that widens as it rises gives '
               'a curve that flattens; one that narrows gives a curve that steepens.')])
    ws.para([B('Five mistakes to avoid')])
    for i, e in enumerate([
        'Substituting the awkward point first instead of the $y$-intercept.',
        'Forgetting that $a^0 = 1$, and so missing that the $y$-intercept is $k$.',
        'Reading $y = ka^{-x}$ as if it were $y = ka^{x}$.',
        'Drawing an exponential curve touching or crossing its asymptote.',
        'Sketching a cubic as if it were a parabola — a cubic has no line of symmetry.',
    ], 1):
        ws.para([T(f'{i}.  ')] + R.split_math(e))


def worked(ws):
    ws.page_break()
    ws.para([B('Examples')])

    ws.para([B('Finding k and a From the y-intercept and One Other Point')])
    ws.para([T('The sketch shows the graph of '), M('y = ka^x'), T('. The points '),
             M('(0,\\ 1.5)'), T(' and '), M('(5,\\ 48)'),
             T(' lie on the graph. Find the value of '), M('k'), T(' and of '), M('a'), T('.')], marks=2)
    ws.para([B('Solution:')])
    ws.para([T('Take the point on the '), M('y'), T('-axis first — it is the one that gives a '
             'value straight away, because '), M('a^0 = 1'), T('.')])
    ws.math_block(r'\text{At } (0,\ 1.5): \quad 1.5 = k \cdot a^{0} = k \quad\Rightarrow\quad k = 1.5')
    ws.para([T('Now substitute the second point, with '), M('k'), T(' known.')])
    ws.math_block(r'\text{At } (5,\ 48): \quad 48 = 1.5\,a^{5} \quad\Rightarrow\quad a^{5} = 32')
    ws.math_block(r'a = \sqrt[5]{32} = 2')
    ws.para([T('So '), M('k = 1.5'), T(' and '), M('a = 2'), T('.')])

    ws.para([B('The Negative Exponent: y = ka^{-x}')])
    ws.para([T('The sketch shows the graph of '), M('y = ka^{-x}'), T('. The points '),
             M('A(-1,\\ 6)'), T(' and '), M('B(0,\\ 3)'),
             T(' lie on the graph. Find the value of '), M('k'), T(' and of '), M('a'), T('.')], marks=2)
    ws.para([B('Solution:')])
    ws.math_block(r'\text{At } B(0,\ 3): \quad 3 = k \cdot a^{0} \quad\Rightarrow\quad k = 3')
    ws.para([T('Now '), M('A(-1,\\ 6)'), T('. Substituting '), M('x = -1'), T(' into '),
             M('a^{-x}'), T(' gives '), M('a^{-(-1)} = a^{1}'),
             T(' — the two minus signs cancel. This is the step most marks are lost on.')])
    ws.math_block(r'6 = 3\,a^{1} \quad\Rightarrow\quad a = 2')
    ws.para([T('So '), M('k = 3'), T(' and '), M('a = 2'), T('.')])

    ws.page_break()
    ws.para([B('When the Curve Has Been Shifted: y = ka^x + c')])
    ws.para([T('The sketch shows the graph of '), M('y = ka^x + 1'), T(', where '), M('a > 0'),
             T('. The points '), M('(0,\\ -3)'), T(' and '), M('(4,\\ -323)'),
             T(' lie on the graph.')])
    ws.para([T('(a) Find the value of '), M('k'), T('.')], marks=1)
    ws.para([T('(b) Find the value of '), M('a'), T('.')], marks=1)
    ws.para([B('Solution:')])
    ws.para([T('(a)')])
    ws.para([T('The '), M('+1'), T(' does not disappear at '), M('x = 0'),
             T(' — carry it through.')])
    ws.math_block(r'-3 = k \cdot a^{0} + 1 = k + 1 \quad\Rightarrow\quad k = -4')
    ws.para([T('The negative '), M('k'), T(' is what puts the curve below its asymptote '),
             M('y = 1'), T('.')])
    ws.para([T('(b)')])
    ws.math_block(r'-323 = -4a^{4} + 1 \quad\Rightarrow\quad -4a^{4} = -324 \quad\Rightarrow\quad a^{4} = 81')
    ws.math_block(r'a = \sqrt[4]{81} = 3 \qquad (a > 0)')

    ws.para([B('Reading a Value When Both Points Are Off the Axis Order')])
    ws.para([T('The sketch shows the graph of '), M('y = ka^{-x}'), T('. The points '),
             M('P(-2,\\ 96)'), T(' and '), M(r'Q\left(0,\ \tfrac{3}{2}\right)'),
             T(' lie on the graph. Find the value of '), M('k'), T(' and of '), M('a'), T('.')], marks=2)
    ws.para([B('Solution:')])
    ws.para([T('Use '), M('Q'), T(' first — it is on the '), M('y'), T('-axis.')])
    ws.math_block(r'\tfrac{3}{2} = k \quad\Rightarrow\quad k = \tfrac{3}{2}')
    ws.para([T('At '), M('P(-2,\\ 96)'), T(' the exponent '), M('-x'), T(' becomes '), M('+2'), T('.')])
    ws.math_block(r'96 = \tfrac{3}{2}\,a^{2} \quad\Rightarrow\quad a^{2} = 64 \quad\Rightarrow\quad a = 8')
    ws.para([T('Reject '), M('a = -8'), T(': the base of an exponential must be positive.')])


def main():
    by_id, _ = fetch("EM", "Graphs of Functions", figures=True)
    print(f"pool: {len(by_id)} rows")
    figdir = Path(tempfile.mkdtemp(prefix="figs_gf_"))
    ws = sheet('O Level E Math Revision', 'Graphs of Functions')
    notes(ws)
    worked(ws)
    ws.page_break()
    ws.para([B('Practice')])
    ws.para([I('Each question refers to the diagram printed with it. Show all working.')])
    n = render_practice(ws, by_id, PRACTICE, figdir=figdir)
    save(ws, "EM", "09 Graphs of Functions Revision.docx")
    print(f"worked examples: 4    practice: {n}/{len(PRACTICE)}")


if __name__ == "__main__":
    main()
