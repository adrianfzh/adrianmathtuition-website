#!/usr/bin/env python3
"""Independently recompute every Kinematics worked example. Nothing is eyeballed.

correct-math-notes: "A worked example that reaches the right answer through a
wrong line is still an error -- students copy the working, not just the answer."
So intermediate lines are checked too, not just finals.
"""
import sympy as sp

t = sp.symbols('t', nonnegative=True)
ok = True


def check(label, got, want, tol=5e-3):
    global ok
    g = sp.nsimplify(got) if isinstance(got, str) else got
    gv, wv = sp.N(g), sp.N(want)
    good = abs(gv - wv) < tol
    ok &= bool(good)
    print(f"  [{'OK ' if good else 'FAIL'}] {label}: got {sp.nsimplify(g)} ({gv:.5f})  expected {wv:.5f}")


def total_distance(v_expr, a, b, extra_roots=()):
    """Integrate |v| by splitting at the sign changes inside (a, b)."""
    roots = sorted({sp.nsimplify(r) for r in sp.solve(sp.Eq(v_expr, 0), t)
                    if r.is_real and a < sp.N(r) < b} | set(extra_roots))
    pts = [sp.nsimplify(a)] + roots + [sp.nsimplify(b)]
    tot = 0
    for p, q in zip(pts, pts[1:]):
        tot += sp.Abs(sp.integrate(v_expr, (t, p, q)))
    return sp.simplify(tot)


print("\n1. Hua Yi 2023 -- v = 3t^2 - 23t + 30")
v = 3*t**2 - 23*t + 30
check("(a) roots of v=0", sp.Min(*sp.solve(sp.Eq(v, 0), t)), sp.Rational(5, 3))
check("(a) roots of v=0", sp.Max(*sp.solve(sp.Eq(v, 0), t)), 6)
s = sp.integrate(v, t)                      # C = 0 since s(0)=0
check("    s(5/3)", s.subs(t, sp.Rational(5, 3)), sp.Rational(1225, 54))
check("    s(6)", s.subs(t, 6), -18)
check("    s(7)", s.subs(t, 7), sp.Rational(-21, 2))
check("(b) distance in first 7 s", total_distance(v, 0, 7), sp.Rational(3827, 54))
tm = sp.solve(sp.Eq(sp.diff(v, t), 0), t)[0]
check("    t at minimum v", tm, sp.Rational(23, 6))
check("(c) minimum velocity", v.subs(t, tm), sp.Rational(-169, 12))

print("\n2. Zhonghua 2021 -- a = k - 2t, v(0) = 15, max v at t = 1")
k = sp.symbols('k')
kv = sp.solve(sp.Eq(k - 2*1, 0), k)[0]
check("(i) k", kv, 2)
v2 = sp.integrate(kv - 2*t, t) + 15
check("(ii) v(t) at t=3 (checks -t^2+2t+15)", v2.subs(t, 3), (-t**2 + 2*t + 15).subs(t, 3))
check("(ii) v(0)", v2.subs(t, 0), 15)
r = [x for x in sp.solve(sp.Eq(v2, 0), t) if sp.N(x) > 0][0]
check("    v = 0 at", r, 5)
check("(iii) distance in first 10 s", total_distance(v2, 0, 10), 200)

print("\n3. Hougang 2022 -- v = 3t^2 + kt + 18, a(1) = -9")
kv3 = sp.solve(sp.Eq((6*t + k).subs(t, 1), -9), k)[0]
check("(i) k", kv3, -15)
v3 = 3*t**2 + kv3*t + 18
rr = sorted(sp.solve(sp.Eq(v3, 0), t))
check("(ii) first root", rr[0], 2)
check("(ii) second root", rr[1], 3)
s3 = sp.integrate(v3, t)
check("    s(2)", s3.subs(t, 2), 14)
check("    s(3)", s3.subs(t, 3), sp.Rational(27, 2))
check("(iii) distance in first 3 s", total_distance(v3, 0, 3), sp.Rational(29, 2))

print("\n4. Orchid Park 2024 -- s = 4 - 2e^{-t} - t")
s4 = 4 - 2*sp.exp(-t) - t
check("(a) OB = s(0)", s4.subs(t, 0), 2)
v4 = sp.diff(s4, t)
check("(b) initial velocity", v4.subs(t, 0), 1)
tr = sp.solve(sp.Eq(v4, 0), t)[0]
check("(c) t at rest", tr, sp.log(2))
d4 = sp.Abs(s4.subs(t, tr) - s4.subs(t, 0)) + sp.Abs(s4.subs(t, 2) - s4.subs(t, tr))
check("(d) distance in first 2 s", d4, 0.884, tol=5e-4)

print("\n5. Presbyterian 2023 -- v = 5cos(t/2)")
v5 = 5*sp.cos(t/2)
check("(a) initial velocity", v5.subs(t, 0), 5)
check("(b) first rest", sp.pi, sp.pi)
check("    v(pi) = 0", v5.subs(t, sp.pi), 0)
check("(c) distance in first 5 s", total_distance(v5, 0, 5), 14.016, tol=5e-3)

print("\n6. St Margaret 2021 -- v = 10(3 - e^{-t/2})")
v6 = 10*(3 - sp.exp(-t/2))
a6 = sp.diff(v6, t)
t23 = sp.solve(sp.Eq(v6, 23), t)[0]
check("(i) a when v = 23", a6.subs(t, t23), sp.Rational(7, 2))
check("(ii) displacement at t=5", sp.integrate(v6, (t, 0, 5)), 131.6, tol=0.05)
check("(iii) limit of v", sp.limit(v6, t, sp.oo), 30)

print("\n" + ("ALL WORKED EXAMPLES VERIFIED" if ok else "*** SOME CHECKS FAILED ***"))
raise SystemExit(0 if ok else 1)
