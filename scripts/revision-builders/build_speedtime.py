#!/usr/bin/env python3
"""EM Distance and Speed-Time Graphs revision worksheet.

Three strands, each with its own notes at the front and its own practice right
after its examples (ADRIAN-STYLE, Numbering and sections):

    A  distance-time (travel) graphs -- the gradient is the speed
    B  speed-time graphs -- the gradient is the acceleration, the area is the
       distance
    C  turning one graph into the other, and a journey set out in words

Every question -- worked examples included -- is read from the live bank rather
than transcribed, so a stem or an answer key on the sheet cannot drift from what
the bank holds.  Two of the examples ask the student to DRAW a graph; the drawn
answers are the committed PNGs from make_speedtime_figures.py, as are the notes
figures.  Re-run that script if one needs changing.

    ~/.../scratchpad/venv/bin/python build_speedtime.py
"""
import tempfile
from pathlib import Path

from build_lib import (sheet, fetch, render_practice, render_parts, save,
                       place_figures, T, B, I, M)
import revision_lib as R

FIG = Path(__file__).resolve().parent / "assets"

# --- worked examples, by bank id -------------------------------------------
EX = {
    "travel_read":  "829099e2",   # Presbyterian High 2023 P1 Q11        [3]
    "travel_full":  "727497a7",   # St Joseph's Institution 2025 P1 Q26   [7]
    "area_train":   "0e358d9e",   # Ahmad Ibrahim 2025 P2 Q6              [4]
    "unknown_u":    "502eb7b5",   # North Vista 2023 P1 Q16               [4]
    "mid_speed":    "2b20f380",   # Methodist Girls 2025 P1 Q18           [4]
    "to_distance":  "9c285480",   # Cedar Girls 2025 P1 Q24               [4]
    "words_graph":  "78d4184d",   # Nan Chiau 2021 P2 Q8                  [6]
}

# Two things the bank holds that this sheet writes differently.  Both sit on
# worked examples, whose solutions are written here rather than printed from the
# stored key, so neither needs an ANSWERS override -- but both should be
# corrected in the bank separately.
#   727497a7 (d)  the row key and the part key both say Emily's line runs from
#                 (1030, 14) to (1236, 30).  The part's own words say she leaves
#                 Town C and arrives at Town D, and the printed graph puts Town C
#                 at 30 km and Town D at 50 km, so the line is (1030, 30) to
#                 (1236, 50).  Part (e) settles it: with 30 to 50 the two lines
#                 cross 8.89 km short of Town D, which is the stored (e) answer
#                 of 9 km.  Read the bank's way, Emily is still 20 km behind when
#                 Lily finishes and the lines do not cross at all.
#   2b20f380 (a)  the stem calls it a particle and the part calls it "the car".
#                 The stem is right; the part prints as the bank holds it.

# --- practice ---------------------------------------------------------------
# Rows checked and left out on purpose:
#   d052da7d  Crescent Girls 2024 P2 Q10 -- the row answer contradicts the part
#             answers in two places
#   08c631f1, 2bac8642, c56df883 -- the answer field is empty, so no [Ans:] line
#             could be printed
#   1e3eaf64  really a container-filling question, which belongs to Graphs of
#             Functions
#   d542d232  carries three topics at once
#   f55f604a, d5271dd1, 8627666c, 03bdc47d -- the stem is empty or the marks sit
#             one level down, so the question does not print whole
PRACTICE_A = [                                   # travel graphs
    "3e21790a-1ea4-4891-9370-a25758e83ae6",      # CHIJ St Nicholas 2022 P1 Q22        [5]
    "f46b3fc0-cf03-4eff-83ac-6010cb5c530c",      # Presbyterian High 2024 P1 Q24       [5]
]
PRACTICE_B = [                                   # gradient and area
    "4b7124b1-a474-4402-bf09-5a0a54280208",      # Outram 2022 P1 Q16                  [3]
    "d581f8fe-21bd-4cf2-a7d8-594423d77f67",      # St Anthony Cannosian 2023 P1 Q15    [3]
    "c9a2d704-3d60-40c2-bd56-5a5489825e1c",      # Geylang Methodist 2023 P1 Q20       [4]
    "b1e25e2d-3e9b-4257-9b15-65c3e8264086",      # Cedar Girls 2024 P1 Q21             [4]
    "09d6ed4f-341b-46a0-be4d-360b3ac3e62b",      # Dunman 2024 P1 Q15                  [4]
    "3ec8cbd6-47d4-4334-ad28-39e2f78890d0",      # Chung Cheng (Main) 2025 P1 Q24      [4]
    "e22121b3-8a27-4fe9-93d3-a24d357de86b",      # Kranji 2022 P1 Q20                  [4]
    "56517880-aa52-4190-b51f-cb592b3b6aa6",      # Bendemeer 2023 P1 Q23               [5]
    "6509e6f6-2f7d-404b-a7fd-c9a3462c58a4",      # Crescent Girls 2023 P1 Q23          [5]
    "b38596f3-dbd9-48dd-bb0b-6e5df4e03660",      # Crescent Girls 2025 P1 Q24          [5]
]
PRACTICE_C = [                                   # one graph into the other
    "dc75c33a-d436-4c17-8bdf-6b4ae450cf7d",      # Fairfield Methodist 2023 P1 Q24     [3]
    "87b47d60-2821-4048-ad60-89a694487b2e",      # Gan Eng Seng 2025 P1 Q23            [4]
    "4eca9a29-a426-4b6c-ab4f-99aabc821d11",      # Anglican High 2024 P2 Q7            [4]
    "a705efc0-6f51-4540-8427-8e9db1fb4e1b",      # Fairfield Methodist 2024 P1 Q26     [5]
    "ea2b3435-37ab-4a4e-b28a-ef2323bc24f8",      # Nan Chiau 2024 P1 Q23               [5]
    "03c89c0e-33e9-4a4c-8947-4988d0cd0289",      # Nan Hua High School 2023 P1 Q24     [5]
    "b7b0a6a3-a103-47f1-92c1-2ee44a598698",      # Ahmad Ibrahim 2021 P1 Q22           [6]
]


