#!/usr/bin/env python3
"""EM Graphs on Graph Paper revision worksheet -- notes, worked examples, practice.

Four strands, each with its own notes at the front and its own practice right
after its examples (ADRIAN-STYLE, Numbering and sections):

    A  drawing the curve -- the table, the scale, plotting, joining
    B  reading the graph -- a value, a range, a maximum, how many solutions
    C  the tangent -- drawing it, measuring its gradient, saying what it means
    D  solving an equation by drawing a straight line

Every question -- worked examples included -- is read from the live bank rather
than transcribed, so a stem or an answer key on the sheet cannot drift from what
the bank holds.  The drawn graphs are the committed PNGs from
make_graphsgp_figures.py; re-run that script if one needs changing.

    ~/.../scratchpad/venv/bin/python build_graphsgp.py
"""
import tempfile
from pathlib import Path

from build_lib import (sheet, fetch, render_practice, render_parts, save,
                       place_figures, render_stem, T, B, I, M)
import revision_lib as R

FIG = Path(__file__).resolve().parent / "assets"

# --- worked examples, by bank id -------------------------------------------
EX = {
    "coins":    "db32eb39",   # Catholic High 2024 P1 Q13                  [4]
    "full":     "dd4cce95",   # Anglican High 2024 P2 Q8                   [8]
    "ball":     "9857ddb9",   # Kranji 2022 P1 Q22                         [5]
    "three_k":  "825b6f97",   # Fairfield Methodist 2023 P2 Q4            [10]
    "tan_quad": "01bf62a3",   # St Gabriel 2024 P1 Q24                     [6]
    "tan_exp":  "26f42193",   # ACS (Barker Road) 2023 P2 Q3              [10]
    "tan_k":    "13d51aef",   # Nan Chiau 2024 P1 Q25                      [4]
    "two_eq":   "11ca6c3d",   # Tanjong Katong Girls 2022 P1 Q19           [5]
    "cubic":    "1abeae37",   # Swiss Cottage 2024 P1 Q24                  [6]
    "kranji":   "a91c9875",   # Kranji 2024 P2 Q7                          [9]
}

# --- practice ---------------------------------------------------------------
# A large group of rows in this pool has an EMPTY question_text -- the equation
# and the table live only in the missing stem, so the question cannot be
# answered from what would print.  None of them is used here.  Two more are left
# out on purpose:
#   4a2b5dba  Zhonghua 2024 P2 Q8 -- the row key and the part keys disagree on
#             (c) and on (e), so there is no one answer to print
#   8584980c  Bukit View 2024 P2 Q3 -- kept back; Section B already carries four
PRACTICE_A = [                                   # drawing the curve
    "c653e026-8dee-47ec-ae58-61e91bd0ae50",      # Anglican High 2023 P1 Q9            [2]
    "c25db63e-e8a0-4079-9989-08ccb7b50d29",      # Nan Chiau 2024 P1 Q9                [3]
    "0d44dd6a-66d1-4ad0-bb96-85c1b5e01f6d",      # Canberra 2024 P2 Q7                 [9]
    "9dc27d68-5e91-47e4-93ed-9d58347e053a",      # Junyuan 2021 P2 Q6                 [10]
]
PRACTICE_B = [                                   # reading the graph
    "e37fd521-78c8-4cbc-bba3-8e13efca5205",      # St Joseph Institute 2024 P2 Q7      [9]
    "2d8c1af8-352f-4188-a9cd-245dd0ad4095",      # Mayflower 2023 P2 Q5                [9]
    "14799e2b-10e5-4f1a-a7e8-a8ab3217510f",      # Geylang Methodist 2023 P2 Q4       [11]
    "0fca3a70-c10e-4dd1-8212-3901b854b79a",      # Crescent Girls 2024 P2 Q7          [11]
]
PRACTICE_C = [                                   # the tangent
    "507982ac-5810-4d61-8210-165fab674e5d",      # Presbyterian High 2022 P2 Q9        [9]
    "4347d721-aabe-43b2-a473-c68b5c7074d2",      # Methodist Girls 2022 P2 Q9         [10]
    "e46fa5dd-ce30-4b39-aa45-f2e007f88007",      # Bukit Panjang Govt High 2021 P2 Q11 [11]
    "c06e6175-46cc-4c09-b5be-8664e2ea7be4",      # Kent Ridge 2024 P2 Q8              [11]
]
PRACTICE_D = [                                   # solving by drawing a line
    "a74237d1-d1be-491d-802a-b09a09b362bf",      # Broadrick 2024 P2 Q6                [7]
    "b69801b4-e58e-41c8-aef6-7e4b4038d8e4",      # Maris Stella 2024 P2 Q4             [8]
    "a16dbb6d-0353-4dc5-b5d0-8c7267f37384",      # St Gabriel 2022 P2 Q4              [10]
    "84ac0f5d-3167-417a-817f-ab32639b1652",      # St Anthony Cannosian 2023 P2 Q3    [10]
]

