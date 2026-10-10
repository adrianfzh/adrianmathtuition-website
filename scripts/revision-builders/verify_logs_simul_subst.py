# Independent check: scan for ALL real solutions of each ORIGINAL equation numerically,
# then compare with the answer printed on the sheet.
import cmath, math
from scipy.optimize import brentq, fsolve
import numpy as np
L=lambda b,a: math.log(a)/math.log(b)
lg=math.log10; ln=math.log
def roots1(f, lo, hi, n=200000, skip=()):
    xs=np.exp(np.linspace(math.log(lo),math.log(hi),n)) if lo>0 else np.linspace(lo,hi,n)
    out=[]; prev=None; px=None
    for x in xs:
        try: v=f(x)
        except (ValueError,ZeroDivisionError): prev=None; continue
        if prev is not None and (prev<0)!=(v<0) and abs(v-prev)<50:
            r=brentq(f,px,x)
            if abs(f(r))<1e-7: out.append(round(r,10))
        prev,px=v,x
    return out
def close(a,b): return len(a)==len(b) and all(abs(x-y)<=1e-6*max(1,abs(y)) for x,y in zip(sorted(a),sorted(b)))
ok=True
def one(name,f,lo,hi,exp):
    global ok
    r=roots1(f,lo,hi); g=close(r,exp); ok&=g
    print(name,'OK ' if g else 'FAIL',r,'expected',exp)
def pair(name,eqs,sols,bad=()):
    global ok
    for s in sols:
        res=[abs(e(*s)) for e in eqs]; g=max(res)<1e-9; ok&=g
        print(name,'OK ' if g else 'FAIL','solution',s,res)
    for s in bad:
        try:
            res=[abs(e(*s)) for e in eqs]; g=False
        except (ValueError,ZeroDivisionError): g=True
        ok&=g; print(name,'OK ' if g else 'FAIL','rejected',s,'undefined' if g else res)
# --- Section A: reduce by hand-independent route: eliminate y, scan x for every real root
# Q1  3^x=27*3^y -> y=x-3
one('Q1 x', lambda x: lg(x+2*(x-3))-lg(5)-lg(3), 2.01,100,[7]); pair('Q1',[lambda x,y:3**x-27*3**y, lambda x,y:lg(x+2*y)-lg(5)-lg(3)],[(7,4)])
# Q2  y=x-8
one('Q2 x', lambda x: L(9,14-2*(x-8))-L(9,x)-0.5, 0.01,14.99,[6]); pair('Q2',[lambda x,y:3**y-3**(x-7)/3, lambda x,y:L(9,14-2*y)-L(9,x)-0.5],[(6,-2)])
# Q3  y=x+1 ; candidates x=0,5
one('Q3 x', lambda x: L(3,x-4)-(L(3,(x+1)-1)-L(3,x)), 4.0001,1000,[5])
pair('Q3',[lambda x,y:5**(2*x)/5**(3*y)-5/(5**3*5**y), lambda x,y:L(3,x-4)-(L(3,y-1)-L(3,x))],[(5,6)],bad=[(0,1)])
# Q4  y=x^2 (x>0 needed for lg x)
one('Q4 x', lambda x: lg(8*x+22)-lg(x*x-1)-1/L(2,10), 1.0001,1000,[6])
pair('Q4',[lambda x,y:lg(8*x+22)-lg(y-1)-1/L(2,10), lambda x,y:math.exp(ln(y))-10**(2*lg(x))],[(6,36)],bad=[(-2,4)])
# Q5  y=-3x
one('Q5 x', lambda x: L(0.5,x-3*(-3*x)-6)+2-L(2,x), 0.6001,1000,[1])
pair('Q5',[lambda x,y:64**x*4**y-1, lambda x,y:L(0.5,x-3*y-6)+2-L(2,x)],[(1,-3)],bad=[(-0.4,1.2)])
# --- Section B
one('Q6', lambda y: L(5,y)**2+L(5,1/y**3)-28, 1e-6,1e7,[78125,1/625])
one('Q7', lambda x: 4**(x+1)+7*2**x-2, -30,30,[-2])
one('Q8', lambda x: ln(x)**2+2/(1/ln(x))-3, 1e-4,1e3,[math.e,math.e**-3])
one('Q9', lambda x: L(3,3*x*x)+4-L(x,27), 1e-4,1e3,[3**0.5,1/27])
one('Q10', lambda x: 2**x-(2**0.5)**(x+2)-15, -30,30,[2*lg(5)/lg(2)]); print('   Q10 3sf',round(2*lg(5)/lg(2),2))
one('Q11 x<1', lambda x: L(4,x)-3/L(x,8)-L(2,x)**2, 1e-4,0.999,[2**-0.5]); one('Q11 x>1', lambda x: L(4,x)-3/L(x,8)-L(2,x)**2, 1.001,1e3,[])
# --- Section C
pair('Q12',[lambda x,y:lg(x)*lg(y)-2, lambda x,y:lg(math.sqrt(x*y/10))-1],[(10,100),(100,10)])
one('Q12 x', lambda x: lg(x)*(3-lg(x))-2, 1e-3,1e6,[10,100])
one('Q13a x', lambda x: x/((x+6)/2)+(x+6)/2-1, -100,100,[-12,-2])
pair('Q13b',[lambda x,y:lg(x)/lg(y)+lg(y)-1, lambda x,y:lg(x/y**2)+6],[(1e-2,1e2),(1e-12,1e-3)])
# Q13b all roots: lg y = t, lg x = 2t-6
one('Q13b t', lambda t: (2*t-6)/t+t-1, -50,50,[-3,2])
print('ALL OK' if ok else 'SOMETHING FAILED')
