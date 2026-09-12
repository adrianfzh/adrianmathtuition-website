import numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
plt.rcParams.update({'font.family':'serif','font.size':9,'mathtext.fontset':'cm'})
def axes(ax, xlim, ylim):
    for s in ('top','right'): ax.spines[s].set_visible(False)
    ax.spines['left'].set_position('zero'); ax.spines['bottom'].set_position('zero')
    ax.set_xlim(*xlim); ax.set_ylim(*ylim)
    ax.plot(1,0,'>k',transform=ax.get_yaxis_transform(),clip_on=False,ms=5); ax.plot(0,1,'^k',transform=ax.get_xaxis_transform(),clip_on=False,ms=5)
def deg_ticks(ax, step, end): ax.set_xticks(range(0,end+1,step)); ax.set_xticklabels([f'{v}°' for v in range(0,end+1,step)])
def pi_ticks(ax, fr, end):
    vals=[k*fr for k in range(0,int(round(end/fr))+1)]; ax.set_xticks(vals)
    lab={0:'0'}
    for v in vals[1:]:
        r=v/np.pi; n=round(r*4); d=4
        from fractions import Fraction; f=Fraction(n,d)
        lab[v]=('π' if f==1 else f'{f.numerator}π' if f.denominator==1 else (f'π/{f.denominator}' if f.numerator==1 else f'{f.numerator}π/{f.denominator}'))
    ax.set_xticklabels([lab[v] for v in vals])
def fig(w=9,h=4.6): return plt.subplots(figsize=(w/2.54*1.9,h/2.54*1.9))
def mark(ax, x, y, txt, dx=0, dy=0.25, ha='center'): ax.plot([x],[y],'ko',ms=3); ax.text(x+dx, y+dy, txt, ha=ha, fontsize=8)

# D1: y = 3cos2x - 1, 0..360 deg
f,ax=fig(); x=np.linspace(0,360,721); ax.plot(x,3*np.cos(np.radians(2*x))-1,'k',lw=1.4); axes(ax,(-5,375),(-5,3.2)); deg_ticks(ax,90,360); ax.set_yticks([-4,-1,2])
for xv in (0,180,360): mark(ax,xv,2,'')
for xv in (90,270): mark(ax,xv,-4,'')
ax.text(365,-0.4,'x'); ax.text(8,3.0,'y'); ax.text(180,2.3,'$y=3\\cos 2x-1$',fontsize=8)
plt.savefig('sk/d1.png',dpi=200,bbox_inches='tight'); plt.close()
# D5: given 3sin2x-1 (thin) and 4cos2x+2 (bold), 0..pi
f,ax=fig(); x=np.linspace(0,np.pi,400); ax.plot(x,3*np.sin(2*x)-1,'k',lw=0.9,alpha=0.6); ax.plot(x,4*np.cos(2*x)+2,'k',lw=1.6); axes(ax,(-0.1,3.4),(-4.7,7.2)); pi_ticks(ax,np.pi/4,np.pi); ax.set_yticks([-4,-2,2,6])
mark(ax,0,6,'(0, 6)',dx=0.28,dy=0.3); mark(ax,np.pi/2,-2,'$(\\pi/2,\\,-2)$',dy=-0.9); mark(ax,np.pi,6,'$(\\pi,\\,6)$',dx=-0.3,dy=0.3)
mark(ax,np.pi/4,2,'',); mark(ax,3*np.pi/4,-4,'')
ax.text(3.3,-0.5,'x'); ax.text(0.06,7.0,'y'); ax.text(1.05,4.6,'$y=4\\cos 2x+2$',fontsize=8); ax.text(1.9,0.4,'$y=3\\sin 2x-1$',fontsize=7,alpha=0.7)
plt.savefig('sk/d5.png',dpi=200,bbox_inches='tight'); plt.close()
# Line: 3cos2x-1 on 0..2pi and y = 1 - 2x/pi
f,ax=fig(10,4.8); x=np.linspace(0,2*np.pi,600); ax.plot(x,3*np.cos(2*x)-1,'k',lw=1.4); ax.plot([0,2*np.pi],[1,-3],'k--',lw=1.1); axes(ax,(-0.15,6.7),(-4.8,3.2)); pi_ticks(ax,np.pi/2,2*np.pi); ax.set_yticks([-4,-3,-1,1,2])
xs=[]; 
from scipy.optimize import brentq
g=lambda t:3*np.cos(2*t)-1-(1-2*t/np.pi)
for a,b in ((0,np.pi/2),(np.pi/2,np.pi),(np.pi,1.5*np.pi),(1.5*np.pi,2*np.pi)):
    try: xs.append(brentq(g,a+1e-6,b-1e-6))
    except Exception: pass
for xv in xs: ax.plot([xv],[1-2*xv/np.pi],'ko',ms=3.5)
ax.text(6.6,-0.5,'x'); ax.text(0.08,3.0,'y'); ax.text(3.6,1.6,'$y=3\\cos 2x-1$',fontsize=8); ax.text(4.9,-2.0,'$y=1-\\dfrac{2}{\\pi}x$',fontsize=8)
plt.savefig('sk/line.png',dpi=200,bbox_inches='tight'); plt.close(); print('line crossings', len(xs))
# D7: 4 sin 3x - 2, 0..360
f,ax=fig(10,4.6); x=np.linspace(0,360,1000); ax.plot(x,4*np.sin(np.radians(3*x))-2,'k',lw=1.4); axes(ax,(-5,375),(-7,3.2)); deg_ticks(ax,60,360); ax.set_yticks([-6,-2,2])
for xv in (30,150,270): mark(ax,xv,2,'')
for xv in (90,210,330): mark(ax,xv,-6,'')
ax.text(366,-2.6,'x'); ax.text(8,3.0,'y'); ax.text(200,2.4,'$f(x)=4\\sin 3x-2$',fontsize=8)
plt.savefig('sk/d7.png',dpi=200,bbox_inches='tight'); plt.close()
# E3: H = 1.2 sin 2t + 1.4, 0..2pi
f,ax=fig(10,4.2); t=np.linspace(0,2*np.pi,600); ax.plot(t,1.2*np.sin(2*t)+1.4,'k',lw=1.4); axes(ax,(-0.15,6.7),(-0.3,3.1)); pi_ticks(ax,np.pi/4,2*np.pi); ax.set_yticks([0.2,1.4,2.6])
ax.axhline(1.4,color='k',lw=0.5,ls=':')
for tv in (np.pi/4,5*np.pi/4): mark(ax,tv,2.6,'')
for tv in (3*np.pi/4,7*np.pi/4): mark(ax,tv,0.2,'')
ax.text(6.6,-0.25,'t'); ax.text(0.08,2.95,'H'); ax.text(2.2,2.8,'$H=1.2\\sin 2t+1.4$',fontsize=8)
plt.savefig('sk/e3.png',dpi=200,bbox_inches='tight'); plt.close()
print('done')