# Eight stored answer keys are wrong, truncated, typed as plain text, or
# leave a part unanswered.  They
# are corrected HERE rather than in the bank -- a build script does not write to
# the question bank -- and the build prints both, so the bank can be corrected
# separately.
#   9dc27d68  Junyuan 2021 P2 Q6: (d) the gradient of y = x^3 - 3x + 1 at
#             x = -1.5 is 3(-1.5)^2 - 3 = 3.75, not 3.375.  (e)(ii) the curve
#             meets y = 3x - 1 where x^3 = 6x - 2, so b = -2, not 2.
#   e46fa5dd  Bukit Panjang Govt High 2021 P2 Q11: the stored key stops in the
#             middle of the fraction in (e) -- "$A = \tfrac{79" -- so the last
#             answer on the row does not print.
#   0fca3a70  Crescent Girls 2024 P2 Q7: (b) and (e)(i) are missing from the row
#             key, so the letters run b, c, d, e without them.
#   c06e6175  Kent Ridge 2024 P2 Q8: the row key starts at (b)(i); (a) is
#             missing, and (d) gives the numbers without naming the line that
#             has to be drawn to get them.
#   2d8c1af8  Mayflower 2023 P2 Q5: (e) gives the two roots without naming the
#             line, which is the two marks.
#   14799e2b  Geylang Methodist 2023 P2 Q4: (c) the curve reaches y = 3.5 where
#             x^2 - 9.5x + 14 = 0, so x = 1.82 or x = 7.68.  The key's 7.5 is
#             outside the reading tolerance.
#   e37fd521  St Joseph Institute 2024 P2 Q7: (c)(i) the cost of 80 watches is
#             20 + 1200/80 = 35 exactly; the key prints a range 28 to 42 instead
#             of the value.
ANSWERS = {
    "9dc27d68-5e91-47e4-93ed-9d58347e053a":
        r"(a) $k = -1$; (b) a smooth cubic through the tabulated points; "
        r"(c) $x = -1.9$, $0.4$ or $1.5$; (d) gradient $= 3.75$; "
        r"(e)(i) a straight line through $(0,\,-1)$ of gradient $3$; "
        r"(ii) $a = 6$, $b = -2$",
    "e46fa5dd-ce30-4b39-aa45-f2e007f88007":
        r"(a) a smooth curve through the nine plotted points; "
        r"(b)(i) $25$ m; (ii) $t \approx 3.6$ s; "
        r"(c)(i) gradient $\approx -8$; (ii) the speed of the ball at "
        r"$t = 2$, falling at about $8$ m/s; (d) $t \approx 0.88$ s; "
        r"(e) $A \approx 26.3$, $B \approx 0.67$",
    "0fca3a70-c10e-4dd1-8212-3901b854b79a":
        r"(a) $p = 5$; (b) a smooth curve through the tabulated points; "
        r"(c) gradient $= -3$; (d) rearranged, the equation is the line "
        r"$y = -1$, which lies below the lowest point of the curve, so the "
        r"line and the curve do not meet; "
        r"(e)(i) a straight line from $(0.5,\,1.25)$ to $(5,\,3.5)$; "
        r"(ii) $x = 0.9$ or $x = 3.75$ ($\pm 0.1$); "
        r"(iii) $3x^{2} - 14x + 10 = 0$",
    "c06e6175-46cc-4c09-b5be-8664e2ea7be4":
        r"(a) a smooth curve through the tabulated points; "
        r"(b)(i) $x = 0.2$ or $x = 6.8$; (ii) $2000$ posters; "
        r"(c) the profit is zero at $200$ posters and again at $6800$ posters; "
        r"(d) draw $y = x$; $200$ or $2800$ posters; "
        r"(e)(i) gradient $= -0.65$; (ii) the profit is falling by about "
        r"$\$0.65$ for each further poster printed",
    "2d8c1af8-352f-4188-a9cd-245dd0ad4095":
        r"(a) $y = 1.17$ at $x = -1.5$; (b) a smooth curve through the "
        r"tabulated points; (c) the lowest point of the curve is about "
        r"$y = 0.95$, so the line $y = k$ misses the curve for $k < 0.95$; "
        r"(d) $c = 1.5$; (e) draw $y = -\dfrac{3}{2}x + 1$; $x = -2.15$ or "
        r"$x = -0.4$ ($\pm 0.05$)",
    "14799e2b-10e5-4f1a-a7e8-a8ab3217510f":
        r"(a) $b = 3.8$; (b) a smooth curve through the tabulated points; "
        r"(c) $x = 1.8$ or $x = 7.7$ ($\pm 0.1$); (d) $m = -1.24$, $c = 5.2$; "
        r"(e) draw $y = -\dfrac{x}{3} + 6$",
    # 4347d721 -- Methodist Girls 2022 P2 Q9.  The row key is stored as plain
    # text rather than maths ("p = 4.24; (b) sketch; (c) y ~ 3 J; ..."), so it
    # prints on the sheet as typed text and the linter flags it.  Rewritten
    # here as marked-up maths; the values themselves are the bank's own, and
    # the tangent gradient 4.16 is right (the exact value is 6 ln 2 = 4.159).
    "4347d721-aabe-43b2-a473-c68b5c7074d2":
        r"(a) $p = 4.24$; (b) a smooth curve through the plotted points; "
        r"(c) $y \approx 3$ J; (d)(i) gradient $\approx 4.16$ (accept $3.3$ "
        r"to $5$); (ii) the rate at which the energy released is rising with "
        r"temperature at $x = 1$; (e) draw $y = x + 4$; $x \approx 0.624$",
    "e37fd521-78c8-4cbc-bba3-8e13efca5205":
        r"(a) $q = 23$; (b) a smooth curve falling towards $y = 20$; "
        r"(c)(i) $\$35$; (ii) $240$ watches (accept $233$ to $248$); "
        r"(d) draw $y = 90 - \dfrac{21x}{100}$; a profit is made for roughly "
        r"$18 < x < 315$",
    # 507982ac -- Presbyterian High 2022 P2 Q9.  (d)(i) the stored gradient at
    # t = 5 is 2.67, accepting 2.3 to 2.93, and that is too steep for the curve
    # the table draws.  The masses either side of t = 5 are 2.0 and 6.4, so the
    # tangent there has gradient (6.4 - 2.0) / 2 = 2.2; a cubic spline through
    # all eight points gives 2.15, and the curve m = 0.3(5/3)^t the row's own
    # (e) suggests gives 1.97.  A student reading 2.2 off a correctly drawn
    # tangent would be marked wrong by the stored range.
    "507982ac-5810-4d61-8210-165fab674e5d":
        r"(a) a smooth increasing curve through the eight plotted points; "
        r"(b) $\approx 0.8$ kg (accept $0.7$ to $0.9$); "
        r"(c) $\approx 5.3$ weeks (accept $5.1$ to $5.5$); "
        r"(d)(i) gradient $\approx 2.2$ (accept $2.0$ to $2.5$); "
        r"(ii) the rate at which the puppy was growing at $5$ weeks old; "
        r"(e) $a = 0.3$, $b = \dfrac{5}{3}$",
    # a74237d1 -- Broadrick 2024 P2 Q6.  (b)(ii) the stored key gives
    # "e.g. y = -1/2 x + 3/2", which passes through P(-1, 2) but never touches
    # the curve: setting it equal to the curve gives 3x^2 - 8x + 7 = 0, whose
    # discriminant is negative.  The tangent from P touches at x = 0.5, where
    # the gradient is -3, so the line is y = -3x - 1 -- which is what the row's
    # OWN subpart solution derives.  (c) the key gives the two roots without
    # naming the line that earns the marks.  The key also uses \tfrac.
    "a74237d1-d1be-491d-802a-b09a09b362bf":
        r"(a) a smooth curve on each side of the asymptote $x = 1$; "
        r"(b)(i) the tangent from $P(-1,\,2)$ touches the left branch at "
        r"$(0.5,\,-2.5)$; (ii) $y = -3x - 1$; "
        r"(c) draw $y = \dfrac{5}{4}x - 1$; $x \approx 2.56$ or "
        r"$x \approx -1.56$",
}


