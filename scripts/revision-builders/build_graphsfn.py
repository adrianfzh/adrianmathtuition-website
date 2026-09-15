#!/usr/bin/env python3
"""EM Graphs of Functions revision worksheet -- notes, worked examples, practice.

Three strands, each with its own notes at the front and its own practice right
after its examples (ADRIAN-STYLE, Numbering and sections):

    A  knowing the shape of a graph from its equation, and sketching it
    B  an exponential graph through two given points -- finding k and a
    C  the depth of water in a container against time

Every question -- worked examples included -- is read from the live bank rather
than transcribed, so a stem or an answer key on the sheet cannot drift from what
the bank holds.  The drawn graphs are the committed PNGs from
make_graphsfn_figures.py; re-run that script if one needs changing.

    ~/.../scratchpad/venv/bin/python build_graphsfn.py
"""
import tempfile
from pathlib import Path

from build_lib import (sheet, fetch, render_practice, render_parts, save, _normalise,
                       place_figures, fig_cm, T, B, I, M)
import revision_lib as R

FIG = Path(__file__).resolve().parent / "assets"

# --- worked examples, by bank id -------------------------------------------
EX = {
    "match":      "3826f55e",   # Methodist Girls 2022 P1 Q14       [3]
    "sketch_exp": "400d2aff",   # Xinmin 2022 P1 Q3                 [2]
    "no_meet":    "e6bf567b",   # Bendemeer 2021 P1 Q6              [3]
    "ka_x":       "7d4f58b8",   # Singapore Chinese Girls 2022 P1 Q10 [2]
    "ka_negx":    "9e55cb10",   # Mayflower 2022 P1 Q4              [2]
    "shifted":    "63ab1e80",   # Anglican High 2022 P1 Q18         [2]
    "with_line":  "b6dd1059",   # Xinmin 2024 P1 Q16                [6]
    "cone":       "d3607435",   # Anglican High 2021 P1 Q21         [2]
    "cone_cyl":   "181761d7",   # Crescent Girls 2024 P1 Q20        [4]
}

