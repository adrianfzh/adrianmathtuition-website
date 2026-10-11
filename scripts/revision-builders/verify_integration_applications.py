"""Answer check for build_integration_applications.py (sympy, from the questions as printed)."""
import sympy as sp
x, t, c, d = sp.symbols('x t c d', real=True)
E, ln, sin, cos, sqrt, pi, R, D, I = sp.E, sp.log, sp.sin, sp.cos, sp.sqrt, sp.pi, sp.Rational, sp.diff, sp.integrate
ok = True
def z(name, v, tol=1e-9):
    global ok
    g = abs(sp.N(v)) < tol; ok &= bool(g); print(name, 'OK' if g else 'FAIL')
# 1  y'' = 3e^{2x} - e^{-x}; P(0,1), gradient 4
y = R(3, 4)*sp.exp(2*x) - sp.exp(-x) + R(3, 2)*x + R(5, 4)
z("1 y''", (D(y, x, 2) - (3*sp.exp(2*x) - sp.exp(-x))).subs(x, 0.7)); z("1 y'(0)", D(y, x).subs(x, 0) - 4); z('1 y(0)', y.subs(x, 0) - 1)
# 2  y'' = 5cos2x - 8 sin(x/2); P(pi,7), gradient 3
y = -R(5, 4)*cos(2*x) + 32*sin(x/2) + 3*x - R(95, 4) - 3*pi
z("2 y''", (D(y, x, 2) - (5*cos(2*x) - 8*sin(x/2))).subs(x, 0.7)); z("2 y'", D(y, x).subs(x, pi) - 3); z('2 y', y.subs(x, pi) - 7)
# 3  y'' = 12/(3-2x)^2 through (1/2,1) and (1, ln(8e^2))
y = -3*ln(3 - 2*x) + 2*x + 3*ln(2)
z("3 y''", (D(y, x, 2) - 12/(3 - 2*x)**2).subs(x, 0.7)); z('3 p1', y.subs(x, R(1, 2)) - 1); z('3 p2', y.subs(x, 1) - ln(8*E**2)); z('3 y(0)', y.subs(x, 0) - 3*ln(R(2, 3)))
# 4  y = 10/(4x+1), tangent at P(1,2)
f = 10/(4*x + 1); tan_ = f.subs(x, 1) + D(f, x).subs(x, 1)*(x - 1)
z('4a', tan_.subs(x, 0) - R(18, 5)); z('4b', I(f - tan_, (x, 0, 1)) - (R(5, 2)*ln(5) - R(14, 5)))
# 5  y = sqrt(2x+5), normal at A(2,3) meets x-axis at B(3,0)
f = sqrt(2*x + 5); z('5a', -1/D(f, x).subs(x, 2) + 3); z('5b', I(f, (x, 0, 2)) + R(3, 2) - (R(21, 2) - 5*sqrt(5)/3))
# 6  y = (cos2x + 2cosx + 1)/2
f = (cos(2*x) + 2*cos(x) + 1)/2
z("6a y'", D(f, x).subs(x, 2*pi/3)); z('6a y', f.subs(x, 2*pi/3) + R(1, 4)); z('6b', I(f, (x, 0, pi/2)) - I(f, (x, pi/2, pi)) - 2)
# 7  y = e^{x-1} - 2, normal at P(2, e-2)
f = sp.exp(x - 1) - 2; xq = 2 + E*(E - 2); r0 = 1 + ln(2)
z('7a', (0 - (E - 2)) - (-1/D(f, x).subs(x, 2))*(xq - 2))
z('7b', -I(f, (x, 0, r0)) + I(f, (x, r0, 2)) + R(1, 2)*(xq - 2)*(E - 2) - 2.56, 5e-3)
# 8  y = 2 + 3 ln x, normal at A(1,2) meets x-axis at B(7,0)
f = 2 + 3*ln(x); z('8a', 2 + (-1/D(f, x).subs(x, 1))*(7 - 1)); z('8b', I(f, (x, E**R(-2, 3), 1)) + 6 - (5 + 3*E**R(-2, 3)))
# 9  v = 2t - 11 + 6/(t+1)
v = 2*t - 11 + 6/(t + 1); print('9 rest', sp.solve(v, t)); z('9a', D(v, t).subs(t, 5) - R(11, 6))
z('9b', sp.Integral(sp.Abs(v), (t, 5, 6)).evalf() - 0.925, 5e-4); z('9c', sp.Integral(sp.Abs(v), (t, 0, 6)).evalf() - 20.2, 5e-2)
# 10  v = 2e^{0.1t} - 10e^{-0.3t}
v = 2*sp.exp(t/10) - 10*sp.exp(-3*t/10); T = R(5, 2)*ln(5); s = I(v, (t, 0, t))
z('10a', v.subs(t, T)); z('10b', D(v, t).subs(t, T) - 1.20, 5e-3); z('10c', -s.subs(t, T) - 13.5, 5e-2)
z('10d s(10)', s.subs(t, 10) - 2.69, 5e-3); z('10d s(11)', s.subs(t, 11) - 7.98, 5e-3)
print('ALL OK' if ok else 'SOMETHING FAILED')
