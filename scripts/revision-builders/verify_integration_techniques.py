"""Answer check for build_integration_techniques.py: every printed antiderivative is
differentiated back to its integrand; definite integrals and unknown limits recomputed."""
import sympy as sp
x, y, n, p = sp.symbols('x y n p', real=True)
E, ln, sin, cos, tan, sqrt, pi, R, D = sp.E, sp.log, sp.sin, sp.cos, sp.tan, sp.sqrt, sp.pi, sp.Rational, sp.diff
ok = True
def back(name, F, f, pts=(0.31, 0.47, 0.9)):
    global ok
    g = all(abs(sp.N((D(F, x) - f).subs(x, q))) < 1e-9 for q in pts); ok &= g; print(name, 'OK' if g else 'FAIL')
def val(name, v, exp, tol=1e-9):
    global ok
    g = abs(sp.N(v - exp)) < tol; ok &= bool(g); print(name, 'OK' if g else 'FAIL', sp.N(v, 6))
back('1a', x**5/5 - 2*x**3/3 + x, (x**2 - 1)**2); back('1b', x**3/6 - x**2/4, (x**3 - x**2)/(2*x))
back('2', x**3/3 - 5*x - R(25, 4)/x, (x - 5/(2*x))**2)
back('3', (4*x + 3)**4/24 - 4/x, R(2, 3)*(4*x + 3)**3 + 4/x**2)
back('4', 1/(2*sqrt(7 - 4*x)), (7 - 4*x)**R(-3, 2))
back('5', R(5, 3)*ln(3*x + 1) - 4/(1 - x), 5/(3*x + 1) - 4/(1 - x)**2)
back('6', (2*x - 3)**3/6 + R(5, 2)*ln(2*x - 3), ((2*x - 3)**3 + 5)/(2*x - 3), pts=(2, 3, 4))
back('7', x + ln(5 - 3*x), (2 - 3*x)/(5 - 3*x))
back('8', -R(4, 5)*ln(2 - 5*x) - 1/x**2 + sp.exp(4*x)/4, 4/(2 - 5*x) + 2/x**3 + sp.exp(4*x), pts=(0.1, 0.2, 0.3))
back('9', -2*sp.exp(-x/2) - cos(3*x)/3, sp.exp(-x/2) + sin(3*x))
back('10a', cos(2*x)/2 + tan(x), 1 - sin(2*x) + tan(x)**2); back('10b', -1/(4*sp.exp(3*x - 6)), 3/(4*sp.exp(3*x - 6)))
back('11', R(2, 3)*tan(3*x - 1) + 4*cos(x/4), 2/cos(3*x - 1)**2 - sin(x/4))
back('12', x/2 - sin(2*x)/4 + ln(x), sin(x)**2 + 1/x)
back('13', R(5, 6)*tan(2*x/5) - x/3, tan(2*x/5)**2/3)
val('14', sp.integrate(sin(3*x)/2 - cos(x)**2, (x, 0, pi/3)), -0.41, 5e-3)
val('15', sp.integrate(2/sqrt(5 - 3*x), (x, -1, 1)), 4*sqrt(2)/3)
val('16', sp.integrate(3/(2*y - 5), (y, R(34, 9), 14)), ln(27))
val('17', sp.integrate((x - 5)/(x**2 - 2*x - 15), (x, R(4, 3), 8)), ln(R(33, 13)))
f = (5*x**4 + 10*x**2 + 3)/(x*(x**2 + 3))
back('18a', 5*x**2/2 + ln(x) - 3*ln(x**2 + 3), f); back('18c', 5*x**2/4 + ln(x)/2 - R(3, 2)*ln(x**2 + 3), f/2)
val('19', (D(sp.exp(-2*x)*sin(4*x), x)/sp.exp(-2*x)).subs(x, pi/4), -4)
g = x*sp.exp(R(2, 5)*x - 5)
back('20a', g, sp.exp(R(2, 5)*x - 5)*(R(2, 5)*x + 1)); back('20c', R(5, 2)*g - R(25, 4)*sp.exp(R(2, 5)*x - 5), g)
val('20b', D(g, x).subs(x, -R(5, 2)), 0)
print('ALL OK' if ok else 'SOMETHING FAILED')
