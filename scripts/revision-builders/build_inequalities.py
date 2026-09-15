#!/usr/bin/env python3
"""EM Linear Inequalities revision worksheet -- notes, worked examples, practice.

Three strands, each with its own notes at the front and its own practice right
after its examples (ADRIAN-STYLE, Numbering and sections):

    A  solving a linear inequality, including a double one
    B  the greatest and least value of an expression built from two ranges
    C  forming an inequality from a worded problem

Every question -- worked examples included -- is read from the live bank rather
than transcribed, so a stem or an answer key on the sheet cannot drift from what
the bank holds.  The number lines are the committed PNGs from
make_numberlines.py; re-run that script if one needs changing.

    ~/.../scratchpad/venv/bin/python build_inequalities.py
"""
from pathlib import Path

from build_lib import sheet, fetch, render_practice, save, T, B, I, M
import revision_lib as R

NL = Path(__file__).resolve().parent / "assets"

# --- worked examples, by bank id -------------------------------------------
EX = {
    "solve_neg":   "2c6f4900",   # Hua Yi 2022 P1 Q9          [2]
    "double":      "04508236",   # Canberra 2021 P1 Q9         [3]
    "fractions":   "cab2dcf1",   # Chung Cheng (Main) 2022 P1 Q7 [3]
    "list":        "04c906d3",   # Cedar Girls 2021 P1 Q15     [4]
    "no_solution": "61094b82",   # Katong Convent 2022 P1 Q11  [3]
    "greatest":    "07224a58",   # Xinmin 2022 P1 Q5           [2]
    "three_ways":  "44218e73",   # CHIJ St Nicholas 2024 P1 Q1 [3]
    "form":        "f3dcc16a",   # Zhonghua 2024 P1 Q17        [4]
    "percent":     "c25729ad",   # Hua Yi 2024 P1 Q6           [3]
}

# --- practice ---------------------------------------------------------------
# Three rows in the single-topic pool are left out on purpose:
#   fc56f6b8  Anglican High 2025 P1 Q17 -- key says 9 < x <= 19, the algebra gives 9 <= x
#   b27b0cc4  Maris Stella 2024 P1 Q15  -- "largest odd odd number", answers another part
#   19cf6299  Xinmin 2025 P1 Q2         -- no answer stored
#   285da303  CHIJ St Nicholas 2023 P1 Q8 -- key drops the minus: "1.5 <= x < 5"
PRACTICE_A = [                                   # solving
    "d80dbb8b-8ac4-4a8b-ac24-4c23264cff3b",      # West Spring 2022 P1 Q6        [2]  smallest integer 0
    "2558316c-0d71-44a2-b0ad-287fe5d4e0ac",      # Presbyterian High 2025 P1 Q7  [2]  smallest integer 4
    "3f5eedd7-0789-4b1a-867a-f13318ba610e",      # St Joseph Institute 2024 P1 Q1 [2] x >= 3 5/13
    "8df38133-d794-4137-8cd4-958dcf1d5aa3",      # Jurong 2022 P1 Q5             [2]  -1 < x <= 1
    "cce8a2ec-09a8-4ada-a119-08a99bfcff20",      # Kent Ridge 2024 P1 Q8         [3]  x < 5
    "280385b9-6ff1-46eb-9564-0f0dd3ac7d21",      # Anglican High 2024 P1 Q6      [3]  9 <= h < 54
    "f86ba5eb-679f-48b4-89b6-66ab52dc386c",      # Bukit Panjang Govt High 2021 P1 Q5 [3]
    "7aabd914-de15-4576-a2fc-af85a0af295c",      # Canberra 2023 P1 Q6           [3]  prime 2
    "4f6e57af-ba9f-439e-9c12-e0d0071522c8",      # Crescent Girls 2023 P1 Q6     [3]  number line
    "063ec0a4-2f09-4f4e-ac6c-029fff8a6bff",      # Riverside 2023 P1 Q20         [4]  cube 8
    "1463f4e2-e8bf-4bd5-849b-05b854a451cb",      # Anglican High 2023 P1 Q15     [4]  square 25
    "4d3e7d0e-9abd-4d12-812d-1e7ecf0ba2b4",      # Anglican High 2021 P1 Q16     [4]  primes 2,3,5,7
    "536adba5-a946-4f5f-ac64-f36f2ad39293",      # Methodist Girls 2022 P1 Q11   [5]  line + smallest int
]
PRACTICE_B = [                                   # greatest and least value
    "4d6aa203-0301-4ad2-8ece-3951e1bf0b6e",      # Catholic (IP) 2022 P1 Q5      [2]  4 ; 1/4
    "0a97747b-3174-4f02-a0dc-b9024a7635ef",      # Deyi 2024 P1 Q4               [2]  5 ; -1
    "b1e1a378-f705-46da-9a23-c5efb9a84bd0",      # Riverside 2024 P1 Q1          [2]  49 ; -28
    "7960eef1-a059-4632-baf3-884231f04c0a",      # Bukit Panjang Govt High 2021 P1 Q6 [2] 10.5
]
PRACTICE_C = [                                   # forming an inequality
    "cd97ac3e-7655-42ec-a511-f4882b26aab8",      # Xinmin 2024 P1 Q4             [3]  x >= 90
    "c72a149f-78d7-4d7e-bbc6-951c972bc0de",      # Chung Cheng (Yishun) 2025 P1 Q15 [3] 22
    "d225b0c1-c8cf-4c65-abef-3b21158a00e2",      # Anglican High 2022 P2 Q4      [4]  8 months
]