# --- practice ---------------------------------------------------------------
# Two rows in the pool are left out on purpose:
#   6052801d  SST 2025 P1 Q19  -- the key contradicts the points printed on the sketch
#   60742a0b  ACS (Barker) 2023 P1 Q23 -- one option is y = e^{-x}, which is beyond E Math
PRACTICE_A = [                                   # shape from equation
    "a34a9b6a-3b03-4d80-8483-3f78b5787864",      # Greendale 2022 P1 Q3               [1]
    "771e7bd1-59cd-49aa-af63-8d4dae2d1123",      # Anglican High 2021 P1 Q12          [2]
    "586b2fed-aabe-4de4-a095-67786f526d02",      # Ngee Ann 2023 P1 Q11               [2]
    "780d4c91-8777-4dd4-bbe7-91603a58765e",      # Presbyterian High 2024 P1 Q13      [2]
    "79944e37-a98d-4207-9b93-86e8daeea732",      # Chung Cheng (Yishun) 2023 P1 Q21   [2]
    "c18ace7a-ed6f-422e-884a-b1ef6a7e5561",      # Cedar Girls 2025 P1 Q7             [2]
    "6f547e05-5978-4bda-92bf-dc251d6e7127",      # Nan Chiau 2021 P1 Q6               [3]
    "f299c140-b982-41c1-8adf-73068258ea3e",      # Nan Chiau 2024 P1 Q7               [3]
    "3b9d871f-6840-4ba8-8c0f-2868841ff2c7",      # Chung Cheng (Main) 2024 P1 Q6      [3]
]
PRACTICE_B = [                                   # finding k and a
    "8f549434-7618-480f-b822-38e43fbf2563",      # Dunman 2025 P1 Q19                 [2]
    "1b560ce7-b442-4c6f-90c9-2ab89fd38814",      # St Joseph Institute 2024 P1 Q10    [2]
    "6ff5fb1a-508d-41c0-ac8e-bd8e1686f1cf",      # Bukit Panjang Govt High 2021 P1 Q15 [3]
    "da03fb09-e6b3-456e-88d6-cd8dd4627d77",      # Springfield 2024 P1 Q21            [3]
    "d2a08ecf-c913-4fca-808f-58f4cae33834",      # Anglican High 2024 P1 Q15          [7]
    "74298480-7b4b-429f-961b-cee3eed65ffd",      # Zhonghua 2024 P1 Q21               [7]
]
# Two stored answer keys are wrong, and a sheet may not print an answer the
# question's own figure contradicts.  They are corrected HERE rather than in the
# bank -- a build script does not write to the question bank -- and the build
# prints both, so the bank can be corrected separately.
#   8f549434  Dunman 2025 P1 Q19: the sketch passes through (-2, 64) and (0, 16),
#             so k is the y-intercept 16, not 1/2.  a = 1/2 is right.
#   34274b0d  TKGS 2023 P2 Q9 (b): the cone widens upwards, so the DEPTH against
#             TIME graph rises steeply then flattens.  "concave up" describes the
#             other graph, time against depth, which is not what (b) asks for.
#   34cb82dd  Fairfield Methodist 2022 P1 Q13 (b): the bottom 10 cm is a wedge
#             narrowing to an edge at the base, so the level there rises along a
#             CURVE, not the "steeper slope" the key describes.  The 5 seconds in
#             (a) is itself the wedge volume, half of 15 x 15 x 10, so the key's
#             own (a) agrees the base tapers.  Only the 30 cm cuboid above gives
#             the straight line.
ANSWERS = {
    "8f549434-7618-480f-b822-38e43fbf2563":
        r"$k = 16$, $a = \dfrac{1}{2}$",
    "34274b0d-07c6-4723-bb41-82760318d912":
        r"(a) $10$ seconds; (b) An increasing curve from the origin, steep at "
        r"first and flattening as it rises, because $t \propto h^{3}$ means "
        r"$h \propto t^{\frac{1}{3}}$; (c) $32\pi\,\text{cm}^2$",
    "34cb82dd-ff48-41f0-b3cd-6a414ac46034":
        r"(a) $5$ seconds; (b) From $(0, 0)$ a curve rising quickly and "
        r"flattening as it goes, up to $(5, 10)$, because the wedge at the "
        r"bottom widens as the water rises; then a straight line from "
        r"$(5, 10)$ to $(35, 40)$, because the part above it has the same "
        r"cross-section all the way up",
}

# St Gabriel 2022 P1 Q3 (3c5aaaf1) is NOT used.  Its (a) asks which of four
# diagrams is the graph and its (b) asks what p on that graph stands for, but the
# bank holds only the picture of the container -- the four diagrams and the
# p-labelled graph were never stored, so the question cannot be answered from
# what prints.  St Joseph Institute 2024 P1 Q14 takes its place: same idea, and
# it carries both its container and its answer axes.
PRACTICE_C = [                                   # depth against time
    "34cb82dd-ff48-41f0-b3cd-6a414ac46034",      # Fairfield Methodist 2022 P1 Q13    [3]
    "133c17ae-ffa9-4a08-a0c5-43baa6b891df",      # Anglican High 2023 P1 Q27          [5]
    "185b76ef-f1bf-4bb9-84c5-9e63c77feb96",      # St Joseph Institute 2024 P1 Q14    [5]
    "34274b0d-07c6-4723-bb41-82760318d912",      # Tanjong Katong Girls 2023 P2 Q9    [7]
]

# The St Joseph question is filed in the bank under Graph on Graph Paper rather
# than Graphs of Functions, so its row is fetched from that pool and put into
# this one.  Nothing else is taken from there.
BORROWED = ("Algebra (Graph on Graph Paper)",
            ["185b76ef-f1bf-4bb9-84c5-9e63c77feb96"])


