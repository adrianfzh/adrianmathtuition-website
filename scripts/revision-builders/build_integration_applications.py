"""A Math · Integration — Applications that need a variety of techniques.
Adrian, 11 Oct 2026: "how about questions on integration that involves applications but need to
use a wide variety of techniques instead?". Ten real school questions from the bank, each in the
school's own sentences (part labels re-lettered; the source never prints). The five area
questions carry the bank's own diagram (assets/integration_applications/<bank id>.png).
Answers: verify_integration_applications.py.

  1 Maris Stella 2025 P1 Q9 0e980bf6        curve from d2y/dx2 · e
  2 Anderson 2023 P1 Q6 43b88161            curve from d2y/dx2 · sin, cos
  3 Cedar Girls 2025 P2 Q4 2db4fceb         curve from d2y/dx2 · (3-2x)^-2 then ln
  4 Ahmad Ibrahim 2025 P1 Q12 1b2c4483      area · 10/(4x+1) gives ln · tangent
  5 Presbyterian High 2025 P1 Q13 fd1d5df0  area · sqrt(2x+5) · normal
  6 Chung Cheng High (Yishun) 2025 P2 Q7 fd542332   area · trig identity · part below the axis
  7 Cedar Girls 2025 P2 Q10 89905d35        area · e · normal · part below the axis
  8 Xinmin 2025 P1 Q12 ab5b1946             area · ln x (integrate along y, or by a derivative)
  9 Ahmad Ibrahim 2024 P2 Q7 caa34abb       kinematics · 6/(t+1) gives ln · total distance
 10 Mayflower 2023 P2 Q4 3cf1f3bc           kinematics · e
 11-13 WRITTEN HERE, not bank questions (12 Oct 2026). Adrian asked whether the bank has kinematics
    questions that integrate (at+b)^(-1/2); it has none in 249 rows, and he said "yes" to three
    written ones: a = 12/sqrt(4t+1); v = 20/sqrt(2t+1) - 4; v = sqrt(t+1) - 4/sqrt(t+1).
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / '.claude/skills/create-worksheet'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from worksheet_lib import Worksheet
from practice_extras import P, full_size_fractions

FIG = Path(__file__).resolve().parent / 'assets/integration_applications'
ws = Worksheet()
ws.title('Integration — Applications Using a Variety of Techniques')
ws.subtitle('Additional Mathematics · Practice')
Q = lambda s, marks=None: ws.Q(P(s), marks=marks)
SQ = lambda s, marks=None: ws.SQ(P(s), marks=marks)
A = lambda s: ws.ans(P(s))
fig = lambda bank_id, cm=6.5: ws.figure(str(FIG / f'{bank_id}.png'), width_cm=cm)
ms2 = r'\text{ m/s}^2'

ws.section('Section A — Finding the equation of a curve')
Q(r'A curve is such that $\dfrac{d^2y}{dx^2} = 3e^{2x} - e^{-x}$. The curve cuts the $y$-axis at $P(0, 1)$ and has a gradient of 4 at $P$.')
SQ('Show that the curve has no stationary points.', 3)
SQ('Find the equation of the curve.', 4)
A(r'(a) shown, $\dfrac{dy}{dx} = \dfrac{3}{2}e^{2x} + e^{-x} + \dfrac{3}{2} > 0$; (b) $y = \dfrac{3}{4}e^{2x} - e^{-x} + \dfrac{3}{2}x + \dfrac{5}{4}$')

Q(r'A curve is such that $\dfrac{d^2y}{dx^2} = 5\cos 2x - 8\sin\dfrac{1}{2}x$ and the point $P(\pi, 7)$ lies on the curve. '
  'The gradient of the curve at $P$ is 3. Find the equation of the curve.', 6)
A(r'$y = -\dfrac{5}{4}\cos 2x + 32\sin\dfrac{1}{2}x + 3x - \dfrac{95}{4} - 3\pi$')

Q(r'A curve is such that $\dfrac{d^2y}{dx^2} = \dfrac{12}{(3 - 2x)^2}$. Given that the curve passes through the points '
  r'$\left(\dfrac{1}{2}, 1\right)$ and $\left(1, \ln(8e^2)\right)$, show that the $y$-intercept of the curve can be expressed as '
  r'$a\ln\left(\dfrac{b}{c}\right)$ where $a$, $b$ and $c$ are constants.', 8)
A(r'$3\ln\left(\dfrac{2}{3}\right)$')

ws.section('Section B — Area')
Q(r'The diagram shows part of the curve $y = \dfrac{10}{4x + 1}$ intersecting the $y$-axis at $A(0, 10)$. '
  'The tangent to the curve at the point $P(1, 2)$ intersects the $y$-axis at $B$.')
fig('1b2c4483', 5.5)
SQ('Show that the coordinates of $B$ is $(0, 3.6)$.', 4)
SQ('Find the exact area of the shaded region.', 5)
A(r'(a) shown; (b) $\dfrac{5}{2}\ln 5 - 2.8$ square units')

Q(r'The diagram shows part of the curve $y = \sqrt{2x + 5}$. $A$ is a point on the curve and the $x$-coordinate of $A$ is 2. '
  'The normal to the curve at $A$ meets the $x$-axis at $B$.')
fig('fd1d5df0', 5.5)
SQ('Find the equation of the normal to the curve at $A$.', 5)
SQ('Find the area of the shaded region bounded by the normal $AB$, the curve, the $x$-axis and the $y$-axis.', 5)
A(r'(a) $y = -3x + 9$; (b) $\dfrac{21}{2} - \dfrac{5\sqrt{5}}{3}$ square units')

Q(r'The diagram shows the curve $y = \dfrac{1}{2}(\cos 2x + 2\cos x + 1)$ for $0 \leq x \leq \pi$ radians. The point $M$ is the '
  r'minimum point of the curve, where the $x$-coordinate of $M$ lies in the interval $\dfrac{\pi}{2} < x < \pi$.')
fig('fd542332', 7.0)
SQ('Find the exact coordinates of $M$.', 5)
SQ('Find the total area of the shaded regions bounded by the curve and the axes.', 4)
A(r'(a) $M\left(\dfrac{2\pi}{3}, -\dfrac{1}{4}\right)$; (b) $2$ square units')

Q('The diagram shows part of the curve $y = e^{x - 1} - 2$. The point $P(2, e - 2)$ lies on the curve and the normal to the curve '
  'at $P$ meets the $x$-axis at $Q$.')
fig('89905d35', 7.0)
SQ('Find the $x$-coordinate of $Q$ in terms of $e$.', 5)
SQ('Find the total area of the shaded region.', 7)
A(r'(a) $e(e - 2) + 2$; (b) $2.56\text{ units}^2$')

Q('The diagram shows part of the curve $y = 2 + 3\\ln x$. The $x$-coordinate of point $A$ is 1. The normal to the curve at $A$ '
  'intersects the $x$-axis at $B$.')
fig('ab5b1946', 7.0)
SQ('Find the coordinates of $B$.', 5)
SQ('Showing all your working, find the exact area of the shaded region bounded by the curve, the line $AB$ and the $x$-axis.', 5)
A(r'(a) $B(7, 0)$; (b) $5 + 3e^{-\frac{2}{3}}$ square units')

ws.section('Section C — Kinematics')
Q(r'A particle moves in a straight line so that, $t$ s after passing through a fixed point $O$, its velocity, $v$ m/s, is given by '
  r'$v = 2t - 11 + \dfrac{6}{t + 1}$.')
SQ('Find the acceleration of the particle when the particle is at instantaneous rest.', 5)
SQ('Find the distance travelled by the particle in the sixth second.', 2)
SQ('Find the total distance travelled by the particle in the first 6 seconds.', 4)
A(r'(a) $\dfrac{11}{6}' + ms2 + '$; (b) $0.925$ m; (c) $20.2$ m')

Q('A particle moves in a straight line such that $t$ seconds after passing a fixed point $O$, its velocity, $v$ m/s, is given by '
  '$v = 2e^{0.1t} - 10e^{-0.3t}$. The particle comes to an instantaneous rest at point $A$.')
SQ(r'Show that the particle reaches $A$ when $t = \dfrac{5}{2}\ln 5$.', 2)
SQ('Find the acceleration of the particle at $A$.', 2)
SQ('Find the distance $OA$.', 4)
SQ('Explain whether the particle is again at $O$ at some instant during the eleventh second after first passing through $O$.', 2)
A('(a) shown; (b) $1.20' + ms2 + '$; (c) $13.5$ m; (d) no, $s = 2.69$ m at $t = 10$ and $7.98$ m at $t = 11$')

ws.section('Section D — Kinematics: integrating a reciprocal square root')
Q(r'A particle moves in a straight line so that, $t$ seconds after passing through a fixed point $O$, its acceleration, $a\text{ m/s}^2$, '
  r'is given by $a = \dfrac{12}{\sqrt{4t + 1}}$. The particle passes through $O$ with a velocity of $-12$ m/s.')
SQ('Find an expression, in terms of $t$, for the velocity of the particle.', 3)
SQ('Show that the particle comes to instantaneous rest when $t = 2$.', 1)
SQ('Find the distance of the particle from $O$ when it is at instantaneous rest.', 4)
SQ('Find the total distance travelled by the particle in the first 6 seconds.', 3)
A(r'(a) $v = 6\sqrt{4t + 1} - 18$; (b) shown; (c) $10$ m; (d) $36$ m')

Q(r'A particle moves in a straight line so that, $t$ seconds after leaving a fixed point $O$, its velocity, $v$ m/s, is given by '
  r'$v = \dfrac{20}{\sqrt{2t + 1}} - 4$.')
SQ('Find the acceleration of the particle when $t = 4$.', 2)
SQ('Find the value of $t$ when the particle is at instantaneous rest.', 2)
SQ('Find an expression, in terms of $t$, for the displacement of the particle from $O$.', 3)
SQ('Find the greatest distance of the particle from $O$ in the first 40 seconds.', 2)
SQ('Show that the particle returns to $O$ when $t = 40$, and find the total distance it has travelled by then.', 3)
A(r'(a) $-\dfrac{20}{27}' + ms2 + r'$; (b) $t = 12$; (c) $s = 20\sqrt{2t + 1} - 4t - 20$; (d) $32$ m; (e) shown, $64$ m')

Q(r'A particle moves in a straight line so that, $t$ seconds after passing through a fixed point $O$, its velocity, $v$ m/s, is given by '
  r'$v = \sqrt{t + 1} - \dfrac{4}{\sqrt{t + 1}}$.')
SQ('Find the value of $t$ when the particle is at instantaneous rest.', 2)
SQ('Explain why the acceleration of the particle is always positive.', 3)
SQ('Find the total distance travelled by the particle in the first 8 seconds.', 6)
A(r'(a) $t = 3$; (b) $a = \dfrac{1}{2\sqrt{t + 1}} + \dfrac{2}{\sqrt{(t + 1)^3}}$, both terms positive; (c) $8$ m')

full_size_fractions(ws)
ws.save(sys.argv[1], strict_maths=True)
