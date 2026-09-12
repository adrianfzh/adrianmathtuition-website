import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
plt.rcParams.update({'font.family':'serif','mathtext.fontset':'cm'})
def astc(out, ticked, rad=False, title=None):
    """S A / T C reference like Adrian's notes; ticked = set of quadrant numbers used."""
    f, ax = plt.subplots(figsize=(2.5, 2.3)); ax.set_xlim(-1.3,1.3); ax.set_ylim(-1.35,1.35); ax.axis('off')
    ax.plot([-1.15,1.15],[0,0],'k',lw=1); ax.plot([0,0],[-1.15,1.15],'k',lw=1)
    gen = {1: r'$\alpha$', 2: (r'$\pi-\alpha$' if rad else r'$180^\circ-\alpha$'), 3: (r'$\pi+\alpha$' if rad else r'$180^\circ+\alpha$'), 4: (r'$2\pi-\alpha$' if rad else r'$360^\circ-\alpha$')}
    pos = {1:(0.55,0.62,'A'), 2:(-0.55,0.62,'S'), 3:(-0.55,-0.5,'T'), 4:(0.55,-0.5,'C')}
    names = {1:'1st quadrant',2:'2nd quadrant',3:'3rd quadrant',4:'4th quadrant'}
    for q,(x,y,L) in pos.items():
        on = q in ticked; col = 'k' if on else '#b0b0b0'
        ax.text(x, y, L, ha='center', va='center', fontsize=20, color=col, fontweight='bold' if on else 'normal')
        ax.text(x, y-0.42, gen[q], ha='center', va='center', fontsize=10, color=col, fontweight='bold' if on else 'normal')
        ax.text(x, 1.22 if y>0 else -1.22, names[q], ha='center', va='center', fontsize=6.5, color='#888')
        if on: ax.plot([x-0.5,x-0.42,x-0.28],[y+0.3,y+0.18,y+0.42],color='#2a9d2a',lw=2.2)
    if title: ax.set_title(title, fontsize=8)
    plt.savefig(out, dpi=220, bbox_inches='tight'); plt.close()
if __name__=='__main__':
    astc('sk/astc_sin_neg.png', {3,4}); astc('sk/astc_sin_pos.png', {1,2}); astc('sk/astc_cos_pos.png', {1,4}); astc('sk/astc_cos_neg.png', {2,3})
    astc('sk/astc_tan_pos.png', {1,3}); astc('sk/astc_tan_neg.png', {2,4}); astc('sk/astc_tan_pos_rad.png', {1,3}, rad=True); astc('sk/astc_tan_neg_rad.png', {2,4}, rad=True)
    astc('sk/astc_cos_pm.png', {1,2}); print('ok')
