#!/usr/bin/python3
"""The four gradient sketches for the S1 Linear Functions Notes box.

Re-run after editing; the PNGs are committed so a build never needs matplotlib.

    /usr/bin/python3 scripts/revision-builders/make_gradient_sketches.py
"""
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

OUT = Path(__file__).resolve().parent / "assets"
OUT.mkdir(exist_ok=True)
plt.rcParams.update({"font.family": "serif", "font.size": 11,
                     "mathtext.fontset": "dejavuserif"})

# name -> the two endpoints of the line
LINES = {
    "grad-positive":  [(-1.5, -1.5), (1.5, 1.5)],
    "grad-negative":  [(-1.5, 1.5), (1.5, -1.5)],
    "grad-zero":      [(-1.6, 0.9), (1.6, 0.9)],
    "grad-undefined": [(0.9, -1.6), (0.9, 1.6)],
}

for name, ((x0, y0), (x1, y1)) in LINES.items():
    fig, ax = plt.subplots(figsize=(1.5, 1.5))
    ax.set_xlim(-2, 2); ax.set_ylim(-2, 2)
    ax.set_aspect("equal")
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.spines["left"].set_position("zero")
    ax.spines["bottom"].set_position("zero")
    ax.spines["left"].set_linewidth(0.9)
    ax.spines["bottom"].set_linewidth(0.9)
    ax.set_xticks([]); ax.set_yticks([])
    ax.plot(1, 0, ">k", transform=ax.get_yaxis_transform(), clip_on=False, markersize=3.5)
    ax.plot(0, 1, "^k", transform=ax.get_xaxis_transform(), clip_on=False, markersize=3.5)
    ax.annotate("$x$", xy=(1, 0), xycoords=ax.get_yaxis_transform(),
                xytext=(5, -3), textcoords="offset points", fontsize=8, style="italic")
    ax.annotate("$y$", xy=(0, 1), xycoords=ax.get_xaxis_transform(),
                xytext=(3, 3), textcoords="offset points", fontsize=8, style="italic")
    ax.plot([x0, x1], [y0, y1], color="black", lw=1.8, solid_capstyle="round")
    fig.savefig(OUT / f"{name}.png", dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("wrote", OUT / f"{name}.png")