# A stem the bank stores with the answer written underneath it.  Same rule as
# ANSWERS: corrected here, in the open, and printed at build time.
#   a74237d1  Broadrick 2024 P2 Q6: the stored stem opens with its own "(a)"
#             -- which the parts list then uses for a DIFFERENT part -- and
#             closes with "The missing value at x = -2 is y = -3.33", the
#             answer to the table the student is being asked to complete.
STEMS = {
    "a74237d1-d1be-491d-802a-b09a09b362bf":
        "Complete the table of values for "
        r"$y = \dfrac{1}{x - 1} + x - 1$." "\n"
        r"$$\begin{array}{|c|c|c|c|c|c|c|c|c|c|c|c|} \hline "
        r"x & -2 & -1 & 0 & 0.5 & 0.75 & 1.25 & 1.5 & 2 & 3 & 3.5 & 4 \\ "
        r"\hline y &  & -2.5 & -2 & -2.5 & -4.25 & 4.25 & 2.5 & 2 & 2.5 & "
        r"2.9 & 3.33 \\ \hline \end{array}$$",
}


# ---------------------------------------------------------------- the helpers
def ask(ws, row, figdir=None, cap_h=8.0, side_by_side=False):
    """The exam question, verbatim from the bank, with its own printed graph."""
    stem = (row.get("question_text") or "").strip()
    parts = [p for p in (row.get("parts") or []) if isinstance(p, dict)]
    if stem:
        render_stem(ws, stem, marks=None if parts else row.get("total_marks"),
                    numbered=False)
    place_figures(ws, row, figdir, side_by_side, cap_h=cap_h)
    if parts:
        ws.parts()
        # an example's (a) sits at the margin, so its (i) (ii) step in once
        render_parts(ws, parts, roman_level=1, figdir=figdir, cap_h=cap_h)


def mistakes(ws, items):
    ws.para([B('Mistakes to avoid')])
    for i, e in enumerate(items, 1):
        ws.para([T(f'{i}.  ')] + R.split_math(e))


def panel(png, w=8.0):
    return ('figure', str(FIG / png), w)


# ------------------------------------------------------------------ section A
def notes_a(ws):
    ws.para([T('Every one of these questions begins the same way: a table, a scale, '
               'a set of points, a smooth curve. The marks for that first part are '
               'the easiest on the paper, and they are the ones most often thrown '
               'away.')])

    ws.para([B('Drawing the curve, step by step')])
    ws.columns([
        [[T('1. Rule the axes to the scale the question gives, and label them.')],
         panel('gp-how1.png', 4.6)],
        [[T('2. Plot each pair from the table as a small cross.')],
         panel('gp-how2.png', 4.6)],
        [[T('3. Join them freehand with one smooth curve.')],
         panel('gp-how3.png', 4.6)],
    ], [5.33, 5.33, 5.33])

    ws.para([B('Reading the scale')])
    ws.para([T('"2 cm to represent 1 unit" means one large square on the graph paper '
               'stands for 1 unit, so each small square stands for '), M('0.2'),
             T(' of a unit. Before plotting anything, check that the whole range fits: '
               'for '), M('0 \\leq x \\leq 7'), T(' at 2 cm to 1 unit the '), M('x'),
             T('-axis needs 14 cm of paper.')])

    ws.para([B('A missing value in the table')])
    ws.para([T('Substitute the '), M('x'), T(' into the equation and give the answer to '
               'the accuracy the question asks for.')])
    ws.math_block(r'''\begin{aligned}
    y &= -\dfrac{x^{3}}{6} + 2x + 4 \\
    y &= -\dfrac{1^{3}}{6} + 2(1) + 4 \quad\text{← substituting } x = 1 \\
    y &= -\dfrac{1}{6} + 6 \\
    y &= 5.8 \quad\text{← correct to 1 decimal place, as asked}
    \end{aligned}''')

    mistakes(ws, [
        'Reading "2 cm to 1 unit" as one small square to one unit, so the graph runs off the grid.',
        'Joining the crosses with straight strokes instead of one smooth curve.',
        'Bending the curve to pass through a point that was plotted wrongly, instead of checking that point again.',
        'Giving a table value to the wrong number of decimal places.',
        'Leaving the axes unlabelled, so the reader cannot tell which way round $x$ and $y$ are.',
    ])