# Thirteen stored row keys carry their maths as plain text -- "v = 20", "2.8
# m/s2", and twice a mixed number typed with a slash ("2 1/3", "21 2/3").  A
# sheet may not print a fraction as a slash (ADRIAN-STYLE, Working), and an
# answer line set in body text beside one set in maths reads as two different
# kinds of answer, so the keys are re-set as maths HERE, in the open, with the
# VALUES unchanged -- each one checked against that row's own part keys, which
# the bank already holds marked up correctly.  Three of them also said no more
# than "sketch (...)" or "graph sketched on the grid provided", which gives a
# student nothing to check a drawn graph against; those name the points and the
# shape the part keys hold.  Every line below is a typography or wording fix, not
# a correction to a value.  The build prints each one so the bank can be tidied
# separately.
ANSWERS = {
    "f46b3fc0-cf03-4eff-83ac-6010cb5c530c":
        r"(a) $2.5$ m/s; (b) He rested from $t = 8$ s to $t = 14$ s, then "
        r"travelled at a constant speed from $t = 14$ s to $t = 18$ s; "
        r"(c)(i) $5$ m/s; (c)(ii) a straight line from $(0,\,0)$ to $(8,\,5)$",
    "c9a2d704-3d60-40c2-bd56-5a5489825e1c":
        r"(a) $2.8$ m/s$^2$; (b) $1365$ m; (c) $t = 74$",
    "3ec8cbd6-47d4-4334-ad28-39e2f78890d0":
        r"(a) $v = 20$; (b) $79$ s",
    "e22121b3-8a27-4fe9-93d3-a24d357de86b":
        r"(a) $5.5$ m/s$^2$; (b) $p = 82$ m/s; (c) $v = 135$ m/s",
    "56517880-aa52-4190-b51f-cb592b3b6aa6":
        r"(a) $v = 6$; (b) $d = 1.2$; (c) $12$ s",
    "6509e6f6-2f7d-404b-a7fd-c9a3462c58a4":
        r"(a) $v = 38$ m/s; (b) $0$ m/s$^2$; (c) $p = 55$",
    "b38596f3-dbd9-48dd-bb0b-6e5df4e03660":
        r"(a) $2\dfrac{1}{3}$ m/s$^2$; (b) $228$ m; (c) $v = 30$ m/s",
    "dc75c33a-d436-4c17-8bdf-6b4ae450cf7d":
        r"(a) $v = 13$ m/s; (b) a curve getting steeper from $(0,\,0)$ to "
        r"$(5,\,40)$, a straight line to $(8,\,79)$, then a curve flattening "
        r"to rest at $(14,\,118)$",
    "87b47d60-2821-4048-ad60-89a694487b2e":
        r"(a) $v = 4.5$ m/s; (b) a distance-time graph through $(30,\,90)$, "
        r"$(60,\,270)$ and $(100,\,390)$",
    "4eca9a29-a426-4b6c-ab4f-99aabc821d11":
        r"(a) $21\dfrac{2}{3}$ km/h; (b) $31.75$ km, average speed "
        r"$15.875$ km/h",
    "a705efc0-6f51-4540-8427-8e9db1fb4e1b":
        r"(a) $4$ m/s$^2$; (b) $200$ m; (c) $k = 18$; (d) a curve getting "
        r"steeper from $(0,\,0)$ to $(10,\,200)$, then a straight line to "
        r"$(18,\,520)$",
    "ea2b3435-37ab-4a4e-b28a-ef2323bc24f8":
        r"(a) $86.4$ km/h; (b) greatest speed $v = 30$ m/s; (c) a distance-time "
        r"graph reaching $504$ m at the end",
    "03c89c0e-33e9-4a4c-8947-4988d0cd0289":
        r"(a) $0.15$ m/s$^2$; (b) $5$ m/s; (c) a distance-time graph reaching "
        r"$600$ m at the end",
    "b7b0a6a3-a103-47f1-92c1-2ee44a598698":
        r"(a) $t = 18$; (b) $288$ m, average speed $16$ m/s; (c) a straight "
        r"line from $(0,\,0)$ to $(6,\,144)$, then a curve flattening to rest "
        r"at $(18,\,288)$",
}


