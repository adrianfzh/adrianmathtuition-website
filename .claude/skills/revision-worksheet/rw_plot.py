"""Answer graphs drawn ON the grid, for the "draw the graph" parts of a sheet.

A worked example whose answer is "plot these points and rule the line" is not
worked at all if the solution is a sentence (Adrian, 5 Sep 2026). This draws
the finished picture — the question's own grid, the line that was already
printed on it in black, and the student's answer in the house answer colour —
so the reader sees exactly what the marker wanted to see.

The grid is redrawn rather than overlaid on the scanned figure: a scan's axes
are never quite square, so points pinned to it drift. Give the same ranges and
scale the original grid uses and the two read the same.

    from rw_plot import answer_grid
    answer_grid(path, xlim=(-2, 5), ylim=(-9, 6),
                given=[{"pts": [(-1, -6), (1.5, 4)], "label": "L"}],
                answer=[{"pts": [(-2, 5), (2, -3)], "label": "y = -2x + 1"}],
                points=[(-2, 5), (1, -1), (2, -3)],
                marks=[{"x": 0.5, "y": 0, "label": "R"}])
"""
from __future__ import annotations

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt          # noqa: E402
from matplotlib.ticker import MultipleLocator  # noqa: E402

DPI = 200
ANSWER = "#843C0C"          # the same orange-brown as the [Ans: …] line
GIVEN = "#000000"
GRID_MAJOR = "#9C9C9C"
GRID_MINOR = "#D8D8D8"

plt.rcParams.update({
    "font.family": "serif",
    "font.size": 9,
    "mathtext.fontset": "dejavuserif",
    "axes.linewidth": 0.9,
})


def _fmt(v: float) -> str:
    """A real minus sign, so a plotted label matches the axis numbers beside it."""
    t = str(int(v)) if float(v).is_integer() else f"{v:g}"
    return t.replace("-", "\u2212")


def answer_grid(out_path, *, xlim, ylim, xstep=1, ystep=1, minor=5,
                given=(), answer=(), points=(), marks=(), reads=(),
                axis_names=("x", "y"), width_in=4.6, height_in=None,
                point_labels=True):
    """Draw a squared-paper answer graph and save it as a PNG.

    given / answer : [{"pts": [(x0,y0), (x1,y1)], "label": str}] — a ruled
        segment. `given` is what the question already printed (black);
        `answer` is what the student had to add (answer colour).
    points  : [(x, y)] or [(x, y, "label")] — the plotted table points, drawn
        as crosses on the answer line.
    marks   : [{"x":…, "y":…, "label":…}] — a named point to label, e.g. an
        intersection the question asks for.
    reads   : [{"x":…, "y":…, "label":…}] — dashed read-off lines from the
        axes to the curve, for a "use your graph to find …" part.
    """
    xr, yr = xlim[1] - xlim[0], ylim[1] - ylim[0]
    if height_in is None:
        # keep the printed squares roughly square, but never taller than a
        # solution box can hold
        height_in = min(width_in * (yr / xr) * (xstep / ystep), width_in * 1.45)
    fig, ax = plt.subplots(figsize=(width_in, height_in))
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)

    ax.xaxis.set_major_locator(MultipleLocator(xstep))
    ax.yaxis.set_major_locator(MultipleLocator(ystep))
    if minor:
        ax.xaxis.set_minor_locator(MultipleLocator(xstep / minor))
        ax.yaxis.set_minor_locator(MultipleLocator(ystep / minor))
        ax.grid(which="minor", color=GRID_MINOR, lw=0.4)
    ax.grid(which="major", color=GRID_MAJOR, lw=0.6)
    ax.set_axisbelow(True)

    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    if xlim[0] <= 0 <= xlim[1]:
        ax.spines["left"].set_position("zero")
    if ylim[0] <= 0 <= ylim[1]:
        ax.spines["bottom"].set_position("zero")
    ax.plot(1, 0, ">k", transform=ax.get_yaxis_transform(), clip_on=False, markersize=4)
    ax.plot(0, 1, "^k", transform=ax.get_xaxis_transform(), clip_on=False, markersize=4)
    ax.annotate(axis_names[0], xy=(1, 0), xycoords=ax.get_yaxis_transform(),
                xytext=(9, -4), textcoords="offset points", style="italic")
    ax.annotate(axis_names[1], xy=(0, 1), xycoords=ax.get_xaxis_transform(),
                xytext=(5, 5), textcoords="offset points", style="italic")
    ax.tick_params(labelsize=8, length=0)

    def _segments(specs, colour, lw):
        for s in specs:
            (x0, y0), (x1, y1) = s["pts"][0], s["pts"][-1]
            ax.plot([x0, x1], [y0, y1], color=colour, lw=lw,
                    solid_capstyle="round", zorder=3)
            if s.get("label"):
                ax.annotate(s["label"], (x1, y1), color=colour, fontsize=9,
                            xytext=s.get("label_offset", (6, 4)),
                            textcoords="offset points", zorder=5)

    _segments(given, GIVEN, 1.6)
    _segments(answer, ANSWER, 1.8)

    for p in points:
        x, y = p[0], p[1]
        ax.plot(x, y, marker="x", color=ANSWER, markersize=6, mew=1.6, zorder=4)
        if point_labels:
            lab = p[2] if len(p) > 2 else f"({_fmt(x)}, {_fmt(y)})"
            ax.annotate(lab, (x, y), color=ANSWER, fontsize=7.5,
                        xytext=(5, 4), textcoords="offset points", zorder=5)

    # A read-off is drawn from the AXIS to the line, the way it is done on paper —
    # running the dashes out to the edge of the grid reads as a second line.
    x_anchor = 0 if xlim[0] <= 0 <= xlim[1] else xlim[0]
    y_anchor = 0 if ylim[0] <= 0 <= ylim[1] else ylim[0]
    for r in reads:
        x, y = r["x"], r["y"]
        ax.plot([x_anchor, x], [y, y], color=ANSWER, lw=0.9, ls=(0, (4, 3)), zorder=2)
        ax.plot([x, x], [y, y_anchor], color=ANSWER, lw=0.9, ls=(0, (4, 3)), zorder=2)
        if r.get("label"):
            ax.annotate(r["label"], (x, y), color=ANSWER, fontsize=8,
                        xytext=r.get("label_offset", (6, -12)),
                        textcoords="offset points", zorder=5)

    for m in marks:
        ax.plot(m["x"], m["y"], "o", color=ANSWER, markersize=4.5, zorder=5)
        ax.annotate(m.get("label", ""), (m["x"], m["y"]), color=ANSWER,
                    fontsize=9, style="italic", zorder=5,
                    xytext=m.get("label_offset", (6, 5)), textcoords="offset points")

    fig.savefig(out_path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return str(out_path)
