#!/usr/bin/env python3
"""Build the AM Kinematics revision worksheet.

Shape follows Adrian's own 2026 O-Level revision sheets (12 Circles Revision,
21 Differentiation Revision):

    Title -> Notes: -> Examples (skill title, stem, Solution: with commentary)
          -> Practice (autonumbered, marks, [Ans: ...])

The worked solutions here were each recomputed with sympy in
verify_kinematics.py -- every intermediate line, not just the final answer.
Practice questions are pulled LIVE from the bank by id so the stems and answer
keys cannot drift from the database.
"""
import sys, os
from pathlib import Path

SKILL = Path.home()/"dev/adrianmathtuition-website/.claude/skills"
sys.path.insert(0, str(SKILL/"revision-worksheet"))
sys.path.insert(0, str(SKILL/"create-worksheet"))
import revision_lib as R                      # noqa: E402
from worksheet_lib import Worksheet           # noqa: E402

T = lambda s: ('text', s)                     # noqa: E731
B = lambda s: ('text', s, {'bold': True})     # noqa: E731
I = lambda s: ('text', s, {'italic': True})   # noqa: E731
M = lambda s: ('math', s)                     # noqa: E731

# Practice questions, in the order they should appear (easy -> hard by marks).
PRACTICE = [
    "c4e62693-c314-4942-bc49-59ce109334ac",   # Gan Eng Seng 2022, 4
    "44ce0473-8f90-484b-8d01-bca62ebb21da",   # Xinmin 2023, 5
    "6e879982-39d1-474b-8061-557bcdbb0912",   # Dunman 2025, 6
    "ca47913f-7896-4fef-ad2a-0d6e40a38f86",   # Singapore Sports School 2025, 7
    "967f46f4-f75f-4f82-a3d0-9e7c0f4c6a04",   # Xinmin 2021, 7
    "1ca6c680-a10d-4f9c-82a3-588567d97e27",   # Nan Chiau 2025, 7
    "5d4aa5b5-9230-46c7-9eaf-f437fd2b91b6",   # Zhenghua 2023, 7
    "02a2eb42-6ac7-43ad-8884-65cef49ffc30",   # Victoria 2022, 8
    "7df0b1fc-210b-4310-a316-5715f8cb0ece",   # Regent 2022, 8
    "d3cf141a-2517-4ef6-ab12-81d3b4ef7778",   # School of Science and Technology 2024, 8
    "df77238b-6686-467d-9817-57271c6e4c03",   # Anglican High 2024, 8
    "b59d8e98-9fe8-463b-a6ed-d64ddf91a9df",   # Catholic High 2025, 8
    "9c5ea94a-affa-4fd2-8c6d-191458164a02",   # Greendale 2024, 8
    "bc8d1bee-2a77-43d8-96a2-eee3c89d6eb4",   # St Gabriel 2024, 8
]


def notes(ws):
    ws.para([B('Notes:')])
    ws.para([B('The three quantities, and how they connect')])
    ws.para([T('Displacement '), M('s'), T(' is measured '), I('from the fixed point '),
             M('O'), T('. It carries a sign: a negative value means the particle is on the '
                       'other side of '), M('O'), T('.')])
    ws.para([T('Velocity '), M('v'), T(' is the rate of change of displacement. '
             'Its sign gives the direction of travel.')])
    ws.para([T('Acceleration '), M('a'), T(' is the rate of change of velocity.')])
    ws.math_block(r'v = \dfrac{ds}{dt} \qquad a = \dfrac{dv}{dt} = \dfrac{d^2s}{dt^2}')
    ws.para([T('Going the other way, integrate — and every integration needs a constant:')])
    ws.math_block(r's = \int v \, dt \qquad v = \int a \, dt')
    ws.para([B('The four conditions you are asked to translate')])
    ws.para([T('Instantaneously at rest, or changes direction: '), M('v = 0'), T('.')])
    ws.para([T('Maximum or minimum velocity: '), M('a = 0'),
             T('  (differentiate '), M('v'), T(' and set it to zero).')])
    ws.para([T('Back at '), M('O'), T(', or returns to its starting point: '), M('s = 0'), T('.')])
    ws.para([T('Starts from rest: '), M('v = 0'), T(' when '), M('t = 0'),
             T('.   Starts from '), M('O'), T(': '), M('s = 0'), T(' when '), M('t = 0'), T('.')])
    ws.para([B('Distance is not displacement')])
    ws.para([T('Displacement is the '), I('final position'), T(' relative to '), M('O'),
             T('. Distance is '), I('how far the particle actually travelled'), T('.')])
    ws.para([T('They differ the moment the particle turns round. To find total distance:')])
    ws.para([T('1.  Solve '), M('v = 0'), T(' to find every turning time inside the interval.')])
    ws.para([T('2.  Work out '), M('s'), T(' at both endpoints and at each of those times.')])
    ws.para([T('3.  Add the '), I('absolute'), T(' differences between consecutive values.')])
    ws.para([B('Speeding up or slowing down')])
    ws.para([T('The particle speeds up when '), M('v'), T(' and '), M('a'),
             T(' have the '), I('same'), T(' sign, and slows down when they have opposite signs. ')])
    ws.para([T('So '), M('a > 0'), T(' does '), I('not'), T(' mean speeding up.')])
    ws.para([B('Six mistakes to avoid')])
    for i, e in enumerate([
        'Giving displacement when the question asked for total distance.',
        'Forgetting the constant of integration.',
        'Assuming the initial condition is at $t = 0$. Sometimes you are given a value at another time.',
        'Confusing $v = 0$ (instantaneously at rest) with $s = 0$ (back at $O$).',
        'Assuming $a > 0$ means speeding up.',
        'Losing units, or mixing cm and m within one question.',
    ], 1):
        ws.para([T(f'{i}.  ')] + R.split_math(e))