# ---------------------------------------------------------------------------
def ask(ws, row):
    """The exam question, verbatim from the bank, marks right-aligned in [n]."""
    stem = (row.get("question_text") or "").strip()
    parts = [p for p in (row.get("parts") or []) if isinstance(p, dict)]
    if stem:
        ws.para(R.split_math(stem),
                marks=None if parts else row.get("total_marks"))
    if parts:
        ws.parts()
        for p in parts:
            ws.SQ(R.split_math((p.get("text") or "").strip()), marks=p.get("marks"))


def mistakes(ws, items):
    ws.para([B('Mistakes to avoid')])
    for i, e in enumerate(items, 1):
        ws.para([T(f'{i}.  ')] + R.split_math(e))


# ---------------------------------------------------------------------------
# Section A -- solving
# ---------------------------------------------------------------------------
def notes_a(ws):
    ws.para([B('Notes')])

    ws.para([B('What the answer looks like')])
    ws.para([T('Solving an inequality gives a '), B('range'), T(' of values, not one number. '),
             M('x > 4'), T(' says that every number bigger than 4 works, and 4 itself does not.')])

    ws.para([B('The moves that keep it true')])
    ws.para([T('Add or subtract the same thing on both sides — the sign stays as it is.')])
    ws.para([T('Multiply or divide both sides by a '), B('positive'),
             T(' number — the sign stays as it is.')])
    ws.para([T('Multiply or divide both sides by a '), B('negative'),
             T(' number — the sign turns round.')])
    ws.math_block(r'-2x < 6 \quad\text{gives}\quad x > -3')

    ws.para([B('Fractions')])
    ws.para([T('Multiply '), B('every'), T(' term by the LCM of the denominators, including any term that has no fraction in it.')])

    ws.para([B('A double inequality')])
    ws.para([T('An expression caught between two others, '), M(r'a \leq b \leq c'),
             T(', is two inequalities sharing a middle. Split it into '), M(r'a \leq b'),
             T(' and '), M(r'b \leq c'), T(', solve each one, then keep the values that satisfy both.')])

    ws.para([B('On a number line')])
    ws.para([T('A solid dot marks an end that is included ('), M(r'\leq'), T(' or '), M(r'\geq'),
             T('), an open circle marks an end that is left out ('), M('<'), T(' or '), M('>'),
             T('), and the line is drawn between them. Drawing the two halves one above the other '
               'shows at a glance where they overlap.')])

    ws.para([B('Listing the numbers in a range')])
    ws.para([T('Read which kind of number is wanted — integers, prime numbers, perfect squares, '
               'perfect cubes — then write out only the ones lying inside the range. A value sitting '
               'on an open circle is outside it.')])

    mistakes(ws, [
        'Leaving the sign as it was after multiplying or dividing by a negative number.',
        'Multiplying only the fraction terms by the LCM and leaving a whole-number term untouched.',
        'Solving one half of a double inequality and stopping there.',
        'Writing two halves that do not overlap as though they were one range.',
        'Filling in the circle at an end the inequality leaves out.',
        'Listing a value that sits exactly on an excluded end.',
    ])


