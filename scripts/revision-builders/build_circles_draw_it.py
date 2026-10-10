"""A Math · Circles — Draw It to See It (Harder Questions).
Adrian, 10 Oct 2026: "i also need circles - questions that are tougher, requires students
to draw diagram to visualize". Twelve real school questions from the bank, none of which
comes with a diagram (part labels re-lettered (a)(b)(c); the source never prints).
Answers: verify_circles_draw_it.py.

  1 Gan Eng Seng 2024 P2 Q3 1b6d6167       2 Tanjong Katong 2025 P2 Q10 ec65df9f
  3 Ahmad Ibrahim 2024 P1 Q8 060155ee      4 Paya Lebar Methodist Girls 2024 P2 Q3 2f57c127
  5 Singapore Sports School 2025 P2 Q9 9d7c4cc5   6 Nan Hua 2025 P2 Q2 d35d7a79
  7 Chung Cheng High (Main) 2024 P2 Q7 08d6deb5   8 Ngee Ann 2025 P2 Q10 e7e47662
  9 SCGS 2025 P1 Q8 0aa09a99
 10 Cedar Girls 2024 P2 Q8 0a7aaaba  (St Patrick 2025 P1 Q13 is the same question; ITS bank key —
    centre (0,-4), radius sqrt 5, k = -19 — is wrong: x = -1 would not touch that circle)
 11 St Joseph's Institution 2025 P2 Q9 ba150c33  12 Ang Mo Kio 2024 P2 Q9 1c031db5

Section B, added later on 10 Oct 2026 (Adrian: "include questions that describes horizontal or vertical
lines as the tangents or normals to the circle and to find the centre"):
 13 RI 2024 P2 Q4 2f0288e9            14 ACS (Barker Road) 2024 P1 Q9 e5ebc6b6   15 ACS (Barker Road) 2025 P2 Q10 57191f6f
 16 Anglican High 2024 P1 Q11 ecde08fb 17 Anderson 2024 P2 Q9 c92909ff           18 Dunman 2025 P2 Q10 5bc79827
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / '.claude/skills/create-worksheet'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from worksheet_lib import Worksheet
from practice_extras import P

ws = Worksheet()
ws.title('Circles — Draw It to See It (Harder Questions)')
ws.subtitle('Additional Mathematics · Practice')
ws.para([('text', 'Draw a diagram for every question.', {'bold': True})])
ws.notes_end()
Q = lambda s, marks=None: ws.Q(P(s), marks=marks)
SQ = lambda s, marks=None: ws.SQ(P(s), marks=marks)
A = lambda s: ws.ans(P(s))

ws.section('Section A — Harder questions')
Q('The line $y = 10$ and $3y + 4x = 32$ are tangent to a circle $C$ at the points $(-2, 10)$ and $(2, 8)$ respectively.')
SQ('Show that the equation of $C$ is $(x + 2)^2 + (y - 5)^2 = 25$.', 5)
SQ('Explain if the $x$-axis is tangent to $C$.', 2)
SQ('Write down the equations of the two vertical tangents.', 2)
SQ('Two points $P$ and $Q$ lie on the circle and the length of $PQ$ is 4 units. Calculate the shortest distance from the centre of the circle to the line $PQ$.', 2)
A(r'(a) shown; (b) yes, the centre is 5 units from the $x$-axis; (c) $x = -7$, $x = 3$; (d) $\sqrt{21}$')

Q(r'A circle has centre $A(2, -3)$ and radius $\sqrt{20}$.')
SQ('Write the equation of this circle.', 1)
SQ('Find the equations of the tangents to the circle that are horizontal.', 2)
SQ('The circle intersects the $y$-axis at points $S$ and $T$. Find the length of $ST$.', 3)
SQ('A second circle with centre $B$ also passes through $S$ and $T$. Explain why the $y$-coordinate of $B$ is $-3$.', 2)
SQ(r'Given that the $x$-coordinate of $B$ is positive and that the radius of the second circle is $\sqrt{52}$, find the $x$-coordinate of $B$.', 2)
A(r'(a) $(x - 2)^2 + (y + 3)^2 = 20$; (b) $y = -3 \pm \sqrt{20}$; (c) $8$; (d) $B$ is on the bisector of $ST$; (e) $6$')

Q('A circle, $C_1$, has equation $x^2 + y^2 - 16x + 8y + 64 = 0$.')
SQ('Find the radius and the coordinates of the centre of $C_1$.', 3)
SQ('The line $y = k$ is a tangent to the circle at point $P$, where $k \\neq 0$. Find the value of $k$.', 1)
SQ('The tangent to the circle at the point $Q(4, -4)$ intersects $y = k$ at the point $R$. State the equation of this tangent.', 1)
SQ('Explain why a circle $C_2$ can be drawn through the points $P$, $Q$ and $R$ with $PQ$ as the diameter.', 2)
SQ('Find the equation of $C_2$.', 3)
A(r'(a) $4$, $(8, -4)$; (b) $k = -8$; (c) $x = 4$; (d) angle $PRQ = 90^\circ$; (e) $(x - 6)^2 + (y + 6)^2 = 8$')

Q('The equation of a circle is $x^2 + y^2 - 8x + 8y - 36 = 0$.')
SQ('Find the radius and the coordinates of the centre.', 4)
SQ('The circle passes through the point $A(2, 4)$ and the point $B$. The equation of the perpendicular bisector of $AB$ is $5y = -3x - 8$. '
   'Find the shortest distance of the centre of the circle from the line segment $AB$.', 5)
A(r'(a) $\sqrt{68}$, $(4, -4)$; (b) $\sqrt{34}$')

Q('The equation of a circle $C_1$ is $x^2 + y^2 + 2kx - 14y - 35 = 0$, where $k$ is a positive constant, has a radius of 10 units.')
SQ('Find the value of $k$.', 3)
SQ('The line $y = 3x + 9$ intersects the circle $C_1$ at the points $P$ and $Q$. Find the shortest distance between the centre of the circle to the line $y = 3x + 9$.', 5)
SQ('A second circle $C_2$ passes through the points $A(2, 4)$ and $B(-3, 5)$ and its centre lies on the line $y = 3x + 9$. Find the coordinates of the centre of circle $C_2$.', 3)
A(r'(a) $k = 4$; (b) $\sqrt{10}$; (c) $(1, 12)$')

Q(r'A circle, $C_1$, with radius $\sqrt{15}$ units is represented by the equation $x^2 + y^2 - 14x + 10y + c = 0$.')
SQ('Find the coordinates of the centre of the circle and the value of the constant $c$.', 3)
SQ('Another circle, $C_2$, of radius 5 units passes through the points $P$ and $Q$ at $(2, 0)$ and $(8, 0)$ respectively. '
   'If the positive $y$-axis is a tangent to the circle, $C_2$, find the equation of the circle.', 3)
SQ('Do the two circles, $C_1$ and $C_2$ intersect each other? Justify your answer.', 2)
A(r'(a) $(7, -5)$, $c = 59$; (b) $(x - 5)^2 + (y - 4)^2 = 25$; (c) no, $\sqrt{85} > \sqrt{15} + 5$')

Q('The equation of a circle is $(x + 4)^2 + (y - 3)^2 = k$.')
SQ('In the case where $k = 9$, explain why the $x$-axis is a tangent to the circle.', 2)
SQ('If the circle passes through the origin $O$, determine the value of $k$.', 2)
SQ('Given that $OP$ is a diameter of the circle and using the value of $k$ found in part (b), find the coordinates of the point at which $L_1$, '
   'the tangent to the circle at $P$, meets the $y$-axis.', 6)
SQ('Given that another line $L_2$ with equation $y = mx + b$ does not intersect $L_1$ and the circle, write down the possible range of values of $b$.', 2)
A(r'(a) the centre is 3 units from the $x$-axis; (b) $k = 25$; (c) $\left(0, 16\dfrac{2}{3}\right)$; (d) $b < 0$ or $b > 16\dfrac{2}{3}$')

Q('A circle passes through the points $D(-4, -3)$ and $E(4, -7)$. The line with equation $4y = 3x - 15$ is a normal to the circle at a point $F$.')
SQ('Showing all your working, find the equation of the circle.', 7)
SQ('Explain why the point $(-1, 1)$ lies inside the circle.', 2)
SQ('The line $y = x - 3$ intersects the circle at points $P$ and $Q$. Determine, with working, whether the line segment $PQ$ is a possible diameter of the circle.', 2)
A(r'(a) $(x - 1)^2 + (y + 3)^2 = 25$; (b) $\sqrt{20} < 5$; (c) no, the line misses the centre')

Q('The highest point on a circle $C_1$ is $(2, 8)$. The equation of the tangent, $T$, to $C_1$ at the point $(6, 6)$ is $3y + 4x = 42$.')
SQ('Find the equation of $C_1$.', 6)
SQ('A second circle, $C_2$, is the reflection of $C_1$ in the line $T$. Find the equation of $C_2$.', 3)
A('(a) $(x - 2)^2 + (y - 3)^2 = 25$; (b) $(x - 10)^2 + (y - 9)^2 = 25$')

Q('A circle has a diameter $AB$. The point $A$ has coordinates $(1, -6)$ and the equation of the tangent to the circle at $B$ is $3x + 4y = k$. '
  'It is also given that the line $x = -1$ touches the circle at the point $(-1, -2)$.')
SQ('Show that the equation of the normal to the circle at the point $A$ is $4x - 3y = 22$.', 3)
SQ('Find the coordinates of the centre and the radius of the circle.', 4)
SQ('Find the value of $k$.', 3)
A('(a) shown; (b) $(4, -2)$, $5$; (c) $k = 29$')

Q('A tangent to a circle at the point $(-3, 3)$ passes through the origin.')
SQ('Find the equation of the normal to the circle at the point $(-3, 3)$.', 3)
SQ('Another normal to the circle passes through the point $(0, -1)$ and is parallel to the line $5y = -2x + 7$. Find the equation of the circle.', 6)
SQ(r'Find the coordinates of the point on the circle which is farthest from the $y$-axis. Leave your answer in the form $(m + n\sqrt{2}, k)$, '
   'where $m$, $n$ and $k$ are constants.', 2)
A(r'(a) $y = x + 6$; (b) $(x + 5)^2 + (y - 1)^2 = 8$; (c) $(-5 - 2\sqrt{2}, 1)$')

Q('The circle $C_2$ is the reflection of circle $C_1$ about the line $y = -x$ such that the $x$-coordinates of the points of intersection of '
  '$C_1$ and $C_2$ are $-15$ and $-5$.')
SQ('Find the equation of the line passing through the centres of $C_1$ and $C_2$.', 2)
SQ('The radius of circle $C_1$ is 10 units. Find the coordinates of the centres of circles $C_1$ and $C_2$.', 4)
SQ(r'Given that circles $C_1$ and $C_2$ are inscribed in a larger circle $C_3$, find the equation of circle $C_3$ in the form of '
   r'$(x - a)^2 + (y - b)^2 = p + q\sqrt{2}$, where $a$, $b$, $p$ and $q$ are integers.', 4)
A(r'(a) $y = x + 20$; (b) $(-5, 15)$ and $(-15, 5)$; (c) $(x + 10)^2 + (y - 10)^2 = 150 + 100\sqrt{2}$')

ws.section('Section B — Horizontal and vertical tangents: find the centre')
Q('A circle passes through the points $A(3, 0)$ and $B(-1, 8)$. The $x$-axis is a tangent to the circle at $A$.')
SQ('Explain briefly why the $x$-coordinate of the centre of the circle is 3.', 1)
SQ('Find the equation of the circle.', 3)
A('(a) the radius at $A$ is vertical; (b) $(x - 3)^2 + (y - 5)^2 = 25$')

Q('$(-2, 6)$ and $(-2, 0)$ are points on the circumference of a circle. The line $y = 8$ is a tangent at the highest point of the circle. '
  'The line with equation $y = 3x - 3$ passes through the centre of the circle.')
SQ('Show that the radius of the circle is 5 units.', 2)
SQ('Find the equation of the circle.', 2)
SQ('Determine whether the point $(6, 7)$ lies inside, on or outside the circle.', 2)
A(r'(a) shown; (b) $(x - 2)^2 + (y - 3)^2 = 25$; (c) outside, $\sqrt{32} > 5$')

Q('The points $A(3, -1)$ and $B(3, 9)$ lie on the circumference of a circle. The line $y = 17$ is a tangent to the circle. '
  'The $x$-coordinate of the centre of the circle is positive.')
SQ('Find the radius of the circle and the coordinates of its centre.', 4)
SQ('Hence, find the coordinates of the point on the circle which is nearest to the $y$-axis.', 2)
A('(a) $13$, $(15, 4)$; (b) $(2, 4)$')

Q('The points $H(-18, 0)$, $K(5, 7)$ and $L(-10, 32)$ lie on a circle, $C$. The line $y = 32$ is a tangent to the circle.')
SQ('Find the equation of the perpendicular bisector of the chord $HK$.', 3)
SQ('Show that the coordinates of the centre of the circle are $(-10, 15)$.', 1)
SQ('Find the equation of the circle.', 2)
A(r'(a) $y = -\dfrac{23}{7}x - \dfrac{125}{7}$; (b) shown; (c) $(x + 10)^2 + (y - 15)^2 = 289$')

Q('The lines $x = 3$ and $y = -4$ are tangents to a circle $C$. The centre, $(a, b)$, of the circle is a point in the second quadrant. '
  'The line $T$ is a tangent to $C$ at the point $(1, -3)$ on the circle.')
SQ('Show that $a + b = -1$.', 2)
SQ('Find the centre of the circle $(a, b)$.', 4)
SQ('Find the equation of $C$.', 1)
SQ('Find the equation of $T$.', 2)
A(r'(a) shown; (b) $(-2, 1)$; (c) $(x + 2)^2 + (y - 1)^2 = 25$; (d) $y = \dfrac{3}{4}x - \dfrac{15}{4}$')

Q('The lines $y = 9$, $y = -1$ and $3y = 4x + 9$ are tangents to a circle. The $x$-coordinate of the centre of the circle is positive.')
SQ('Explain why the $y$-coordinate of the centre of the circle is 4.', 1)
SQ('By considering the discriminant, or otherwise, show that the $x$-coordinate of the centre of the circle is 7.', 7)
SQ('Determine if the point $(3, 0)$ lies within the circle.', 2)
A(r'(a) the centre is midway between $y = 9$ and $y = -1$; (b) shown; (c) no, $\sqrt{32} > 5$')

ws.save(sys.argv[1], strict_maths=True)
