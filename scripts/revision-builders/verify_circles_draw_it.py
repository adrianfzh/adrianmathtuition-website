"""Answer check for build_circles_draw_it.py — each circle rebuilt from the question's own
conditions with sympy, then every printed answer tested against it."""
import sympy as sp
x, y, a, b, k, m = sp.symbols('x y a b k m', real=True)
R = sp.Rational; sq = sp.sqrt; ok = True
def chk(name, cond):
    global ok
    g = bool(cond); ok &= g; print(name, 'OK' if g else 'FAIL')
d2 = lambda p, q: (p[0]-q[0])**2 + (p[1]-q[1])**2
def dline(p, A, B, C): return sp.Abs(A*p[0] + B*p[1] + C)/sq(A*A + B*B)
# 1 tangents y=10 at (-2,10), 3y+4x=32 at (2,8)
c = sp.solve([sp.Eq(a, -2), sp.Eq(b - 8, R(3, 4)*(a - 2))], [a, b]); c = (c[a], c[b])
chk('1a', c == (-2, 5) and d2(c, (2, 8)) == 25 and dline(c, 4, 3, -32) == 5)
chk('1b', c[1] == 5); chk('1d', sq(25 - 4) == sq(21))
# 2 centre (2,-3), r^2 = 20
ys = sp.solve(4 + (y + 3)**2 - 20, y); chk('2c', abs(ys[0] - ys[1]) == 8)
chk('2e', sp.solve(a**2 + 16 - 52, a) == [-6, 6])
# 3 x^2+y^2-16x+8y+64=0
chk('3a', 64 + 16 - 64 == 16); chk('3e', d2((8, -8), (4, -4)) == 4*8 and ((8+4)/2, (-8-4)/2) == (6, -6))
chk('3d', (8 - 4)*(4 - 4) + (-8 + 8)*(-4 + 8) == 0)       # RP . RQ = 0 with R(4,-8)
# 4 centre (4,-4), r^2 = 68; AB through A(2,4) perpendicular to 5y=-3x-8
chk('4a', 16 + 16 + 36 == 68 and d2((4, -4), (2, 4)) == 68); chk('4b', dline((4, -4), 5, -3, 2) == sq(34))
# 5
chk('5a', sp.solve(k**2 + 49 + 35 - 100, k) == [-4, 4]); chk('5b', sp.simplify(dline((-4, 7), 3, -1, 9) - sq(10)) == 0)
s = sp.solve([sp.Eq(b, 3*a + 9), sp.Eq(d2((a, b), (2, 4)), d2((a, b), (-3, 5)))], [a, b]); chk('5c', (s[a], s[b]) == (1, 12))
# 6
chk('6a', 49 + 25 - 59 == 15)
s = sp.solve([sp.Eq(d2((a, b), (2, 0)), 25), sp.Eq(d2((a, b), (8, 0)), 25)], [a, b]); chk('6b', (5, 4) in s and (5, -4) in s)
chk('6c', sq(d2((7, -5), (5, 4))) > sq(15) + 5)
# 7 centre (-4,3)
chk('7b', d2((-4, 3), (0, 0)) == 25); Pt = (-8, 6)
chk('7c', sp.solve(sp.Eq(y - 6, R(4, 3)*(0 + 8)), y) == [R(50, 3)] and R(4, 3)*R(6, -8) == -1)
chk('7d', dline((-4, 3), 4, -3, 0) == 5)                     # y = 4x/3 is the other parallel tangent
# 8 through D(-4,-3), E(4,-7); centre on 4y = 3x - 15
s = sp.solve([sp.Eq(4*b, 3*a - 15), sp.Eq(d2((a, b), (-4, -3)), d2((a, b), (4, -7)))], [a, b])
chk('8a', (s[a], s[b]) == (1, -3) and d2((1, -3), (4, -7)) == 25); chk('8b', d2((1, -3), (-1, 1)) == 20); chk('8c', -3 != 1 - 3)
# 9 highest point (2,8); tangent at (6,6): 3y+4x=42
s = sp.solve([sp.Eq(a, 2), sp.Eq(b - 6, R(3, 4)*(a - 6))], [a, b]); chk('9a', (s[a], s[b]) == (2, 3) and 8 - 3 == 5 and d2((2, 3), (6, 6)) == 25)
chk('9b', (2*6 - 2, 2*6 - 3) == (10, 9) and 4*6 + 3*6 == 42)
# 10 A(1,-6); x=-1 touches at (-1,-2); normal at A: 4x-3y=22
s = sp.solve([sp.Eq(b, -2), sp.Eq(4*a - 3*b, 22)], [a, b]); chk('10b', (s[a], s[b]) == (4, -2) and d2((4, -2), (1, -6)) == 25 and 4 - (-1) == 5)
B = (2*4 - 1, 2*(-2) + 6); chk('10c', B == (7, 2) and 3*7 + 4*2 == 29)
# 11 tangent at (-3,3) through O; second normal through (0,-1), gradient -2/5
s = sp.solve([sp.Eq(b, a + 6), sp.Eq(b, -R(2, 5)*a - 1)], [a, b]); chk('11b', (s[a], s[b]) == (-5, 1) and d2((-5, 1), (-3, 3)) == 8)
# 12 intersections (-15,15), (-5,5); r = 10
s = sp.solve([sp.Eq(d2((a, b), (-15, 15)), 100), sp.Eq(d2((a, b), (-5, 5)), 100)], [a, b])
chk('12b', set(s) == {(-5, 15), (-15, 5)}); chk('12a', all(q[1] == q[0] + 20 for q in s))
chk('12c', sp.expand((sq(d2((-10, 10), (-5, 15))) + 10)**2) == 150 + 100*sq(2))
print('ALL OK' if ok else 'SOMETHING FAILED')
