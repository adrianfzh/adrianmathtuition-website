"""A Math · Differentiation and Integration — Applications (with Kinematics).
Adrian, 10 Oct 2026, on the "Every Type" sheet: "i don't need questions specifically for
integration and differentiation techniques, but i want application questions that uses a
wide variety of integration and differentiation techniques, including those harder ones".
Ten real school questions from the bank, none with a diagram (part labels re-lettered
(a)(b)(c); the source never prints). Answers: verify_calculus_applications.py.

  1 Ahmad Ibrahim 2024 P1 Q7 4c924633     ln of a root · rates · normal
  2 Presbyterian High 2025 P2 Q8 3c89db13 e × tan (product) · stationary · never decreasing
  3 SCGS 2024 P2 Q2 3a88ef41              x^2 ln 3x · hence a definite integral · increasing · rates
  4 Ahmad Ibrahim 2023 P1 Q10 23ccc4cc    trig quotient · decreasing
  5 Crescent Girls 2024 P2 Q9 4c170819    e × trig · stationary · hence a definite integral
  6 Bedok South 2025 P1 Q13 2d8f5832      x^2 e^(x+2) · decreasing · least gradient (second derivative)
  7 Ahmad Ibrahim 2023 P1 Q11 506398cb    partial fractions · integrate to ln · curve from gradient
  8 Deyi 2024 P2 Q11 6d405bbf             integrate e twice · normal · turning point
  9 Xinmin 2024 P1 Q14 21317103           kinematics, trig · total distance
 10 Yishun Town 2024 P2 Q8 2f533dd6       kinematics, e · minimum velocity · distance
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / '.claude/skills/create-worksheet'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from worksheet_lib import Worksheet
from practice_extras import P, eqs
from docx.shared import Cm

ws = Worksheet()
ws.title('Differentiation and Integration — Applications (with Kinematics)')
ws.subtitle('Additional Mathematics · Practice')
Q = lambda s, marks=None: ws.Q(P(s), marks=marks)
SQ = lambda s, marks=None: ws.SQ(P(s), marks=marks)
A = lambda s: ws.ans(P(s))
E_ = lambda lines, marks=None, indent=1.6: eqs(ws, lines if isinstance(lines, list) else [lines], marks, indent)
ms2 = r'\text{ m/s}^2'

ws.section('Section A — Curves: tangents and normals, rates of change, stationary points')
Q(r'The equation of a curve is $y = \ln\sqrt{5 - 2x}$.')
SQ('A particle moves along the curve such that at the point $T$, the $x$-coordinate of the particle is increasing at 0.2 units per second '
   'and the $y$-coordinate is decreasing at 0.05 units per second. Find the coordinates of $T$.', 4)
SQ('The normal to the curve at the $y$-intercept meets the $x$-axis at $A$ and the $y$-axis at $B$. '
   'Find the area of triangle $AOB$, where $O$ is the origin.', 5)
A(r'(a) $(0.5, \ln 2)$; (b) $0.0648\text{ units}^2$')

Q(r'The equation of a curve is $y = e^{-2x}\tan x$.')
SQ('Show that'); E_(r'\dfrac{dy}{dx} = e^{-2x}(1 - \tan x)^2', 3, 2.6)
SQ('Find the $x$-coordinate of the stationary point for the interval below.'); E_(r'0 < x < \dfrac{\pi}{2}', 2, 2.6)
SQ('Explain why $y$ is never decreasing.', 2)
SQ('What does your answer to part (c) imply about the stationary point in part (b)?', 2)
A(r'(a) shown; (b) $\dfrac{\pi}{4}$; (c) $e^{-2x} > 0$ and $(1 - \tan x)^2 \geq 0$; (d) it is a point of inflexion')

Q(r'A curve has the equation $y = x^2\ln 3x$, where $x > 0$.')
SQ(r'Find an expression for $\dfrac{dy}{dx}$.', 3)
SQ('Find'); E_(r'\int_1^3 x\ln 3x\,dx', 4, 2.6)
SQ('Find the range of values of $x$ for which $y$ is increasing. Leave your answer in terms of $e$.', 2)
SQ('Given that $y$ increases at the rate of 6 units per second when $x$ is as below, find the rate of change of $x$.')
E_(r'x = \dfrac{e}{3}', 2, 2.6)
A(r'(a) $x + 2x\ln 3x$; (b) $\dfrac{17}{2}\ln 3 - 2$; (c) $x > \dfrac{1}{3\sqrt{e}}$; (d) $\dfrac{6}{e}$ units per second')

ws.Q([])
SQ(r'Solve the equation $2\cos 3x + 1 = 0$ for $0 \leq x \leq \pi$.', 3)
SQ(r'Sketch the graph of $y = 2\cos 3x + 1$ for $0 \leq x \leq \pi$.', 3)
SQ(r'The equation of a curve is as below, where $0 \leq x \leq \pi$. Using (a) and (b), find the range of values of $x$ for which $y$ is a decreasing function.')
E_(r'y = \dfrac{\sin 3x}{2 + \cos 3x}', 5, 2.6)
A(r'(a) $\dfrac{2\pi}{9}$, $\dfrac{4\pi}{9}$, $\dfrac{8\pi}{9}$; (b) sketch; (c) $\dfrac{2\pi}{9} < x < \dfrac{4\pi}{9}$ or $\dfrac{8\pi}{9} < x \leq \pi$')

Q(r'A curve has the equation $y = e^{2x}(\sin 2x - \cos 2x)$, where $0 < x < \pi$.')
SQ('Show that the gradient can be written as below, where $k$ is a constant. State the value of $k$.')
E_(r'\dfrac{dy}{dx} = ke^{2x}\sin 2x', 3, 2.6)
SQ('Find the $x$-coordinates of the stationary point of the curve.', 3)
SQ('Evaluate'); E_(r'\int_0^{\frac{\pi}{2}} e^{2x}\sin 2x\,dx', 3, 2.6)
A(r'(a) $k = 4$; (b) $\dfrac{\pi}{2}$; (c) $6.04$')

Q('It is given that $f(x) = x^2e^{x+2}$.')
SQ('Show that the range of values of $x$ for which $f(x)$ is a decreasing function is $-2 < x < 0$.', 4)
SQ('The gradient with the least value is in the range $-2 < x < 0$. Find the value of this gradient, giving your answer in exact form.', 4)
A(r'(a) shown; (b) $(2 - 2\sqrt{2})e^{\sqrt{2}}$')

ws.section('Section B — Finding the curve by integration')
ws.Q([])
SQ('Express the following in partial fractions.')
E_(r'\dfrac{3x^2 + 4x - 20}{(2x + 1)(x^2 + 4)}', 5, 2.6)
SQ(r'Differentiate $\ln(x^2 + 4)$ with respect to $x$.', 2)
SQ(r'The gradient function of a curve is the expression in part (a). Given that the $y$-intercept of the curve is $(0, \ln 4)$, '
   'using part (a) and (b), find the equation of the curve.', 4)
A(r'(a) $\dfrac{4x}{x^2 + 4} - \dfrac{5}{2x + 1}$; (b) $\dfrac{2x}{x^2 + 4}$; (c) $y = 2\ln(x^2 + 4) - \dfrac{5}{2}\ln(2x + 1) - \ln 4$')

Q('At any point $(x, y)$ on a curve,')
E_(r'\dfrac{d^2y}{dx^2} = 6e^{3x} + 1')
ws.cont(P(r'The gradient of the curve at $A\left(0, -4\dfrac{1}{3}\right)$ is $-2$.'), level=0).paragraph_format.left_indent = Cm(1.0)
SQ('Find the equation of the curve.', 6)
SQ('Find the equation of normal at $A$.', 3)
SQ('Show that the curve has a turning point between 0 and 1, and determine the nature of this turning point.', 3)
A(r'(a) $y = \dfrac{2}{3}e^{3x} + \dfrac{x^2}{2} - 4x - 5$; (b) $y = \dfrac{1}{2}x - 4\dfrac{1}{3}$; (c) shown, minimum')

ws.section('Section C — Kinematics')
Q('A particle travelling in a straight line, has a velocity, $v$ m/s, at time $t$ seconds, $t \\geq 0$, given by')
E_(r'v = 3\sin 2t - 4\cos 2t')
SQ('Find the initial acceleration of the particle.', 2)
SQ('Find the total distance travelled by the particle in the first 1.5 seconds.', 8)
A('(a) $6' + ms2 + '$; (b) $4.70$ m')

Q('A particle travelling in a straight line passes through a fixed point $O$ with its velocity, $v$ m/s, given as '
  '$v = e^{2t} - 10e^{t} + 21$, where $t$ is the time in seconds after it passes $O$.')
SQ('Find the acceleration of the particle when it first comes to instantaneous rest.', 4)
SQ('Find the distance travelled by the particle when the particle reaches minimum velocity.', 6)
A('(a) $-12' + ms2 + '$; (b) $8.34$ m')

ws.save(sys.argv[1], strict_maths=True)
