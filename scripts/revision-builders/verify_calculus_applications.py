"""Answer check for build_calculus_applications.py (sympy, from the questions as printed)."""
import sympy as sp
x, t = sp.symbols('x t', real=True)
E, ln, sin, cos, tan, sqrt, pi, R, D = sp.E, sp.log, sp.sin, sp.cos, sp.tan, sp.sqrt, sp.pi, sp.Rational, sp.diff
ok = True
def z(name, expr, tol=1e-9, pts=None):
    global ok
    vals = [expr.subs(x, p) for p in pts] if pts else [expr]
    g = all(abs(sp.N(v)) < tol for v in vals); ok &= g; print(name, 'OK' if g else 'FAIL')
# 1  y = ln sqrt(5-2x)
y = ln(sqrt(5 - 2*x)); z('1a', D(y, x).subs(x, R(1, 2)) * R(1, 5) + R(1, 20)); z('1a y', y.subs(x, R(1, 2)) - ln(2))
c = y.subs(x, 0); m = -1/D(y, x).subs(x, 0); z('1b', R(1, 2)*(c/m)*c - ln(5)**2/40); z('1b 3sf', ln(5)**2/40 - 0.0648, 5e-5)
# 2  y = e^{-2x} tan x
y = sp.exp(-2*x)*tan(x); z('2a', D(y, x) - sp.exp(-2*x)*(1 - tan(x))**2, pts=(0.3, 0.9, 1.2)); z('2b', D(y, x).subs(x, pi/4))
# 3  y = x^2 ln 3x
y = x**2*ln(3*x); z('3a', D(y, x) - (x + 2*x*ln(3*x)), pts=(0.5, 2)); z('3b', sp.integrate(x*ln(3*x), (x, 1, 3)) - (R(17, 2)*ln(3) - 2))
z('3c', D(y, x).subs(x, 1/(3*sqrt(E)))); z('3d', 6/D(y, x).subs(x, E/3) - 6/E)
# 4  y = sin3x/(2+cos3x)
y = sin(3*x)/(2 + cos(3*x)); z('4 dy/dx', D(y, x) - 3*(2*cos(3*x) + 1)/(2 + cos(3*x))**2, pts=(0.3, 1.1, 2.9))
print('4a roots', sorted(sp.solveset(2*cos(3*x) + 1, x, sp.Interval(0, pi))))
g = all(sp.N(D(y, x).subs(x, p)) < 0 for p in (0.8, 1.2, 2.9, 3.1)) and all(sp.N(D(y, x).subs(x, p)) > 0 for p in (0.1, 0.6, 1.5, 2.7)); ok &= g; print('4c', 'OK' if g else 'FAIL')
# 5  y = e^{2x}(sin2x - cos2x)
y = sp.exp(2*x)*(sin(2*x) - cos(2*x)); z('5a', D(y, x) - 4*sp.exp(2*x)*sin(2*x), pts=(0.3, 1.9))
z('5c', sp.integrate(sp.exp(2*x)*sin(2*x), (x, 0, pi/2)) - (E**pi + 1)/4); z('5c 3sf', (E**pi + 1)/4 - 6.04, 5e-3)
# 6  f = x^2 e^{x+2}
f = x**2*sp.exp(x + 2); z("6a", D(f, x) - x*(x + 2)*sp.exp(x + 2), pts=(-1, 0.5))
print('6b f\'\'=0 at', sp.solve(D(f, x, 2), x)); z('6b', D(f, x).subs(x, -2 + sqrt(2)) - (2 - 2*sqrt(2))*E**sqrt(2))
# 7  partial fractions, curve through (0, ln 4)
g_ = (3*x**2 + 4*x - 20)/((2*x + 1)*(x**2 + 4)); z('7a', g_ - (4*x/(x**2 + 4) - 5/(2*x + 1)), pts=(1, 2))
y = 2*ln(x**2 + 4) - R(5, 2)*ln(2*x + 1) - ln(4); z('7c', D(y, x) - g_, pts=(1, 2)); z('7c y(0)', y.subs(x, 0) - ln(4))
# 8  y'' = 6e^{3x} + 1, gradient -2 at (0, -13/3)
y = R(2, 3)*sp.exp(3*x) + x**2/2 - 4*x - 5
z("8a y''", D(y, x, 2) - (6*sp.exp(3*x) + 1), pts=(0, 1)); z("8a y'(0)", D(y, x).subs(x, 0) + 2); z('8a y(0)', y.subs(x, 0) + R(13, 3))
g = sp.N(D(y, x).subs(x, 0)) < 0 < sp.N(D(y, x).subs(x, 1)); ok &= bool(g); print('8c', 'OK' if g else 'FAIL')
# 9  v = 3 sin 2t - 4 cos 2t
v = 3*sin(2*t) - 4*cos(2*t); z('9a', D(v, t).subs(t, 0) - 6); z('9b', sp.Integral(sp.Abs(v), (t, 0, 1.5)).evalf() - 4.70, 5e-3)
# 10  v = e^{2t} - 10e^t + 21
v = sp.exp(2*t) - 10*sp.exp(t) + 21; print('10 rest', sp.solve(v, t), 'min v', sp.solve(D(v, t), t))
z('10a', D(v, t).subs(t, ln(3)) + 12); z('10b', sp.Integral(sp.Abs(v), (t, 0, ln(5))).evalf() - 8.34, 5e-3)
# ---- Section D: differentiate, hence integrate (added 10 Oct 2026)
def same(name, a, b, pts=(0.3, 0.7, 1.1)): z(name, a - b, pts=pts)
same('11a', D(ln(x)/x**2, x), (1 - 2*ln(x))/x**3); same('11b', D(-ln(x)/(2*x**2) - 1/(4*x**2), x), ln(x)/x**3)
same('12a', D(sp.exp(3*x)*(2*x - 5), x), sp.exp(3*x)*(6*x - 13)); z('12b', sp.integrate(x*sp.exp(3*x), (x, 0, 4)) - (R(11, 9)*E**12 + R(1, 9)), 1e-5)
same('13a', D(x*cos(4*x), x), cos(4*x) - 4*x*sin(4*x)); z('13b', sp.integrate(x*sin(4*x), (x, 0, pi/12)) - (-pi/96 + sqrt(3)/32))
same('14a', D(ln(sqrt((3*x + 1)/(3*x - 1))), x), -3/((3*x + 1)*(3*x - 1)), pts=(0.5, 1, 2))
same('14b', D(-R(2, 3)*ln(sqrt((3*x + 1)/(3*x - 1))), x), 2/(9*x**2 - 1), pts=(0.5, 1, 2))
y = (x + 2)*sqrt(x - 1); same('15a', D(y, x), 3*x/(2*sqrt(x - 1)), pts=(2, 3, 5)); z('15b', 2/D(y, x).subs(x, 2) - R(2, 3)); z('15c', sp.integrate(x/sqrt(x - 1), (x, 2, 5)) - R(20, 3))
same('16a', D(-ln(cos(x)), x), tan(x)); same('16b', D(x*tan(x), x), x/cos(x)**2 + tan(x)); same('16c', D(x*tan(x) + ln(cos(x)), x), x/cos(x)**2)
same('17a', D(x*sin(x)**2, x), x*sin(2*x) - cos(2*x)/2 + R(1, 2)); same('17b', D(4*x*sin(x)**2 + sin(2*x) - 2*x, x), 4*x*sin(2*x))
same('18a', D(sin(2*x)**3, x), 6*sin(2*x)**2*cos(2*x)); same('18b', D(sin(2*x)/2 - sin(2*x)**3/6, x), cos(2*x)**3)
same('19a', D((x + 2)/sqrt(4 + 3*x**2), x), (4 - 6*x)/sqrt((4 + 3*x**2)**3)); z('19b', sp.Integral((6 - 9*x)/sqrt((4 + 3*x**2)**3), (x, 0, 2)).evalf(), 1e-9)
same('20a', D(x*sin(x) + cos(x), x), x*cos(x)); same('20b', D(x*sin(x)**3/3, x), sin(x)**3/3 - x*cos(x)**3 + x*cos(x))
same('20c', D(x*sin(x)**3 - 3*x*sin(x) - 3*cos(x), x), sin(x)**3 - 3*x*cos(x)**3)
same('21a', D(x*tan(x)**2, x), tan(x)**2 + 2*x*tan(x)/cos(x)**2)
f = R(2, 5)*(x*tan(x)**2 - tan(x) + x) + R(9, 5) - pi/5   # the bank key prints 4/5 here: that curve passes through (pi/4, 2/5), not (pi/4, 7/5)
same("21b f'", D(f, x), 4*x*tan(x)/(5*cos(x)**2)); z('21b point', f.subs(x, pi/4) - R(7, 5))
print('ALL OK' if ok else 'SOMETHING FAILED')