def worked_a(ws, bank):
    ws.concept('Dividing by a Negative Number Turns the Sign Round')
    ws.example()
    ask(ws, bank[EX['solve_neg']])
    ws.solution_box([('', [
        [T('Clear the fraction first. The denominator is '), M('-2'),
         T(', so multiplying both sides by it turns the sign round.')],
        r'''\begin{aligned}
        \dfrac{4x+3}{-2} &\leq 5 \\
        4x+3 &\geq 5 \times (-2) \quad\text{← } \times(-2)\text{, a negative, so } \leq \text{ becomes } \geq \\
        4x+3 &\geq -10 \\
        4x &\geq -13 \\
        x &\geq -\dfrac{13}{4} \\
        x &\geq -3\dfrac{1}{4} \quad (-3.25)
        \end{aligned}''',
        ('check', [T('put '), M('x = 0'), T(' back in: '), M(r'\dfrac{3}{-2} = -1.5'),
                   T(', which is less than 5.')]),
    ])], keep_together=False)

    ws.concept('A Double Inequality Is Two Inequalities — Split It')
    ws.example()
    ask(ws, bank[EX['double']])
    ws.solution_box([('', [
        [T('The middle expression is caught between two others, so there are two inequalities to solve.')],
        ('cols', [
            [[B('Left half')], r'''\begin{aligned}
             x &\leq \dfrac{x+4}{3} \\
             3x &\leq x+4 \quad\text{← both sides } \times 3 \\
             2x &\leq 4 \\
             x &\leq 2
             \end{aligned}'''],
            [[B('Right half')], r'''\begin{aligned}
             \dfrac{x+4}{3} &\leq 2x-1 \\
             x+4 &\leq 6x-3 \\
             7 &\leq 5x \\
             x &\geq 1\dfrac{2}{5}
             \end{aligned}'''],
        ], [7.3, 7.3]),
        [T('Both halves have to be true at the same time, so keep the values that lie in both ranges.')],
        r'1\dfrac{2}{5} \leq x \leq 2',
        ('figure', str(NL / 'nl-solve-both-closed.png'), 7.6),
    ])], keep_together=False)

    ws.concept('Clear the Fractions First')
    ws.example()
    ask(ws, bank[EX['fractions']])
    ws.solution_box([('', [
        [T('The denominators are 9, 15 and 6, and their LCM is 90. Multiply every term by 90, '
           'then treat the two halves separately.')],
        ('cols', [
            [[B('Left half')], r'''\begin{aligned}
             \dfrac{x-2}{9} &\leq \dfrac{2x+5}{15} \\
             10(x-2) &\leq 6(2x+5) \quad\text{← each term } \times 90 \\
             10x-20 &\leq 12x+30 \\
             -50 &\leq 2x \\
             x &\geq -25
             \end{aligned}'''],
            [[B('Right half')], r'''\begin{aligned}
             \dfrac{2x+5}{15} &\leq \dfrac{x+4}{6} \\
             6(2x+5) &\leq 15(x+4) \\
             12x+30 &\leq 15x+60 \\
             -30 &\leq 3x \\
             x &\geq -10
             \end{aligned}'''],
        ], [7.3, 7.3]),
        [T('Both must hold. Every number that is at least '), M('-10'),
         T(' is already at least '), M('-25'), T(', so the second range is the whole answer.')],
        r'x \geq -10',
        ('figure', str(NL / 'nl-overlap.png'), 9.6),
    ])], keep_together=False)

    ws.concept('Hence, List the Numbers a Range Contains')
    ws.example()
    ask(ws, bank[EX['list']])
    ws.solution_box([
        ('(a)', [
            [T('Expand the bracket, then split the double inequality.')],
            ('cols', [
                [[B('Left half')], r'''\begin{aligned}
                 2x+13 &< 4(x+2) \\
                 2x+13 &< 4x+8 \\
                 5 &< 2x \\
                 x &> \dfrac{5}{2}
                 \end{aligned}'''],
                [[B('Right half')], r'''\begin{aligned}
                 4(x+2) &\leq x+41 \\
                 4x+8 &\leq x+41 \\
                 3x &\leq 33 \\
                 x &\leq 11
                 \end{aligned}'''],
            ], [7.3, 7.3]),
            r'\dfrac{5}{2} < x \leq 11',
            [T('Part (b) is quicker with a number line, even though this part does not ask for one: '
               'an open circle at '), M(r'2\dfrac{1}{2}'), T(' and a solid dot at '), M('11'), T('.')],
            ('figure', str(NL / 'nl-open-closed.png'), 8.4),
        ]),
        ('(b)', [
            [T('The prime numbers lying inside the range:')],
            r'3,\ 5,\ 7,\ 11',
            ('check', [M('11'), T(' is in because that end carries '), M(r'\leq'), T('; '), M('2'),
                       T(' is out because it is smaller than '), M(r'2\dfrac{1}{2}'), T('.')]),
        ]),
    ], keep_together=False)

    ws.concept('When the Two Halves Do Not Overlap')
    ws.example()
    ask(ws, bank[EX['no_solution']])
    ws.solution_box([('', [
        [T('Split it, and solve each half as usual.')],
        ('cols', [
            [[B('Left half')], r'''\begin{aligned}
             -x &< 2x+1 \\
             -1 &< 3x \\
             x &> -\dfrac{1}{3}
             \end{aligned}'''],
            [[B('Right half')], r'''\begin{aligned}
             2x+1 &\leq \dfrac{3x-6}{4} \\
             8x+4 &\leq 3x-6 \quad\text{← both sides } \times 4 \\
             5x &\leq -10 \\
             x &\leq -2
             \end{aligned}'''],
        ], [7.3, 7.3]),
        [T('Draw both on one number line and look for the part they share.')],
        ('figure', str(NL / 'nl-no-solution.png'), 9.6),
        [T('A number cannot be bigger than '), M(r'-\dfrac{1}{3}'), T(' and be '), M('-2'),
         T(' or smaller at the same time, so there is no solution.')],
    ])], keep_together=False)


