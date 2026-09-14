"""The graphs for the Section B notes block on trigonometric graphs.
Serif / cm mathtext to match astc.py and the rest of the sheet."""
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from axes import arrow_axes
plt.rcParams.update({'font.family': 'serif', 'mathtext.fontset': 'cm'})

DEG = np.pi / 180.0
CURVE = '#1a1a1a'
GUIDE = '#9a9a9a'
NOTE  = '#2a7d2a'
DIM   = '#b04a2a'


BOX = dict(facecolor='white', edgecolor='none', pad=0.6)


def _frame(ax, xmax, ymin, ymax, xticks, yticks, right=1.08):
    """Axes crossing at the origin, the way a sketch is drawn by hand."""
    ax.set_xlim(-xmax * 0.05, xmax * right)
    ax.set_ylim(ymin, ymax)
    ax.set_xticks(xticks)
    ax.set_xticklabels([f'${t}^\\circ$' for t in xticks], fontsize=6.3)
    ax.set_yticks(yticks)
    ax.set_yticklabels([f'${y:g}$' for y in yticks], fontsize=6.3)
    ax.tick_params(length=2, pad=1.5)
    # the curve runs straight through the axis labels; a white pad keeps them readable
    for t in list(ax.get_xticklabels()) + list(ax.get_yticklabels()):
        t.set_bbox(BOX); t.set_zorder(6)
    arrow_axes(ax, xlabel='x', ylabel='y', size=6.5)


def _sincos(out, fn, label):
    f, ax = plt.subplots(figsize=(2.3, 1.5))
    x = np.linspace(0, 360, 900)
    ax.plot(x, fn(x * DEG), color=CURVE, lw=1.6, zorder=3)
    _frame(ax, 360, -1.6, 1.8, [90, 180, 270, 360], [-1, 1])
    ax.axhline(1, color=GUIDE, ls=':', lw=0.7, zorder=1)
    ax.axhline(-1, color=GUIDE, ls=':', lw=0.7, zorder=1)
    ax.text(360, 1.75, label, fontsize=7.5, ha='right', va='top')
    f.savefig(out, dpi=220, bbox_inches='tight'); plt.close(f)


def _tan(out):
    f, ax = plt.subplots(figsize=(2.3, 1.5))
    for a, b in [(0, 90), (90, 270), (270, 360)]:
        x = np.linspace(a + 0.6, b - 0.6, 400)
        y = np.tan(x * DEG)
        y[np.abs(y) > 3.1] = np.nan
        ax.plot(x, y, color=CURVE, lw=1.6, zorder=3)
    for a in (90, 270):
        ax.plot([a, a], [-3.1, 3.1], color=DIM, ls='--', lw=0.8, zorder=2)
    _frame(ax, 360, -3.3, 4.8, [90, 180, 270, 360], [-1, 1])
    ax.text(180, 4.7, 'asymptotes', color=DIM, fontsize=6, ha='center', va='top')
    ax.annotate('', xy=(92, 3.3), xytext=(155, 4.25),
                arrowprops=dict(arrowstyle='->', color=DIM, lw=0.7))
    ax.annotate('', xy=(268, 3.3), xytext=(210, 4.25),
                arrowprops=dict(arrowstyle='->', color=DIM, lw=0.7))
    ax.text(180, -2.3, r'$y=\tan x$', fontsize=7.5, ha='center', va='center').set_bbox(BOX)
    f.savefig(out, dpi=220, bbox_inches='tight'); plt.close(f)