# ---------------------------------------------------------------------------
def ask(ws, row, figdir=None, side_by_side=False, cap_h=8.0, fig_labels=None,
        skip_parts=False):
    """The exam question, verbatim from the bank, marks right-aligned in [n].

    A topic built on pictures needs the picture the paper printed, so this
    carries the stored figures between the stem and the sub-parts, the same
    place the practice half puts them.  Several small sketches belonging to
    (a) (b) (c) go side by side under their own labels rather than one under
    the other, so the student reads them as one picture -- and the sub-parts
    are then dropped, because "(a) see the first sketch graph" says nothing the
    labelled picture has not already said.
    """
    stem = (row.get("question_text") or "").strip()
    parts = [] if skip_parts else [p for p in (row.get("parts") or [])
                                   if isinstance(p, dict)]
    if stem:
        ws.para(R.split_math(stem),
                marks=None if parts else row.get("total_marks"))

    if fig_labels and figdir is not None:
        shots = []
        for j, f in enumerate(row.get("_figures") or []):
            fp = _normalise(f, figdir / f"{row['id'][:8]}_{j}")
            if fp is not None:
                shots.append((fp, f.get("px")))
        w = round(16.0 / max(len(shots), 1), 2)
        ws.columns([[[B(lab)], ('figure', str(fp), fig_cm(px, w - 0.7, cap_h))]
                    for lab, (fp, px) in zip(fig_labels, shots)],
                   [w] * len(shots))
    else:
        place_figures(ws, row, figdir, side_by_side, cap_h=cap_h)

    if parts:
        ws.parts()
        # an example's (a) sits at the margin, so its (i) (ii) step in once
        render_parts(ws, parts, roman_level=1, figdir=figdir, cap_h=cap_h)


def mistakes(ws, items):
    ws.para([B('Mistakes to avoid')])
    for i, e in enumerate(items, 1):
        ws.para([T(f'{i}.  ')] + R.split_math(e))


def family(equation, png, fact):
    """One column of the shapes table: the equation, its picture, the fact."""
    return [[M(equation)], ('figure', str(FIG / png), 4.3), fact]


# ---------------------------------------------------------------------------
# Section A -- the shape of a graph
# ---------------------------------------------------------------------------
def notes_a(ws):
    ws.para([B('Notes')])

    ws.para([B('The six shapes')])
    ws.columns([
        family('y = mx + c', 'gf-fam-linear.png',
               [T('A straight line. '), M('m'), T(' is the gradient and '), M('c'),
                T(' is where it cuts the '), M('y'), T('-axis.')]),
        family('y = ax^2 + bx + c', 'gf-fam-quadratic.png',
               [T('A parabola. '), M('a > 0'), T(' opens upwards, '), M('a < 0'),
                T(' opens downwards.')]),
        family('y = ax^3', 'gf-fam-cubic.png',
               [T('A cubic. '), M('a > 0'), T(' rises from left to right, '), M('a < 0'),
                T(' falls from left to right.')]),
    ], [5.33, 5.33, 5.33])
    ws.columns([
        family(r'y = \dfrac{a}{x}', 'gf-fam-reciprocal.png',
               [T('Two branches in '), B('opposite'), T(' quadrants. '), M('a > 0'),
                T(' puts them top right and bottom left.')]),
        family(r'y = \dfrac{a}{x^2}', 'gf-fam-reciprocal2.png',
               [T('Two branches on the '), B('same'), T(' side of the '), M('x'),
                T('-axis. '), M('a > 0'), T(' puts both above it.')]),
        family('y = ka^x', 'gf-fam-exponential.png',
               [T('An exponential curve through '), M('(0,\\,k)'),
                T(', flattening towards the '), M('x'), T('-axis.')]),
    ], [5.33, 5.33, 5.33])

    ws.para([B('Where the curve cuts the y-axis')])
    ws.para([T('Put '), M('x = 0'), T(' into the equation. For '), M('y = x^2 - 2'),
             T(' that gives '), M('y = -2'), T(', so the curve cuts the '), M('y'),
             T('-axis at '), M('-2'), T('.')])

    ws.para([B('What a minus sign in front does')])
    ws.para([T('It turns the whole curve upside down. '), M('y = x^3'),
             T(' rises from left to right, so '), M('y = -x^3'), T(' falls; '),
             M('y = x^2'), T(' opens upwards, so '), M('y = -x^2'), T(' opens downwards.')])

    ws.para([B('Adding a number to the whole equation')])
    ws.para([T('Every point lifts by that amount, and any asymptote lifts with it. '),
             M('y = 3^x'), T(' flattens towards '), M('y = 0'), T(', so '),
             M('y = 3^x + 1'), T(' flattens towards '), M('y = 1'), T('.')])

    ws.para([B('What a sketch has to show')])
    ws.para([T('The right shape, in the right quadrants, with the intercepts the question '
               'asks for written beside the curve as coordinates.')])

    mistakes(ws, [
        'Drawing the two branches of $y = \\dfrac{a}{x^2}$ in opposite quadrants; both lie on the same side of the $x$-axis.',
        'Picking $y = x^3 - 2$ for a curve that falls from left to right, when a falling cubic carries a minus sign in front of $x^3$.',
        'Letting an exponential curve touch or cross the $x$-axis instead of approaching it.',
        'Drawing $y = 3^x + 1$ through $(0, 1)$ rather than $(0, 2)$.',
        'Leaving out the coordinates the question asks to be marked.',
        'Reading $x^2y = 2$ as $y = \\dfrac{2}{x}$; it rearranges to $y = \\dfrac{2}{x^2}$.',
    ])


