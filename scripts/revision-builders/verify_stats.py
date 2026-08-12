import sympy as sp
ok = True
def check(l, got, want, tol=5e-3):
    global ok
    g, w = sp.N(got), sp.N(want)
    good = abs(g - w) < tol; ok &= bool(good)
    print(f"  [{'OK ' if good else 'FAIL'}] {l}: {g:.5f} vs {w:.5f}")

def grouped(mids, freqs):
    n = sum(freqs)
    mean = sp.Rational(sum(m*f for m, f in zip(mids, freqs)), n)
    var = sp.Rational(sum(f*m**2 for m, f in zip(mids, freqs)), n) - mean**2
    return mean, sp.sqrt(var)

print("\n1. Nan Hua 2022 -- mean 3.8 of 5 numbers, sum of squares 360, each x2")
var = sp.Rational(360,5) - sp.Rational(38,10)**2
check("original sd", sp.sqrt(var), 7.58683)
check("new sd (x2)", 2*sp.sqrt(var), 15.2, tol=5e-2)

print("\n2. Katong Convent 2021 -- n=10, mean 11.8, sd 4.729")
check("(i) sum x", 10*sp.Rational(118,10), 118)
sx2 = 10*(sp.Float('4.729')**2 + sp.Float('11.8')**2)
check("(ii) sum x^2", sx2, 1616, tol=0.6)

print("\n3. Gan Eng Seng 2025 -- hospital A grouped")
mean, sd = grouped([22,26,30,34,38], [8,10,21,7,4])
check("(a) mean", mean, sp.Rational(2912,100))
check("(a) sd", sd, 4.47, tol=5e-3)
p = sp.Rational(8,50)*sp.Rational(11,49) + sp.Rational(11,50)*sp.Rational(8,49)
check("(c) probability", p, sp.Rational(88,1225))
print(f"        exact probability = {sp.nsimplify(p)}")

print("\n4. Bukit View 2024 -- p,6,12,q,3 total 40, LQ = 20")
p_ = 10 - 6
check("(i) p", p_, 4)
q_ = 40 - p_ - 6 - 12 - 3
check("(ii) q", q_, 15)
mean4, sd4 = grouped([5,15,25,35,45], [p_,6,12,q_,3])
check("(iii) mean", mean4, sp.Rational(2675,100))
check("(iv) sd", sd4, 10.9, tol=5e-2)
print(f"        exact sd = {sp.N(sd4, 6)}")

print("\n" + ("ALL STATISTICS EXAMPLES VERIFIED" if ok else "*** FAILED ***"))
raise SystemExit(0 if ok else 1)