def variation(out, fn, xmax, ymin, ymax, xticks, yticks, centre=None,
              dots=(), period=None, amp=None, base=None, asym=(), note=None):
    """One variation graph: the curve, its centre line, and the one feature the
    column is teaching, marked on the picture."""
    f, ax = plt.subplots(figsize=(2.3, 1.55))
    if asym:
        edges = [0] + list(asym) + [xmax]
        for a, b in zip(edges[:-1], edges[1:]):
            x = np.linspace(a + xmax * 0.004, b - xmax * 0.004, 600)
            y = fn(x)
            y[(y > ymax * 0.70) | (y < ymin * 0.92)] = np.nan
            ax.plot(x, y, color=CURVE, lw=1.6, zorder=3)
        for a in asym:
            ax.plot([a, a], [ymin * 0.95, ymax * 0.92], color=DIM, ls='--', lw=0.8, zorder=2)
    else:
        x = np.linspace(0, xmax, 900)
        ax.plot(x, fn(x), color=CURVE, lw=1.6, zorder=3)
    if base is not None:
        x = np.linspace(0, xmax, 900)
        ax.plot(x, base(x), color=GUIDE, ls='--', lw=0.9, zorder=2)
    if centre:                      # y = 0 is already the x-axis; don't double it
        ax.plot([0, xmax], [centre, centre], color=NOTE, ls='-.', lw=0.8, zorder=2)
        ax.text(xmax * 1.04, centre, f'$y={centre:g}$', color=NOTE, fontsize=6,
                va='center', ha='left')
    _frame(ax, xmax, ymin, ymax, xticks, yticks, right=1.30 if centre else 1.08)
    for dx, dy in dots:
        ax.plot([dx], [dy], 'o', color=NOTE, ms=3.2, zorder=4)
    if amp is not None:
        xa, lo, hi = amp
        ax.annotate('', xy=(xa, hi), xytext=(xa, lo),
                    arrowprops=dict(arrowstyle='<->', color=NOTE, lw=0.8))
        ax.text(xa + xmax * 0.03, (lo + hi) / 2, f'${hi - lo:g}$', color=NOTE,
                fontsize=6.5, va='center').set_bbox(BOX)
    if period is not None:
        xa, xb, yy, txt = period
        ax.annotate('', xy=(xb, yy), xytext=(xa, yy),
                    arrowprops=dict(arrowstyle='<->', color=DIM, lw=0.8))
        ax.text((xa + xb) / 2, yy + (ymax - ymin) * 0.035, txt, color=DIM,
                fontsize=6.5, ha='center', va='bottom').set_bbox(BOX)
    if note:
        ax.text(xmax * 0.5, ymax, note, color=NOTE, fontsize=6.3,
                ha='center', va='top').set_bbox(BOX)
    f.savefig(out, dpi=220, bbox_inches='tight'); plt.close(f)


if __name__ == '__main__':
    _sincos('g_sin.png', np.sin, r'$y=\sin x$')
    _sincos('g_cos.png', np.cos, r'$y=\cos x$')
    _tan('g_tan.png')

    d = lambda t: t * DEG
    # 1. a on its own — y = 3 sin x, with y = sin x dashed underneath
    variation('v_sin_a.png', lambda t: 3 * np.sin(d(t)), 360, -3.7, 5.0,
              [90, 180, 270, 360], [-3, -1, 1, 3],
              base=lambda t: np.sin(d(t)), amp=(90, 0, 3),
              note=r'$y=\sin x$ dashed')
    # 2. b and c together — y = sin 2x + 1
    variation('v_sin_bc.png', lambda t: np.sin(2 * d(t)) + 1, 360, -0.9, 3.4,
              [90, 180, 270, 360], [1, 2], centre=1,
              period=(0, 180, 2.45, r'period $180^\circ$'),
              dots=[(45, 2), (135, 0)])
    # 3. a and b together — y = 2 cos 3x
    variation('v_cos_ab.png', lambda t: 2 * np.cos(3 * d(t)), 360, -2.7, 4.2,
              [120, 240, 360], [-2, 2],
              period=(0, 120, 2.5, r'period $120^\circ$'),
              amp=(120, 0, 2))
    # 4. a negative, and c — y = -2 cos x + 1
    variation('v_cos_neg.png', lambda t: -2 * np.cos(d(t)) + 1, 360, -2.0, 4.6,
              [90, 180, 270, 360], [-1, 1, 3], centre=1,
              base=lambda t: 2 * np.cos(d(t)) + 1,
              dots=[(180, 3), (0, -1)],
              note=r'$a<0$ turns the curve over')
    # 5. b on tan — y = tan 2x
    variation('v_tan_b.png', lambda t: np.tan(2 * d(t)), 180, -3.3, 4.6,
              [45, 90, 135, 180], [-1, 1], asym=(45, 135),
              period=(45, 135, 3.4, r'period $90^\circ$'))
    # 6. a and a fractional b on tan — y = 2 tan (x/2)
    variation('v_tan_ab.png', lambda t: 2 * np.tan(d(t) / 2), 360, -3.3, 5.2,
              [90, 180, 270, 360], [-2, 2], asym=(180,),
              period=(0, 360, 4.2, r'period $360^\circ$'))
    print('ok')