def worked_a(ws, bank, figdir):
    ws.concept('Reading an Equation Off a Sketch')
    ws.example()
    ask(ws, bank[EX['match']], figdir,
        fig_labels=('(a)', '(b)', '(c)'), skip_parts=True)
    ws.solution_box([
        ('(a)', [
            [T('A parabola, so the equation carries '), M('x^2'),
             T(' and no higher power. It opens upwards, so the number in front of '),
             M('x^2'), T(' is positive, and it cuts the '), M('y'), T('-axis at '),
             M('-2'), T('.')],
            r'y = x^2 - 2',
        ]),
        ('(b)', [
            [T('Two branches in opposite quadrants, so it is a reciprocal graph. Of the two '
               'reciprocal equations in the box, '), M('x^2y = 2'), T(' rearranges to '),
             M(r'y = \dfrac{2}{x^2}'), T(', whose branches are both above the '), M('x'),
             T('-axis, so it is the other one.')],
            r'xy = 2',
        ]),
        ('(c)', [
            [T('A cubic falling from left to right, so the number in front of '), M('x^3'),
             T(' is negative. It cuts the '), M('y'), T('-axis at '), M('2'), T('.')],
            r'y = 2 - x^3',
        ]),
    ], keep_together=False)

    ws.concept('Sketching an Exponential Curve That Has Been Lifted')
    ws.example()
    ask(ws, bank[EX['sketch_exp']])
    ws.solution_box([('', [
        [T('Start from '), M('y = 3^x'), T(': a curve rising from left to right through '),
         M('(0,\\,1)'), T(', flattening towards the '), M('x'), T('-axis.')],
        [T('Adding 1 lifts every point by 1, so the curve flattens towards '), M('y = 1'),
         T(' instead.')],
        [T('The question asks for the point on the '), M('y'), T('-axis, so put '),
         M('x = 0'), T(' into the equation.')],
        r'''\begin{aligned}
        y &= 3^{x} + 1 \\
        y &= 3^{0} + 1 \quad\text{← substituting } x = 0 \\
        y &= 1 + 1 \quad\text{← any number to the power } 0 \text{ is } 1 \\
        y &= 2
        \end{aligned}''',
        [T('So the curve passes through '), M('(0,\\,2)'), T(' and stays above '), M('y = 1'), T('.')],
        ('figure', str(FIG / 'gf-ex2-3powx-plus1.png'), 7.0),
    ])], keep_together=False)

    ws.concept('Two Sketches That Show an Equation Has No Solution')
    ws.example()
    ask(ws, bank[EX['no_meet']])
    ws.solution_box([
        ('(a)', [
            [M('y = -x^2'), T(' is a parabola opening downwards with its highest point at the '
                              'origin, so both intercepts are at '), M('(0,\\,0)'), T('.')],
            [M('y = 3^x'), T(' rises from left to right through '), M('(0,\\,1)'),
             T(' and flattens towards the '), M('x'), T('-axis. It has no '), M('x'),
             T('-intercept.')],
            ('figure', str(FIG / 'gf-ex3-no-solution.png'), 7.6),
        ]),
        ('(b)', [
            [T('Rearrange the equation so that each side is one of the graphs.')],
            r'''\begin{aligned}
            3^{x} + x^{2} &= 0 \\
            3^{x} &= -x^{2}
            \end{aligned}''',
            [T('A solution would be a value of '), M('x'),
             T(' where the two curves meet. '), M('y = 3^x'),
             T(' lies entirely above the '), M('x'), T('-axis and '), M('y = -x^2'),
             T(' lies on or below it, so the curves do not meet.')],
            [T('Hence '), M('3^{x} + x^{2} = 0'), T(' has no solution.')],
        ]),
    ], keep_together=False)


