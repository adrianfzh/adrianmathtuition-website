"""A Math · Trigonometric Graphs — Add a Line to Solve an Equation.
Adrian, 10 Oct 2026: "4 trigo questions involving graphs, just the part where you need to add
an additional line to your graph to solve an equation. give two standard ones and two
question where tougher manipulation is required". Four real school questions from the bank —
only the sketch part and the add-a-line part of each (re-lettered (a)(b)); the source never
prints. The counts were checked by computer (sign changes of curve minus line on a fine grid).

  1 ACS (Barker Road) 2025 P2 Q5 (b)(c) 14f9fdb4    line y = x/pi - 2, 2 solutions
  2 Geylang Methodist 2025 P1 Q10 (d)(e) 5c312663   line y = 4x/pi - 6, 2 solutions
  3 School of Science and Technology 2024 P1 Q6 (iii)(v) 22a714c1   line y = 2 - x/60, THREE solutions
    (x = 32.2, 92.6, 143.2; the bank key says 2 — wrong). The bank's part (iv) text is not
    stored, so (b) here carries the usual "by drawing a suitable straight line" wording.
  4 Dunman 2026 P1 Q9 (b)(c) 48bce04b               line y = 4x/pi + 4, touches the curve at its maximum (3pi/4, 7)
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / '.claude/skills/create-worksheet'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from worksheet_lib import Worksheet
from practice_extras import P, eqs

ws = Worksheet()
ws.title('Trigonometric Graphs — Add a Line to Solve an Equation')
ws.subtitle('Additional Mathematics · Practice')
SQ = lambda s, marks=None: ws.SQ(P(s), marks=marks)
A = lambda s: ws.ans(P(s))
E_ = lambda latex, marks=None: eqs(ws, [latex], marks, 2.6)

ws.section('Section A — Standard')
ws.Q([])
SQ('Sketch the graph below for $0 \\leq x \\leq 4\\pi$.'); E_(r'y = 3\cos\left(\dfrac{x}{2}\right) + 1', 3)
SQ('By drawing a suitable straight line on your sketch in part (a), determine the number of solutions of the equation below for $0 \\leq x \\leq 4\\pi$.')
E_(r'\cos\left(\dfrac{x}{2}\right) + 1 = \dfrac{x}{3\pi}', 3)
A(r'(a) sketch; (b) line $y = \dfrac{x}{\pi} - 2$, 2 solutions')

ws.Q([])
SQ('Sketch the graph of $y = 4\\cos 2x - 2$ for $0 \\leq x \\leq \\pi$.', 2)
SQ('By drawing a suitable straight line on your sketch, determine the number of solutions of the equation')
E_(r'\cos 2x = \dfrac{x}{\pi} - 1', 2)
A(r'(a) sketch; (b) line $y = \dfrac{4x}{\pi} - 6$, 2 solutions')

ws.section('Section B — Tougher manipulation')
ws.Q([])
SQ('Sketch the graph of $y = 1 - 4\\cos 3x$ for $0^\\circ \\leq x \\leq 180^\\circ$.', 2)
SQ('By drawing a suitable straight line on your sketch, state the number of solutions, for $0^\\circ \\leq x \\leq 180^\\circ$, '
   'of the equation $x - 240\\cos 3x = 60$.', 2)
A(r'(a) sketch; (b) line $y = 2 - \dfrac{x}{60}$, 3 solutions')

ws.Q([])
SQ('Sketch the graph of $y = 4 - 3\\sin 2x$ for $0 \\leq x \\leq \\pi$ radians.', 3)
SQ('By drawing a suitable straight line in your sketch, explain why the equation $3\\pi\\sin 2x = -4x$ has no solution for the values of $x$ below.')
E_(r'x > \dfrac{3\pi}{4}', 3)
A(r'(a) sketch; (b) line $y = \dfrac{4x}{\pi} + 4$ touches the curve at its top $\left(\dfrac{3\pi}{4}, 7\right)$, then stays above')

ws.save(sys.argv[1], strict_maths=True)