# ---------------------------------------------------------------------------
def ask(ws, row, figdir=None, side_by_side=False, cap_h=8.0):
    """The exam question, verbatim from the bank, marks right-aligned in [n].

    Every question in this topic is read off a picture, so the stored figure
    goes between the stem and the sub-parts -- the same place the practice half
    puts it.  A part carrying its own figure (blank answer axes, say) gets it
    from render_parts.
    """
    stem = (row.get("question_text") or "").strip()
    parts = [p for p in (row.get("parts") or []) if isinstance(p, dict)]
    if stem:
        ws.para(R.split_math(stem),
                marks=None if parts else row.get("total_marks"))

    place_figures(ws, row, figdir, side_by_side, cap_h=cap_h)

    if parts:
        ws.parts()
        # an example's (a) sits at the margin, so its (i) (ii) step in once
        render_parts(ws, parts, roman_level=1, figdir=figdir, cap_h=cap_h)


def mistakes(ws, items):
    ws.para([B('Mistakes to avoid')])
    for i, e in enumerate(items, 1):
        ws.para([T(f'{i}.  ')] + R.split_math(e))


def panel(png, caption):
    """One column of the shapes row: the picture, then what it means."""
    return [('figure', str(FIG / png), 3.6), caption]


# ---------------------------------------------------------------------------
# Section A -- distance-time (travel) graphs
# ---------------------------------------------------------------------------
def notes_a(ws):
    ws.para([B('Notes')])

    ws.para([B('Read the vertical axis first')])
    ws.para([T('A distance-time graph has '), B('distance'), T(' up the side. '
             'Everything below depends on it saying distance and not speed.')])

    ws.para([B('What each piece of the line means')])
    ws.columns([
        [[T('The gradient of a section is the speed over that section.')],
         ('figure', str(FIG / 'st-note-travel.png'), 8.6)],
        [[T('A sloping line going up: moving away from the start.')],
         [T('A steeper line: a faster journey.')],
         [T('A horizontal line: the object has '), B('stopped'),
          T('. It is standing still, not moving at a constant speed.')],
         [T('A line coming back down: returning towards the start.')],
         [T('The line reaches the axis again when the object is home.')]],
    ], [9.0, 7.0])

    ws.para([B('Speed from a section')])
    ws.math_block(r'\text{speed} = \dfrac{\text{distance travelled}}{\text{time taken}}')
    ws.para([T('Take both numbers off the graph: the rise between the two ends of the '
               'section, and the time across it.')])

    ws.para([B('Average speed for a whole journey')])
    ws.math_block(r'\text{average speed} = \dfrac{\text{total distance}}{\text{total time}}')
    ws.para([T('Add up all the distance travelled, including the way back, and divide by '
               'the whole time from start to finish. Adding the separate speeds and halving '
               'gives a different number, and it is the wrong one.')])

    ws.para([B('Changing km/h into m/s')])
    ws.para([T('One kilometre is '), M('1000'), T(' metres and one hour is '), M('3600'),
             T(' seconds, so turn each quantity into metres and seconds before dividing.')])
    ws.math_block(r'\dfrac{16 \text{ km}}{5 \text{ h}} = \dfrac{16 \times 1000 \text{ m}}{5 \times 3600 \text{ s}} = \dfrac{8}{9} \text{ m/s}')

    ws.para([B('Times written the exam way')])
    ws.para([T('A travel graph is often marked 0800, 0900, 1000 along the bottom, in six '
               'minute squares. Count squares rather than guessing: five squares is 30 '
               'minutes, and 48 minutes is '), M('0.8'), T(' of an hour.')])

    mistakes(ws, [
        'Calling a horizontal section "constant speed" — on a distance–time graph the object is standing still.',
        'Dividing the height at the end by the time to get the average speed of a journey that goes out and comes back; the return leg is distance travelled too.',
        'Leaving a time of 48 minutes as $0.48$ of an hour instead of $0.8$.',
        'Finding a gradient from the whole graph when the question asks about one section of it.',
        'Answering in km/h when the question asks for m/s.',
    ])