def worked_a(ws, bank, figdir):
    ws.concept('Recognising the Shape a Table Describes')
    ws.example()
    ask(ws, bank[EX['coins']], figdir)
    ws.solution_box([
        ('(a)', [
            [T('Look at what happens to '), M('V'), T(' when '), M('R'), T(' doubles.')],
            r'''\begin{aligned}
            R = 0.5 \rightarrow R = 1 &: \quad V = 250 \rightarrow V = 1000
            \quad\text{← } R \text{ doubles} \\
            &\phantom{:} \quad 1000 = 4 \times 250 \quad\text{← } V \text{ becomes four times as big}
            \end{aligned}''',
            [T('Doubling '), M('R'), T(' multiplies '), M('V'), T(' by four, so '), M('V'),
             T(' climbs faster and faster. The graph starts at the origin and steepens.')],
            [T('That is '), B('Graph B'), T('.')],
        ]),
        ('(b)', [
            [T('Four times for a doubling is the square law: '), M('(2R)^{2} = 4R^{2}'), T('.')],
            [T('So the equation is '), M('V = kR^{2}'), T('.')],
        ]),
        ('(c)', [
            [T('Put one pair from the table into '), M('V = kR^{2}'), T(' and solve for '),
             M('k'), T('.')],
            r'''\begin{aligned}
            V &= kR^{2} \\
            1000 &= k(1)^{2} \quad\text{← substituting } R = 1,\; V = 1000 \\
            k &= 1000
            \end{aligned}''',
            ('check', [T('At '), M('R = 2.5'), T(': '),
                       M(r'1000 \times 2.5^{2} = 6250'), T(', which is the table value.')]),
            [T('So '), M('V = 1000R^{2}'), T('.')],
        ]),
    ], keep_together=False)

    ws.concept('The Whole Question: Scale, Curve, Reading, Line')
    ws.example()
    ask(ws, bank[EX['full']], figdir)
    ws.solution_box([
        ('(a)', [
            [T('At 2 cm to 1 unit, '), M('0 \\leq x \\leq 7'), T(' needs 14 cm across and '),
             M('0 \\leq y \\leq 12'), T(' needs 24 cm up, which the grid holds. Plot the '
               'seven pairs and join them with one smooth curve.')],
            panel('gp-a2a.png'),
        ]),
        ('(b)(i)', [
            [T('The lowest point of the curve sits between '), M('x = 2'), T(' and '),
             M('x = 3'), T('. Read across from it to the '), M('y'), T('-axis.')],
            [T('The minimum value of '), M('y'), T(' is about '), M('3.5'), T('.')],
            [T('The question asks for the '), B('value of '), M('y'),
             T(', so the answer is a reading on the vertical axis, not the '), M('x'),
             T(' underneath it.')],
            panel('gp-a2b.png'),
        ]),
        ('(b)(ii)', [
            [T('Draw the line '), M('y = 6'), T(' across the grid, and mark where it cuts the curve.')],
            [T('Between those two crossings the curve lies below the line, so that is where '),
             M('y < 6'), T('.')],
            [T('Reading the two crossings: '), M('1.3 < x < 4.9'), T('.')],
        ]),
        ('(c)', [
            [T('Rearrange the equation until one side is exactly the expression in the '
               'curve’s equation.')],
            r'''\begin{aligned}
            x^{2} - 4x + \dfrac{40}{x} &= 20 \\
            \dfrac{x^{2}}{4} - x + \dfrac{10}{x} &= 5
            \quad\text{← dividing every term by } 4 \\
            \dfrac{x^{2}}{4} + \dfrac{10}{x} - 2 &= 5 + x - 2
            \quad\text{← adding } x \text{ and subtracting } 2 \text{ on both sides} \\
            y &= x + 3
            \quad\text{← the left side is now the curve’s own equation}
            \end{aligned}''',
            [T('Draw '), M('y = x + 3'), T(' on the same grid and read the '), M('x'),
             T('-coordinates where it cuts the curve.')],
            panel('gp-a2c.png'),
            [T('So '), M('x = 1.7'), T(' or '), M('x = 6.2'), T('.')],
        ]),
    ], keep_together=False)


# ------------------------------------------------------------------ section B
def notes_b(ws):
    ws.para([T('Once the curve is drawn, most of the remaining marks are for reading it. '
               'Each kind of reading has its own move, and the move is always drawn on '
               'the grid — the marks are for the line, not only for the number.')])

    ws.para([B('A value')])
    ws.para([T('Go up from the '), M('x'), T(' on the horizontal axis to the curve, then '
               'straight across to the vertical axis. Leave both dashed lines on the grid.')])

    ws.para([B('A range')])
    ws.para([T('Draw the level line — '), M('y = 6'), T(' for "'), M('y < 6'),
             T('" — mark the two crossings, and read the '), M('x'), T('-coordinates. Then '
               'decide which side of each crossing the question is asking about by looking '
               'at where the curve is below the line.')])

    ws.para([B('The highest or lowest point')])
    ws.para([T('Read the '), M('y'), T('-coordinate of the turning point. The smallest value '
               'in the table is usually close to it but is not it — the curve turns between '
               'two of the plotted points.')])

    ws.para([B('How many solutions')])
    ws.para([T('The equation '), M('f(x) = k'), T(' is the horizontal line '), M('y = k'),
             T(' drawn across the curve, so the number of solutions is the number of '
               'crossings. For a curve with two turning points, a line drawn between the '
               'two turning-point levels cuts it three times.')])
    ws.para([T('So the range of '), M('k'), T(' giving three solutions runs from the lower '
               'turning-point value to the higher one.')])

    mistakes(ws, [
        'Giving the $x$-coordinate when the question asks for the minimum value of $y$.',
        'Taking the smallest number in the table as the lowest point of the curve.',
        'Writing the answer to a "by drawing" part without drawing the line, so the working marks are lost.',
        'Turning $<$ into $\\leq$, or the other way round, when the question\'s own words settle it.',
        'Reading a range off the wrong axis — a range of $x$ answers "for which values of $x$", a range of $k$ answers "how many solutions".',
    ])