# ---------------------------------------------------------------------------
# Section B -- greatest and least
# ---------------------------------------------------------------------------
def notes_b(ws):
    ws.para([B('Notes')])

    ws.para([B('What is being asked')])
    ws.para([T('Nothing is solved here. You are '), B('choosing'),
             T(' values out of two ranges to make an expression as large, or as small, as it goes. '
               'The winner is almost always at an end of a range.')])

    ws.para([B('Sums and differences')])
    ws.math_block(r'\text{greatest } (x+y) = (\text{greatest } x) + (\text{greatest } y)')
    ws.math_block(r'\text{greatest } (x-y) = (\text{greatest } x) - (\text{least } y)')
    ws.para([T('Taking away a negative number makes a total bigger, which is why the least '),
             M('y'), T(' gives the greatest difference.')])

    ws.para([B('Products and quotients')])
    ws.para([T('A negative value turns a large product into a small one, so work out all '),
             B('four'), T(' combinations of the two ends and read off the one you want.')])

    ws.para([B('Squares')])
    ws.para([T('A square is 0 or more. The least '), M('x^2'), T(' is 0 when 0 lies in the range; '
             'otherwise it comes from the end nearest 0. The greatest '), M('x^2'),
             T(' comes from the end furthest from 0, which is often the negative end.')])

    ws.para([B('Making a fraction large or small')])
    ws.para([T('In '), M(r'\dfrac{a}{b}'), T(', a small '), M('b'), T(' makes the fraction large. '
             'To go as far below zero as possible, make the top as negative as it can be and the '
             'bottom small.')])

    ws.para([B('Read the ends carefully')])
    ws.para([T('Check what kind of number is allowed — integers, prime numbers — and check whether '
               'each end is included. An end written with '), M('<'), T(' or '), M('>'),
             T(' cannot be used, so step in to the nearest value the range does allow.')])

    mistakes(ws, [
        'Pairing the greatest with the greatest when the question asks for the greatest difference.',
        'Using an end value the range leaves out.',
        'Forgetting that the square of a negative number is positive.',
        'Taking the least product to be the product of the two least values.',
        'Giving a value that is not an integer when the question says the values are integers.',
    ])