def worked(ws):
    ws.page_break()
    ws.para([B('Examples')])

    # ---- 1 ---------------------------------------------------------------
    ws.para([B('Finding an Unknown Constant From a Stated Condition')])
    ws.para([T('A particle '), M('P'), T(' moves in a straight line so that, '), M('t'),
             T(' seconds after passing through a fixed point '), M('O'), T(', its velocity '),
             M('v'), T(' m/s is given by '), M('v = 3t^2 + kt + 18'), T(', where '), M('k'),
             T(' is a constant. When '), M('t = 1'), T(', the acceleration is '),
             M(r'-9\text{ m/s}^2'), T('.')])
    ws.para([T('(i)   Show that '), M('k = -15'), T('.')], marks=2)
    ws.para([T('(ii)  Find the values of '), M('t'),
             T(' when the particle is instantaneously at rest.')], marks=3)
    ws.para([T('(iii) Find the total distance travelled in the first 3 seconds.')], marks=3)
    ws.para([B('Solution:')])
    ws.para([T('(i)')])
    ws.para([T('The only condition given is about acceleration, so differentiate first.')])
    ws.math_block(r'a = \dfrac{dv}{dt} = 6t + k')
    ws.para([T('When '), M('t = 1'), T(', '), M('a = -9'), T(':')])
    ws.math_block(r'6(1) + k = -9 \quad\Rightarrow\quad k = -15 \text{ (shown)}')
    ws.para([T('(ii)')])
    ws.para([T('"Instantaneously at rest" is the instruction to set '), M('v = 0'), T('.')])
    ws.math_block(r'3t^2 - 15t + 18 = 0')
    ws.math_block(r't^2 - 5t + 6 = 0 \quad\Rightarrow\quad (t-2)(t-3) = 0')
    ws.math_block(r't = 2 \quad\text{or}\quad t = 3')
    ws.para([T('(iii)')])
    ws.para([T('Two rest times inside the interval means the particle turns round twice, '
               'so distance and displacement are not the same. Integrate to get '), M('s'),
             T(', then check the position at every turning point.')])
    ws.math_block(r's = \int (3t^2 - 15t + 18)\, dt = t^3 - \tfrac{15}{2}t^2 + 18t + C')
    ws.para([T('It starts at '), M('O'), T(', so '), M('s = 0'), T(' when '), M('t = 0'),
             T(', giving '), M('C = 0'), T('.')])
    ws.math_block(r's(0) = 0 \qquad s(2) = 14 \qquad s(3) = 13.5')
    ws.para([T('The particle runs forward to '), M(r's = 14'),
             T(' m, then reverses to '), M('s = 13.5'), T(' m.')])
    ws.math_block(r'\text{Distance} = 14 + |13.5 - 14| = 14.5 \text{ m}')

    # ---- 2 ---------------------------------------------------------------
    ws.para([B('Working Backwards From Acceleration: the Constant of Integration')])
    ws.para([T('A particle travels in a straight line so that '), M('t'),
             T(' seconds after passing a fixed point '), M('O'), T(' with a velocity of '),
             M(r'15\text{ cm s}^{-1}'), T(', its acceleration '), M(r'a\text{ cm s}^{-2}'),
             T(' is given by '), M('a = k - 2t'), T(', where '), M('k'),
             T(' is a constant. The particle reaches maximum velocity in 1 second.')])
    ws.para([T('(i)   Find the value of '), M('k'), T('.')], marks=2)
    ws.para([T('(ii)  Express '), M('v'), T(' in terms of '), M('t'), T('.')], marks=3)
    ws.para([T('(iii) Find the distance travelled in the first 10 seconds.')], marks=3)
    ws.para([B('Solution:')])
    ws.para([T('(i)')])
    ws.para([T('Maximum velocity is an '), I('acceleration'), T(' condition: '), M('a = 0'), T('.')])
    ws.math_block(r'0 = k - 2(1) \quad\Rightarrow\quad k = 2')
    ws.para([T('(ii)')])
    ws.para([T('Integrate '), M('a'), T(' to reach '), M('v'),
             T(' — and write the constant down immediately, before you forget it.')])
    ws.math_block(r'v = \int (2 - 2t)\, dt = 2t - t^2 + c')
    ws.para([T('The initial velocity is given: '), M('v = 15'), T(' when '), M('t = 0'),
             T(', so '), M('c = 15'), T('.')])
    ws.math_block(r'v = -t^2 + 2t + 15')
    ws.para([T('(iii)')])
    ws.para([T('Distance, not displacement — so find where it turns. Solve '), M('v = 0'), T(':')])
    ws.math_block(r'-t^2 + 2t + 15 = 0 \quad\Rightarrow\quad (t - 5)(t + 3) = 0')
    ws.para([T('so '), M('t = 5'), T('  ('), M('t = -3'), T(' is rejected: time cannot be negative).')])
    ws.math_block(r's = \int v\, dt = -\tfrac{1}{3}t^3 + t^2 + 15t \qquad (d = 0 \text{ since } s = 0 \text{ at } t = 0)')
    ws.math_block(r's(0) = 0 \qquad s(5) = \tfrac{175}{3} \qquad s(10) = -\tfrac{250}{3}')
    ws.para([T('The particle goes out to '), M(r'\tfrac{175}{3}'),
             T(' cm, turns, and comes back past '), M('O'), T('.')])
    ws.math_block(r'\text{Distance} = \tfrac{175}{3} + \left|-\tfrac{250}{3} - \tfrac{175}{3}\right| = \tfrac{175}{3} + \tfrac{425}{3} = 200 \text{ cm}')

    # ---- 3 ---------------------------------------------------------------
    ws.page_break()
    ws.para([B('Total Distance When the Particle Turns Round Twice')])
    ws.para([T('A particle moves in a straight line so that '), M('t'),
             T(' seconds after leaving a fixed point '), M('O'), T(', its velocity '), M('v'),
             T(' m/s is given by '), M('v = 3t^2 - 23t + 30'), T('.')])
    ws.para([T('(a) Find the values of '), M('t'),
             T(' when the particle is instantaneously at rest.')], marks=2)
    ws.para([T('(b) Find the distance travelled in the first 7 seconds.')], marks=4)
    ws.para([T('(c) Find the minimum velocity.')], marks=2)
    ws.para([B('Solution:')])
    ws.para([T('(a)')])
    ws.math_block(r'3t^2 - 23t + 30 = 0 \quad\Rightarrow\quad (3t - 5)(t - 6) = 0')
    ws.math_block(r't = \tfrac{5}{3} \quad\text{or}\quad t = 6')
    ws.para([T('(b)')])
    ws.para([T('Both rest times lie inside the 7 seconds, so the journey has three legs. '
               'Find '), M('s'), T(' at every one of the four times.')])
    ws.math_block(r's = \int (3t^2 - 23t + 30)\, dt = t^3 - \tfrac{23}{2}t^2 + 30t \qquad (C = 0)')
    ws.math_block(r's\!\left(\tfrac{5}{3}\right) = \tfrac{1225}{54} \qquad s(6) = -18 \qquad s(7) = -\tfrac{21}{2}')
    ws.para([T('Add the three absolute changes — out, back past '), M('O'), T(', then forward again:')])
    ws.math_block(r'\text{Distance} = \tfrac{1225}{54} + \left(18 + \tfrac{1225}{54}\right) + 7.5 = 70\tfrac{47}{54} \approx 70.9 \text{ m}')
    ws.para([T('(c)')])
    ws.para([T('Minimum velocity is where '), M('a = 0'), T('.')])
    ws.math_block(r'\dfrac{dv}{dt} = 6t - 23 = 0 \quad\Rightarrow\quad t = \tfrac{23}{6}')
    ws.math_block(r'v = 3\left(\tfrac{23}{6}\right)^2 - 23\left(\tfrac{23}{6}\right) + 30 = -\tfrac{169}{12} \text{ m/s}')
    ws.para([T('Keep the minus sign. The question asked for the minimum '), I('velocity'),
             T(', not the maximum speed.')])

    # ---- 4 ---------------------------------------------------------------
    ws.para([B('When the Displacement Function Is the One You Are Given')])
    ws.para([T('A particle moving in a straight line is such that its displacement, '),
             M('s'), T(' metres, from a fixed point '), M('O'), T(', is given by '),
             M('s = 4 - 2e^{-t} - t'), T(', where '), M('t'),
             T(' is the time in seconds after passing through a point '), M('B'),
             T(' on the line.')])
    ws.para([T('(a) Find the distance '), M('OB'), T('.')], marks=1)
    ws.para([T('(b) Find the initial velocity of the particle.')], marks=2)
    ws.para([T('(c) Find the value of '), M('t'),
             T(' when the particle is instantaneously at rest.')], marks=2)
    ws.para([T('(d) Find the total distance travelled in the first two seconds.')], marks=3)
    ws.para([B('Solution:')])
    ws.para([T('(a)')])
    ws.para([T('You are given '), M('s'), T(' directly, so differentiate rather than integrate. '),
             M('B'), T(' is where the particle is at '), M('t = 0'), T('.')])
    ws.math_block(r's(0) = 4 - 2e^{0} - 0 = 2 \quad\Rightarrow\quad OB = 2 \text{ m}')
    ws.para([T('(b)')])
    ws.math_block(r'v = \dfrac{ds}{dt} = 2e^{-t} - 1 \qquad v(0) = 2 - 1 = 1 \text{ m/s}')
    ws.para([T('(c)')])
    ws.math_block(r'2e^{-t} - 1 = 0 \quad\Rightarrow\quad e^{-t} = \tfrac{1}{2} \quad\Rightarrow\quad t = \ln 2 = 0.693 \text{ (3 s.f.)}')
    ws.para([T('(d)')])
    ws.para([T('It turns once, at '), M(r't = \ln 2'),
             T('. Use the '), M('s'), T(' you were given — there is nothing to integrate here.')])
    ws.math_block(r's(0) = 2 \qquad s(\ln 2) = 2.30685 \qquad s(2) = 1.72933')
    ws.math_block(r'\text{Distance} = (2.30685 - 2) + (2.30685 - 1.72933) = 0.884 \text{ m (3 s.f.)}')

    # ---- 5 ---------------------------------------------------------------
    ws.page_break()
    ws.para([B('Trigonometric Velocity: Reading the First Rest Time')])
    ws.para([T('A particle moves in a straight line so that '), M('t'),
             T(' seconds after passing through a fixed point '), M('O'), T(', its velocity '),
             M('v'), T(' m/s is given by '), M(r'v = 5\cos\left(\dfrac{t}{2}\right)'), T('. Find')])
    ws.para([T('(a) the initial velocity of the particle,')], marks=1)
    ws.para([T('(b) the value of '), M('t'), T(', in terms of '), M(r'\pi'),
             T(', when the particle first comes to instantaneous rest,')], marks=3)
    ws.para([T('(c) the distance travelled in the first 5 seconds.')], marks=4)
    ws.para([B('Solution:')])
    ws.para([T('(a)')])
    ws.math_block(r'v(0) = 5\cos 0 = 5 \text{ m/s}')
    ws.para([T('(b)')])
    ws.para([T('Set '), M('v = 0'), T(' and take the '), I('first'), T(' solution.')])
    ws.math_block(r'\cos\left(\dfrac{t}{2}\right) = 0 \quad\Rightarrow\quad \dfrac{t}{2} = \dfrac{\pi}{2} \quad\Rightarrow\quad t = \pi \text{ s}')
    ws.para([T('(c)')])
    ws.para([T('Since '), M(r't = \pi \approx 3.14'), T(' is inside the 5 seconds, the particle '
               'turns during the interval. Integrate, then split at '), M(r't = \pi'), T('.')])
    ws.math_block(r's = \int 5\cos\left(\dfrac{t}{2}\right) dt = 10\sin\left(\dfrac{t}{2}\right) + c, \qquad c = 0')
    ws.math_block(r's(\pi) = 10 \qquad s(5) = 10\sin(2.5) = 5.984')
    ws.math_block(r'\text{Distance} = 10 + (10 - 5.984) = 14.0 \text{ m (3 s.f.)}')
    ws.para([T('Work in radians throughout.')])

    # ---- 6 ---------------------------------------------------------------
    ws.para([B('Exponential Velocity and the Limiting Value')])
    ws.para([T('A particle moves in a straight line so that, '), M('t'),
             T(' seconds after leaving a fixed point '), M('O'), T(', its velocity '),
             M(r'v\text{ ms}^{-1}'), T(' is given by '), M(r'v = 10\left(3 - e^{-\frac{t}{2}}\right)'), T('.')])
    ws.para([T('(i)   Find the acceleration of the particle when '), M('v = 23'), T('.')], marks=3)
    ws.para([T('(ii)  Calculate, to the nearest metre, the displacement from '), M('O'),
             T(' when '), M('t = 5'), T('.')], marks=3)
    ws.para([T('(iii) State the value which '), M('v'),
             T(' approaches as '), M('t'), T(' becomes very large.')], marks=1)
    ws.para([B('Solution:')])
    ws.para([T('(i)')])
    ws.para([T('You are not given '), M('t'), T(', so use the '), M('v'),
             T(' condition to find the value of '), M(r'e^{-t/2}'),
             T(' and substitute that — there is no need to find '), M('t'), T(' itself.')])
    ws.math_block(r'a = \dfrac{dv}{dt} = 5e^{-\frac{t}{2}}')
    ws.math_block(r'10\left(3 - e^{-\frac{t}{2}}\right) = 23 \quad\Rightarrow\quad e^{-\frac{t}{2}} = 0.7')
    ws.math_block(r'a = 5(0.7) = 3.5 \text{ ms}^{-2}')
    ws.para([T('(ii)')])
    ws.para([T('Displacement, not distance — and '), M('v > 0'),
             T(' throughout, so the particle never turns. A single definite integral is enough.')])
    ws.math_block(r's = \int_0^5 10\left(3 - e^{-\frac{t}{2}}\right) dt = 10\left[3t + 2e^{-\frac{t}{2}}\right]_0^5 = 131.6 \approx 132 \text{ m}')
    ws.para([T('(iii)')])
    ws.para([T('As '), M(r't \to \infty'), T(', '), M(r'e^{-t/2} \to 0'), T('.')])
    ws.math_block(r'v \to 10(3 - 0) = 30 \text{ ms}^{-1}')


