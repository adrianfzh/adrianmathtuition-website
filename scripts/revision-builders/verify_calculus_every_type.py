"""Answer check for build_calculus_every_type.py — every answer recomputed with sympy
from the question as printed (derivatives compared symbolically, integrals by
differentiating back or by numeric quadrature, kinematics by integrating |v|)."""
import sympy as sp
x, t, q, c = sp.symbols('x t q c', real=True)
E, ln, sin, cos, tan, sqrt, pi = sp.E, sp.log, sp.sin, sp.cos, sp.tan, sp.sqrt, sp.pi
ok = True
def same(name, a, b, var=x, pts=(0.3, 0.37, 0.41)):
    global ok
    g = all(abs(sp.N((a - b).subs(var, p))) < 1e-9 for p in pts); ok &= g
    print(name, 'OK' if g else 'FAIL')
def num(name, val, exp, tol=None):
    global ok
    v = float(sp.N(val)); tol = tol or 0.5 * 10 ** (sp.floor(sp.log(abs(exp), 10)) - 2) if exp else 1e-9
    g = abs(v - float(exp)) <= float(tol); ok &= g
    print(name, 'OK' if g else 'FAIL', round(v, 6), 'printed', exp)
def dist(v, a, b):
    return sp.Integral(sp.Abs(v), (t, a, b)).evalf(12)
D = sp.diff
# 1
same('1a', D((2*x**2 - 3*x + 1)**5, x), 5*(4*x - 3)*(2*x**2 - 3*x + 1)**4)
same('1b', D((2*x + 3)**2*sqrt(1 - 4*x), x), 2*(2*x + 3)*(-1 - 10*x)/sqrt(1 - 4*x), pts=(0.1, -0.3, 0.2))
same('1c', D((x - 2)/sqrt(1 - 2*x), x), (-1 - x)/(1 - 2*x)**sp.Rational(3, 2), pts=(0.1, -0.3, 0.2))
# 2
same('2a', D(sqrt(2 - 3*cos(4*x)**2), x), 6*sin(8*x)/sqrt(2 - 3*cos(4*x)**2), pts=(0.3, 0.35, 0.4))
same('2b', D(2*x**3*tan(6*x), x), 6*x**2*(tan(6*x) + 2*x/cos(6*x)**2))
# 3
same('3a', D(sp.exp(3*x)*tan(2*x), x), sp.exp(3*x)*(3*tan(2*x) + 2/cos(2*x)**2))
same('3b', D(sin(3*x)/(3*x), x), (3*x*cos(3*x) - sin(3*x))/(3*x**2))
# 4
y = ln(sqrt((5 + 3*x)/(2*x - 5)))
print('4 meets x-axis at', sp.solve(sp.Eq((5 + 3*x)/(2*x - 5), 1), x))
num('4i', D(y, x).subs(x, -10), sp.Rational(-1, 50), 1e-12)
same('4ii', D(y, x), -25/(2*(5 + 3*x)*(2*x - 5)), pts=(3, 4, -10))
# 5
y = 7*x**3*sp.exp(-2*x)
same('5a', D(y, x), 7*x**2*sp.exp(-2*x)*(3 - 2*x))
same('5b', sp.exp(2*x)*(4*D(y, x) + D(y, x, 2) + 4*y), 42*x)
# 6
same('6', D(sp.Rational(2, 5)*(4 + 5*x)**sp.Rational(3, 2) - 1/x**2 + sp.Rational(6, 7)*ln(7*x - 1), x),
     3*sqrt(4 + 5*x) + 2/x**3 + 6/(7*x - 1), pts=(1, 2, 3))