# ---------------------------------------------------------------------------
# Section B -- an exponential graph through two points
# ---------------------------------------------------------------------------
def notes_b(ws):
    ws.para([B('Notes')])

    ws.para([B('The point on the y-axis gives k straight away')])
    ws.para([T('Putting '), M('x = 0'), T(' into '), M('y = ka^x'), T(' leaves '),
             M(r'y = k \times a^0'), T(', and any positive number to the power 0 is 1.')])
    ws.math_block(r'y = ka^{x} \quad\text{at } x = 0 \;\Rightarrow\; y = k')

    ws.para([B('Then the second point gives a')])
    ws.para([T('Substitute the other point with '), M('k'),
             T(' already known. That leaves a power of '), M('a'),
             T(' equal to a number, so read off the base.')])
    ws.math_block(r'a^{4} = 81 \;\Rightarrow\; a = 3 \quad\text{since } 3^{4} = 81')
    ws.para([T('The base of an exponential graph is positive, so a negative root is left out.')])

    ws.para([B('When the equation is '), M('y = ka^{-x}')])
    ws.para([T('The power is '), M('-x'), T(', so a point at '), M('x = -1'),
             T(' has power '), M('+1'), T(', and a point at '), M('x = -2'),
             T(' has power '), M('+2'), T('. Work the power out before substituting.')])

    ws.para([B('When a number has been added')])
    ws.para([T('For '), M('y = ka^x + 1'), T(', putting '), M('x = 0'), T(' gives '),
             M('y = k + 1'), T(', so the point on the '), M('y'),
             T('-axis is one more than '), M('k'), T('. The curve flattens towards '),
             M('y = 1'), T('.')])

    ws.para([B('A line through two points on the curve')])
    ws.para([T('Two points give a gradient and then an equation.')])
    ws.math_block(r'\text{gradient} = \dfrac{y_2 - y_1}{x_2 - x_1} \qquad y = mx + c')
    ws.para([T('A line that does not meet another line is parallel to it: same gradient, '
               'different intercept.')])

    mistakes(ws, [
        'Taking the point on the $y$-axis to be $a$ instead of $k$.',
        'Substituting $x = -2$ into $y = ka^{-x}$ as $a^{-2}$ when the power is $+2$.',
        'Reading the point on the $y$-axis of $y = ka^{x} + 1$ as $k$ rather than $k + 1$.',
        'Stopping at $a^{4} = 81$ without taking the fourth root.',
        'Giving a negative value for the base $a$.',
    ])


