"""A graph drawn to ANSWER a worded question, even when no graph was asked for.

Adrian, 14 Sep 2026, on Example 4d(ii) (the tide and the boat's draft): "question
did not ask for a graph, but would be good if there is a graph to illustrate how
to solve the question - the visual will be very helpful".  The arithmetic answers
it; the picture shows WHY — the model, the level the question tests it against,
the shaded stretch where the answer is no, and the moment asked about sitting
inside that stretch.

    from context_graph import threshold_graph
    threshold_graph('ex4d.png', lambda t: 1.2*np.cos(4*np.pi*t/25) + 5, ...)
"""
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from axes import arrow_axes, CURVE

plt.rcParams.update({'font.family': 'serif', 'mathtext.fontset': 'cm'})

DIM  = '#b04a2a'
NOTE = '#2a7d2a'
BOX  = dict(facecolor='white', edgecolor='none', pad=0.6)


def threshold_graph(out, fn, xmax, ymax, xticks, yticks, level, level_label,
                    at, at_label=None, centre=None, xlabel='x', ylabel='y',
                    band_label=None, curve_label=None, figsize=(3.6, 2.35),
                    below=True):
    """Curve, the level it is tested against, the failing stretch, the moment asked.

    `below=True` shades where the curve is UNDER the level (a minimum depth, a
    minimum height); pass False for a question that fails when the curve is over
    the level.  The shading fills the whole strip of x, so the picture says "this
    stretch is no good" rather than outlining a sliver.  `at` is the x the question names — a dashed drop to the curve and
    the value written beside it, so the student sees the number come off the graph.
    """
    f, ax = plt.subplots(figsize=figsize)
    x = np.linspace(0, xmax, 900)
    y = fn(x)

    bad = (y < level) if below else (y > level)
    # the WHOLE strip of x where the answer is no, floor to level (or level to
    # ceiling), not the thin slice between curve and level: on a shallow dip that
    # slice is a sliver nobody can see, and it is the STRETCH OF TIME the question
    # is about
    lo_y, hi_y = (0.0, level) if below else (level, ymax)
    ax.fill_between(x, lo_y, hi_y, where=bad, color=DIM, alpha=0.13, lw=0, zorder=0)
    if centre is not None:
        ax.plot([0, xmax], [centre, centre], 'k', ls=':', lw=0.9, zorder=1)
    ax.plot(x, y, color=CURVE, lw=1.6, zorder=3)

    ax.plot([0, xmax], [level, level], color=DIM, ls='--', lw=1.0, zorder=2)
    ax.text(xmax * 1.02, level, level_label, color=DIM, fontsize=6.4,
            va='center', ha='left')

    ya = float(fn(np.array([at]))[0])
    ax.plot([at, at], [0, ya], color=NOTE, ls='--', lw=0.9, zorder=2)
    ax.plot([at], [ya], 'o', color=NOTE, ms=3.4, zorder=4)
    if at_label:
        ax.text(at + xmax * 0.02, ya - ymax * 0.10, at_label, color=NOTE,
                fontsize=6.4, ha='left', va='top').set_bbox(BOX)

    # the stretch where the answer is no, measured off the curve itself
    edges = np.where(np.diff(bad.astype(int)) != 0)[0]
    if band_label and len(edges):
        lo, hi = x[edges[0] + 1], x[edges[-1]]
        # sits ABOVE the dip, inside the span of the band — a label laid on
        # the level line itself puts its white pad over the curve either side
        ax.text((lo + hi) / 2, level + ymax * 0.16, band_label, color=DIM,
                fontsize=6.3, ha='center', va='bottom').set_bbox(BOX)
        ax.annotate('', xy=((lo + hi) / 2, level - ymax * 0.02),
                    xytext=((lo + hi) / 2, level + ymax * 0.15),
                    arrowprops=dict(arrowstyle='->', color=DIM, lw=0.7))

    ax.set_xlim(-xmax * 0.04, xmax * 1.10)
    ax.set_ylim(0, ymax)
    ax.set_xticks(xticks)
    ax.set_xticklabels([f'${t:g}$' for t in xticks], fontsize=6.3)
    ax.set_yticks(yticks)
    ax.set_yticklabels([f'${v:g}$' for v in yticks], fontsize=6.3)
    ax.tick_params(length=2, pad=1.5)
    arrow_axes(ax, xlabel=xlabel, ylabel=ylabel, size=6.5)
    if curve_label:
        ax.text(xmax * 0.5, ymax * 0.97, curve_label, fontsize=7.0,
                ha='center', va='top').set_bbox(BOX)
    f.savefig(out, dpi=220, bbox_inches='tight'); plt.close(f)


if __name__ == '__main__':
    # Example 4d(ii): h = 1.2 cos(4(pi)t/25) + 5, a boat drawing 4.2 m, 7 pm.
    threshold_graph(
        'ex4d_tide.png',
        lambda t: 1.2 * np.cos(4 * np.pi * t / 25) + 5,
        xmax=14, ymax=8.4, xticks=[2, 4, 6, 8, 10, 12, 14],
        yticks=[2, 5, 6.2], level=4.2, level_label=r'$h=4.2$ (draft)',
        at=7, at_label='7 pm\n' + r'$h=3.88<4.2$', centre=5,
        xlabel=r't/\mathrm{hours}', ylabel=r'h/\mathrm{m}',
        band_label='too shallow for this boat',
        curve_label=r'$h=1.2\cos\dfrac{4\pi t}{25}+5$')
    print('ok')