def worked_a(ws, bank, figdir):
    ws.concept('Reading a Distance Off a Travel Graph, and Converting the Units')
    ws.example()
    ask(ws, bank[EX['travel_read']], figdir, cap_h=7.0)
    ws.solution_box([
        ('(a)', [
            [T('Go up from '), M('t = 2'), T(' to the line, then across to the distance axis.')],
            [T('Tan ran '), M('8'), T(' km in the first two hours.')],
        ]),
        ('(b)', [
            [T('The whole journey is the full height of the graph over the full width: '),
             M('16'), T(' km in '), M('5'), T(' hours.')],
            [T('The answer is asked for in m/s, so change both quantities before dividing.')],
            r'''\begin{aligned}
            16 \text{ km} &= 16 \times 1000 \\
            &= 16\,000 \text{ m}
            \end{aligned}''',
            r'''\begin{aligned}
            5 \text{ h} &= 5 \times 3600 \\
            &= 18\,000 \text{ s}
            \end{aligned}''',
            r'''\begin{aligned}
            \text{average speed} &= \dfrac{\text{total distance}}{\text{total time}} \quad\text{← average speed for a whole journey} \\
            &= \dfrac{16\,000}{18\,000} \\
            &= \dfrac{8}{9} \text{ m/s} \quad\text{← } 0.889 \text{ m/s to 3 significant figures}
            \end{aligned}''',
        ]),
    ], keep_together=False)

    ws.concept('A Whole Travel Graph: Stops, Speeds and a Second Journey on the Same Axes')
    ws.example()
    ask(ws, bank[EX['travel_full']], figdir, cap_h=9.0)
    ws.solution_box([
        ('(a)', [
            [T('At 0930 the line is horizontal, so the distance from Town '), M('A'),
             T(' is not changing.')],
            [T('Lily has stopped. She is resting at Town '), M('B'), T('.')],
        ]),
        ('(b)', [
            [T('Town '), M('B'), T(' is at '), M('14'), T(' km and Town '), M('C'),
             T(' is at '), M('30'), T(' km, so read off the distance between them.')],
            r'''\begin{aligned}
            \text{distance} &= 30 - 14 \\
            &= 16 \text{ km}
            \end{aligned}''',
            [T('She leaves Town '), M('B'), T(' at 0942 and reaches Town '), M('C'),
             T(' at 1030, so the section takes 48 minutes.')],
            r'''\begin{aligned}
            \text{time} &= \dfrac{48}{60} \quad\text{← minutes into hours, because the answer is in km/h} \\
            &= 0.8 \text{ h}
            \end{aligned}''',
            r'''\begin{aligned}
            \text{average speed} &= \dfrac{\text{distance}}{\text{time}} \\
            &= \dfrac{16}{0.8} \\
            &= 20 \text{ km/h}
            \end{aligned}''',
        ]),
        ('(c)', [
            [T('From Town '), M('C'), T(' at '), M('30'), T(' km to Town '), M('D'), T(' at '),
             M('50'), T(' km is '), M('20'), T(' km.')],
            r'''\begin{aligned}
            \text{time} &= \dfrac{\text{distance}}{\text{speed}} \quad\text{← rearranging speed = distance ÷ time} \\
            &= \dfrac{20}{16\frac{2}{3}} \\
            &= 1.2 \text{ h} \\
            &= 1 \text{ h } 12 \text{ min}
            \end{aligned}''',
            [T('She leaves Town '), M('C'), T(' at 1100, so she reaches Town '), M('D'),
             T(' at 1212.')],
            [T('On the graph, draw a straight line from '), M('(1100,\\,30)'), T(' to '),
             M('(1212,\\,50)'), T('.')],
        ]),
        ('(d)', [
            [T('Emily starts at Town '), M('C'), T(', which is '), M('30'),
             T(' km from Town '), M('A'), T(', at 1030, and finishes at Town '), M('D'),
             T(', which is '), M('50'), T(' km, at 1236.')],
            [T('She does not stop, so her journey is one straight line from '),
             M('(1030,\\,30)'), T(' to '), M('(1236,\\,50)'), T('.')],
        ]),
        ('(e)', [
            [T('They pass each other where the two lines cross. Read the crossing point off '
               'the graph: it is at 1140, at a distance of about '), M('41'),
             T(' km from Town '), M('A'), T('.')],
            r'''\begin{aligned}
            \text{distance from Town } D &= 50 - 41.1 \\
            &\approx 9 \text{ km}
            \end{aligned}''',
            # (c), (d) and (e) are all answered by drawing, so the answer is
            # the finished graph -- Lily in one colour, Emily in another
            [T('The finished graph, with Lily\u2019s journey in one colour and '
               'Emily\u2019s in another:')],
            ('figure', str(FIG / 'st-ex-journey.png'), 11.0),
        ]),
    ], keep_together=False)


