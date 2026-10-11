"""A Math · Logarithms practice — the "make simultaneous" type and the "substitution" type.
Adrian, 10 Oct 2026: "could I have a logs ws like those that are like make simultaneous
and substitution type". Every question is a real school prelim question from the bank
(the part named below, word for word); the source never prints on the sheet.
Answers: scripts/revision-builders/verify_logs_simul_subst.py (every original equation
scanned for all real roots; rejected values shown to be undefined).

  1  Raffles Girls 2011 P1 Q3          a33ee202
  2  Juying 2022 P1 Q3                 d1c92354
  3  Greendale 2018 P1 Q5              9c02d4c4   (x = 0 rejected)
  4  VCA (IP) 2021 P2 Q3               2faf427a   (x = -2 rejected)
  5  Orchid Park 2024 P2 Q7            8c663a21   (bank key keeps x = -2/5; log2 x is undefined there — rejected here)
  6  Nan Chiau 2022 P1 Q5              6ad594b6
  7  Maris Stella 2025 P2 Q5(c)        0bdb5b2b   (2^x = -2 rejected)
  8  Hougang 2022 P1 Q13(a)            7a38d494
  9  Jurongville 2025 P2 Q7(b)         90b9db6b
 10  Hua Yi 2023 P2 Q7(a)              085ddbbf   ((sqrt 2)^x = -3 rejected)
 11  Cedar Girls 2025 P1 Q10           78e7b70c   (x = 1 rejected: base of a log)
 12  Raffles Girls 2021 P1 Q2          dbd7007e
 13  Yishun Town 2024 P1 Q6            b833b080
 14  Fairfield Methodist 2022 P2 Q7(a) d1a4ecc4   (y = 0 rejected)   } added 10 Oct 2026, Adrian:
 15  Bukit Merah 2016 P1 Q2            c075dc1f   (x = -2 rejected)  } "3 more tougher simultaneous
 16  Swiss Cottage 2017 P2 Q7          462237c7                      }  questions involving indices and logarithms"
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / '.claude/skills/create-worksheet'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from worksheet_lib import Worksheet
from practice_extras import P, eqs, full_size_fractions

# 11 Oct 2026: every question carries the bank's own sentence again (Adrian: "why does the
# question look different from question bank?"), and nothing is laid out in a table.
ws = Worksheet()
ws.title('Logarithms — Simultaneous and Substitution Types')
ws.subtitle('Additional Mathematics · Practice')
Q = lambda s, marks=None: ws.Q(P(s), marks=marks)
SQ = lambda s, marks=None: ws.SQ(P(s), marks=marks)
A = lambda s: ws.ans(P(s))


def pair(stem, eq1, eq2, marks, indent=1.6):
    """A pair the bank prints one equation to a line."""
    Q(stem); eqs(ws, [eq1, eq2], marks, indent)


ws.section('Section A — Two equations: make them simultaneous')
pair('Solve the simultaneous equations', r'3^{x} = 27\left(3^{y}\right)', r'\lg(x + 2y) = \lg 5 + \lg 3', 4)
A('$x = 7$, $y = 4$')

Q(r'Solve the simultaneous equations $3^{y} = \dfrac{1}{3}\left(3^{x - 7}\right)$ and $\log_{9}(14 - 2y) - \log_{9}x = 0.5$.', 5)
A('$x = 6$, $y = -2$')

pair('Solve, for $x$ and $y$, the simultaneous equations', r'\dfrac{5^{2x}}{5^{3y}} = \dfrac{5}{5^{3}\left(5^{y}\right)}',
     r'\log_{3}(x - 4) = \log_{3}(y - 1) - \log_{3}x', 7)
A('$x = 5$, $y = 6$')

Q(r'Solve algebraically the simultaneous equations $\lg(8x + 22) - \lg(y - 1) = \dfrac{1}{\log_{2}10}$, $e^{\ln y} = 10^{2\lg x}$.', 5)
A('$x = 6$, $y = 36$')

Q('Two simultaneous equations are given:')
eqs(ws, [r'64^{x} \times 4^{y} = 1', r'\log_{\frac{1}{2}}(x - 3y - 6) + 2 = \log_{2}x'])
SQ(r'Show that $\log_{\frac{1}{2}}(x - 3y - 6) + 2 = \log_{2}x$ can be written as $\log_{2}(x - 3y - 6) = \log_{2}\dfrac{4}{x}$.', 3)
SQ('Solve, for $x$ and $y$.', 7)
A('(a) shown; (b) $x = 1$, $y = -3$')

ws.section('Section B — One equation: use a substitution')
Q(r'Solve the equation $\left(\log_{5}y\right)^{2} + \log_{5}\dfrac{1}{y^{3}} = 28$.', 4)
A(r'$y = 78\,125$ or $y = \dfrac{1}{625}$')

Q(r'Solve the equation $4^{x + 1} + 7\left(2^{x}\right) = 2$.', 4)
A('$x = -2$')

Q(r'Solve the equation $(\ln x)^{2} + \dfrac{2}{\log_{x}e} = 3$.', 4)
A('$x = e$ or $x = e^{-3}$')

Q(r'Solve the equation $\log_{3}3x^{2} + 4 = \log_{x}27$.', 5)
A(r'$x = \sqrt{3}$ or $x = \dfrac{1}{27}$')

Q(r'Using suitable substitution, solve the equation $2^{x} - \left(\sqrt{2}\right)^{x + 2} = 15$.', 5)
A('$x = 4.64$')

Q(r'Solve the equation $\log_{4}x - \dfrac{3}{\log_{x}8} = \left(\log_{2}x\right)^{2}$, leaving your answer in terms of $\sqrt{2}$.', 5)
A(r'$x = \dfrac{1}{\sqrt{2}}$')

ws.section('Section C — Both together')
Q(r'Given that $x, y > 0$, solve the simultaneous equations $(\lg x)(\lg y) = 2$ and $\lg\sqrt{\dfrac{xy}{10}} = 1$.', 7)
A('$x = 10$, $y = 100$ or $x = 100$, $y = 10$')

ws.Q([])
SQ(r'The curve $\dfrac{x}{y} + y = 1$ and the line $x - 2y + 6 = 0$ intersect at the points $A$ and $B$. Find the $x$-coordinate of $A$ and of $B$.', 3)
SQ(r'Hence solve for the value(s) of $x$ in the simultaneous equations $\dfrac{\lg x}{\lg y} + \lg y = 1$, $\lg\dfrac{x}{y^{2}} = -6$.', 3)
A('(a) $x = -2$ or $x = -12$; (b) $x = 10^{-2}$ or $x = 10^{-12}$')

ws.section('Section D — More simultaneous questions (tougher)')
Q(r'Solve the simultaneous equations $e\sqrt{e^{x}} = e^{2y}$ and $\log_{4}(x + 2) = 1 + \log_{2}y$.', 8)
A('$x = 2$, $y = 1$')

pair('Solve the simultaneous equations', r'0.5^{x}\left(4^{3y}\right) = 16', r'\log_{4}2x + \log_{4}(x + 3y) = 1', 5)
A(r'$x = \dfrac{2}{3}$, $y = \dfrac{7}{9}$')

ws.Q([])
SQ(r'Given that $\dfrac{\left(\log_{a}b\right)^{2}}{\log_{b}a} - 27 = 0$, express $b$ as a power of $a$.', 4)
SQ('Hence, solve, for $a$ and $b$, the simultaneous equations')
eqs(ws, [r'ab = 81', r'\dfrac{\left(\log_{a}b\right)^{2}}{\log_{b}a} - 27 = 0'], 3, 2.6)
A('(a) $b = a^{3}$; (b) $a = 3$, $b = 27$')

full_size_fractions(ws)
ws.save(sys.argv[1], strict_maths=True)