def worked_b(ws, bank, figdir):
    ws.concept('Symmetry, a Gradient and a Line That Misses')
    ws.example()
    ask(ws, bank[EX['ball']], figdir)
    ws.solution_box([
        ('(a)', [
            [T('A parabola is symmetrical, so two points at the same height are the same '
               'distance from the line of symmetry. From the graph the curve is at '),
             M('y = 28'), T(' at both '), M('x = 0'), T(' and '), M('x = 3'), T('.')],
            r'''\begin{aligned}
            x &= \dfrac{0 + 3}{2} \quad\text{← halfway between the two equal heights} \\
            x &= 1.5
            \end{aligned}''',
            [T('The line of symmetry is '), M('x = 1.5'), T('.')],
        ]),
        ('(b)', [
            [T('Draw a long tangent touching the curve at '), M('(3,\\,28)'), T(', then take '
               'a large triangle on the tangent and read its run and rise off the scales.')],
            r'''\begin{aligned}
            \text{gradient} &= \dfrac{\text{rise}}{\text{run}} \\
            \text{gradient} &= \dfrac{-6}{2} \quad\text{← the tangent falls } 6 \text{ units over a run of } 2 \\
            \text{gradient} &= -3
            \end{aligned}''',
            panel('gp-b1a.png'),
        ]),
        ('(c)', [
            [T('Draw the line '), M('y = 35'), T(' across the grid.')],
            panel('gp-b1b.png'),
            [T('The highest point of the curve is at the line of symmetry, so put '),
             M('x = 1.5'), T(' into the equation.')],
            r'''\begin{aligned}
            y &= -x^{2} + 3x + 28 \\
            y &= -(1.5)^{2} + 3(1.5) + 28 \quad\text{← substituting } x = 1.5 \\
            y &= -2.25 + 4.5 + 28 \\
            y &= 30.25
            \end{aligned}''',
            [T('The whole curve lies below '), M('y = 30.25'), T(', and '), M('35 > 30.25'),
             T(', so the line '), M('y = 35'), T(' misses the curve. The ball stays lower '
               'than 35 m.')],
        ]),
    ], keep_together=False)

    ws.concept('How Many Solutions a Level Line Gives')
    ws.example()
    ask(ws, bank[EX['three_k']], figdir)
    ws.solution_box([
        ('(a)', [
            r'''\begin{aligned}
            y &= -\dfrac{x^{3}}{6} + 2x + 4 \\
            y &= -\dfrac{1^{3}}{6} + 2(1) + 4 \quad\text{← substituting } x = 1 \\
            y &= 5.8 \quad\text{← correct to 1 decimal place}
            \end{aligned}''',
            [T('Plot the nine pairs and join them with one smooth curve.')],
        ]),
        ('(b)', [
            [T('The equation asks where the curve meets the horizontal line '), M('y = k'),
               T(', so three solutions means the line cuts the curve three times.')],
            [T('That happens when the line lies between the two turning points. Read their '),
             M('y'), T('-values off the graph.')],
            panel('gp-b2a.png'),
            [T('The low turning point is at about '), M('y = 1.3'), T(' and the high one at '
               'about '), M('y = 6.7'), T('.')],
            [T('So '), M('1.3 < k < 6.7'), T('.')],
        ]),
        ('(c)(i)', [
            [T('Rearrange the equation to be solved until one side is the curve’s own '
               'expression.')],
            r'''\begin{aligned}
            x^{3} - 15x + 3 &= 0 \\
            -\dfrac{x^{3}}{6} + \dfrac{15x}{6} - \dfrac{3}{6} &= 0
            \quad\text{← dividing every term by } -6 \\
            -\dfrac{x^{3}}{6} &= -\dfrac{15x}{6} + \dfrac{1}{2}
            \quad\text{← moving the other two terms to the right} \\
            -\dfrac{x^{3}}{6} + 2x + 4 &= -\dfrac{15x}{6} + \dfrac{1}{2} + 2x + 4
            \quad\text{← adding } 2x + 4 \text{ to both sides} \\
            y &= -\dfrac{1}{2}x + \dfrac{9}{2}
            \quad\text{← collecting the } x \text{ terms and the numbers}
            \end{aligned}''',
            [T('So '), M('a = -\\dfrac{1}{2}'), T(' and '), M('b = \\dfrac{9}{2}'), T('.')],
        ]),
        ('(c)(ii)', [
            [T('Draw '), M('y = -\\dfrac{1}{2}x + \\dfrac{9}{2}'), T(' on the same grid. It '
               'passes through '), M('(0,\\,4.5)'), T(' and '), M('(4,\\,2.5)'), T('.')],
            panel('gp-b2b.png'),
            [T('Read the '), M('x'), T('-coordinates of the three crossings: '),
             M('x = -3.95'), T(', '), M('x = 0.2'), T(' or '), M('x = 3.75'), T('.')],
        ]),
    ], keep_together=False)