# ---------------------------------------------------------------------------
# Section B -- speed-time graphs
# ---------------------------------------------------------------------------
def notes_b(ws):
    ws.para([B('Notes')])

    ws.para([B('The same shape means something else here')])
    ws.columns([
        [[T('On a speed-time graph the gradient of a section is the acceleration.')],
         ('figure', str(FIG / 'st-note-area.png'), 8.6)],
        [[T('A sloping line going up: speeding up.')],
         [T('A sloping line going down: slowing down, which is a negative gradient.')],
         [T('A horizontal line: '), B('constant speed'),
          T('. The object is still moving.')],
         [T('The area under the graph is the distance travelled. Most of the marks in this '
            'topic are hidden in that area.')]],
    ], [9.0, 7.0])

    ws.para([B('The two formulas')])
    ws.math_block(r'\text{acceleration} = \dfrac{\text{change in speed}}{\text{time taken}} \qquad \text{distance} = \text{area under the graph}')

    ws.para([B('Finding the area')])
    ws.para([T('Cut the shape into triangles, rectangles and trapeziums, work each one out, '
               'and add them.')])
    ws.math_block(r'\text{triangle} = \dfrac{1}{2}bh \qquad \text{rectangle} = bh \qquad \text{trapezium} = \dfrac{1}{2}(a + b)h')
    ws.para([T('On a speed-time graph the two parallel sides '), M('a'), T(' and '), M('b'),
             T(' of a trapezium are the two '), I('times'), T(' — the top edge and the '
             'bottom edge — and '), M('h'), T(' is the speed across. The sloping side is not '
             'one of them.')])

    ws.para([B('How long it takes to stop')])
    ws.para([T('A deceleration given in the question fixes the time the last section takes.')])
    ws.math_block(r'\text{time} = \dfrac{\text{speed to be lost}}{\text{deceleration}}')
    ws.para([T('Add that time to the time the section starts at, and the end of the graph is '
               'fixed.')])

    ws.para([B('An unknown speed on the graph')])
    ws.para([T('Give it the letter the diagram uses, write down the fact the question gives '
               'you as an equation in that letter, and solve it.')])

    ws.para([B('Average speed, again')])
    ws.math_block(r'\text{average speed} = \dfrac{\text{total area}}{\text{total time}}')

    ws.para([B('Units')])
    ws.para([T('Read them off the axes and keep them. Speed in cm/s gives an acceleration in '),
             M(r'\text{cm/s}^2'), T(' and a distance in cm.')])

    mistakes(ws, [
        'Reading a speed–time graph as if the height were the distance; the height is the speed.',
        'Calling a horizontal section "stopped" — on a speed–time graph the object is moving at a constant speed.',
        'Using the sloping side of a trapezium as one of the two parallel sides.',
        'Working out one piece of the area and forgetting the piece beside it.',
        'Averaging the separate speeds instead of dividing the total distance by the total time.',
        'Dropping the minus sign, or the word deceleration, when the line slopes down.',
    ])


