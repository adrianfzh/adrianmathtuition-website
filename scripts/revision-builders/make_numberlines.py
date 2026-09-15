#!/usr/bin/python3
"""The number lines for the EM Linear Inequalities revision worksheet.

Re-run after editing; the PNGs are committed so a build never needs matplotlib.

    /usr/bin/python3 scripts/revision-builders/make_numberlines.py

Sizing follows the worksheet rule: a figure is drawn 1.9x the size it is placed
at, so every point size here is the size wanted ON THE PAGE multiplied by 1.9
(ADRIAN-STYLE, Diagrams).  A number line is not a graph, so it does not use
arrow_axes -- but it carries the same arrowheads at both ends, and the letter
the range is in, so the student can see what is being measured along it.
"""
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

OUT = Path(__file__).resolve().parent / "assets"
OUT.mkdir(exist_ok=True)
plt.rcParams.update({"font.family": "serif", "mathtext.fontset": "cm"})

S = 1.9                       # drawn at 1.9x, so type is written at 1.9x too
PT = lambda p: p * S          # noqa: E731  -- a point size wanted on the page
BLUE, ORANGE = "#1a5fb4", "#c64600"


def numline(out, xmin, xmax, ticks, bars, w_cm=7.6, h_cm=1.7, var="x",
            rays=(), note=None):
    """One number line.

    ticks  -- [(value, label), ...] written under the line
    bars   -- [(lo, hi, lo_closed, hi_closed), ...] the solution, drawn on the
              line itself; None for lo/hi runs the bar off that end
    rays   -- [(lo, hi, lo_closed, hi_closed, colour, label), ...] a separate
              range drawn ABOVE the line, so two conditions can be compared
    """
    fig, ax = plt.subplots(figsize=(w_cm / 2.54 * S, h_cm / 2.54 * S))
    pad = (xmax - xmin) * 0.04
    ax.set_xlim(xmin - pad, xmax + pad)
    top = 1.15 + 0.70 * len(rays)
    ax.set_ylim(-1.75 if note else -0.95, top)
    ax.axis("off")

    ax.annotate("", xy=(xmax, 0), xytext=(xmin, 0),
                arrowprops=dict(arrowstyle="<|-|>", color="black",
                                lw=PT(0.55), mutation_scale=PT(6),
                                shrinkA=0, shrinkB=0))
    ax.text(xmax + pad, -0.42 if rays else 0.10, f"${var}$", fontsize=PT(8.5),
            ha="left", va="center" if rays else "bottom")

    for v, lab in ticks:
        ax.plot([v, v], [-0.22, 0.22], color="black", lw=PT(0.5))
        ax.text(v, -0.40, lab, fontsize=PT(8.5), ha="center", va="top")

    def draw(lo, hi, loc, hic, y, colour, lw):
        """The bar itself, and an arrowhead on whichever end runs on forever.

        A range with no upper bound does not stop at the edge of the picture --
        it carries an arrowhead there, the same as the axis does, so the student
        reads it as continuing.  The bar is held back by one arrowhead's length
        so the head sits at the end of the line rather than past it, and because
        a bar drawn at y = 0 would otherwise paint over the axis's own arrow.
        """
        head = (xmax - xmin) * 0.035
        a = xmin + head if lo is None else lo
        b = xmax - head if hi is None else hi
        ax.plot([a, b], [y, y], color=colour, lw=lw, solid_capstyle="butt",
                zorder=3)
        for v, end in ((lo, xmin), (hi, xmax)):
            if v is not None:
                continue
            ax.annotate("", xy=(end, y), xytext=(a if end == xmin else b, y),
                        arrowprops=dict(arrowstyle="-|>", color=colour,
                                        lw=lw, mutation_scale=PT(6.5),
                                        shrinkA=0, shrinkB=0),
                        zorder=4)
        for v, closed in ((lo, loc), (hi, hic)):
            if v is None:
                continue
            ax.plot([v], [y], "o", ms=PT(3.4), zorder=4, color=colour,
                    markerfacecolor=colour if closed else "white",
                    markeredgecolor=colour, markeredgewidth=PT(0.55))

    for lo, hi, loc, hic in bars:
        draw(lo, hi, loc, hic, 0, "black", PT(1.9))
    for i, (lo, hi, loc, hic, colour, label) in enumerate(rays):
        y = 0.75 + 0.70 * i
        draw(lo, hi, loc, hic, y, colour, PT(1.5))
        ax.text(xmax + pad, y, label, fontsize=PT(8), ha="left",
                va="center", color=colour)
    if note:
        ax.text((xmin + xmax) / 2, -1.70, note, fontsize=PT(8),
                ha="center", va="bottom", color="#2a7d2a")

    fig.savefig(OUT / out, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("wrote", OUT / out)


if __name__ == "__main__":
    # Example 2 -- 1 2/5 <= x <= 2, both ends included
    numline("nl-solve-both-closed.png", 0, 4,
            [(0, "$0$"), (1, "$1$"), (1.4, r"$1\frac{2}{5}$"), (2, "$2$"),
             (3, "$3$"), (4, "$4$")],
            [(1.4, 2, True, True)])

    # Example 3 -- two conditions, and the part they share
    numline("nl-overlap.png", -30, 5,
            [(-25, "$-25$"), (-20, "$-20$"), (-15, "$-15$"), (-10, "$-10$"),
             (-5, "$-5$"), (0, "$0$"), (5, "$5$")],
            [(-10, None, True, False)],
            w_cm=9.6, h_cm=3.0,
            rays=[(-10, None, True, False, ORANGE, r"$x\geq-10$"),
                  (-25, None, True, False, BLUE, r"$x\geq-25$")],
            note=r"both must hold, so the answer is $x\geq-10$")

    # Example 4 -- 5/2 < x <= 11, one end open
    numline("nl-open-closed.png", 0, 13,
            [(0, "$0$"), (2.5, r"$2\frac{1}{2}$"), (5, "$5$"), (8, "$8$"),
             (11, "$11$"), (13, "$13$")],
            [(2.5, 11, False, True)], w_cm=8.4)

    # Example 5 -- the two halves do not meet
    numline("nl-no-solution.png", -5, 3,
            [(-4, "$-4$"), (-3, "$-3$"), (-2, "$-2$"),
             (-1, "$-1$"), (0, "$0$"), (1, "$1$"), (2, "$2$")],
            [], w_cm=9.6, h_cm=3.0,
            rays=[(-1 / 3, None, False, False, ORANGE, r"$x>-\frac{1}{3}$"),
                  (None, -2, False, True, BLUE, r"$x\leq-2$")],
            note="no value of $x$ lies on both, so there is no solution")