# ------------------------------------------------------------------ section C
def notes_c(ws):
    ws.para([T('A tangent is a straight line that touches the curve at one point and runs '
               'in the same direction as the curve there. Its gradient is the gradient of '
               'the curve at that point, and in a real-world question it is a rate.')])

    ws.para([B('Drawing it')])
    ws.para([T('Rest the ruler against the curve at the point, and draw the line right '
               'across the grid. A long tangent gives a large triangle, and a large '
               'triangle gives an accurate gradient.')])

    ws.para([B('Measuring it')])
    ws.para([T('Choose two points on the '), B('tangent'), T(' — not on the curve — where '
               'it crosses clear grid lines, and read their coordinates off the scales.')])
    ws.math_block(r'''\begin{aligned}
    \text{gradient} &= \dfrac{\text{rise}}{\text{run}} \\
    \text{gradient} &= \dfrac{y_{2} - y_{1}}{x_{2} - x_{1}}
    \quad\text{← both read in units, not in squares}
    \end{aligned}''')
    ws.para([T('A curve going downhill gives a negative gradient, so the minus sign is part '
               'of the answer.')])

    ws.para([B('Saying what it represents')])
    ws.para([T('The gradient is "'), M('y'), T('-units per '), M('x'), T('-unit". Name both '
               'axes in the answer: for a graph of numbers of micro-organisms against days, '
               'the gradient is how many more micro-organisms appear each day at that '
               'moment.')])

    mistakes(ws, [
        'Counting squares instead of units — the two axes usually have different scales.',
        'Drawing a chord through two points of the curve instead of a tangent touching at one.',
        'Dropping the minus sign on a falling curve.',
        'Using a tiny triangle, so a small slip in reading becomes a large error in the gradient.',
        'Answering "what does the gradient represent" with a number instead of with what it measures.',
    ])


def worked_c(ws, bank, figdir):
    ws.concept('A Tangent to a Quadratic Curve')
    ws.example()
    ask(ws, bank[EX['tan_quad']], figdir)
    ws.solution_box([
        ('(a)', [
            [T('Draw a tangent touching the curve at '), M('(-2,\\,6)'), T(' and take a '
               'triangle on it.')],
            panel('gp-c1a.png', 7.6),
            r'''\begin{aligned}
            \text{gradient} &= \dfrac{\text{rise}}{\text{run}} \\
            \text{gradient} &= \dfrac{5}{1} \quad\text{← the tangent rises } 5 \text{ units over a run of } 1 \\
            \text{gradient} &= 5
            \end{aligned}''',
        ]),
        ('(b)(i)', [
            r'''\begin{aligned}
            -2x^{2} - x + 4 &= 0 \\
            -2x^{2} &= x - 4 \quad\text{← moving the other two terms to the right} \\
            -2x^{2} - 3x + 8 &= x - 4 - 3x + 8
            \quad\text{← adding } -3x + 8 \text{ to both sides} \\
            y &= -2x + 4
            \quad\text{← the left side is now the curve’s own equation}
            \end{aligned}''',
            [T('So the straight line to draw is '), M('y = -2x + 4'), T('.')],
        ]),
        ('(b)(ii)', [
            [T('The line passes through '), M('(0,\\,4)'), T(' and '), M('(2,\\,0)'), T('.')],
            panel('gp-c1b.png', 7.6),
            [T('Read the '), M('x'), T('-coordinates of the two crossings: '), M('x = -1.7'),
             T(' or '), M('x = 1.2'), T('.')],
        ]),
    ], keep_together=False)

    ws.concept('A Tangent as a Rate of Change')
    ws.example()
    ask(ws, bank[EX['tan_exp']], figdir)
    ws.solution_box([
        ('(a)', [
            r'''\begin{aligned}
            y &= 10(2^{t}) \\
            y &= 10(2^{4}) \quad\text{← substituting } t = 4 \\
            y &= 10 \times 16 \\
            q &= 160
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('The values climb from 10 to 640, so the vertical scale has to hold 640. '
               'Plot the seven pairs and join them with one smooth curve that rises more '
               'and more steeply.')],
        ]),
        ('(c)(i)', [
            [T('Draw a tangent touching the curve at '), M('t = 3'), T(', where '),
             M('y = 80'), T(', and take a large triangle on it.')],
            panel('gp-c2a.png'),
            r'''\begin{aligned}
            \text{gradient} &= \dfrac{\text{rise}}{\text{run}} \\
            \text{gradient} &= \dfrac{111}{2} \quad\text{← the tangent rises } 111 \text{ over a run of } 2 \text{ days} \\
            \text{gradient} &= 55.5
            \end{aligned}''',
            [T('Any reading from 50 to 60 is accepted, because a hand-drawn tangent is '
               'read by eye.')],
        ]),
        ('(c)(ii)', [
            [T('The vertical axis counts micro-organisms and the horizontal axis counts '
               'days, so the gradient is micro-organisms per day.')],
            [T('It represents the rate at which the number of micro-organisms is growing '
               'three days after the start — about 55 more each day.')],
        ]),
        ('(d)', [
            [T('The two test tubes hold the same number where the two graphs meet, so draw '),
             M('y = -80t + 600'), T(' on the same grid. It passes through '),
             M('(0,\\,600)'), T(' and '), M('(6,\\,120)'), T('.')],
            panel('gp-c2b.png'),
            [T('The line cuts the curve once, at '), M('t \\approx 4.6'), T('.')],
            [T('So the two test tubes hold the same number after about '), M('4.6'),
             T(' days.')],
        ]),
    ], keep_together=False)

    ws.concept('Finding the Line of a Given Gradient That Just Touches')
    ws.example()
    ask(ws, bank[EX['tan_k']], figdir)
    ws.solution_box([
        ('(a)', [
            [T('The curve crosses the '), M('y'), T('-axis at '), M('5'), T(', so put '),
             M('x = 0'), T(' into the equation.')],
            r'''\begin{aligned}
            y &= -\dfrac{1}{4}\left(3x^{2} - 5x + m\right) \\
            5 &= -\dfrac{1}{4}\left(3(0)^{2} - 5(0) + m\right)
            \quad\text{← substituting } x = 0,\; y = 5 \\
            5 &= -\dfrac{m}{4} \\
            m &= -20
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('The gradient of a curve is 0 where it stops rising and starts falling — the '
               'highest point. Read both coordinates off the graph.')],
            [T('The coordinates are '), M('(0.8,\\,5.5)'), T('.')],
        ]),
        ('(c)', [
            [T('Every line '), M('y = 2x + k'), T(' has gradient 2; changing '), M('k'),
             T(' slides it up and down without turning it.')],
            [T('Draw one such line and slide it until it just touches the curve. Too high '
               'and it misses the curve; too low and it cuts the curve twice.')],
            panel('gp-c3.png', 8.6),
            [T('The touching line meets the '), M('y'), T('-axis at about '), M('5.2'),
             T(', so '), M('k = 5.2'), T('.')],
        ]),
    ], keep_together=False)