def practice(ws, rows):
    ws.page_break()
    ws.para([B('Practice')])
    ws.para([I('Answers are at the end of each question. Show all working.')])
    by_id = {r["id"]: r for r in rows}
    n = 0
    for qid in PRACTICE:
        r = by_id.get(qid)
        if r is None:
            print(f"  !! missing from pool: {qid}")
            continue
        n += 1
        parts = r.get("parts") or []
        stem = (r.get("question_text") or "").strip()
        ws.Q(R.split_math(stem), marks=None if parts else r.get("total_marks"))
        if isinstance(parts, list):
            for p in parts:
                if not isinstance(p, dict):
                    continue
                ws.SQ(R.split_math((p.get("text") or "").strip()), marks=p.get("marks"))
        ws.ans(R.split_math((r.get("answer") or "").strip()))
    return n


def main():
    env = R.load_env()
    rows = R.fetch_pool(env, "AM", "Kinematics", figures=False)
    print(f"pool: {len(rows)} Kinematics rows (text-only)")

    ws = Worksheet()
    ws.title('Sec 4 Additional Math Revision')
    ws.subtitle('Kinematics')
    notes(ws)
    worked(ws)
    n = practice(ws, rows)

    out = Path.home()/"Library/CloudStorage/Dropbox/Apps/AdrianMathNotes/Revision/AM/30 Kinematics Revision (S4).docx"
    ws.save(str(out))
    print(f"worked examples: 6")
    print(f"practice questions: {n}/{len(PRACTICE)}")
    print(f"saved: {out}")


if __name__ == "__main__":
    main()
