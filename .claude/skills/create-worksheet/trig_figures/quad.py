import numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.patches import Arc
plt.rcParams.update({'font.family':'serif','font.size':10,'mathtext.fontset':'cm'})
QNAME={1:'1st quadrant',2:'2nd quadrant',3:'3rd quadrant',4:'4th quadrant'}
def quadrant(out, quad, adj, opp, hyp, angle_name=r'$\theta$', derived='hyp', pyth=None, title=None, w=7.2, h=6.2):
    """adj, opp: signed lengths as strings/numbers along x and y; hyp: string. derived: which side came from Pythagoras."""
    sx = 1 if quad in (1,4) else -1; sy = 1 if quad in (1,2) else -1
    a, o = 1.0, 0.85  # drawing proportions
    f, ax = plt.subplots(figsize=(w/2.54*1.6, h/2.54*1.6))
    for s in ('top','right','left','bottom'): ax.spines[s].set_visible(False)
    ax.set_xticks([]); ax.set_yticks([]); ax.set_xlim(-1.75,1.75); ax.set_ylim(-1.45,1.45); ax.set_aspect('equal')
    ax.annotate('', xy=(1.7,0), xytext=(-1.7,0), arrowprops=dict(arrowstyle='->', lw=1.1, color='k'))
    ax.annotate('', xy=(0,1.4), xytext=(0,-1.4), arrowprops=dict(arrowstyle='->', lw=1.1, color='k'))
    ax.text(1.72,-0.14,'$x$',fontsize=11); ax.text(0.06,1.3,'$y$',fontsize=11)
    X, Y = sx*a, sy*o
    ax.plot([0,X],[0,0],color='#1f4fd6',lw=2); ax.plot([X,X],[0,Y],color='#1f4fd6',lw=2); ax.plot([0,X],[0,Y],color='#1f4fd6',lw=2)
    # right-angle mark
    m=0.1; ax.plot([X-sx*m,X-sx*m,X],[0,sy*m,sy*m],color='#1f4fd6',lw=1)
    # angle arc from +x axis to hypotenuse (anticlockwise), red
    th = np.degrees(np.arctan2(Y, X)) % 360
    ax.add_patch(Arc((0,0),0.44,0.44,theta1=0,theta2=th,color='red',lw=1.6))
    ang = np.radians(th*0.5); rr = 0.38 if th < 200 else 0.36
    ax.text(rr*np.cos(ang), rr*np.sin(ang), angle_name, color='red', fontsize=12, ha='center', va='center')
    ax.plot([0,0.26],[0,0],color='red',lw=1.6)
    # labels
    ax.text(X/2 - sx*0.18, -sy*0.15, str(adj), ha='center', va='center', fontsize=12, fontweight='bold')
    ax.text(X + sx*0.16, Y/2, str(opp), ha='center', va='center', fontsize=12, fontweight='bold')
    ax.text(0.3*X - sx*0.22, 0.3*Y + sy*0.2, str(hyp), ha='center', va='center', fontsize=12, fontweight='bold')   # value near the origin end
    ax.text(sx*1.0, sy*1.25, QNAME[quad], ha='center', fontsize=10, fontweight='bold')
    ax.annotate('Adjacent', xy=(X/2 + sx*0.22, -sy*0.03), xytext=(X/2 + sx*0.25, -sy*0.5), ha='center', fontsize=9, fontweight='bold', arrowprops=dict(arrowstyle='->', lw=0.7))
    ax.annotate('Opposite', xy=(X+sx*0.03, Y*0.75), xytext=(X+sx*0.45, Y/2 + sy*0.55), ha='center', fontsize=9, fontweight='bold', arrowprops=dict(arrowstyle='->', lw=0.7))
    ax.annotate('Hypotenuse', xy=(0.72*X - sx*0.03, 0.72*Y + sy*0.03), xytext=(-sx*0.45, sy*1.05), ha='center', fontsize=9, fontweight='bold', arrowprops=dict(arrowstyle='->', lw=0.7))   # arrow lands on the far end
    if pyth: ax.text(-sx*0.12, -sy*0.85, 'by Pythagoras\' Theorem\n'+pyth, ha='right' if sx>0 else 'left', va='center', fontsize=11, color='#222')
    if title: ax.set_title(title, fontsize=10, pad=2)
    plt.savefig(out, dpi=200, bbox_inches='tight'); plt.close()
if __name__ == '__main__':
    quadrant('sk/q_P.png', 4, '7', '$-24$', '25', angle_name='$P$', pyth=r'$\sqrt{25^2-7^2}=24$')
    quadrant('sk/q_Q.png', 4, '5', '$-12$', '13', angle_name='$Q$', pyth=r'$\sqrt{13^2-12^2}=5$')
    quadrant('sk/q_th.png', 1, '3', '1', r'$\sqrt{10}$', angle_name=r'$\theta$', pyth=r'$\sqrt{3^2+1^2}=\sqrt{10}$')
    quadrant('sk/q_18.png', 1, r'$\sqrt{1-p^2}$', '$p$', '1', angle_name=r'$18^\circ$', pyth=r'$\sqrt{1^2-p^2}$')
    print('ok')