def worked_b(ws, bank):
    ws.concept('Greatest and Least of a Combination')
    ws.example()
    ask(ws, bank[EX['greatest']])
    ws.solution_box([
        ('(a)', [
            [T('Write down what each letter can actually be. Both are integers, and the ends '),
             M('2'), T(' and '), M('0'), T(' are left out.')],
            r'x = -5,\ -4,\ -3,\ -2,\ -1,\ 0,\ 1 \qquad y = 1,\ 2,\ \ldots,\ 8',
            [T('A square is largest at the end furthest from zero.')],
            r'''\begin{aligned}
            \text{greatest } x^2 &= (-5)^2 = 25 \quad\text{← } -5 \text{ is further from } 0 \text{ than } 1 \\
            \text{greatest } y &= 8 \\
            \text{greatest } (x^2+y) &= 25+8 = 33
            \end{aligned}''',
        ]),
        ('(b)', [
            [T('Least means as far below zero as possible: make the top as negative as it goes, '
               'then divide by the smallest '), M('y'), T('.')],
            r'''\begin{aligned}
            \text{least } 2x &= 2(-5) = -10 \\
            \text{smallest } y &= 1 \\
            \text{least } \dfrac{2x}{y} &= \dfrac{-10}{1} = -10
            \end{aligned}''',
            ('check', [T('with '), M('y = 8'), T(' instead, '), M(r'\dfrac{-10}{8} = -1.25'),
                       T(', which is higher up.')]),
        ]),
    ], keep_together=False)

    ws.concept('Three Questions from One Pair of Ranges')
    ws.example()
    ask(ws, bank[EX['three_ways']])
    ws.solution_box([
        ('(a)', [
            [T('Both letters are integers, so '), M('m'), T(' runs from '), M('-8'), T(' to '),
             M('6'), T(', and '), M('n'), T(' runs from '), M('1'), T(' to '), M('5'), T('.')],
            r'''\begin{aligned}
            \text{least } (m+n) &= (-8) + 1 \\
            &= -7
            \end{aligned}''',
        ]),
        ('(b)', [
            [M('-mn'), T(' is greatest when '), M('mn'), T(' is as far below zero as it goes.')],
            r'''\begin{aligned}
            \text{least } mn &= (-8)(5) = -40 \\
            \text{greatest } (-mn) &= -(-40) = 40
            \end{aligned}''',
        ]),
        ('(c)', [
            [T('Take away as much as possible from as little as possible.')],
            r'''\begin{aligned}
            \text{least } m^2 &= 0^2 = 0 \quad\text{← } 0 \text{ lies inside } -8 \leq m < 7 \\
            \text{greatest } n^2 &= 5^2 = 25 \\
            \text{least } (m^2-n^2) &= 0 - 25 = -25
            \end{aligned}''',
        ]),
    ], keep_together=False)


# ---------------------------------------------------------------------------
# Section C -- forming an inequality
# ---------------------------------------------------------------------------
def notes_c(ws):
    ws.para([B('Notes')])

    ws.para([B('The words that become a sign')])
    ws.para([T('"at least", "a minimum of", "no less than"  '), M(r'\rightarrow \;\geq')])
    ws.para([T('"at most", "not more than", "a maximum of"  '), M(r'\rightarrow \;\leq')])
    ws.para([T('"more than", "exceeds"  '), M(r'\rightarrow \;>')])
    ws.para([T('"less than", "cheaper than", "fewer than"  '), M(r'\rightarrow \;<')])

    ws.para([B('Building the inequality')])
    ws.para([T('Name the unknown, write the quantity the question is about in terms of that letter '
               'one step at a time, then set it against the condition. Working down the story line '
               'by line is safer than trying to write the whole thing in one go.')])

    ws.para([B('Answer the question that was asked')])
    ws.para([T('The range is the middle of the work, not the end of it. The question usually asks '
               'for a number of months, people or items, so read that number off the range: the '
               'smallest value in '), M(r'x \geq 50'), T(' is 50.')])

    ws.para([B('What the situation allows')])
    ws.para([T('A count of people, months or items is a whole number and cannot be negative. If the '
               'range ends at '), M('7.14'), T(' and more is wanted, the answer is 8, not 7.')])

    mistakes(ws, [
        'Using $\\leq$ where the words say "less than".',
        'Leaving the answer as a range when one number was asked for.',
        'Rounding the ordinary way instead of the way the inequality points.',
        'Forgetting a fixed amount, such as a deposit, that is paid only once.',
    ])


