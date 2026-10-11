"""A Math · Integration Techniques — from the basics up.
Adrian, 11 Oct 2026: "i need a practice worksheet on integration questions involving
differentiation integration techniques > basically student is weak at integration
techniques". Twenty short real school questions from the bank, one technique at a time,
easiest first (part labels re-lettered; the source never prints).
Answers: verify_integration_techniques.py.

  1 Yishun Town 2023 P2 Q1 4315b584        2 St Joseph's Institution 2025 P1 Q2 df70909f
    (the bank key prints +25/(4x); the integral of 25/(4x^2) is -25/(4x) — corrected here)
  3 Pierce 2022 P1 Q4 e013f6ec             4 Dunearn 2021 P1 Q3 182081cb
  5 CHIJ St Theresa 2023 P1 Q2 40f83a4b    6 St Gabriel 2025 P1 Q4 c650bd47
  7 Nan Chiau 2021 P1 Q5(b) 3eacf679       8 Presbyterian High 2022 P1 Q4 e27777d3
  9 Catholic High 2022 P1 Q4(a) 77c58596  10 Anglican High 2024 P2 Q9 (b)(c) dfdd7dc5
 11 Crescent Girls 2024 P1 Q3 61220fc7    12 Crescent Girls 2022 P1 Q2 20318826
 13 Nan Chiau 2021 P1 Q5(a) 3eacf679      14 Juying 2024 P2 Q8 c14d5ef5
 15 Woodgrove 2021 P2 Q6(a) 652a1013      16 North Vista 2022 P2 Q1(a) 22b32ac5
 17 Greendale 2023 P1 Q4 b46ac4f6         18 St Joseph 2023 P1 Q13 77ebce7c
 19 Nan Chiau 2021 P1 Q11(a) 586b06eb     20 Bedok Green 2025 P1 Q7 8bfc4bba
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / '.claude/skills/create-worksheet'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from worksheet_lib import Worksheet
from practice_extras import P, eqs

ws = Worksheet()
ws.title('Integration Techniques — From the Basics Up')
ws.subtitle('Additional Mathematics · Practice')
Q = lambda s, marks=None: ws.Q(P(s), marks=marks)
SQ = lambda s, marks=None: ws.SQ(P(s), marks=marks)
A = lambda s: ws.ans(P(s))
E_ = lambda latex, marks=None, indent=1.6: eqs(ws, [latex], marks, indent)
WRT = 'Integrate the following with respect to $x$.'


def integrate(latex, marks, ans, stem=WRT):
    Q(stem); E_(latex, marks); A(ans)


ws.section('Section A — Powers: expand or divide first')
Q('Integrate with respect to $x$')
SQ('$(x^2 - 1)^2$,', 2)
SQ('the expression below.'); E_(r'\dfrac{x^3 - x^2}{2x}', 2, 2.6)
A(r'(a) $\dfrac{x^5}{5} - \dfrac{2x^3}{3} + x + c$; (b) $\dfrac{x^3}{6} - \dfrac{x^2}{4} + c$')

integrate(r'\left(x - \dfrac{5}{2x}\right)^2', 3, r'$\dfrac{x^3}{3} - 5x - \dfrac{25}{4x} + c$')

ws.section('Section B — Powers of a bracket, and integrals that give ln')
integrate(r'\dfrac{2}{3}(4x + 3)^3 + \dfrac{4}{x^2}', 3, r'$\dfrac{1}{24}(4x + 3)^4 - \dfrac{4}{x} + c$')

integrate(r'(7 - 4x)^{-\frac{3}{2}}', 3, r'$\dfrac{1}{2\sqrt{7 - 4x}} + c$')

integrate(r'\dfrac{5}{3x + 1} - \dfrac{4}{(1 - x)^2}', 4, r'$\dfrac{5}{3}\ln(3x + 1) - \dfrac{4}{1 - x} + c$')

integrate(r'\dfrac{(2x - 3)^3 + 5}{2x - 3}', 4, r'$\dfrac{1}{6}(2x - 3)^3 + \dfrac{5}{2}\ln(2x - 3) + c$')

integrate(r'\dfrac{2 - 3x}{5 - 3x}', 3, r'$x + \ln(5 - 3x) + c$')

ws.section('Section C — Exponentials and trigonometric functions')
integrate(r'\dfrac{4}{2 - 5x} + \dfrac{2}{x^3} + e^{4x}', 4, r'$-\dfrac{4}{5}\ln(2 - 5x) - \dfrac{1}{x^2} + \dfrac{1}{4}e^{4x} + c$')

integrate(r'e^{-\frac{1}{2}x} + \sin 3x', 2, r'$-2e^{-\frac{1}{2}x} - \dfrac{1}{3}\cos 3x + c$')

ws.Q([])
SQ(r'Integrate $1 - \sin 2x + \tan^2 x$ with respect to $x$.', 3)
SQ('Find'); E_(r'\int \dfrac{3}{4e^{3x - 6}}\,dx', 2, 2.6)
A(r'(a) $\dfrac{1}{2}\cos 2x + \tan x + c$; (b) $-\dfrac{1}{4e^{3x - 6}} + c$')

integrate(r'\dfrac{2}{\cos^2(3x - 1)} - \sin\dfrac{1}{4}x', 3, r'$\dfrac{2}{3}\tan(3x - 1) + 4\cos\dfrac{1}{4}x + c$')

ws.section('Section D — Trigonometry: use an identity first')
integrate(r'\sin^2 x + \dfrac{1}{x}', 3, r'$\dfrac{1}{2}x - \dfrac{1}{4}\sin 2x + \ln x + c$')

integrate(r'\dfrac{1}{3}\tan^2\left(\dfrac{2}{5}x\right)', 2, r'$\dfrac{5}{6}\tan\left(\dfrac{2}{5}x\right) - \dfrac{1}{3}x + c$')

integrate(r'\int_0^{\frac{\pi}{3}} \left(\dfrac{1}{2}\sin 3x - \cos^2 x\right) dx', 4, '$-0.41$',
          stem='Evaluate the integral below, correct to 2 decimal places.')

ws.section('Section E — Definite integrals and unknown limits')
integrate(r'\int_{-1}^{1} \dfrac{2}{\sqrt{5 - 3x}}\,dx', 3, r'$\dfrac{4\sqrt{2}}{3}$ or $1.89$', stem='Evaluate')

integrate(r'\int_p^{14} \dfrac{3}{2y - 5}\,dy = \ln 27', 4, r'$p = \dfrac{34}{9}$',
          stem='Given the result below, find the exact value of $p$.')

integrate(r'\int_n^8 \dfrac{x - 5}{x^2 - 2x - 15}\,dx = \ln\dfrac{33}{13}', 4, r'$n = \dfrac{4}{3}$',
          stem='Given the result below, find the value of $n$.')

ws.section('Section F — Partial fractions, and using a derivative to integrate')
ws.Q([])
SQ('Express the following in partial fractions.'); E_(r'\dfrac{5x^4 + 10x^2 + 3}{x(x^2 + 3)}', 5, 2.6)
SQ(r'Differentiate $\ln(x^2 + 3)$ with respect to $x$.', 1)
SQ('Using the results of parts (a) and (b), determine'); E_(r'\int \dfrac{5x^4 + 10x^2 + 3}{2x(x^2 + 3)}\,dx', 4, 2.6)
A(r'(a) $5x + \dfrac{1}{x} - \dfrac{6x}{x^2 + 3}$; (b) $\dfrac{2x}{x^2 + 3}$; (c) $\dfrac{5x^2}{4} + \dfrac{1}{2}\ln x - \dfrac{3}{2}\ln(x^2 + 3) + c$')

Q('Given the result below, find the value of $f$ at the given value of $x$.')
eqs(ws, [r'\int e^{-2x}f(x)\,dx = e^{-2x}\sin 4x + c', r'x = \dfrac{\pi}{4}'], 4)
A(r'$f\left(\dfrac{\pi}{4}\right) = -4$')

ws.Q([])
SQ('Find'); E_(r'\dfrac{d}{dx}\left(xe^{0.4x - 5}\right)', 1, 2.6)
SQ('Find the range of $x$ such that $f(x) = xe^{0.4x - 5}$ is always a decreasing function.', 2)
SQ('Use your answer to part (a) to find'); E_(r'\int xe^{0.4x - 5}\,dx', 3, 2.6)
A(r'(a) $e^{0.4x - 5}(0.4x + 1)$; (b) $x < -2.5$; (c) $\dfrac{5}{2}xe^{0.4x - 5} - \dfrac{25}{4}e^{0.4x - 5} + c$')

ws.save(sys.argv[1], strict_maths=True)