def worked_b(ws, bank, figdir):
    ws.concept('Finding k and a from Two Points')
    ws.example()
    ask(ws, bank[EX['ka_x']], figdir, cap_h=6.0)
    ws.solution_box([('', [
        [T('Take the point on the '), M('y'), T('-axis first, because its power is 0.')],
        r'''\begin{aligned}
        y &= ka^{x} \\
        1.5 &= k \times a^{0} \quad\text{← substituting } (0,\,1.5) \\
        1.5 &= k \times 1 \quad\text{← any number to the power } 0 \text{ is } 1 \\
        k &= 1.5
        \end{aligned}''',
        [T('Now substitute the second point with '), M('k'), T(' known.')],
        r'''\begin{aligned}
        48 &= 1.5 \times a^{5} \quad\text{← substituting } (5,\,48) \\
        a^{5} &= \dfrac{48}{1.5} \\
        a^{5} &= 32 \\
        a &= 2 \quad\text{← taking the fifth root, since } 2^{5} = 32
        \end{aligned}''',
        ('check', [M(r'1.5 \times 2^{5} = 1.5 \times 32 = 48'), T('.')]),
    ])], keep_together=False)

    ws.concept('When the Power Is Negative')
    ws.example()
    ask(ws, bank[EX['ka_negx']], figdir, cap_h=6.0)
    ws.solution_box([('', [
        [T('Start with '), M('B'), T(', the point on the '), M('y'), T('-axis.')],
        r'''\begin{aligned}
        y &= ka^{-x} \\
        3 &= k \times a^{0} \quad\text{← substituting } (0,\,3) \\
        k &= 3
        \end{aligned}''',
        [T('At '), M('A'), T(' the value of '), M('x'), T(' is '), M('-1'),
         T(', so the power '), M('-x'), T(' is '), M('+1'), T('.')],
        r'''\begin{aligned}
        6 &= 3 \times a^{-(-1)} \quad\text{← substituting } (-1,\,6) \\
        6 &= 3 \times a^{1} \\
        a &= 2
        \end{aligned}''',
        ('check', [M(r'3 \times 2^{-(-1)} = 3 \times 2 = 6'), T('.')]),
    ])], keep_together=False)

    ws.concept('When the Curve Has Been Shifted')
    ws.example()
    ask(ws, bank[EX['shifted']], figdir, cap_h=6.0)
    ws.solution_box([
        ('(a)', [
            [T('Putting '), M('x = 0'), T(' leaves '), M('a^0'), T(', which is 1, so the '
             'point on the '), M('y'), T('-axis is '), M('k + 1'), T('.')],
            r'''\begin{aligned}
            y &= ka^{x} + 1 \\
            -3 &= k \times a^{0} + 1 \quad\text{← substituting } (0,\,-3) \\
            -3 &= k + 1 \\
            k &= -4
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('Substitute the second point with '), M('k = -4'), T('.')],
            r'''\begin{aligned}
            -323 &= -4a^{4} + 1 \quad\text{← substituting } (4,\,-323) \\
            -324 &= -4a^{4} \\
            a^{4} &= 81 \\
            a &= 3 \quad\text{← } 3^{4} = 81 \text{, and the base is positive}
            \end{aligned}''',
            ('check', [M(r'-4 \times 3^{4} + 1 = -324 + 1 = -323'), T('.')]),
        ]),
    ], keep_together=False)

    ws.concept('The Curve, Then the Line Through Its Two Points')
    ws.example()
    ask(ws, bank[EX['with_line']], figdir, cap_h=6.0)
    ws.solution_box([
        ('(a)', [
            [M('B'), T(' lies on the '), M('y'), T('-axis, so its power is 0.')],
            r'''\begin{aligned}
            y &= ka^{-x} \\
            7 &= k \times a^{0} \quad\text{← substituting } (0,\,7) \\
            k &= 7
            \end{aligned}''',
            [T('At '), M('A'), T(' the value of '), M('x'), T(' is '), M('-2'),
             T(', so the power '), M('-x'), T(' is '), M('+2'), T('.')],
            r'''\begin{aligned}
            63 &= 7 \times a^{-(-2)} \quad\text{← substituting } (-2,\,63) \\
            63 &= 7a^{2} \\
            a^{2} &= 9 \\
            a &= 3 \quad\text{← the base is positive}
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('A line needs a gradient and an intercept. Take the gradient from the two points.')],
            r'''\begin{aligned}
            \text{gradient} &= \dfrac{y_2 - y_1}{x_2 - x_1} \quad\text{← gradient of a line through two points} \\
            &= \dfrac{7 - 63}{0 - (-2)} \\
            &= \dfrac{-56}{2} \\
            &= -28
            \end{aligned}''',
            [M('B'), T(' is on the '), M('y'), T('-axis at '), M('7'),
             T(', so that is the intercept.')],
            r'y = -28x + 7',
        ]),
        ('(c)', [
            [T('A line that does not meet '), M('AB'),
             T(' is parallel to it, so it has the same gradient and a different intercept.')],
            r'y = -28x + 1',
        ]),
    ], keep_together=False)


