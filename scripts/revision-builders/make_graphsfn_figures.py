#!/usr/bin/python3
"""The figures for the EM Graphs of Functions revision worksheet.

Re-run after editing; the PNGs are committed so a build never needs matplotlib.

    /usr/bin/python3 scripts/revision-builders/make_graphsfn_figures.py

Sizing follows the worksheet rule: a figure is drawn 1.9x the size it is placed
at, so every point size here is the size wanted ON THE PAGE multiplied by 1.9
(ADRIAN-STYLE, Diagrams).  Every graph gets named, arrowed axes through the
shared helper, called AFTER the limits are set.  A panel carrying one graph is
drawn plain black; only the panel holding two different curves is coloured, and
there the colour separates the two curves rather than counting them.
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


def fig(w_cm, h_cm):
    f, ax = plt.subplots(figsize=(w_cm / 2.54 * S, h_cm / 2.54 * S))
    return f, ax


def finish(f, ax, out, xlabel="x", ylabel="y", tick_size=PT(8.0)):
    """The arrowed, named axes every graph carries, then the file.

    tick_size goes to arrow_axes rather than to set_xticklabels: a size given
    to the tick labels before the spines move is discarded (see axes.py), which
    is what left the numbers on the first draft printing at 5 pt.
    """
    arrow_axes(ax, xlabel=xlabel, ylabel=ylabel, size=PT(8.5), lw=LW(0.55),
               head=PT(2.6), tick_size=tick_size)
    f.savefig(OUT / out, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(f)
    print("wrote", OUT / out)


def bare(ax):
    """A shape panel carries no numbers -- the shape is the whole point."""
    ax.set_xticks([])
    ax.set_yticks([])


# ---------------------------------------------------------------- the six families

def family_panels():
    w, h = 4.5, 3.2

    # y = ax + b, a > 0, b > 0
    f, ax = fig(w, h)
    x = np.linspace(-2.6, 2.6, 2)
    ax.plot(x, 0.9 * x + 1.2, color=CURVE, lw=LW(1.1))
    ax.set_xlim(-3.0, 3.0); ax.set_ylim(-2.0, 3.8)
    bare(ax)
    finish(f, ax, "gf-fam-linear.png")

    # y = ax^2 + bx + c, a > 0
    f, ax = fig(w, h)
    x = np.linspace(-2.3, 2.3, 200)
    ax.plot(x, 0.75 * x ** 2 - 1.2, color=CURVE, lw=LW(1.1))
    ax.set_xlim(-3.0, 3.0); ax.set_ylim(-2.2, 3.4)
    bare(ax)
    finish(f, ax, "gf-fam-quadratic.png")

    # y = ax^3, a > 0
    f, ax = fig(w, h)
    x = np.linspace(-1.55, 1.55, 200)
    ax.plot(x, 0.8 * x ** 3, color=CURVE, lw=LW(1.1))
    ax.set_xlim(-1.9, 1.9); ax.set_ylim(-3.1, 3.1)
    bare(ax)
    finish(f, ax, "gf-fam-cubic.png")

    # y = a/x, a > 0
    f, ax = fig(w, h)
    for lo, hi in ((0.34, 2.8), (-2.8, -0.34)):
        x = np.linspace(lo, hi, 200)
        ax.plot(x, 1.0 / x, color=CURVE, lw=LW(1.1))
    ax.set_xlim(-3.0, 3.0); ax.set_ylim(-3.0, 3.0)
    bare(ax)
    finish(f, ax, "gf-fam-reciprocal.png")

    # y = a/x^2, a > 0
    f, ax = fig(w, h)
    for lo, hi in ((0.58, 2.8), (-2.8, -0.58)):
        x = np.linspace(lo, hi, 200)
        ax.plot(x, 1.0 / x ** 2, color=CURVE, lw=LW(1.1))
    ax.set_xlim(-3.0, 3.0); ax.set_ylim(-1.1, 3.2)
    bare(ax)
    finish(f, ax, "gf-fam-reciprocal2.png")

    # y = k a^x, k > 0, a > 1
    f, ax = fig(w, h)
    x = np.linspace(-2.9, 1.55, 200)
    ax.plot(x, 1.0 * 2.6 ** x, color=CURVE, lw=LW(1.1))
    ax.axhline(0, color=DASH, lw=LW(0.5), ls=(0, (3, 3)), zorder=1)
    ax.plot([0], [1], "o", color=CURVE, ms=PT(2.0), zorder=5)
    ax.text(-0.22, 1.45, r"$(0,\,k)$", fontsize=PT(7.5), ha="right",
            va="bottom")
    ax.set_xlim(-3.0, 2.0); ax.set_ylim(-0.9, 4.4)
    bare(ax)
    finish(f, ax, "gf-fam-exponential.png")


# ------------------------------------------------------- Example 2: y = 3^x + 1

def example2():
    f, ax = fig(7.0, 5.0)
    x = np.linspace(-3.0, 1.35, 300)
    ax.plot(x, 3.0 ** x + 1, color=CURVE, lw=LW(1.2))
    ax.axhline(1, color=DASH, lw=LW(0.6), ls=(0, (4, 3)), zorder=1)
    ax.text(-2.9, 1.16, r"$y=1$", fontsize=PT(8.0), color=DASH,
            ha="left", va="bottom")
    ax.plot([0], [2], "o", color=CURVE, ms=PT(2.4), zorder=5)
    ax.text(-0.14, 2.06, r"$(0,\,2)$", fontsize=PT(8.5), ha="right",
            va="bottom")
    ax.text(-1.15, 4.1, r"$y=3^{x}+1$", fontsize=PT(9.5), ha="center",
            va="bottom")
    ax.set_xlim(-3.2, 1.6); ax.set_ylim(-0.9, 5.4)
    ax.set_xticks([]); ax.set_yticks([])
    finish(f, ax, "gf-ex2-3powx-plus1.png")


# ------------------------------ Example 3: y = -x^2 and y = 3^x never meet

def example3():
    f, ax = fig(7.6, 5.4)
    x = np.linspace(-2.05, 2.05, 300)
    ax.plot(x, -x ** 2, color=BLUE, lw=LW(1.2))
    xe = np.linspace(-2.4, 1.45, 300)
    ax.plot(xe, 3.0 ** xe, color=ORANGE, lw=LW(1.2))
    ax.plot([0], [1], "o", color=ORANGE, ms=PT(2.4), zorder=5)
    ax.text(-0.14, 1.06, r"$(0,\,1)$", fontsize=PT(8.0), color=ORANGE,
            ha="right", va="bottom")
    # both labels sit clear of every curve: the parabola is drawn no lower than
    # -4.2, and the exponential is under 2 at x = 0.5
    ax.text(-2.5, -5.1, r"$y=-x^{2}$", fontsize=PT(9.5), color=BLUE,
            ha="left", va="center")
    ax.text(1.62, 4.5, r"$y=3^{x}$", fontsize=PT(9.5), color=ORANGE,
            ha="left", va="center")
    ax.set_xlim(-2.6, 3.4); ax.set_ylim(-5.6, 5.2)
    ax.set_xticks([]); ax.set_yticks([])
    finish(f, ax, "gf-ex3-no-solution.png")


# ------------------------------------------- Section C: the three tank shapes

def tank_panel(out, outline, curve, caption):
    """A container drawn above the depth-time graph it produces.

    The container and the graph share one picture so the student reads the
    shape of the vessel and the shape of the graph as one fact.
    """
    f, (top, bot) = plt.subplots(
        2, 1, figsize=(4.6 / 2.54 * S, 5.4 / 2.54 * S),
        gridspec_kw={"height_ratios": [1.0, 1.25], "hspace": 0.34})

    xs, ys = zip(*outline)
    top.plot(xs, ys, color=CURVE, lw=LW(1.0))
    top.set_xlim(-1.35, 1.35); top.set_ylim(-0.12, 1.28)
    top.axis("off")
    top.set_aspect("equal")

    t = np.linspace(0, 1, 200)
    bot.plot(t, curve(t), color=CURVE, lw=LW(1.2))
    bot.set_xlim(-0.14, 1.2); bot.set_ylim(-0.16, 1.24)
    bot.set_xticks([]); bot.set_yticks([])
    arrow_axes(bot, xlabel="t", ylabel="d", size=PT(8.5), lw=LW(0.55),
               head=PT(2.6), tick_size=PT(8.0))
    bot.text(0.5, -0.34, caption, fontsize=PT(8.0), ha="center", va="top",
             transform=bot.transAxes)

    f.savefig(OUT / out, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(f)
    print("wrote", OUT / out)


def tank_panels():
    # straight sides -- same area at every height, so the level climbs steadily
    tank_panel("gf-tank-straight.png",
               [(-0.7, 1.15), (-0.7, 0), (0.7, 0), (0.7, 1.15)],
               lambda t: t, "straight line")
    # wider as it rises -- each centimetre needs more water, so the level slows
    tank_panel("gf-tank-widening.png",
               [(-1.05, 1.15), (0, 0), (1.05, 1.15)],
               lambda t: np.sqrt(t), "curve bending down")
    # narrower as it rises -- each centimetre needs less water, so it speeds up
    tank_panel("gf-tank-narrowing.png",
               [(-0.28, 1.15), (-1.05, 0), (1.05, 0), (0.28, 1.15)],
               lambda t: t ** 2, "curve bending up")


# ---------------------------------------- Example 8: the inverted cone, 200 s

def example8():
    f, ax = fig(7.4, 5.0)
    t = np.linspace(0, 200, 300)
    ax.plot(t, 30 * (t / 200) ** (1 / 3), color=CURVE, lw=LW(1.2))
    ax.plot([200], [30], "o", color=CURVE, ms=PT(2.4), zorder=5)
    ax.plot([0, 200], [30, 30], color=DASH, lw=LW(0.5), ls=(0, (3, 3)),
            zorder=1)
    ax.plot([200, 200], [0, 30], color=DASH, lw=LW(0.5), ls=(0, (3, 3)),
            zorder=1)
    ax.text(196, 31.4, r"$(200,\,30)$", fontsize=PT(8.5), ha="right",
            va="bottom")
    ax.set_xlim(-16, 238); ax.set_ylim(-3.4, 37)
    ax.set_xticks([200]); ax.set_yticks([30])
    ax.set_xticklabels([r"$200$"])
    ax.set_yticklabels([r"$30$"])
    finish(f, ax, "gf-ex8-cone.png", xlabel="t", ylabel="d")


# ------------------------------- Example 9: the cone inside the cylinder

def example9():
    """Depth against time for water poured round a cone standing in a cylinder.

    The cone's base covers the whole floor of the cylinder, so at the bottom
    there is almost no room for the water and the level jumps; as the cone
    narrows the ring of free space widens and the level slows.  Taking r = 1,
    the volume under depth x is pi*x - pi(1-(1-x)^3)/3, and the container takes
    2/3 pi in the first 4 minutes, which gives the time below.
    """
    f, ax = fig(7.4, 5.0)
    x1 = np.linspace(0, 1, 300)
    t1 = 2 * (3 * x1 - 1 + (1 - x1) ** 3)
    ax.plot(t1, x1, color=CURVE, lw=LW(1.2))
    t2 = np.linspace(4, 10, 2)
    ax.plot(t2, 1 + (t2 - 4) / 6, color=CURVE, lw=LW(1.2))
    for x, y in ((4, 1), (10, 2)):
        ax.plot([x], [y], "o", color=CURVE, ms=PT(2.4), zorder=5)
    ax.plot([0, 4], [1, 1], color=DASH, lw=LW(0.5), ls=(0, (3, 3)), zorder=1)
    ax.plot([4, 4], [0, 1], color=DASH, lw=LW(0.5), ls=(0, (3, 3)), zorder=1)
    ax.plot([0, 10], [2, 2], color=DASH, lw=LW(0.5), ls=(0, (3, 3)), zorder=1)
    ax.plot([10, 10], [0, 2], color=DASH, lw=LW(0.5), ls=(0, (3, 3)), zorder=1)
    ax.text(4.3, 0.92, r"$(4,\,r)$", fontsize=PT(8.5), ha="left", va="top")
    ax.text(9.8, 2.08, r"$(10,\,2r)$", fontsize=PT(8.5), ha="right",
            va="bottom")
    ax.set_xlim(-0.8, 11.8); ax.set_ylim(-0.22, 2.45)
    ax.set_xticks([4, 10]); ax.set_yticks([1, 2])
    ax.set_xticklabels([r"$4$", r"$10$"])
    ax.set_yticklabels([r"$r$", r"$2r$"])
    finish(f, ax, "gf-ex9-cone-in-cylinder.png", xlabel="t", ylabel="d")


if __name__ == "__main__":
    family_panels()
    example2()
    example3()
    tank_panels()
    example8()
    example9()
