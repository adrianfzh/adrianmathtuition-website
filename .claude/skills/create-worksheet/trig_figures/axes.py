"""Axes for a GRAPH, drawn the way a student draws them by hand.

Adrian, 14 Sep 2026: "the graphs should have x and y axis labelled with the
arrow for x-axis and y-axis".  Every graph figure in a worksheet goes through
`arrow_axes` — the two spines cross at the origin, each ends in an arrowhead,
and each carries its own name.  A quadrant reference square (astc.py, quad.py)
is not a graph and is left alone.

    import matplotlib.pyplot as plt
    from axes import arrow_axes
    f, ax = plt.subplots(figsize=(3.8, 1.75))
    ax.plot(x, y)
    ax.set_xlim(...); ax.set_ylim(...)          # set the limits FIRST
    arrow_axes(ax, xlabel='x', ylabel='y')

Set the limits before calling it: the arrowheads are pinned to the ends of the
axes, so they follow whatever limits are in force at draw time.
"""

from matplotlib import patheffects as path_effects


def arrow_axes(ax, xlabel='x', ylabel='y', color='k', size=7.0, lw=0.9,
               head=3.6):
    """Spines crossing at the origin, each ending in an arrow and named.

    xlabel/ylabel are set in maths italics; pass e.g. xlabel=r'\\theta'.
    Pass xlabel=None (or ylabel=None) to draw the arrow without a name.
    """
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)
    for s in ('bottom', 'left'):
        ax.spines[s].set_position(('data', 0))
        ax.spines[s].set_linewidth(lw)
        ax.spines[s].set_color(color)
    # x in axes fraction, y in data → the right-hand end of the x-axis
    ax.plot(1, 0, '>', color=color, ms=head, transform=ax.get_yaxis_transform(),
            clip_on=False, zorder=8)
    # x in data, y in axes fraction → the top end of the y-axis
    ax.plot(0, 1, '^', color=color, ms=head, transform=ax.get_xaxis_transform(),
            clip_on=False, zorder=8)
    # a curve crossing the axis would otherwise be drawn over its tick labels
    # set_axisbelow FIRST — it rewrites the two axis zorders (2.5 for False),
    # so raising them has to come after it or it is silently undone
    ax.set_axisbelow(False)
    ax.xaxis.set_zorder(9)
    ax.yaxis.set_zorder(9)
    # and the numbers are given a white outline, so a curve passing through a
    # tick label still leaves the digits readable (a white box would chop the
    # curve in half instead)
    halo = [path_effects.withStroke(linewidth=2.0, foreground='white')]
    for t in list(ax.get_xticklabels()) + list(ax.get_yticklabels()):
        t.set_path_effects(halo)
    if xlabel:
        ax.annotate(f'${xlabel}$', xy=(1, 0), xycoords=ax.get_yaxis_transform(),
                    xytext=(7, -1), textcoords='offset points', fontsize=size,
                    ha='left', va='center', color=color, annotation_clip=False,
                    zorder=8, path_effects=halo)
    if ylabel:
        ax.annotate(f'${ylabel}$', xy=(0, 1), xycoords=ax.get_xaxis_transform(),
                    xytext=(3, 6), textcoords='offset points', fontsize=size,
                    ha='left', va='bottom', color=color, annotation_clip=False,
                    zorder=8, path_effects=halo)
    return ax


# Adrian, 14 Sep 2026: "if there are more than 1 graph, we should colour code to
# highlight the number of graphs".  One colour per repeat of the curve, so the
# student counts the graphs in the range by counting the colours instead of
# being told the number.  ONE palette for every figure, so cycle 2 is the same
# orange on the step-by-step panels as it is on the variation graphs.
CYCLE_COLOURS = ['#1a5fb4', '#c64600', '#7a3fb8', '#0b7285', '#a4187a']
CURVE = '#1a1a1a'

# A COLOUR MEANS A WHOLE GRAPH.  Adrian, 14 Sep 2026, on the 0-360 tangent
# picture with all three pieces coloured: "you misunderstand.  this is ONE
# tangent graph" — a tangent graph runs from one asymptote to the next, and the
# stub left at each end of the range is an offcut of the graph next door, not a
# graph of its own.  An offcut is drawn GREY so it is plainly not one of the
# things being counted.
PART_GRAPH = '#9a9a9a'


def cycle_colour(i, default=CURVE):
    """Colour for graph number i (0-based).  None = a single graph, so black.

    `'part'` = a part-graph at the edge of the range, drawn grey: it is an
    offcut of a graph that does not fit in the picture, and colouring it would
    add one to the count the colours are there to make.  A range holding only
    one graph is drawn plain black — a colour there would be counting something
    there is nothing to count.  Adjacent graphs never land on the same colour,
    so there are five.
    """
    if i == 'part':
        return PART_GRAPH
    return default if i is None else CYCLE_COLOURS[i % len(CYCLE_COLOURS)]
