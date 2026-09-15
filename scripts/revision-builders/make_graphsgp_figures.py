#!/usr/bin/python3
"""The figures for the EM Graphs on Graph Paper revision worksheet.

Re-run after editing; the PNGs are committed so a build never needs matplotlib.

    /usr/bin/python3 scripts/revision-builders/make_graphsgp_figures.py

This topic is examined on printed graph paper, so every panel here is drawn ON
graph paper: 2 mm minor squares under 1 cm major ones, the way the real grid
comes.  That is what makes a panel read as "the answer on your grid" rather
than as a textbook sketch.

Sizing follows the worksheet rule: a figure is drawn 1.9x the size it is placed
at, so every point size here is the size wanted ON THE PAGE multiplied by 1.9
(ADRIAN-STYLE, Diagrams).  Every graph gets named, arrowed axes through the
shared helper, called AFTER the limits are set, and the numbers along the axes
are sized through it and nowhere else.

Colour: a panel carrying one curve is plain BLACK.  Colour appears only where
a panel holds two different graphs at once — the curve and the line drawn on
it — and there it separates the two, it does not count them.
"""
from pathlib import Path
import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / ".claude/skills/create-worksheet/trig_figures"))
from axes import arrow_axes, CURVE, CYCLE_COLOURS  # noqa: E402

OUT = Path(__file__).resolve().parent / "assets"
OUT.mkdir(exist_ok=True)
plt.rcParams.update({"font.family": "serif", "mathtext.fontset": "cm"})

S = 1.9                       # drawn at 1.9x, so type is written at 1.9x too
PT = lambda p: p * S          # noqa: E731  -- a point size wanted on the page
LW = lambda p: p * S          # noqa: E731
BLUE, ORANGE = CYCLE_COLOURS[0], CYCLE_COLOURS[1]
DASH = "#5a5a5a"
PAPER_MAJOR = "#a8c6e2"
PAPER_MINOR = "#d7e6f4"
BAND = "#e8eef6"


def grid(w_cm, h_cm, xlim, ylim, xmajor, ymajor, minor=5):
    """A panel of graph paper with the limits already set."""
    f, ax = plt.subplots(figsize=(w_cm / 2.54 * S, h_cm / 2.54 * S))
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    for step, col, w in ((xmajor / minor, PAPER_MINOR, 0.22), (xmajor, PAPER_MAJOR, 0.45)):
        v = np.arange(np.ceil(xlim[0] / step) * step, xlim[1] + step / 2, step)
        for t in v:
            ax.axvline(t, color=col, lw=LW(w), zorder=0)
    for step, col, w in ((ymajor / minor, PAPER_MINOR, 0.22), (ymajor, PAPER_MAJOR, 0.45)):
        v = np.arange(np.ceil(ylim[0] / step) * step, ylim[1] + step / 2, step)
        for t in v:
            ax.axhline(t, color=col, lw=LW(w), zorder=0)
    ax.set_xticks(np.arange(np.ceil(xlim[0] / xmajor) * xmajor, xlim[1] + xmajor / 2, xmajor))
    ax.set_yticks(np.arange(np.ceil(ylim[0] / ymajor) * ymajor, ylim[1] + ymajor / 2, ymajor))
    return f, ax