# ---------------------------------------------------------------------------
# Section C -- depth of water against time
# ---------------------------------------------------------------------------
def notes_c(ws):
    ws.para([B('Notes')])

    ws.para([B('What the shape of the container does to the graph')])
    ws.para([T('Water goes in at a constant rate, so the same volume arrives each second. '
               'The width of the container at the water surface decides how much depth that '
               'volume buys.')])
    ws.columns([
        [[B('Straight sides')], ('figure', str(FIG / 'gf-tank-straight.png'), 4.3),
         [T('The same volume buys the same depth all the way up, so the depth rises at a '
            'steady rate.')]],
        [[B('Widening upwards')], ('figure', str(FIG / 'gf-tank-widening.png'), 4.3),
         [T('Each extra centimetre of depth takes more water, so the level slows down as it '
            'rises.')]],
        [[B('Narrowing upwards')], ('figure', str(FIG / 'gf-tank-narrowing.png'), 4.3),
         [T('Each extra centimetre takes less water, so the level speeds up as it rises.')]],
    ], [5.33, 5.33, 5.33])

    ws.para([B('A container made of two pieces')])
    ws.para([T('Draw the graph in two pieces and join them at the depth where the shape '
               'changes. A corner in the graph sits at that depth, and the piece above it '
               'follows the shape of the upper part.')])

    ws.para([B('Working out a time')])
    ws.math_block(r'\text{time} = \dfrac{\text{volume}}{\text{rate}}')
    ws.para([T('The volumes usually come from the mensuration formulas.')])
    ws.math_block(r'\text{cylinder } V = \pi r^{2} h \qquad \text{cone } V = \dfrac{1}{3}\pi r^{2} h')

    ws.para([B('An object standing in the container')])
    ws.para([T('The water fills the space left over, so subtract the volume of the object '
               'from the volume of the container over the height it occupies.')])

    mistakes(ws, [
        'Drawing a straight line for a cone, when only straight sides give a straight line.',
        'Bending the curve the wrong way — a container that widens upwards gives a curve that bends down.',
        'Joining the two pieces at the wrong depth.',
        'Using the full volume of the container when an object stands inside it.',
        'Using $\\pi r^{2} h$ for a cone; a cone holds a third of that.',
    ])