# ------------------------------------------------------------------ section D
def notes_d(ws):
    ws.para([T('The last part of one of these questions almost always asks for an equation '
               'to be solved by drawing a straight line. The curve is already on the grid; '
               'the whole task is to work out '), B('which'), T(' line to draw.')])

    ws.para([B('The method')])
    ws.para([T('1.  Write down the curve’s equation, '), M('y = f(x)'), T('.')])
    ws.para([T('2.  Take the equation to be solved and rearrange it until one side is '
               'exactly '), M('f(x)'), T('.')])
    ws.para([T('3.  Whatever is left on the other side is the line, '), M('y = mx + c'),
             T('.')])
    ws.para([T('4.  Draw that line on the same grid, and read the '), M('x'),
             T('-coordinates of the crossings.')])

    ws.para([B('An example of the rearranging')])
    ws.para([T('The curve is '), M('y = \\dfrac{x^{3}}{2} - 4x - 1'),
             T(' and the equation to solve is '), M('x^{3} - 4x = 0'), T('.')])
    ws.math_block(r'''\begin{aligned}
    x^{3} - 4x &= 0 \\
    \dfrac{x^{3}}{2} - 2x &= 0
    \quad\text{← dividing every term by } 2 \text{ to match the } \dfrac{x^{3}}{2} \text{ in the curve} \\
    \dfrac{x^{3}}{2} - 4x - 1 &= -2x - 1
    \quad\text{← subtracting } 2x + 1 \text{ from both sides} \\
    y &= -2x - 1
    \end{aligned}''')
    ws.para([T('Check the rearranging by picking one '), M('x'), T(': at '), M('x = 2'),
             T(' the curve gives '), M('y = 4 - 8 - 1 = -5'), T(' and the line gives '),
             M('y = -5'), T('. They agree, so the line is right.')])

    ws.para([B('How many answers to expect')])
    ws.para([T('The number of solutions is the number of crossings on the grid. A cubic '
               'curve and a straight line can meet three times, so three '), M('x'),
             T('-values may be wanted even when only one is easy to see.')])

    mistakes(ws, [
        'Dividing only some of the terms by the constant.',
        'Leaving an $x^{2}$ or $\\dfrac{1}{x}$ term on the right, so what is left is not a straight line.',
        'Giving the $y$-coordinates of the crossings when the solutions are the $x$-coordinates.',
        'Drawing the line only across part of the grid, and missing a crossing beyond it.',
        'Reading the answers to more decimal places than a hand-drawn graph can support.',
    ])


