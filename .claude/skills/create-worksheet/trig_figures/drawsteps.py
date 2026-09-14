"""The step-by-step series for "how to draw a trigonometric graph".
Six panels of the SAME axes, each adding one step, so the student watches the
picture being built (Adrian, 14 Sep 2026).  Worked on y = 2 sin 3x + 1, 0 <= x <= 360.
Serif / cm mathtext to match astc.py and tgraphs.py."""
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from axes import arrow_axes, CYCLE_COLOURS
plt.rcParams.update({'font.family': 'serif', 'mathtext.fontset': 'cm'})

DEG = np.pi / 180.0
GUIDE = '#9a9a9a'
NOTE  = '#2a7d2a'
DIM   = '#b04a2a'
BOX   = dict(facecolor='white', edgecolor='none', pad=0.6)

# one colour per cycle, so a copied cycle is visibly the same shape moved along
CYC = CYCLE_COLOURS

A, B, C = 2, 3, 1                 # y = A sin(Bx) + C
XMAX, PERIOD = 360, 120
TOP, BOT = C + A, C - A           # 3 and -1
QUARTER = PERIOD / 4              # 30


def f(x):
    return A * np.sin(B * x * DEG) + C


def _frame(ax, xticks, xsize=6.2):
    ax.set_xlim(-XMAX * 0.06, XMAX * 1.12)
    ax.set_ylim(-2.3, 4.4)
    ax.set_xticks(xticks)
    ax.set_xticklabels([f'${t:g}^\\circ$' for t in xticks], fontsize=xsize)
    ax.set_yticks([-1, 1, 3])
    ax.set_yticklabels(['$-1$', '$1$', '$3$'], fontsize=6.2)
    ax.tick_params(length=2, pad=1.5)
    # arrow_axes lifts the tick labels above the curve and haloes them
    arrow_axes(ax, xlabel='x', ylabel='y')


def _maxmin(ax):
    for y, lab in ((TOP, r'maximum $y=3$'), (BOT, r'minimum $y=-1$')):
        ax.plot([0, XMAX], [y, y], color=DIM, ls='--', lw=0.9, zorder=2)
        ax.text(XMAX * 1.02, y, lab, color=DIM, fontsize=6, va='center', ha='left')


def _centre(ax):
    ax.plot([0, XMAX], [C, C], color=NOTE, ls='-.', lw=0.9, zorder=2)
    ax.text(XMAX * 1.02, C, r'centre $y=1$', color=NOTE, fontsize=6,
            va='center', ha='left')


def _cycle_marks(ax, headline=True):
    """The period stepped off along the x-axis: how many cycles to draw."""
    for k in (1, 2, 3):
        x0, x1 = (k - 1) * PERIOD, k * PERIOD
        ax.plot([x1, x1], [-2.15, -1.85], color=CYC[k - 1], lw=1.0, zorder=4)
        ax.annotate('', xy=(x1, -2.0), xytext=(x0, -2.0),
                    arrowprops=dict(arrowstyle='<->', color=CYC[k - 1], lw=0.8))
        ax.text((x0 + x1) / 2, -2.32, f'cycle {k}', color=CYC[k - 1],
                fontsize=6, ha='center', va='bottom').set_bbox(BOX)
    ax.plot([0, 0], [-2.15, -1.85], color=CYC[0], lw=1.0, zorder=4)
    if headline:
        ax.text(XMAX / 2, 4.3, r'period $=\dfrac{360^\circ}{3}=120^\circ$, so 3 cycles',
                color=DIM, fontsize=6.6, ha='center', va='top').set_bbox(BOX)


def _key_points(ax):
    """The five points of one cycle: centre, max, centre, min, centre."""
    xs = [0, QUARTER, 2 * QUARTER, 3 * QUARTER, 4 * QUARTER]
    for x in xs:
        ax.plot([x], [f(x)], 'o', color=CYC[0], ms=4.0, zorder=6)
        ax.plot([x, x], [0, f(x)], color=GUIDE, ls=':', lw=0.6, zorder=1)


def _quarter_mark(ax):
    """The first quarter period, measured off along the top of the panel.

    Naming 30, 60, 90 and 120 on the x-axis put four labels in the width of one
    cycle and they ran into each other; the step's own working already lists the
    five coordinates, so the diagram shows the SPACING instead.
    """
    ax.annotate('', xy=(QUARTER, 2.15), xytext=(0, 2.15),
                arrowprops=dict(arrowstyle='<->', color=NOTE, lw=0.8))
    ax.text(QUARTER + 8, 2.15, r'a quarter period $=30^\circ$ apart',
            color=NOTE, fontsize=5.8, ha='left', va='center')


def panel(out, stage):
    fig, ax = plt.subplots(figsize=(3.8, 1.75))
    ticks = [120, 240, 360]

    if stage >= 1:
        _maxmin(ax)
    if stage >= 2:
        _centre(ax)
    if stage >= 3:
        _cycle_marks(ax, headline=stage < 6)
    if stage >= 4:
        _key_points(ax)
    if stage == 4:
        _quarter_mark(ax)
    if stage >= 5:                                   # the first cycle, drawn
        x = np.linspace(0, PERIOD, 400)
        ax.plot(x, f(x), color=CYC[0], lw=1.8, zorder=5)
    if stage >= 6:                                   # the copies
        for k in (2, 3):
            x = np.linspace((k - 1) * PERIOD, k * PERIOD, 400)
            ax.plot(x, f(x), color=CYC[k - 1], lw=1.8, zorder=5)
        ax.annotate('', xy=(180, 3.45), xytext=(60, 3.45),
                    arrowprops=dict(arrowstyle='->', color=CYC[1], lw=0.9,
                                    connectionstyle='arc3,rad=-0.3'))
        ax.annotate('', xy=(300, 3.45), xytext=(180, 3.45),
                    arrowprops=dict(arrowstyle='->', color=CYC[2], lw=0.9,
                                    connectionstyle='arc3,rad=-0.3'))
        ax.text(XMAX / 2, 4.3, 'the same cycle, copied along',
                color=CYC[1], fontsize=6.4, ha='center', va='top').set_bbox(BOX)

    _frame(ax, ticks)
    fig.savefig(out, dpi=220, bbox_inches='tight'); plt.close(fig)


if __name__ == '__main__':
    for s in range(1, 7):
        panel(f'd_step{s}.png', s)
    print('ok')
