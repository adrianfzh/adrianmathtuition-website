"""Re-checks every answer in topics/am-quadratic-functions.mjs (needs sympy).
Run: /usr/bin/python3 scripts/notes-layout/check-quadratic-functions.py — prints OK or the failing line."""
from sympy import symbols, expand, Rational as Q, solve, sqrt, simplify, discriminant, Poly, reduce_inequalities, S

x, t, k, q = symbols('x t k q')
def eq(a, b, msg):
    assert simplify(a - b) == 0, msg

# 1 completing the square
eq(x**2 - 4*x, (x - 2)**2 - 4, 'cts a=1')
eq(2*x**2 - 10*x - 18, 2*(x - Q(5, 2))**2 - Q(61, 2), 'cts a!=1')
eq(-4*x**2 - 24*x - 35, -4*(x + 3)**2 + 1, 'sketch form')
assert set(solve(-4*x**2 - 24*x - 35, x)) == {Q(-5, 2), Q(-7, 2)}, 'sketch roots'
# 2 always positive
eq(x**2 - 4*x + 7, (x - 2)**2 + 3, 'pos 1')
eq(4*x**2 - 6*x + 14, 4*(x - Q(3, 4))**2 + Q(47, 4), 'pos 2')
# 3 constants
eq((x - 3)**2 - 5, x**2 - 6*x + 4, 'b c')
assert solve(6 - q*(0 - 2)**2 - 4, q) == [Q(1, 2)], 'q'
# 4 symmetry / reflection
eq(x**2 - 4*x - 5, (x - 2)**2 - 9, 'reflect cts')
# 5 word problems
eq(16*t - 4*t**2 + 1, -4*(t - 2)**2 + 17, 'stone')
eq(-Q(176, 100)*x**2 + Q(44, 10)*x, -Q(176, 100)*(x - Q(5, 4))**2 + Q(11, 4), 'tunnel')
assert -Q(176, 100)*Q(35, 100)**2 + Q(44, 10)*Q(35, 100) == Q(13244, 10000), 'tunnel h'
# 6 two curves
eq(-x**2 + 6*x - 14, -(x - 3)**2 - 5, 'y1'); eq(3*x**2 + 12*x + 13, 3*(x + 2)**2 + 1, 'y2')
# 7 discriminant
assert str(reduce_inequalities(k**2 - 36 < 0, k)) in ('(-6 < k) & (k < 6)',), 'no real roots'
assert solve(discriminant(x**2 - 6*x + 5 - k, x), k) == [-4], 'tangent'
assert solve(discriminant(x**2 - 5*x + 5 - (3*x + k/2), x), k) == [-22], 'two points boundary'
# 8 line meets curve
assert set(solve(5 - 3*x - (-x**2 + 4*x - 7), x)) == {3, 4}
eq(sqrt((4 - 3)**2 + (-7 + 4)**2), sqrt(10), 'AB')
# 9 sum and product
def roots(a, b, c):
    return solve(a*x**2 + b*x + c, x)
r = roots(3, 4, -2); eq(r[0] + r[1], Q(-4, 3), 's'); eq(r[0]*r[1], Q(-2, 3), 'p')
r = roots(4, 7, 1); eq(r[0]**2 + r[1]**2, Q(41, 16), 'a2b2')
r = roots(1, 4, 5); eq(expand(r[0]**3 + r[1]**3), -4, 'a3b3')
r = roots(3, -2, 5); eq(expand(5*(x - 1/r[0])*(x - 1/r[1])), 5*x**2 - 2*x + 3, 'recip')
r = roots(2, -7, 8); eq(expand(4*(x - (r[0]**2 - 1))*(x - (r[1]**2 - 1))), 4*x**2 - 9*x + 51, 'a2-1')
assert set(roots(1, -3, 0)) == {0, 3}, 'differ by 3'
print('OK — every answer checks')