def worked_b(ws, bank, figdir):
    ws.concept('Gradient for the Acceleration, Area for the Distance')
    ws.example()
    ask(ws, bank[EX['area_train']], figdir, cap_h=6.5)
    ws.solution_box([
        ('(a)', [
            [T('The acceleration is the gradient of the first section: the speed gained, '
               'divided by the time it took.')],
            r'''\begin{aligned}
            \text{acceleration} &= \dfrac{\text{change in speed}}{\text{time taken}} \quad\text{← gradient of a speed-time graph} \\
            &= \dfrac{30 - 0}{10} \\
            &= 3 \text{ m/s}^{2}
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('The graph stops at '), M('t = 30'), T(' seconds, where the speed is still '),
             M('30'), T(' m/s. The deceleration tells us how long the train takes to lose it.')],
            r'''\begin{aligned}
            \text{time to stop} &= \dfrac{\text{speed to be lost}}{\text{deceleration}} \\
            &= \dfrac{30}{2} \\
            &= 15 \text{ s}
            \end{aligned}''',
            [T('So the train comes to rest at '), M('30 + 15 = 45'),
             T(' seconds, and the whole graph is a trapezium.')],
            r'''\begin{aligned}
            \text{distance} &= \dfrac{1}{2}(a + b)h \quad\text{← area of a trapezium, } a \text{ and } b \text{ the two times} \\
            &= \dfrac{1}{2}(20 + 45)(30) \quad\text{← top edge } 30 - 10 = 20 \text{ s, bottom edge } 45 \text{ s} \\
            &= \dfrac{1}{2}(65)(30) \\
            &= 975 \text{ m}
            \end{aligned}''',
        ]),
    ], keep_together=False)

    ws.concept('An Unknown Speed on the Graph')
    ws.example()
    ask(ws, bank[EX['unknown_u']], figdir, cap_h=7.5)
    ws.solution_box([
        ('(a)', [
            [T('The first section falls from '), M('50'), T(' m/s to '), M('10'),
             T(' m/s in '), M('20'), T(' seconds, so start there.')],
            r'''\begin{aligned}
            \text{deceleration} &= \dfrac{50 - 10}{20} \quad\text{← the speed lost, over the time taken} \\
            &= 2 \text{ m/s}^{2}
            \end{aligned}''',
            [T('The acceleration is half of that.')],
            r'''\begin{aligned}
            \text{acceleration} &= \dfrac{1}{2} \times 2 \\
            &= 1 \text{ m/s}^{2}
            \end{aligned}''',
            [T('The second section climbs from '), M('10'), T(' m/s to '), M('u'),
             T(' m/s in '), M('30'), T(' seconds, and its gradient is that acceleration.')],
            r'''\begin{aligned}
            \dfrac{u - 10}{30} &= 1 \\
            u - 10 &= 30 \\
            u &= 40
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('The graph is two trapeziums side by side. Work out each area, then add.')],
            r'''\begin{aligned}
            \text{first } 20 \text{ s} &= \dfrac{1}{2}(50 + 10)(20) \quad\text{← area of a trapezium, the two speeds and the time} \\
            &= 600 \text{ m}
            \end{aligned}''',
            r'''\begin{aligned}
            \text{next } 30 \text{ s} &= \dfrac{1}{2}(10 + 40)(30) \\
            &= 750 \text{ m}
            \end{aligned}''',
            r'''\begin{aligned}
            \text{total distance} &= 600 + 750 \\
            &= 1350 \text{ m}
            \end{aligned}''',
            r'''\begin{aligned}
            \text{average speed} &= \dfrac{\text{total distance}}{\text{total time}} \\
            &= \dfrac{1350}{50} \\
            &= 27 \text{ m/s}
            \end{aligned}''',
        ]),
    ], keep_together=False)

    ws.concept('A Speed Part Way Along a Sloping Section')
    ws.example()
    ask(ws, bank[EX['mid_speed']], figdir, cap_h=6.5)
    ws.solution_box([
        ('(a)', [
            [T('At '), M('t = 6'), T(' the particle is on the middle section, which runs from '),
             M('(2,\\,22)'), T(' to '), M('(10,\\,40)'), T('. Find its gradient first.')],
            r'''\begin{aligned}
            \text{acceleration} &= \dfrac{40 - 22}{10 - 2} \\
            &= \dfrac{18}{8} \\
            &= 2.25 \text{ cm/s}^{2}
            \end{aligned}''',
            [T('From '), M('t = 2'), T(' to '), M('t = 6'), T(' is '), M('4'),
             T(' seconds, so add on the speed gained in those 4 seconds.')],
            r'''\begin{aligned}
            v &= 22 + 2.25 \times (6 - 2) \quad\text{← starting speed, plus acceleration × time} \\
            &= 22 + 9 \\
            &= 31 \text{ cm/s}
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('Cut the graph into its three sections and find each area.')],
            r'''\begin{aligned}
            0 \text{ to } 2 \text{ s} &= \dfrac{1}{2}(2)(22) \quad\text{← area of a triangle} \\
            &= 22 \text{ cm}
            \end{aligned}''',
            r'''\begin{aligned}
            2 \text{ to } 10 \text{ s} &= \dfrac{1}{2}(22 + 40)(8) \quad\text{← area of a trapezium} \\
            &= 248 \text{ cm}
            \end{aligned}''',
            r'''\begin{aligned}
            10 \text{ to } 16 \text{ s} &= \dfrac{1}{2}(6)(40) \\
            &= 120 \text{ cm}
            \end{aligned}''',
            r'''\begin{aligned}
            \text{total distance} &= 22 + 248 + 120 \\
            &= 390 \text{ cm}
            \end{aligned}''',
            r'''\begin{aligned}
            \text{average speed} &= \dfrac{390}{16} \\
            &= 24.375 \text{ cm/s}
            \end{aligned}''',
        ]),
    ], keep_together=False)


# ---------------------------------------------------------------------------
# Section C -- one graph into the other
# ---------------------------------------------------------------------------
def notes_c(ws):
    ws.para([B('Notes')])

    ws.para([B('What the distance-time graph looks like')])
    ws.para([T('The height of a distance-time graph at any moment is the '), B('area so far'),
             T(' under the speed-time graph. So the four things a speed-time graph can be '
               'doing give four shapes.')])
    ws.columns([
        panel('st-shape-steady.png',
              [T('Constant speed: the distance grows by the same amount each second, so the '
                 'graph is a straight line.')]),
        panel('st-shape-speeding.png',
              [T('Speeding up: each second adds more than the one before, so the curve gets '
                 'steeper.')]),
        panel('st-shape-slowing.png',
              [T('Slowing down: each second adds less than the one before, so the curve '
                 'flattens out.')]),
        panel('st-shape-stopped.png',
              [T('Stopped: the distance does not change, so the graph is horizontal.')]),
    ], [4.0, 4.0, 4.0, 4.0])

    ws.para([B('Building it section by section')])
    ws.para([T('Work out the area of each section of the speed-time graph, and keep a '
               'running total. Those totals are the heights to plot, and each one starts '
               'where the section before it finished.')])

    ws.para([B('A journey given in words')])
    ws.para([T('Name the unknown speed, write down the distance each leg covers, and use the '
               'fact that both legs are the same distance.')])
    ws.math_block(r'\text{distance} = \text{speed} \times \text{time}')
    ws.para([T('Fifteen minutes is '), M('0.25'), T(' of an hour, so a journey that takes 15 '
             'minutes less than '), M('2.5'), T(' hours takes '), M('2.25'), T(' hours.')])

    ws.para([B('What a drawn graph has to show')])
    ws.para([T('Both axes labelled with what they carry and the units, the corner points '
               'plotted at the values worked out, and each section the right shape between '
               'them.')])

    mistakes(ws, [
        'Plotting the area of each section as its own height instead of adding it to the running total.',
        'Drawing a straight line for a section where the speed is changing; a changing speed gives a curve.',
        'Drawing the distance–time graph coming back down when the object is only slowing down; it comes down only when the object turns round and goes back.',
        'Leaving the corner points off, so the graph shows the shape but not the values.',
        'Treating "15 minutes less" as $0.15$ of an hour.',
    ])


def worked_c(ws, bank, figdir):
    ws.concept('Turning a Speed-Time Graph Into a Distance-Time Graph')
    ws.example()
    ask(ws, bank[EX['to_distance']], figdir, cap_h=6.5)
    ws.solution_box([
        ('(a)', [
            [T('From '), M('60'), T(' s to '), M('65'), T(' s the car falls from '), M('30'),
             T(' m/s to rest, so take the gradient of that last section.')],
            r'''\begin{aligned}
            \text{deceleration} &= \dfrac{30 - 0}{65 - 60} \\
            &= \dfrac{30}{5} \\
            &= 6 \text{ m/s}^{2}
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('Work out the area of each section and keep a running total; those totals are '
               'the heights of the distance-time graph.')],
            r'''\begin{aligned}
            0 \text{ to } 10 \text{ s} &= \dfrac{1}{2}(10)(30) \quad\text{← area of a triangle} \\
            &= 150 \text{ m}
            \end{aligned}''',
            r'''\begin{aligned}
            10 \text{ to } 60 \text{ s} &= (50)(30) \quad\text{← area of a rectangle} \\
            &= 1500 \text{ m} \\
            \text{running total} &= 150 + 1500 \\
            &= 1650 \text{ m}
            \end{aligned}''',
            r'''\begin{aligned}
            60 \text{ to } 65 \text{ s} &= \dfrac{1}{2}(5)(30) \\
            &= 75 \text{ m} \\
            \text{running total} &= 1650 + 75 \\
            &= 1725 \text{ m}
            \end{aligned}''',
            [T('So the graph passes through '), M('(0,\\,0)'), T(', '), M('(10,\\,150)'),
             T(', '), M('(60,\\,1650)'), T(' and '), M('(65,\\,1725)'), T('.')],
            [T('The car speeds up for the first 10 seconds, so that piece is a curve getting '
               'steeper; it then holds one speed, so that piece is a straight line; it slows '
               'to rest at the end, so that piece flattens out.')],
            ('figure', str(FIG / 'st-ex-distance.png'), 8.6),
        ]),
    ], keep_together=False)

    ws.concept('A Journey Described in Words, Then Drawn')
    ws.example()
    ask(ws, bank[EX['words_graph']], figdir, cap_h=7.5)
    ws.solution_box([
        ('(a)', [
            [T('Let the speed from Town '), M('A'), T(' to '), M('B'), T(' be '), M('x'),
             T(' km/h. The journey out takes '), M('2.5'), T(' hours.')],
            r'''\begin{aligned}
            \text{distance out} &= \text{speed} \times \text{time} \\
            &= 2.5x
            \end{aligned}''',
            [T('Coming back she goes '), M('4'), T(' km/h faster and takes 15 minutes less, '
             'which is '), M('0.25'), T(' of an hour less.')],
            r'''\begin{aligned}
            \text{distance back} &= (x + 4)(2.5 - 0.25) \\
            &= 2.25(x + 4)
            \end{aligned}''',
            [T('It is the same road both ways, so the two distances are equal.')],
            r'''\begin{aligned}
            2.5x &= 2.25(x + 4) \\
            2.5x &= 2.25x + 9 \\
            0.25x &= 9 \\
            x &= 36 \quad\text{← shown}
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('First find how far Town '), M('B'), T(' is.')],
            r'''\begin{aligned}
            AB &= 2.5 \times 36 \\
            &= 90 \text{ km}
            \end{aligned}''',
            [T('She goes there and comes back, so the distance travelled is twice that, and '
               'the whole journey takes '), M('2.5 + 2.25'), T(' hours.')],
            r'''\begin{aligned}
            \text{average speed} &= \dfrac{\text{total distance}}{\text{total time}} \\
            &= \dfrac{2 \times 90}{4.75} \\
            &= \dfrac{180}{4.75} \\
            &= 37\dfrac{17}{19} \text{ km/h}
            \end{aligned}''',
        ]),
        ('(c)', [
            [T('Both legs are at a constant speed, so both are straight lines.')],
            [T('Out: from '), M('(0,\\,0)'), T(' up to '), M('(2.5,\\,90)'), T('.')],
            [T('Back: from '), M('(2.5,\\,90)'), T(' down to '), M('(4.75,\\,0)'),
             T(', because she is returning to Town '), M('A'), T('.')],
            ('figure', str(FIG / 'st-ex-travel.png'), 8.6),
        ]),
    ], keep_together=False)


# ---------------------------------------------------------------------------
def main():
    by_id, _ = fetch("EM", "Distance and Speed Time Graphs", figures=True)
    print(f"pool: {len(by_id)} rows")
    bank = {}
    for short in EX.values():
        hit = [r for r in by_id.values() if r["id"].startswith(short)]
        if not hit:
            raise SystemExit(f"worked example {short} is not in the pool")
        bank[short] = hit[0]

    figdir = Path(tempfile.mkdtemp(prefix="stfig-"))
    ws = sheet('O Level E Math Revision', 'Distance and Speed-Time Graphs')

    ws.section('Section A — Distance-Time (Travel) Graphs')
    notes_a(ws)
    ws.notes_end()   # notes may break across a page; a question may not
    worked_a(ws, bank, figdir)
    ws.para([B('Practice')])
    a = render_practice(ws, by_id, PRACTICE_A, figdir, cap_h=9.5,
                        answers=ANSWERS)

    ws.page_break()
    ws.section('Section B — Speed-Time Graphs: Acceleration, and Distance as an Area')
    notes_b(ws)
    ws.notes_end()   # notes may break across a page; a question may not
    worked_b(ws, bank, figdir)
    ws.para([B('Practice')])
    b = render_practice(ws, by_id, PRACTICE_B, figdir, cap_h=8.5,
                        answers=ANSWERS)

    ws.page_break()
    ws.section('Section C — Turning One Graph Into the Other')
    notes_c(ws)
    ws.notes_end()   # notes may break across a page; a question may not
    worked_c(ws, bank, figdir)
    ws.para([B('Practice')])
    c = render_practice(ws, by_id, PRACTICE_C, figdir, cap_h=8.5,
                        answers=ANSWERS)

    # a run Word cannot keep whole has to break inside itself -- the page rule
    tall = [h for h in ws.glued_heights() if h > ws.PAGE_CM - 1.5]
    if tall:
        print(f"  !! runs too tall to keep on one page: {tall}")

    save(ws, "EM/S3 EM Revision Set", "REV 3 Distance and Speed Time Graphs.docx")
    print(f"worked examples: {len(EX)}    practice: A {a}/{len(PRACTICE_A)}  "
          f"B {b}/{len(PRACTICE_B)}  C {c}/{len(PRACTICE_C)}")


if __name__ == "__main__":
    main()
