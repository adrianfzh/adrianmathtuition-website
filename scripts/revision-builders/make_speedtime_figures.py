#!/usr/bin/python3
"""The figures for the EM Distance and Speed-Time Graphs revision worksheet.

Re-run after editing; the PNGs are committed so a build never needs matplotlib.

    /usr/bin/python3 scripts/revision-builders/make_speedtime_figures.py

Two of these are ANSWERS -- the graph the question asks the student to draw,
drawn (ADRIAN-STYLE, Diagrams: a graph is drawn even where the working alone
would answer the question, because the picture is what the student is being
marked on here).  The rest belong to the notes: one travel graph read segment
by segment, one speed-time graph with its area shaded, and four small panels
holding the four shapes a distance-time graph can take.

Sizing follows the worksheet rule: a figure is drawn 1.9x the size it is placed
at, so every point size here is the size wanted ON THE PAGE multiplied by 1.9.
Every graph gets named, arrowed axes through the shared helper, called AFTER
the limits are set.  Each panel carries one graph, so each is plain black.
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
DASH = "#5a5a5a"
SHADE = "#d7dde6"


def fig(w_cm, h_cm):
    f, ax = plt.subplots(figsize=(w_cm / 2.54 * S, h_cm / 2.54 * S))
    return f, ax


def finish(f, ax, out, xlabel="t", ylabel="d", tick_size=PT(8.0)):
    arrow_axes(ax, xlabel=xlabel, ylabel=ylabel, size=PT(8.5), lw=LW(0.55),
               head=PT(2.6), tick_size=tick_size)
    f.savefig(OUT / out, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(f)
    print("wrote", OUT / out)


def bare(ax):
    """A shape panel carries no numbers -- the shape is the whole point."""
    ax.set_xticks([])
    ax.set_yticks([])


def guides(ax, x, y, xmax=None):
    """The two dotted lines from a point back to the axes."""
    ax.plot([0, x], [y, y], color=DASH, lw=LW(0.5), ls=(0, (3, 3)), zorder=1)
    ax.plot([x, x], [0, y], color=DASH, lw=LW(0.5), ls=(0, (3, 3)), zorder=1)


# ------------------------------------------------ notes: reading a travel graph

def note_travel():
    """A journey out, a rest, and the journey home, with each stretch named."""
    f, ax = fig(8.6, 5.2)
    ax.plot([0, 2, 3, 5], [0, 60, 60, 0], color=CURVE, lw=LW(1.2))
    for x, y in ((2, 60), (3, 60), (5, 0)):
        ax.plot([x], [y], "o", color=CURVE, ms=PT(2.2), zorder=5)
    ax.text(0.85, 34, "travelling away", fontsize=PT(8.0), rotation=44,
            ha="center", va="bottom")
    ax.text(2.5, 62.5, "stopped", fontsize=PT(8.0), ha="center", va="bottom")
    ax.text(4.3, 33, "coming back", fontsize=PT(8.0), rotation=-50,
            ha="center", va="bottom")
    ax.set_xlim(-0.35, 5.7); ax.set_ylim(-5.5, 78)
    ax.set_xticks([2, 3, 5]); ax.set_yticks([60])
    ax.set_xticklabels([r"$2$", r"$3$", r"$5$"])
    ax.set_yticklabels([r"$60$"])
    finish(f, ax, "st-note-travel.png",
           xlabel=r"t\,\mathrm{(h)}", ylabel=r"d\,\mathrm{(km)}")


# ------------------------------------------- notes: the area under a speed graph

def note_area():
    """Speed against time: the gradient is the acceleration, the area the distance."""
    f, ax = fig(8.6, 5.2)
    t = [0, 10, 30, 40]
    v = [0, 20, 20, 0]
    ax.fill_between(t, v, color=SHADE, zorder=0)
    ax.plot(t, v, color=CURVE, lw=LW(1.2))
    for x, y in ((10, 20), (30, 20), (40, 0)):
        ax.plot([x], [y], "o", color=CURVE, ms=PT(2.2), zorder=5)
    ax.text(21, 7.4, "area = distance", fontsize=PT(8.5), ha="center",
            va="center")
    ax.text(11.5, 16.4, "gradient =", fontsize=PT(8.0), ha="left", va="bottom")
    ax.text(11.5, 13.6, "acceleration", fontsize=PT(8.0), ha="left", va="bottom")
    ax.set_xlim(-2.6, 46); ax.set_ylim(-1.9, 26)
    ax.set_xticks([10, 30, 40]); ax.set_yticks([20])
    ax.set_xticklabels([r"$10$", r"$30$", r"$40$"])
    ax.set_yticklabels([r"$20$"])
    finish(f, ax, "st-note-area.png",
           xlabel=r"t\,\mathrm{(s)}", ylabel=r"v\,\mathrm{(m/s)}")


# -------------------------------------- notes: the four shapes, side by side

def shape_panel(out, ys, caption):
    f, ax = fig(3.6, 2.6)
    x = np.linspace(0, 1, 200)
    ax.plot(x, ys(x), color=CURVE, lw=LW(1.2))
    ax.set_xlim(-0.08, 1.2); ax.set_ylim(-0.1, 1.25)
    bare(ax)
    ax.text(0.5, -0.3, caption, fontsize=PT(8.0), ha="center", va="top",
            transform=ax.transAxes)
    finish(f, ax, out, xlabel="t", ylabel="d")


def shape_panels():
    shape_panel("st-shape-steady.png", lambda x: 0.95 * x, "constant speed")
    shape_panel("st-shape-speeding.png", lambda x: 0.95 * x ** 2,
                "speeding up")
    shape_panel("st-shape-slowing.png", lambda x: 0.95 * (1 - (1 - x) ** 2),
                "slowing down")
    shape_panel("st-shape-stopped.png", lambda x: 0 * x + 0.62, "stopped")


# ----------------------------- Example: the distance-time graph of a journey

def example_distance():
    """Cedar Girls 2025 P1 Q24(b): the distance-time graph of the speed graph.

    The van speeds up for 10 s, holds 30 m/s to 60 s, then stops in 5 s.  Under
    a constant acceleration the distance is 1.5t^2, so the first stretch is a
    curve getting steeper; the middle stretch is a straight line; the last is a
    curve flattening out, reaching 1725 m at 65 s.
    """
    f, ax = fig(8.6, 5.4)
    t1 = np.linspace(0, 10, 120)
    ax.plot(t1, 1.5 * t1 ** 2, color=CURVE, lw=LW(1.2))
    ax.plot([10, 60], [150, 1650], color=CURVE, lw=LW(1.2))
    t3 = np.linspace(60, 65, 80)
    ax.plot(t3, 1650 + 30 * (t3 - 60) - 3 * (t3 - 60) ** 2, color=CURVE,
            lw=LW(1.2))
    for x, y in ((10, 150), (60, 1650), (65, 1725)):
        ax.plot([x], [y], "o", color=CURVE, ms=PT(2.2), zorder=5)
    guides(ax, 10, 150)
    guides(ax, 65, 1725)
    ax.text(58, 1560, r"$(60,\,1650)$", fontsize=PT(8.0), ha="right",
            va="top")
    ax.set_xlim(-3.4, 76); ax.set_ylim(-90, 2000)
    ax.set_xticks([10, 60, 65]); ax.set_yticks([150, 1725])
    ax.set_xticklabels([r"$10$", r"$60$", r"$65$"])
    ax.set_yticklabels([r"$150$", r"$1725$"])
    finish(f, ax, "st-ex-distance.png",
           xlabel=r"t\,\mathrm{(s)}", ylabel=r"d\,\mathrm{(m)}")


# -------------------------- Example: the travel graph of the journey in words

def example_travel():
    """Nan Chiau 2021 P2 Q8(c): 90 km out at 36 km/h, straight back at 40 km/h.

    Out in 2.5 hours, home 2.25 hours later, so the graph is two straight lines
    through (0, 0), (2.5, 90) and (4.75, 0).
    """
    f, ax = fig(8.6, 5.2)
    ax.plot([0, 2.5, 4.75], [0, 90, 0], color=CURVE, lw=LW(1.2))
    ax.plot([2.5], [90], "o", color=CURVE, ms=PT(2.2), zorder=5)
    ax.plot([4.75], [0], "o", color=CURVE, ms=PT(2.2), zorder=5)
    guides(ax, 2.5, 90)
    ax.text(2.62, 91, r"$(2.5,\,90)$", fontsize=PT(8.0), ha="left", va="bottom")
    ax.set_xlim(-0.34, 5.6); ax.set_ylim(-8.5, 116)
    ax.set_xticks([2.5, 4.75]); ax.set_yticks([90])
    ax.set_xticklabels([r"$2.5$", r"$4.75$"])
    ax.set_yticklabels([r"$90$"])
    finish(f, ax, "st-ex-travel.png",
           xlabel=r"t\,\mathrm{(h)}", ylabel=r"d\,\mathrm{(km)}")


# ------------- Example: the travel graph the question asks to be completed

def example_journey():
    """St Joseph's Institution 2025 P1 Q26: the finished travel graph.

    Parts (c), (d) and (e) are all answered by drawing on the graph, so the
    answer IS a picture (ADRIAN-STYLE, Diagrams).  Two journeys share the
    axes, so each is a colour of its own; the given part of Lily's journey is
    her colour too, because a colour means a whole graph.

    x is measured in hours after 0800 and ticked with the clock, the way the
    question's own grid is.  The two lines run close together and neither has
    room for a label beside it, so each is named ALONG its own line.
    """
    BLUE, ORANGE = CYCLE_COLOURS[0], CYCLE_COLOURS[1]
    f, ax = fig(11.0, 7.0)

    ax.plot([0, 1, 1.7, 2.5, 3.0], [0, 14, 14, 30, 30],
            color=BLUE, lw=LW(1.1), zorder=4)
    ax.plot([3.0, 4.2], [30, 50], color=BLUE, lw=LW(1.1), zorder=4)
    ax.plot([2.5, 4.6], [30, 50], color=ORANGE, lw=LW(1.1), zorder=4)

    for x, y, c in ((4.2, 50, BLUE), (2.5, 30, ORANGE), (4.6, 50, ORANGE)):
        ax.plot([x], [y], "o", color=c, ms=PT(2.0), zorder=6)

    # where they pass -- the answer to (e) is the gap from there up to Town D
    cx, cy = 3.6667, 41.11
    ax.plot([cx], [cy], "o", color="#1a1a1a", ms=PT(2.2), zorder=7)
    ax.plot([cx, cx], [0, cy], color=DASH, lw=LW(0.5), ls=(0, (3, 3)), zorder=1)
    ax.annotate("", xy=(cx, 50), xytext=(cx, cy + 0.9),
                arrowprops=dict(arrowstyle="<->", color="#1a1a1a",
                                lw=LW(0.55), shrinkA=0, shrinkB=0))
    ax.text(cx - 0.09, (cy + 50) / 2, r"$9$ km", fontsize=PT(7.5),
            ha="right", va="center")
    ax.text(cx - 0.07, 3.0, r"$1140$", fontsize=PT(7.5), ha="center",
            va="bottom", rotation=90)

    ax.set_xlim(-0.2, 5.4); ax.set_ylim(-3.4, 56)
    ax.set_xticks([0, 1, 2, 3, 4, 5]); ax.set_yticks([14, 30, 50])
    ax.set_xticklabels([r"$0800$", r"$0900$", r"$1000$", r"$1100$", r"$1200$",
                        r"$1300$"])
    ax.set_yticklabels([r"$14$", r"$30$", r"$50$"])

    def along(x0, y0, x1, y1, at, text, colour, dy):
        """Name a line along itself, at the fraction `at` of its length."""
        p0 = ax.transData.transform((x0, y0))
        p1 = ax.transData.transform((x1, y1))
        ang = np.degrees(np.arctan2(p1[1] - p0[1], p1[0] - p0[0]))
        ax.text(x0 + at * (x1 - x0), y0 + at * (y1 - y0) + dy, text,
                fontsize=PT(7.5), color=colour, ha="center", va="center",
                rotation=ang, rotation_mode="anchor", zorder=6)

    f.canvas.draw()
    along(3.0, 30, 4.2, 50, 0.82, "Lily", BLUE, 2.4)
    along(2.5, 30, 4.6, 50, 0.93, "Emily", ORANGE, -2.6)
    ax.text(0.97, 15.0, r"$B$", fontsize=PT(7.5), ha="right", va="bottom")
    ax.text(2.44, 31.0, r"$C$", fontsize=PT(7.5), ha="right", va="bottom")
    ax.text(4.26, 50.4, r"$D$", fontsize=PT(7.5), ha="left", va="bottom")

    finish(f, ax, "st-ex-journey.png",
           xlabel=r"\text{time}", ylabel=r"d\,\mathrm{(km)}", tick_size=PT(7.5))


if __name__ == "__main__":
    note_travel()
    note_area()
    shape_panels()
    example_distance()
    example_travel()
    example_journey()