def worked_c(ws, bank, figdir):
    ws.concept('Time to Fill a Cone, and the Shape of Its Graph')
    ws.example()
    ask(ws, bank[EX['cone']])
    ws.solution_box([
        ('(a)', [
            [T('Work out the volume the container holds, then divide by the rate.')],
            r'''\begin{aligned}
            V &= \dfrac{1}{3}\pi r^{2} h \quad\text{← volume of a cone} \\
            &= \dfrac{1}{3}\pi (10)^{2}(30) \\
            &= 1000\pi \text{ cm}^{3}
            \end{aligned}''',
            r'''\begin{aligned}
            \text{time} &= \dfrac{\text{volume}}{\text{rate}} \\
            &= \dfrac{1000\pi}{5\pi} \\
            &= 200 \text{ s}
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('The cone stands point down, so it widens as the water rises. Each extra '
               'centimetre of depth takes more water than the one below it, so the level '
               'slows down: a curve bending down, from '), M('(0,\\,0)'), T(' up to '),
             M('(200,\\,30)'), T('.')],
            ('figure', str(FIG / 'gf-ex8-cone.png'), 7.4),
        ]),
    ], keep_together=False)

    ws.concept('An Object Standing Inside the Container')
    ws.example()
    ask(ws, bank[EX['cone_cyl']], figdir, cap_h=6.0)
    ws.solution_box([
        ('(a)', [
            [T('Up to a depth of '), M('r'),
             T(' the cone is in the way, so the water fills the cylinder of height '),
             M('r'), T(' with the cone taken out of it.')],
            r'''\begin{aligned}
            V_1 &= \pi r^{2}h - \dfrac{1}{3}\pi r^{2}h \quad\text{← cylinder, less the cone inside it} \\
            &= \pi r^{2}(r) - \dfrac{1}{3}\pi r^{2}(r) \\
            &= \pi r^{3} - \dfrac{1}{3}\pi r^{3} \\
            &= \dfrac{2}{3}\pi r^{3}
            \end{aligned}''',
            [T('That much water arrives in 4 minutes, which gives the rate.')],
            r'''\begin{aligned}
            \text{rate} &= \dfrac{\frac{2}{3}\pi r^{3}}{4} \\
            &= \dfrac{1}{6}\pi r^{3} \text{ per minute}
            \end{aligned}''',
            [T('Above a depth of '), M('r'),
             T(' the cone is below the surface, so the rest is a plain cylinder of height '),
             M('r'), T('.')],
            r'''\begin{aligned}
            V_2 &= \pi r^{2}(r) \\
            &= \pi r^{3}
            \end{aligned}''',
            r'''\begin{aligned}
            \text{time for } V_2 &= \dfrac{\pi r^{3}}{\frac{1}{6}\pi r^{3}} \\
            &= 6 \text{ minutes}
            \end{aligned}''',
            r'''\begin{aligned}
            \text{total time} &= 4 + 6 \\
            &= 10 \text{ minutes}
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('Below '), M('r'),
             T(' the cone takes up the middle, and the ring of space left over widens as the '
               'water rises, so the level starts fast and slows down: a curve bending down.')],
            [T('Above '), M('r'),
             T(' the container is a plain cylinder, so the level rises at a steady rate: a '
               'straight line, reaching '), M('2r'), T(' at 10 minutes.')],
            ('figure', str(FIG / 'gf-ex9-cone-in-cylinder.png'), 7.4),
        ]),
    ], keep_together=False)


# ---------------------------------------------------------------------------
def main():
    by_id, _ = fetch("EM", "Graphs of Functions", figures=True)
    print(f"pool: {len(by_id)} rows")
    topic, wanted = BORROWED
    other, _ = fetch("EM", topic, figures=True)
    for qid in wanted:
        if qid not in other:
            raise SystemExit(f"borrowed question {qid} is not in {topic}")
        by_id[qid] = other[qid]
    bank = {}
    for short in EX.values():
        hit = [r for r in by_id.values() if r["id"].startswith(short)]
        if not hit:
            raise SystemExit(f"worked example {short} is not in the pool")
        bank[short] = hit[0]

    figdir = Path(tempfile.mkdtemp(prefix="gffig-"))
    ws = sheet('O Level E Math Revision', 'Graphs of Functions')

    ws.section('Section A — Knowing the Shape from the Equation')
    notes_a(ws)
    worked_a(ws, bank, figdir)
    ws.para([B('Practice')])
    a = render_practice(ws, by_id, PRACTICE_A, figdir, cap_h=9.5)

    ws.page_break()
    ws.section('Section B — Exponential Graphs: Finding k and a')
    notes_b(ws)
    worked_b(ws, bank, figdir)
    ws.para([B('Practice')])
    b = render_practice(ws, by_id, PRACTICE_B, figdir, cap_h=9.5,
                        answers=ANSWERS)

    ws.page_break()
    ws.section('Section C — The Depth of Water Against Time')
    notes_c(ws)
    worked_c(ws, bank, figdir)
    ws.para([B('Practice')])
    c = render_practice(ws, by_id, PRACTICE_C, figdir, cap_h=8.0,
                        answers=ANSWERS)

    # a run Word cannot keep whole has to break inside itself -- the page rule
    tall = [h for h in ws.glued_heights() if h > ws.PAGE_CM - 1.5]
    if tall:
        print(f"  !! runs too tall to keep on one page: {tall}")

    save(ws, "EM/S3 EM Revision Set", "REV 3 Graphs of Functions.docx")
    print(f"worked examples: 9    practice: A {a}/{len(PRACTICE_A)}  "
          f"B {b}/{len(PRACTICE_B)}  C {c}/{len(PRACTICE_C)}")


if __name__ == "__main__":
    main()