# 7, 8
num('7', sp.integrate(3*cos(x)**2 - sin(x)**2, (x, 0, pi/12)) - (6 + pi)/12, 0, 1e-12)
num('8', sp.Integral(5*sin(2*x) + 1/cos(x/3)**2, (x, pi/4, pi)).evalf(), 1.89)
# 9
same('9a', D(ln(x)/x**2, x), (1 - 2*ln(x))/x**3)
same('9b', D(-ln(x)/(2*x**2) - 1/(4*x**2), x), ln(x)/x**3)
# 10
same('10a', D(sp.exp(3*x)*(2*x - 5), x), sp.exp(3*x)*(6*x - 13))
num('10b', sp.integrate(x*sp.exp(3*x), (x, 0, 4)) - (sp.Rational(11, 9)*E**12 + sp.Rational(1, 9)), 0, 1e-6)
# 11
f = (5*x**4 + 10*x**2 + 3)/(x*(x**2 + 3))
same('11a', f, 5*x + 1/x - 6*x/(x**2 + 3), pts=(1, 2, 3))
same('11c', D(5*x**2/4 + ln(x)/2 - sp.Rational(3, 2)*ln(x**2 + 3), x), f/2, pts=(1, 2, 3))
# 12  s = 4 - 2e^-t - t
s = 4 - 2*sp.exp(-t) - t; v = D(s, t)
num('12a', s.subs(t, 0), 2, 1e-12); num('12b', v.subs(t, 0), 1, 1e-12)
print('12c rest at', sp.solve(v, t)); num('12d', dist(v, 0, 2), 0.884)
# 13  a = -e^{-0.1t}, v(0) = 8
v = 8 + sp.integrate(-sp.exp(-t/10), (t, 0, t)); s = sp.integrate(v, (t, 0, t))
num('13i', v.subs(t, 10*ln(5)), 0, 1e-9); num('13ii', s.subs(t, 10*ln(5)), 47.8)
num('13iii s(49)', s.subs(t, 49), 1.255, 1e-3); num('13iii s(50)', s.subs(t, 50), -0.674, 1e-3)
# 14  v = 3 sin 2t - 4 cos 2t
v = 3*sin(2*t) - 4*cos(2*t)
num('14a', D(v, t).subs(t, 0), 6, 1e-12); num('14b', dist(v, 0, 1.5), 4.70)
# 15  v = 2t - 11 + 6/(t+1)
v = 2*t - 11 + 6/(t + 1)
print('15 rest at', sp.solve(v, t)); num('15a', D(v, t).subs(t, 5), sp.Rational(11, 6), 1e-12)
num('15b', dist(v, 5, 6), 0.925); num('15c', dist(v, 0, 6), 20.2)
# 16
y = (1 + sin(x))/cos(x)
same('16a', D(y, x), (1 + sin(x))/cos(x)**2)
num('16b', sp.Integral((3 + 3*sin(x) - 10*cos(x)**3)/(5*cos(x)**2), (x, 0, pi/3)).evalf() - (sp.Rational(3, 5) - sp.Rational(2, 5)*sqrt(3)), 0, 1e-9)
# 17
f = sp.exp(5*x)/5 + x - sin(2*x)/2 + 4
same('17 f\'', D(f, x), sp.exp(5*x) + 2*sin(x)**2)
same('17 identity', 10*f + 3*D(f, x) - D(f, x, 2) + 7*sin(2*x) + 3*cos(2*x), 10*x + 43)
# 18
y = x*sp.exp(3*x)/(x + q)
same('18ii', (D(y, x) - sp.exp(3*x)*(3*x**2 + 3*q*x + q)/(x + q)**2).subs(q, 1.7), 0)
print('18iii q from discriminant 9q^2-12q=0:', sp.solve(9*q**2 - 12*q, q))
yq = y.subs(q, sp.Rational(4, 3)); num('18iii y', yq.subs(x, -sp.Rational(2, 3)) + E**-2, 0, 1e-12)
num("18iii y'", D(yq, x).subs(x, -sp.Rational(2, 3)), 0, 1e-12)
# 19
same('19a', D(ln(cos(x)), x), -tan(x))
f = 4*x**2 + sp.Rational(3, 4)*ln(cos(2*x)) + sp.Rational(7, 4)*x + 5
same("19 f''", D(f, x, 2), 8 - 3/cos(2*x)**2)
num("19 f'(pi/8)", D(f, x).subs(x, pi/8) - (pi + sp.Rational(1, 4)), 0, 1e-12); num('19 f(0)', f.subs(x, 0), 5, 1e-12)
num('19 f(pi/6)', f.subs(x, pi/6) - (pi**2/9 + 7*pi/24 + 5 - sp.Rational(3, 4)*ln(2)), 0, 1e-12)
# 20  v = e^{2t} - 10e^t + 21
v = sp.exp(2*t) - 10*sp.exp(t) + 21
print('20 rest at', sp.solve(v, t), ' min v at', sp.solve(D(v, t), t))
num('20a', D(v, t).subs(t, ln(3)), -12, 1e-9); num('20b', dist(v, 0, ln(5)), 8.34)
print('ALL OK' if ok else 'SOMETHING FAILED')