def finish(f, ax, out, xlabel="x", ylabel="y", tick_size=PT(7.5)):
    arrow_axes(ax, xlabel=xlabel, ylabel=ylabel, size=PT(8.5), lw=LW(0.55),
               head=PT(2.6), tick_size=tick_size)
    f.savefig(OUT / out, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(f)
    print("wrote", OUT / out)


def curve(ax, x, y, colour=CURVE, lw=1.2, z=4):
    ax.plot(x, y, color=colour, lw=LW(lw), zorder=z, solid_capstyle="round")


def note(ax, x, y, text, colour="k", size=7.6, ha="left", va="bottom", **kw):
    ax.text(x, y, text, color=colour, fontsize=PT(size), ha=ha, va=va, zorder=9,
            path_effects=[], bbox=dict(boxstyle="square,pad=0.12", fc="white",
                                       ec="none", alpha=0.85), **kw)


def cross(ax, xs, ys, colour="k", size=4.5):
    ax.plot(xs, ys, linestyle="none", marker="x", color=colour,
            ms=PT(size), mew=LW(0.7), zorder=6)


def dot(ax, x, y, colour="k", size=3.2):
    ax.plot([x], [y], marker="o", color=colour, ms=PT(size), zorder=7)


def readoff(ax, x, y, y0, colour=DASH):
    """The dotted pair a student draws to read a value off the grid."""
    ax.plot([x, x], [y0, y], ls=":", color=colour, lw=LW(0.7), zorder=5)


# ------------------------------------------------------------------ A · notes
# how a curve gets on to the paper, as a series of panels: y = x^2 - 4x + 1

def how_panels():
    xs = np.array([-1, 0, 1, 2, 3, 4, 5], float)
    ys = xs ** 2 - 4 * xs + 1
    xf = np.linspace(-1, 5, 400)
    yf = xf ** 2 - 4 * xf + 1
    lim = ((-1.4, 5.4), (-4.4, 7.4))

    f, ax = grid(4.6, 3.6, *lim, 1, 2)
    finish(f, ax, "gp-how1.png")

    f, ax = grid(4.6, 3.6, *lim, 1, 2)
    cross(ax, xs, ys)
    finish(f, ax, "gp-how2.png")

    f, ax = grid(4.6, 3.6, *lim, 1, 2)
    curve(ax, xf, yf)
    cross(ax, xs, ys)
    finish(f, ax, "gp-how3.png")


# ------------------------------------------------------- A2 · Anglican High 2024
# y = x^2/4 + 10/x - 2  for 0 < x <= 7

def a2():
    g = lambda x: x ** 2 / 4 + 10 / x - 2          # noqa: E731
    xf = np.linspace(0.85, 7.0, 500)
    xs = np.array([1, 2, 3, 4, 5, 6, 6.5], float)
    lim = ((0, 7.4), (0, 12.4))

    f, ax = grid(8.0, 5.6, *lim, 1, 2)
    curve(ax, xf, g(xf))
    cross(ax, xs, g(xs))
    finish(f, ax, "gp-a2a.png")

    f, ax = grid(8.0, 5.6, *lim, 1, 2)
    ax.axvspan(1.3, 4.9, color=BAND, zorder=1)
    curve(ax, xf, g(xf))
    ax.plot([0, 7.4], [6, 6], ls="--", color=ORANGE, lw=LW(1.0), zorder=3)
    note(ax, 6.6, 6.25, r"$y=6$", colour=ORANGE, size=7.2, ha="right")
    xm = 20 ** (1 / 3)
    dot(ax, xm, g(xm))
    readoff(ax, xm, g(xm), 0)
    ax.plot([0, xm], [g(xm), g(xm)], ls=":", color=DASH, lw=LW(0.7), zorder=5)
    note(ax, 0.15, 2.3, r"lowest point $\approx 3.5$", size=7.0)
    note(ax, 1.35, 0.25, r"$1.3$", size=7.0)
    note(ax, 4.95, 0.25, r"$4.9$", size=7.0)
    finish(f, ax, "gp-a2b.png")

    f, ax = grid(8.0, 5.6, *lim, 1, 2)
    curve(ax, xf, g(xf))
    xl = np.array([0, 7.4])
    ax.plot(xl, xl + 3, color=BLUE, lw=LW(1.1), zorder=3)
    note(ax, 5.0, 8.6, r"$y=x+3$", colour=BLUE, size=7.2)
    for r in (1.7, 6.2):
        dot(ax, r, r + 3, colour=BLUE)
        readoff(ax, r, r + 3, 0)
    note(ax, 1.75, 0.25, r"$1.7$", size=7.0)
    note(ax, 6.25, 0.25, r"$6.2$", size=7.0, ha="right")
    finish(f, ax, "gp-a2c.png")


# ------------------------------------------------------------ B1 · Kranji 2022
# y = -x^2 + 3x + 28, a ball thrown off a building

def b1():
    g = lambda x: -x ** 2 + 3 * x + 28             # noqa: E731
    xf = np.linspace(0, 7.2, 400)
    lim = ((0, 7.6), (0, 38))

    f, ax = grid(8.0, 5.6, *lim, 1, 5)
    curve(ax, xf, g(xf))
    ax.plot([1.5, 1.5], [0, g(1.5)], ls="-.", color=DASH, lw=LW(0.8), zorder=5)
    note(ax, 1.6, 4, r"$x=1.5$", size=7.2)
    # the tangent at (3, 28): gradient -3
    xt = np.array([1.6, 4.6])
    ax.plot(xt, 28 - 3 * (xt - 3), color=ORANGE, lw=LW(1.1), zorder=6)
    dot(ax, 3, 28, colour=ORANGE)
    ax.plot([2.0, 4.0], [25, 25], color=DASH, lw=LW(0.8), zorder=6)
    ax.plot([2.0, 2.0], [25, 31], color=DASH, lw=LW(0.8), zorder=6)
    note(ax, 3.0, 22.0, r"run $=2$", size=7.0, ha="center")
    # clear of the curve, which passes through y ~ 29-30 across this x range
    note(ax, 1.9, 26.5, r"rise $=-6$", size=7.0, ha="right")
    finish(f, ax, "gp-b1a.png")

    f, ax = grid(8.0, 5.6, *lim, 1, 5)
    curve(ax, xf, g(xf))
    ax.plot([0, 7.6], [35, 35], ls="--", color=ORANGE, lw=LW(1.1), zorder=6)
    note(ax, 7.5, 35.4, r"$y=35$", colour=ORANGE, size=7.2, ha="right")
    dot(ax, 1.5, 30.25)
    note(ax, 2.0, 30.6, r"highest point $30.25$", size=7.0)
    finish(f, ax, "gp-b1b.png")


# ------------------------------------------------- B2 · Fairfield Methodist 2023
# y = -x^3/6 + 2x + 4

def b2():
    g = lambda x: -x ** 3 / 6 + 2 * x + 4          # noqa: E731
    xf = np.linspace(-4, 4, 500)
    lim = ((-4.4, 4.4), (0, 9))

    f, ax = grid(8.0, 5.2, *lim, 1, 1)
    ax.axhspan(1.33, 6.67, color=BAND, zorder=1)
    curve(ax, xf, g(xf))
    for lvl, lab in ((6.67, r"$6.7$"), (1.33, r"$1.3$")):
        ax.plot([-4.4, 4.4], [lvl, lvl], ls="--", color=ORANGE, lw=LW(0.9), zorder=3)
        note(ax, -4.3, lvl + 0.1, lab, colour=ORANGE, size=7.0)
    dot(ax, 2, g(2))
    dot(ax, -2, g(-2))
    note(ax, 0.1, 4.6, r"a line in here cuts 3 times", size=7.0, ha="left")
    finish(f, ax, "gp-b2a.png")

    f, ax = grid(8.0, 5.2, *lim, 1, 1)
    curve(ax, xf, g(xf))
    xl = np.array([-4.4, 4.4])
    ax.plot(xl, -0.5 * xl + 4.5, color=BLUE, lw=LW(1.1), zorder=3)
    note(ax, -4.3, 7.0, r"$y=-\dfrac{1}{2}x+\dfrac{9}{2}$", colour=BLUE, size=7.0)
    # the true roots of x^3 - 15x + 3 = 0 are -3.968, 0.200 and 3.768
    for r in (-3.95, 0.2, 3.75):
        dot(ax, r, -0.5 * r + 4.5, colour=BLUE)
        readoff(ax, r, -0.5 * r + 4.5, 0)
    finish(f, ax, "gp-b2b.png")


# ------------------------------------------------------- C1 · St Gabriel 2024
# y = -2x^2 - 3x + 8

def c1():
    g = lambda x: -2 * x ** 2 - 3 * x + 8          # noqa: E731
    xf = np.linspace(-3.4, 2.4, 400)
    lim = ((-3.6, 2.6), (-8, 11))

    f, ax = grid(7.6, 5.4, *lim, 1, 2)
    curve(ax, xf, g(xf))
    xt = np.array([-3.0, -1.0])
    ax.plot(xt, 6 + 5 * (xt + 2), color=ORANGE, lw=LW(1.1), zorder=6)
    dot(ax, -2, 6, colour=ORANGE)
    ax.plot([-2.8, -1.8], [1, 1], color=DASH, lw=LW(0.8), zorder=6)
    ax.plot([-1.8, -1.8], [1, 6], color=DASH, lw=LW(0.8), zorder=6)
    # just outside the right-angle corner: below the axis it lands on the "-3"
    # tick label, and inside the triangle it erases the tangent
    note(ax, -1.72, 1.1, r"run $=1$", size=7.0)
    note(ax, -1.7, 3.0, r"rise $=5$", size=7.0)
    finish(f, ax, "gp-c1a.png")

    f, ax = grid(7.6, 5.4, *lim, 1, 2)
    curve(ax, xf, g(xf))
    xl = np.array([-3.6, 2.6])
    ax.plot(xl, -2 * xl + 4, color=BLUE, lw=LW(1.1), zorder=3)
    note(ax, -3.5, 9.6, r"$y=-2x+4$", colour=BLUE, size=7.2)
    for r in (-1.686, 1.186):
        dot(ax, r, -2 * r + 4, colour=BLUE)
        readoff(ax, r, -2 * r + 4, 0)
    note(ax, -1.75, -2.6, r"$-1.7$", size=7.0, ha="center")
    note(ax, 1.25, -2.6, r"$1.2$", size=7.0, ha="center")
    finish(f, ax, "gp-c1b.png")


# ------------------------------------------------ C2 · ACS (Barker Road) 2023
# y = 10(2^t), micro-organisms

def c2():
    g = lambda t: 10 * 2.0 ** t                    # noqa: E731
    tf = np.linspace(0, 6, 400)
    lim = ((0, 6.4), (0, 700))

    f, ax = grid(8.0, 5.6, *lim, 1, 100)
    curve(ax, tf, g(tf))
    m = 80 * np.log(2)
    tt = np.array([1.7, 4.6])
    ax.plot(tt, 80 + m * (tt - 3), color=ORANGE, lw=LW(1.1), zorder=6)
    dot(ax, 3, 80, colour=ORANGE)
    ax.plot([2.0, 4.0], [24, 24], color=DASH, lw=LW(0.8), zorder=6)
    ax.plot([4.0, 4.0], [24, 135], color=DASH, lw=LW(0.8), zorder=6)
    note(ax, 3.0, 2, r"$2$ days", size=7.0, ha="center")
    note(ax, 4.1, 60, r"$111$", size=7.0)
    finish(f, ax, "gp-c2a.png", xlabel="t")

    f, ax = grid(8.0, 5.6, *lim, 1, 100)
    curve(ax, tf, g(tf))
    tl = np.array([0, 6.4])
    ax.plot(tl, -80 * tl + 600, color=BLUE, lw=LW(1.1), zorder=3)
    note(ax, 0.15, 620, r"$y=-80t+600$", colour=BLUE, size=7.2)
    r = 4.55
    dot(ax, r, -80 * r + 600, colour=BLUE)
    readoff(ax, r, -80 * r + 600, 0)
    note(ax, 4.65, 20, r"$4.6$", size=7.0)
    finish(f, ax, "gp-c2b.png", xlabel="t")


# ------------------------------------------------------- C3 · Nan Chiau 2024
# y = -1/4 (3x^2 - 5x - 20); a line of gradient 2 slid until it touches

def c3():
    g = lambda x: -0.75 * x ** 2 + 1.25 * x + 5    # noqa: E731
    xf = np.linspace(-2.2, 3.6, 400)
    lim = ((-2.4, 3.8), (-5, 8))

    f, ax = grid(8.6, 5.6, *lim, 1, 1)
    curve(ax, xf, g(xf))
    xl = np.array([-2.4, 3.8])
    for k, style, col in ((7.0, ":", DASH), (3.0, ":", DASH)):
        ax.plot(xl, 2 * xl + k, ls=style, color=col, lw=LW(0.8), zorder=3)
    ax.plot(xl, 2 * xl + 5.1875, color=ORANGE, lw=LW(1.2), zorder=5)
    dot(ax, -0.5, g(-0.5), colour=ORANGE)
    # The three lines are parallel and only ~1 unit apart across the panel, so
    # a horizontal word does not fit between them -- each label is set ALONG
    # its own line instead, half a unit clear of it.  rot comes from the axes
    # themselves so the text lies exactly on the screen slope of y = 2x + k.
    p0, p1 = ax.transData.transform((0, 0)), ax.transData.transform((1, 2))
    rot = np.degrees(np.arctan2(p1[1] - p0[1], p1[0] - p0[0]))
    slant = dict(size=7.0, rotation=rot, rotation_mode="anchor")
    note(ax, -2.2, 3.1, r"misses", **slant)
    note(ax, -2.2, 1.35, r"touches", colour=ORANGE, **slant)
    note(ax, 0.0, 2.0, r"cuts twice", va="top", **slant)
    finish(f, ax, "gp-c3.png")


# -------------------------------------------------------------- D1 · TKGS 2022
# y = 8 - x - 4/x

def d1():
    g = lambda x: 8 - x - 4 / x                    # noqa: E731
    xf = np.linspace(0.62, 7.6, 600)
    lim = ((0, 8.0), (0, 6.4))

    f, ax = grid(8.0, 5.0, *lim, 1, 1)
    curve(ax, xf, g(xf))
    ax.plot([0, 8.0], [3, 3], color=BLUE, lw=LW(1.1), zorder=3)
    note(ax, 7.9, 3.15, r"$y=3$", colour=BLUE, size=7.2, ha="right")
    for r in (1.0, 4.0):
        dot(ax, r, 3, colour=BLUE)
        readoff(ax, r, 3, 0)
    note(ax, 1.05, 0.2, r"$1.0$", size=7.0)
    note(ax, 4.05, 0.2, r"$4.0$", size=7.0)
    finish(f, ax, "gp-d1a.png")

    f, ax = grid(8.0, 5.0, *lim, 1, 1)
    curve(ax, xf, g(xf))
    xl = np.array([0, 2.0])
    ax.plot(xl, 1 - xl / 2, color=BLUE, lw=LW(1.1), zorder=3)
    note(ax, 2.1, 0.6, r"$y=1-\frac{1}{2}x$", colour=BLUE, size=7.0)
    dot(ax, 0.597, 1 - 0.597 / 2, colour=BLUE)
    note(ax, 0.7, 1.1, r"$x=0.6$", size=7.0)
    finish(f, ax, "gp-d1b.png")


# ------------------------------------------------------ D2 · Swiss Cottage 2024
# y = x^3/2 - 4x - 1, with y = 1 - x already drawn

def d2():
    g = lambda x: x ** 3 / 2 - 4 * x - 1           # noqa: E731
    xf = np.linspace(-3.0, 3.0, 500)
    lim = ((-3.2, 3.2), (-6.5, 6.5))

    f, ax = grid(8.6, 6.0, *lim, 1, 1)
    curve(ax, xf, g(xf))
    xl = np.array([-3.2, 3.2])
    ax.plot(xl, 1 - xl, color=ORANGE, lw=LW(1.0), zorder=3)
    note(ax, -3.1, 4.4, r"$y=1-x$", colour=ORANGE, size=7.0)
    ax.plot(xl, -2 * xl - 1, color=BLUE, lw=LW(1.1), zorder=3)
    note(ax, 1.55, -5.8, r"$y=-2x-1$", colour=BLUE, size=7.0)
    for r in (-2.0, 0.0, 2.0):
        dot(ax, r, -2 * r - 1, colour=BLUE)
    note(ax, -2.6, 3.4, r"$x=-2,\ 0,\ 2$", colour=BLUE, size=7.0)
    finish(f, ax, "gp-d2.png")


# ------------------------------------------------------------- D3 · Kranji 2024
# y = x(15 - x^2)/10

def d3():
    g = lambda x: x * (15 - x ** 2) / 10           # noqa: E731
    xf = np.linspace(-2.0, 5.0, 500)
    lim = ((-2.4, 5.2), (-5.4, 3.4))

    f, ax = grid(8.6, 5.4, *lim, 1, 1)
    curve(ax, xf, g(xf))
    xt = np.sqrt(35 / 3)
    yt = g(xt)
    xl = np.array([xt - 1.5, xt + 1.2])
    ax.plot(xl, yt - 2 * (xl - xt), color=ORANGE, lw=LW(1.1), zorder=6)
    dot(ax, xt, yt, colour=ORANGE)
    readoff(ax, xt, yt, 0)
    note(ax, 3.55, 1.35, r"$(3.4,\ 1.1)$", size=7.0)
    finish(f, ax, "gp-d3a.png")

    f, ax = grid(8.6, 5.4, *lim, 1, 1)
    curve(ax, xf, g(xf))
    xl = np.array([-2.4, 5.2])
    ax.plot(xl, 0.7 * xl + 0.3, color=BLUE, lw=LW(1.1), zorder=3)
    note(ax, 3.3, 3.0, r"$y=0.7x+0.3$", colour=BLUE, size=7.0, ha="right")
    for r in (0.382, 2.618):
        dot(ax, r, 0.7 * r + 0.3, colour=BLUE)
        readoff(ax, r, 0.7 * r + 0.3, -5.4)
    note(ax, 0.45, -1.6, r"$0.4$", size=7.0)
    note(ax, 2.68, -1.6, r"$2.6$", size=7.0)
    finish(f, ax, "gp-d3b.png")


if __name__ == "__main__":
    how_panels()
    a2()
    b1()
    b2()
    c1()
    c2()
    c3()
    d1()
    d2()
    d3()
    print("done")