def worked_c(ws, bank):
    ws.concept('Turning the Words Into an Inequality')
    ws.example()
    ask(ws, bank[EX['form']])
    ws.solution_box([
        ('(a)', [
            [T('Follow the money one step at a time, starting from '), M('x'), T('.')],
            [T('She gives half away, which leaves '), M(r'\dfrac{x}{2}'), T('.')],
            [T('She uses $150 and then receives $500 on pay day:')],
            r'\dfrac{x}{2} - 150 + 500',
            [T('She uses 20% of that, so 80% of it is left, and 80% is '), M('0.8'),
             T(' of the amount. What is left is not more than $800.')],
            r'\left[\left(\dfrac{x}{2} - 150\right) + 500\right] \times 0.8 \leq 800',
        ]),
        ('(b)', [
            r'''\begin{aligned}
            \left[\left(\dfrac{x}{2} - 150\right) + 500\right] \times 0.8 &\leq 800 \\
            \left(\dfrac{x}{2} + 350\right) \times 0.8 &\leq 800 \\
            \dfrac{x}{2} + 350 &\leq 1000 \quad\text{← both sides } \div\, 0.8 \text{, a positive number} \\
            \dfrac{x}{2} &\leq 650 \\
            x &\leq 1300
            \end{aligned}''',
            [T('The largest possible sum is the top end of the range.')],
            r'\text{largest possible value of } x = 1300',
            ('check', [T('starting with $1300: '), M(r'650 - 150 + 500 = 1000'),
                       T(', and '), M(r'1000 \times 0.8 = 800'), T('.')]),
        ]),
    ], keep_together=False)

    ws.concept('A Percentage Condition')
    ws.example()
    ask(ws, bank[EX['percent']])
    ws.solution_box([('', [
        [T('Let '), M('x'), T(' be the number of children Kyle recruits. The children become '),
         M('31+x'), T(', and the whole club becomes '), M('54+31+x'), T(', which is '),
         M('85+x'), T('.')],
        [T('"At least 60% of the members should be children" means the fraction of children is '
           '0.6 or more.')],
        r'''\begin{aligned}
        \dfrac{31+x}{85+x} &\geq 0.6 \\
        31+x &\geq 0.6(85+x) \quad\text{← both sides } \times (85+x)\text{, a positive number} \\
        31+x &\geq 51 + 0.6x \\
        0.4x &\geq 20 \\
        x &\geq 50
        \end{aligned}''',
        [T('The question asks for the smallest number he needs, which is the bottom end of the range.')],
        r'\text{smallest number of children} = 50',
        ('check', [M(r'\dfrac{31+50}{85+50} = \dfrac{81}{135} = 0.6'),
                   T(', exactly the share he is aiming for.')]),
    ])], keep_together=False)


# ---------------------------------------------------------------------------
def main():
    by_id, _ = fetch("EM", "Algebra (Inequalities)")
    print(f"pool: {len(by_id)} rows")
    bank = {}
    for short in EX.values():
        hit = [r for r in by_id.values() if r["id"].startswith(short)]
        if not hit:
            raise SystemExit(f"worked example {short} is not in the pool")
        bank[short] = hit[0]

    ws = sheet('O Level E Math Revision', 'Linear Inequalities')

    ws.section('Section A — Solving Linear Inequalities')
    notes_a(ws)
    worked_a(ws, bank)
    ws.para([B('Practice')])
    a = render_practice(ws, by_id, PRACTICE_A)

    ws.page_break()
    ws.section('Section B — The Greatest and Least Value of an Expression')
    notes_b(ws)
    worked_b(ws, bank)
    ws.para([B('Practice')])
    b = render_practice(ws, by_id, PRACTICE_B)

    ws.page_break()
    ws.section('Section C — Forming an Inequality from a Problem')
    notes_c(ws)
    worked_c(ws, bank)
    ws.para([B('Practice')])
    c = render_practice(ws, by_id, PRACTICE_C)

    # a run Word cannot keep whole has to break inside itself -- the page rule
    tall = [h for h in ws.glued_heights() if h > ws.PAGE_CM - 1.5]
    if tall:
        print(f"  !! runs too tall to keep on one page: {tall}")

    save(ws, "EM/S3 EM Revision Set", "REV 3 Linear Inequalities.docx")
    print(f"worked examples: 9    practice: A {a}/{len(PRACTICE_A)}  "
          f"B {b}/{len(PRACTICE_B)}  C {c}/{len(PRACTICE_C)}")


if __name__ == "__main__":
    main()
