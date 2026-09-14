"""The graphs for the Section B notes block on trigonometric graphs.
Serif / cm mathtext to match astc.py and the rest of the sheet."""
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from axes import arrow_axes, cycle_colour, CURVE
plt.rcParams.update({'font.family': 'serif', 'mathtext.fontset': 'cm'})

DEG = np.pi / 180.0
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
    """y = tan x to 360 deg — a colour marks a WHOLE tangent graph.

    ONE TANGENT GRAPH RUNS FROM ONE ASYMPTOTE TO THE NEXT (Adrian, 14 Sep 2026,
    on the 90-270 branch: "this is considered one tangent graph -> this should
    be same colour, then another set of this should be another colour").  Only
    a whole one is coloured: inside 0-360 that is the 90-270 branch alone.  The
    stub before 90 and the stub after 270 are offcuts of the graphs next door,
    so they are drawn GREY — colouring them would say three graphs, and he
    corrected exactly that ("you misunderstand.  this is ONE tangent graph").
    How many graphs are in the range is read off the period (360 / 180 = 2),
    and no numerals go on the picture ("don't have to put the numbers").
    """
    f, ax = plt.subplots(figsize=(2.3, 1.5))
    for a, b, ci in [(0, 90, 'part'), (90, 270, 0), (270, 360, 'part')]:
        x = np.linspace(a + 0.6, b - 0.6, 400)
        y = np.tan(x * DEG)
        y[np.abs(y) > 3.1] = np.nan
        ax.plot(x, y, color=cycle_colour(ci), lw=1.6, zorder=3)
    for a in (90, 270):
        ax.plot([a, a], [-3.1, 3.1], color=DIM, ls='--', lw=0.8, zorder=2)
    _frame(ax, 360, -3.3, 5.4, [90, 180, 270, 360], [-1, 1])
    ax.text(180, 5.3, 'asymptotes', color=DIM, fontsize=6, ha='center', va='top')
    ax.annotate('', xy=(92, 3.3), xytext=(155, 4.85),
                arrowprops=dict(arrowstyle='->', color=DIM, lw=0.7))
    ax.annotate('', xy=(268, 3.3), xytext=(210, 4.85),
                arrowprops=dict(arrowstyle='->', color=DIM, lw=0.7))
    ax.text(180, -2.3, r'$y=\tan x$', fontsize=7.5, ha='center', va='center').set_bbox(BOX)
    f.savefig(out, dpi=220, bbox_inches='tight'); plt.close(f)


def variation(out, fn, xmax, ymin, ymax, xticks, yticks, centre=None,
              dots=(), period=None, amp=None, base=None, asym=(),
              pieces=None, clip=None, note=None):
    """One variation graph: the curve, its centre line, and the one feature the
    column is teaching, marked on the picture.

    `pieces` splits the curve into (from, to, colour number) runs so a range
    holding more than one graph is colour coded — one colour per graph.  Left
    out, the curve is drawn plain black, which is what a range holding a single
    graph should look like.  The colour is the whole of the count; the graphs
    carry no numerals ("don't have to put the numbers", 14 Sep 2026).

    A COLOUR MEANS A WHOLE GRAPH.  On a TANGENT curve a graph runs from one
    asymptote to the next, so only a piece with an asymptote at BOTH ends takes
    a colour; the stub left at either end of the range is an offcut of a graph
    that does not fit in the picture and is given colour number `'part'`, which
    draws it grey.  ("you misunderstand.  this is ONE tangent graph", Adrian,
    14 Sep 2026, on a picture that had coloured all three pieces.)
    """
    f, ax = plt.subplots(figsize=(2.3, 1.55))
    if pieces is None:
        edges = [0] + list(asym) + [xmax]
        pieces = [(a, b, None) for a, b in zip(edges[:-1], edges[1:])]
    for a, b, ci in pieces:
        pad = xmax * 0.004 if asym else 0.0
        x = np.linspace(a + pad, b - pad, 700)
        y = fn(x)
        if asym:                    # a tangent run leaves the top and bottom
            lo, hi = clip or (ymin * 0.92, ymax * 0.70)
            y[(y > hi) | (y < lo)] = np.nan
        ax.plot(x, y, color=cycle_colour(ci), lw=1.6, zorder=3)
    for a in asym:
        ax.plot([a, a], [ymin * 0.95, ymax * 0.92], color=DIM, ls='--', lw=0.8, zorder=2)
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


def cycles(xmax, period):
    """The (from, to, colour number) runs for a curve that simply repeats."""
    n = int(round(xmax / period))
    return [(k * period, (k + 1) * period, k) for k in range(n)]


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
    # 2. b and c together — y = sin 2x + 1, two sine graphs, one colour each
    variation('v_sin_bc.png', lambda t: np.sin(2 * d(t)) + 1, 360, -0.9, 3.7,
              [90, 180, 270, 360], [1, 2], centre=1,
              period=(0, 180, 2.45, r'period $180^\circ$'),
              dots=[(45, 2), (135, 0)],
              pieces=cycles(360, 180))
    # 3. a and b together — y = 2 cos 3x, three cosine graphs
    variation('v_cos_ab.png', lambda t: 2 * np.cos(3 * d(t)), 360, -2.7, 4.4,
              [120, 240, 360], [-2, 2],
              period=(0, 120, 2.5, r'period $120^\circ$'),
              amp=(120, 0, 2),
              pieces=cycles(360, 120))
    # 4. a negative, and c — y = -2 cos x + 1
    variation('v_cos_neg.png', lambda t: -2 * np.cos(d(t)) + 1, 360, -2.0, 4.6,
              [90, 180, 270, 360], [-1, 1, 3], centre=1,
              base=lambda t: 2 * np.cos(d(t)) + 1,
              dots=[(180, 3), (0, -1)],
              note=r'$a<0$ turns the curve over')
    # 5. b on tan — y = tan 2x, drawn to 360 deg so the four are there to see.
    #    Three WHOLE graphs sit inside the range and take the three colours; the
    #    stubs at 0-45 and 315-360 are offcuts and stay grey.  Three whole plus
    #    two halves is the four the period promises.
    variation('v_tan_b.png', lambda t: np.tan(2 * d(t)), 360, -2.7, 4.6,
              [90, 180, 270, 360], [-1, 1], asym=(45, 135, 225, 315),
              clip=(-2.5, 2.5),
              period=(45, 135, 3.05, r'period $90^\circ$'),
              pieces=[(0, 45, 'part'), (45, 135, 0), (135, 225, 1),
                      (225, 315, 2), (315, 360, 'part')])
    # 6. a and a fractional b on tan — y = 2 tan (x/2).  The period is the whole
    #    range, so no WHOLE graph fits inside it — the picture is the back half
    #    of one graph and the front half of the next.  Nothing to count, so the
    #    curve stays plain black rather than grey: grey says "offcut, don't count
    #    it" next to things that ARE being counted, and here nothing is.
    variation('v_tan_ab.png', lambda t: 2 * np.tan(d(t) / 2), 360, -3.3, 5.2,
              [90, 180, 270, 360], [-2, 2], asym=(180,), clip=(-3.0, 3.0),
              period=(0, 360, 4.2, r'period $360^\circ$'))
    print('ok')
