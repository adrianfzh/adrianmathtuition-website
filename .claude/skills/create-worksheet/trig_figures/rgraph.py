import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
import numpy as np
from axes import arrow_axes
plt.rcParams.update({'font.family':'serif','mathtext.fontset':'cm'})
R = np.sqrt(34); a = np.arctan(5/3)
t = np.linspace(0, np.pi/2, 400)
y = 3*np.cos(t) + 5*np.sin(t)
f, ax = plt.subplots(figsize=(3.1, 2.4))
ax.plot(t, y, 'k', lw=1.6)
ax.set_xlim(-0.12, np.pi/2 + 0.12); ax.set_ylim(0, 7)
ax.set_xticks([0, a, np.pi/2]); ax.set_xticklabels(['0', r'$1.0304$', r'$\frac{\pi}{2}$'], fontsize=8)
ax.set_yticks([3, 5, R]); ax.set_yticklabels([r'$3$', r'$5$', r'$\sqrt{34}$'], fontsize=8)
ax.plot([0],[3],'o',color='#c0392b',ms=5)
ax.plot([a],[R],'o',color='#2a9d2a',ms=5)
ax.plot([np.pi/2],[5],'o',color='k',ms=4)
ax.plot([0,0],[0,3],color='#c0392b',lw=0.8,ls=':')
ax.plot([0,a],[R,R],color='#2a9d2a',lw=0.8,ls=':'); ax.plot([a,a],[0,R],color='#2a9d2a',lw=0.8,ls=':')
ax.annotate('smallest here', xy=(0.02, 3), xytext=(0.30, 1.5), fontsize=7.5, color='#c0392b',
            arrowprops=dict(arrowstyle='->', color='#c0392b', lw=0.9))
ax.annotate('largest here', xy=(a, R), xytext=(0.55, 6.4), fontsize=7.5, color='#2a9d2a',
            arrowprops=dict(arrowstyle='->', color='#2a9d2a', lw=0.9))
# the curve carries its own name; the y-axis is named 'y' by arrow_axes, so a
# second rotated label down the side would say the same thing twice
ax.text(np.pi/2 - 0.05, 3.7, r'$y=3\cos\theta+5\sin\theta$', fontsize=7.5,
        ha='right', va='center')
arrow_axes(ax, xlabel=r'\theta', ylabel='y', size=8.5)
ax.tick_params(length=2)
plt.savefig('rrange.png', dpi=220, bbox_inches='tight'); plt.close()
print('ok')