def worked_d(ws, bank, figdir):
    ws.concept('Two Equations Solved from the Same Curve')
    ws.example()
    ask(ws, bank[EX['two_eq']], figdir)
    ws.solution_box([
        ('(a)', [
            r'''\begin{aligned}
            x + \dfrac{4}{x} &= 5 \\
            -x - \dfrac{4}{x} &= -5 \quad\text{← multiplying every term by } -1 \\
            8 - x - \dfrac{4}{x} &= 8 - 5 \quad\text{← adding } 8 \text{ to both sides} \\
            y &= 3
            \end{aligned}''',
            [T('Draw the horizontal line '), M('y = 3'), T(' and read the crossings.')],
            panel('gp-d1a.png'),
            [T('So '), M('x = 1.0'), T(' or '), M('x = 4.0'), T('.')],
        ]),
        ('(b)', [
            r'''\begin{aligned}
            7 - \dfrac{4}{x} &= \dfrac{x}{2} \\
            -\dfrac{4}{x} &= \dfrac{x}{2} - 7 \quad\text{← moving the } 7 \text{ to the right} \\
            8 - x - \dfrac{4}{x} &= \dfrac{x}{2} - 7 + 8 - x
            \quad\text{← adding } 8 - x \text{ to both sides} \\
            y &= 1 - \dfrac{x}{2}
            \quad\text{← collecting the } x \text{ terms and the numbers}
            \end{aligned}''',
            [T('Draw '), M('y = 1 - \\dfrac{x}{2}'), T(', which passes through '),
             M('(0,\\,1)'), T(' and '), M('(2,\\,0)'), T('.')],
            panel('gp-d1b.png'),
            [T('The line cuts the curve once in the range '), M('0 < x < 8'), T(', at '),
             M('x = 0.6'), T('.')],
        ]),
    ], keep_together=False)

    ws.concept('Reading a Cubic Equation Off Two Graphs Already Drawn')
    ws.example()
    ask(ws, bank[EX['cubic']], figdir)
    ws.solution_box([
        ('(a)', [
            [T('Where the two graphs meet, their '), M('y'), T('-values are equal.')],
            r'''\begin{aligned}
            \dfrac{x^{3}}{2} - 4x - 1 &= 1 - x
            \quad\text{← setting the curve equal to the line} \\
            \dfrac{x^{3}}{2} - 3x - 2 &= 0
            \quad\text{← moving every term to the left} \\
            x^{3} - 6x - 4 &= 0
            \quad\text{← multiplying every term by } 2 \text{ to clear the fraction}
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('Draw a tangent touching the curve at '), M('(-2,\\,3)'), T(' and take a '
               'triangle on it.')],
            r'''\begin{aligned}
            \text{gradient} &= \dfrac{\text{rise}}{\text{run}} \\
            \text{gradient} &= \dfrac{2}{1} \\
            \text{gradient} &= 2
            \end{aligned}''',
        ]),
        ('(c)(i)', [
            r'''\begin{aligned}
            x^{3} - 4x &= 0 \\
            \dfrac{x^{3}}{2} - 2x &= 0 \quad\text{← dividing every term by } 2 \\
            \dfrac{x^{3}}{2} - 4x - 1 &= -2x - 1
            \quad\text{← subtracting } 2x + 1 \text{ from both sides} \\
            y &= -2x - 1
            \end{aligned}''',
        ]),
        ('(c)(ii)', [
            [T('Draw '), M('y = -2x - 1'), T(', through '), M('(0,\\,-1)'), T(' and '),
             M('(2,\\,-5)'), T('.')],
            panel('gp-d2.png', 8.6),
            [T('The line cuts the curve three times, at '), M('x = -2'), T(', '),
             M('x = 0'), T(' and '), M('x = 2'), T('.')],
        ]),
    ], keep_together=False)

    ws.concept('A Tangent of a Given Gradient, and a Line to Solve a Cubic')
    ws.example()
    ask(ws, bank[EX['kranji']], figdir)
    ws.solution_box([
        ('(a)', [
            r'''\begin{aligned}
            y &= \dfrac{1}{10}x\left(15 - x^{2}\right) \\
            y &= \dfrac{1}{10}(5)\left(15 - 5^{2}\right) \quad\text{← substituting } x = 5 \\
            y &= \dfrac{1}{10}(5)(-10) \\
            p &= -5
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('Plot the ten pairs and join them with one smooth curve, rising to a turning '
               'point near '), M('x = 2.2'), T(' and falling steeply after '), M('x = 3'),
             T('.')],
        ]),
        ('(c)', [
            [T('A gradient of '), M('-2'), T(' means the tangent falls 2 units for every 1 '
               'unit across. Draw a line of that slope and slide it until it just touches '
               'the curve on the falling side.')],
            panel('gp-d3a.png', 8.6),
            [T('It touches at about '), M('(3.4,\\,1.1)'), T('.')],
        ]),
        ('(d)', [
            r'''\begin{aligned}
            y &= \dfrac{1}{10}x\left(15 - x^{2}\right) \\
            y &= \dfrac{15x - x^{3}}{10} \quad\text{← expanding the bracket} \\
            x^{3} &= 15x - 10y \quad\text{← making } x^{3} \text{ the subject}
            \end{aligned}''',
            [T('Now put that into the equation to be solved.')],
            r'''\begin{aligned}
            x^{3} - 8x + 3 &= 0 \\
            15x - 10y - 8x + 3 &= 0 \quad\text{← substituting for } x^{3} \\
            -10y &= -7x - 3 \\
            y &= 0.7x + 0.3
            \end{aligned}''',
            [T('So '), M('a = 0.7'), T(' and '), M('b = 0.3'), T('.')],
            panel('gp-d3b.png', 8.6),
        ]),
    ], keep_together=False)


# ---------------------------------------------------------------------- build
def main():
    by_id, _ = fetch("EM", "Algebra (Graph on Graph Paper)", figures=True)
    print(f"pool: {len(by_id)} rows")

    bank = {}
    for short in EX.values():
        hit = [r for r in by_id.values() if r["id"].startswith(short)]
        if not hit:
            raise SystemExit(f"worked example {short} is not in the pool")
        bank[short] = hit[0]

    figdir = Path(tempfile.mkdtemp(prefix="gpfig-"))
    ws = sheet('O Level E Math Revision', 'Graphs on Graph Paper')

    ws.section('Section A — Drawing the Curve')
    notes_a(ws)
    ws.notes_end()      # notes are not a part -- Word may break inside them
    worked_a(ws, bank, figdir)
    ws.para([B('Practice')])
    a = render_practice(ws, by_id, PRACTICE_A, figdir, side_by_side=False,
                        cap_w=10.5, cap_h=9.5, answers=ANSWERS)

    ws.page_break()
    ws.section('Section B — Reading the Graph')
    notes_b(ws)
    ws.notes_end()      # notes are not a part -- Word may break inside them
    worked_b(ws, bank, figdir)
    ws.para([B('Practice')])
    b = render_practice(ws, by_id, PRACTICE_B, figdir, side_by_side=False,
                        cap_w=10.5, cap_h=9.5, answers=ANSWERS)

    ws.page_break()
    ws.section('Section C — The Tangent')
    notes_c(ws)
    ws.notes_end()      # notes are not a part -- Word may break inside them
    worked_c(ws, bank, figdir)
    ws.para([B('Practice')])
    c = render_practice(ws, by_id, PRACTICE_C, figdir, side_by_side=False,
                        cap_w=10.5, cap_h=9.5, answers=ANSWERS)

    ws.page_break()
    ws.section('Section D — Solving an Equation by Drawing a Straight Line')
    notes_d(ws)
    ws.notes_end()      # notes are not a part -- Word may break inside them
    worked_d(ws, bank, figdir)
    ws.para([B('Practice')])
    d = render_practice(ws, by_id, PRACTICE_D, figdir, side_by_side=False,
                        cap_w=10.5, cap_h=9.5, answers=ANSWERS, stems=STEMS)

    # a run Word cannot keep whole has to break inside itself -- the page rule
    tall = [h for h in ws.glued_heights() if h > ws.PAGE_CM - 1.5]
    if tall:
        print(f"  !! runs too tall to keep on one page: {tall}")

    save(ws, "EM/S3 EM Revision Set", "REV 3 Graphs on Graph Paper.docx")
    print(f"worked examples: {len(EX)}    practice: "
          f"A {a}/{len(PRACTICE_A)}  B {b}/{len(PRACTICE_B)}  "
          f"C {c}/{len(PRACTICE_C)}  D {d}/{len(PRACTICE_D)}")


if __name__ == "__main__":
    main()
