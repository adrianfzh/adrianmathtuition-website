import sympy as sp
k = sp.Symbol('k')
a = sp.Symbol('a', positive=True)
ok=True
def check(l, got, want, tol=1e-9):
    global ok
    g,w = sp.N(got), sp.N(want); good = abs(g-w) < tol; ok &= bool(good)
    print(f"  [{'OK ' if good else 'FAIL'}] {l}: {g} vs {w}")

print("\n1. SCGS 2022 -- y = k a^x through (0, 1.5) and (5, 48)")
kk = sp.Rational(3,2)                      # y(0) = k
aa = sp.solve(sp.Eq(kk*a**5, 48), a)
aa = [r for r in aa if r.is_real and r > 0][0]
check("k", kk, 1.5); check("a", aa, 2)

print("\n2. Mayflower 2022 -- y = k a^{-x} through B(0,3), A(-1,6)")
kk2 = 3
aa2 = [r for r in sp.solve(sp.Eq(kk2*a**(1), 6), a) if r.is_real and r > 0][0]
check("k", kk2, 3); check("a", aa2, 2)

print("\n3. Anglican High 2022 -- y = k a^x + 1 through (0,-3) and (4,-323)")
kk3 = sp.solve(sp.Eq(k + 1, -3), k)[0]
aa3 = [r for r in sp.solve(sp.Eq(kk3*a**4 + 1, -323), a) if r.is_real and r > 0][0]
check("k", kk3, -4); check("a", aa3, 3)

print("\n4. St Joseph Institute 2024 -- y = k a^{-x} through Q(0,3/2), P(-2,96)")
kk4 = sp.Rational(3,2)
aa4 = [r for r in sp.solve(sp.Eq(kk4*a**2, 96), a) if r.is_real and r > 0][0]
check("k", kk4, 1.5); check("a", aa4, 8)

print("\n" + ("ALL GRAPH EXAMPLES VERIFIED" if ok else "*** FAILED ***"))
raise SystemExit(0 if ok else 1)
