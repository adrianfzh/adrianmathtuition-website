"""A Math · Differentiation and Integration — Every Type (with Kinematics).
Adrian, 10 Oct 2026: "practice worksheet on differentiation and logarithms (particularly
those involving different differentiation and integration + include kinematics) - make it a
worksheet that helps improve the different kinds of differentiation and integration (also
include hard questions)". Every question is a real school question from the bank (the
parts named, word for word; part labels re-lettered (a)(b)(c)); the source never prints.
Answers: verify_calculus_every_type.py.

  1 DHS 2023 P2 Q4 (b)(e)(f) 07b855cc      2 RI 2022 P1 Q27 090603a8     3 RI 2022 P1 Q18 11b008f7
  4 DHS 2023 P3 Q5 24af593f                5 Montfort 2023 P2 Q1 1748a8a1
  6 Victoria 2022 P1 Q4 0635027d           7 Ahmad Ibrahim 2023 P2 Q6(b) 74f0559b
  8 Mayflower 2023 P1 Q8(c) d9d12fe7       9 Greendale 2025 P1 Q4 011d50c9
 10 Nan Hua 2025 P2 Q7 1480b85f           11 St Joseph 2023 P1 Q13 77ebce7c
 12 Orchid Park 2024 P2 Q5 4114fb71       13 Ahmad Ibrahim 2023 P2 Q10 47dec294
 14 Xinmin 2024 P1 Q14 21317103           15 Ahmad Ibrahim 2024 P2 Q7 caa34abb
 16 Nan Chiau 2024 P1 Q7 1dcb6b6d         17 Nan Chiau 2024 P2 Q2 a7848e5c (bank key stops at "+ c"; c = 4)
 18 Anderson 2024 P2 Q4 1171c2ac          19 Boon Lay 2025 P2 Q9 a4a5beed
 20 Yishun Town 2024 P2 Q8 2f533dd6
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / '.claude/skills/create-worksheet'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from worksheet_lib import Worksheet
from practice_extras import P, eqs
from docx.shared import Cm

ws = Worksheet()
ws.title('Differentiation and Integration — Every Type (with Kinematics)')
ws.subtitle('Additional Mathematics · Practice')
Q = lambda s, marks=None: ws.Q(P(s), marks=marks)
SQ = lambda s, marks=None: ws.SQ(P(s), marks=marks)
A = lambda s: ws.ans(P(s))
E_ = lambda lines, marks=None, indent=1.6: eqs(ws, lines if isinstance(lines, list) else [lines], marks, indent)
ms2 = r'\text{ m/s}^2'

ws.section('Section A — Differentiation: chain, product, quotient, trigonometry, e and ln')
Q('Differentiate the following with respect to $x$.')
SQ('$(2x^2 - 3x + 1)^5$', 2)
SQ(r'$(2x + 3)^2\sqrt{1 - 4x}$', 3)
SQ('$y$, where'); E_(r'y = \dfrac{x - 2}{\sqrt{1 - 2x}}', 3, 2.6)
A(r'(a) $5(4x - 3)(2x^2 - 3x + 1)^4$; (b) $-\dfrac{2(2x + 3)(10x + 1)}{\sqrt{1 - 4x}}$; (c) $-\dfrac{x + 1}{(1 - 2x)^{3/2}}$')

Q('Differentiate each of the following with respect to $x$, simplifying your answers as far as possible.')
SQ(r'$\sqrt{2 - 3\cos^2 4x}$', 2)
SQ(r'$2x^3\tan 6x$', 2)
A(r'(a) $\dfrac{6\sin 8x}{\sqrt{2 - 3\cos^2 4x}}$; (b) $6x^2(\tan 6x + 2x\sec^2 6x)$')

Q('Differentiate the following expressions with respect to $x$, giving your answers in the simplest form possible.')
SQ(r'$e^{3x}\tan 2x$', 2)
SQ('$y$, where'); E_(r'y = \dfrac{\sin 3x}{3x}', 2, 2.6)
A(r'(a) $e^{3x}(3\tan 2x + 2\sec^2 2x)$; (b) $\dfrac{3x\cos 3x - \sin 3x}{3x^2}$')

Q('A curve has the equation')
E_(r'y = \ln\sqrt{\dfrac{5 + 3x}{2x - 5}}')
SQ('Find the gradient of the curve at the point where the curve meets the $x$-axis.', 4)
SQ('Show that the curve has no stationary point for all real values of $x$.', 2)
A(r'(a) $-\dfrac{1}{50}$; (b) shown')

Q('It is given that $y = 7x^3e^{-2x}$.')
SQ(r'Find $\dfrac{dy}{dx}$.', 2)
SQ('Show that the expression below equals $qx$, where $p$ and $q$ are constants to be determined.')
E_(r'e^{2x}\left(p\dfrac{dy}{dx} + \dfrac{d^2y}{dx^2} + 4y\right)', 5, 2.6)
A('(a) $7x^2e^{-2x}(3 - 2x)$; (b) $p = 4$, $q = 42$')

ws.section('Section B — Integration: powers, ln, e, trigonometry, "hence", partial fractions')
Q('Integrate the following with respect to $x$.')
E_(r'3\sqrt{4 + 5x} + \dfrac{2}{x^3} + \dfrac{6}{7x - 1}', 4)
A(r'$\dfrac{2}{5}(4 + 5x)^{3/2} - \dfrac{1}{x^2} + \dfrac{6}{7}\ln(7x - 1) + c$')

Q('Evaluate the integral below exactly.')
E_(r'\int_0^{\frac{\pi}{12}} \left(3\cos^2 x - \sin^2 x\right) dx', 4)
A(r'$\dfrac{6 + \pi}{12}$')

Q('Evaluate')
E_(r'\int_{\frac{\pi}{4}}^{\pi} \left(5\sin 2x + \sec^2\dfrac{1}{3}x\right) dx', 4)
A('$1.89$')

ws.Q([])
SQ('Find'); E_(r'\dfrac{d}{dx}\left(\dfrac{\ln x}{x^2}\right)', 3, 2.6)
SQ('Hence, find'); E_(r'\int \dfrac{\ln x}{x^3}\,dx', 4, 2.6)
A(r'(a) $\dfrac{1 - 2\ln x}{x^3}$; (b) $-\dfrac{\ln x}{2x^2} - \dfrac{1}{4x^2} + c$')

ws.Q([])
SQ('Show that'); E_(r'\dfrac{d}{dx}\left[e^{3x}(2x - 5)\right] = e^{3x}(6x - 13)', 2, 2.6)
SQ('Hence find the value of each of the constants $a$ and $b$ for which')
E_(r'\int_0^4 xe^{3x}\,dx = ae^{12} + b', 5, 2.6)
A(r'(a) shown; (b) $a = \dfrac{11}{9}$, $b = \dfrac{1}{9}$')

ws.Q([])
SQ('Express the following in partial fractions.')
E_(r'\dfrac{5x^4 + 10x^2 + 3}{x(x^2 + 3)}', 5, 2.6)
SQ(r'Differentiate $\ln(x^2 + 3)$ with respect to $x$.', 1)
SQ('Using the results of parts (a) and (b), determine')
E_(r'\int \dfrac{5x^4 + 10x^2 + 3}{2x(x^2 + 3)}\,dx', 4, 2.6)
A(r'(a) $5x + \dfrac{1}{x} - \dfrac{6x}{x^2 + 3}$; (b) $\dfrac{2x}{x^2 + 3}$; (c) $\dfrac{5x^2}{4} + \dfrac{1}{2}\ln x - \dfrac{3}{2}\ln(x^2 + 3) + c$')

ws.section('Section C — Kinematics')
Q('A particle moving in a straight line is such that its displacement, $s$ metres, from a fixed point $O$, is given by '
  '$s = 4 - 2e^{-t} - t$ where $t$ is the time in seconds after passing through a point $B$ on the line.')
SQ('Find the distance $OB$.', 1)
SQ('Find the initial velocity of the particle.', 2)
SQ('Find the value of $t$ when the particle is instantaneously at rest.', 2)
SQ('Find the total distance travelled by the particle in the first two seconds.', 3)
A(r'(a) $2$ m; (b) $1$ m/s; (c) $t = \ln 2$; (d) $0.884$ m')

Q('A particle travelling in a straight line passes through a fixed point $O$ with a speed of 8 m/s. '
  r'The acceleration, $a\text{ m/s}^2$, of the particle $t$ s after passing through $O$, is given by $a = -e^{-0.1t}$. '
  'The particle comes to instantaneous rest at the point $P$.')
SQ(r'Show that the particle reaches $P$ when $t = 10\ln 5$.', 5)
SQ('Calculate the distance $OP$.', 3)
SQ('Explain why the particle is again at $O$ at some instant during the fiftieth second after first passing through $O$.', 3)
A('(a) shown; (b) $47.8$ m; (c) $s = 1.26$ m at $t = 49$, $s = -0.674$ m at $t = 50$')

Q('A particle travelling in a straight line, has a velocity, $v$ m/s, at time $t$ seconds, $t \\geq 0$, given by')
E_(r'v = 3\sin 2t - 4\cos 2t')
SQ('Find the initial acceleration of the particle.', 2)
SQ('Find the total distance travelled by the particle in the first 1.5 seconds.', 8)
A('(a) $6' + ms2 + '$; (b) $4.70$ m')

Q('A particle moves in a straight line so that, $t$ s after passing through a fixed point $O$, its velocity, $v$ m/s, is given by')
E_(r'v = 2t - 11 + \dfrac{6}{t + 1}')
SQ('Find the acceleration of the particle when the particle is at instantaneous rest.', 5)
SQ('Find the distance travelled by the particle in the sixth second.', 2)
SQ('Find the total distance travelled by the particle in the first 6 seconds.', 4)
A(r'(a) $\dfrac{11}{6}' + ms2 + '$; (b) $0.925$ m; (c) $20.2$ m')

ws.section('Section D — Harder questions')
ws.Q([])
SQ(r'Given that $y$ is as below, find $\dfrac{dy}{dx}$.')
E_(r'y = \dfrac{1 + \sin x}{\cos x}', 2, 2.6)
SQ('Hence, without using a calculator, find the value of each of the constants $p$ and $q$ for which')
E_(r'\int_0^{\frac{\pi}{3}} \dfrac{3 + 3\sin x - 10\cos^3 x}{5\cos^2 x}\,dx = p + q\sqrt{3}', 6, 2.6)
A(r'(a) $\dfrac{1 + \sin x}{\cos^2 x}$; (b) $p = \dfrac{3}{5}$, $q = -\dfrac{2}{5}$')

Q("The expression $10f(x) + 3f'(x) - f''(x) + 7\\sin 2x + 3\\cos 2x$ may be written as $10x + 43$, "
  "when $f'(x) = e^{5x} + 2\\sin^2 x$. Find $f(x)$.", 6)
A(r'$f(x) = \dfrac{1}{5}e^{5x} + x - \dfrac{1}{2}\sin 2x + 4$')

Q('The equation of a curve is as below, where $q$ is a non-zero constant.')
E_(r'y = \dfrac{xe^{3x}}{x + q}')
SQ('Differentiate $xe^{3x}$ with respect to $x$.', 2)
SQ('Show that'); E_(r'\dfrac{dy}{dx} = \dfrac{e^{3x}(3x^2 + 3qx + q)}{(x + q)^2}', 3, 2.6)
SQ('Given that the curve has exactly one stationary point, find the value of $q$ and determine the exact coordinates of the stationary point.', 5)
A(r'(a) $e^{3x}(1 + 3x)$; (b) shown; (c) $q = \dfrac{4}{3}$, $\left(-\dfrac{2}{3}, -\dfrac{1}{e^2}\right)$')

ws.Q([])
SQ(r'Differentiate $\ln(\cos x)$ with respect to $x$, leaving your answer in terms of a single trigonometric term in $x$.', 2)
SQ(r"$f(x)$ is such that $f''(x) = 8 - 3\sec^2 2x$. Given that $f'\left(\dfrac{\pi}{8}\right) = \pi + \dfrac{1}{4}$ and $f(0) = 5$, show that")
E_(r'f\left(\dfrac{\pi}{6}\right) = \dfrac{\pi^2}{9} + \dfrac{7\pi}{24} + 5 - \dfrac{3}{4}\ln 2', 7, 2.6)
A(r'(a) $-\tan x$; (b) shown')

Q('A particle travelling in a straight line passes through a fixed point $O$ with its velocity, $v$ m/s, given as '
  '$v = e^{2t} - 10e^{t} + 21$, where $t$ is the time in seconds after it passes $O$.')
SQ('Find the acceleration of the particle when it first comes to instantaneous rest.', 4)
SQ('Find the distance travelled by the particle when the particle reaches minimum velocity.', 6)
A('(a) $-12' + ms2 + '$; (b) $8.34$ m')

ws.save(sys.argv[1], strict_maths=True)
