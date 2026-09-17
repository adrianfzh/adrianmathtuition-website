"""Draw the AdrianMath mark: the similar-triangles A (Adrian picked concept 8 of
the second logo round, 17 Sep 2026 -- "i like 8, use that as the logo ... keep
the previous logo around"). The previous sqrt-m ring marks are in previous-root-m/.

A solid triangle whose counter is a smaller similar triangle, crossbar in the
brand orange. Black and white is the outline alone, so no solid ink area.

    mark_navy.png     navy legs + orange bar    (colour headers on white)
    mark_white.png    white legs + orange bar   (the A Math navy band)
    mark_outline.png  outline only, near-black  (every black-and-white header)
    mark_black.png    solid near-black A        (spare)

Run: python3 make_marks.py   (writes the four PNGs beside this file)
"""
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Polygon

HERE = Path(__file__).parent
NAVY, ORANGE, INK, WHITE = '#1B2A4A', '#E08A3A', '#1A1A1A', '#FFFFFF'
PX, DPI = 620, 250

APEX = np.array([50.0, 91.0]); BL = np.array([8.0, 12.0]); BR = np.array([92.0, 12.0])
T = 16.0                    # leg thickness, measured square to the leg
C1, C2 = 33.0, 46.0         # crossbar bottom / top


def _geom():
    d = APEX - BL; d /= np.linalg.norm(d)
    p = BL + np.array([d[1], -d[0]]) * T          # a point on the inner left edge
    xin = lambda y: p[0] + (y - p[1]) / d[1] * d[0]
    apex_in = p[1] + (50 - p[0]) / d[0] * d[1]
    return xin, apex_in


def draw(name, legs=None, bar=None, outline=None):
    xin, ay = _geom()
    fig = plt.figure(figsize=(PX / DPI, PX / DPI), dpi=DPI)
    ax = fig.add_axes([0, 0, 1, 1]); ax.axis('off')
    ax.set_xlim(4, 96); ax.set_ylim(5.5, 97.5)
    counter = [(xin(C2), C2), (100 - xin(C2), C2), (50, ay)]
    if outline:
        contour = [tuple(BL), (xin(12), 12), (xin(C1), C1), (100 - xin(C1), C1),
                   (100 - xin(12), 12), tuple(BR), tuple(APEX)]
        for poly in (contour, counter):
            ax.add_patch(Polygon(poly, closed=True, fc='none', ec=outline, lw=5.0, joinstyle='miter'))
    else:
        shape = [tuple(BL), (xin(12), 12), (50, ay), (100 - xin(12), 12), tuple(BR), tuple(APEX)]
        ax.add_patch(Polygon(shape, closed=True, fc=legs, ec='none', zorder=2))
        quad = [(xin(C1) - .3, C1), (100 - xin(C1) + .3, C1), (100 - xin(C2) + .3, C2), (xin(C2) - .3, C2)]
        ax.add_patch(Polygon(quad, closed=True, fc=bar, ec='none', zorder=1))
    fig.savefig(HERE / name, transparent=True)
    plt.close(fig)


if __name__ == '__main__':
    draw('mark_navy.png', legs=NAVY, bar=ORANGE)
    draw('mark_white.png', legs=WHITE, bar=ORANGE)
    draw('mark_outline.png', outline=INK)
    draw('mark_black.png', legs=INK, bar=INK)
    print('wrote 4 marks to', HERE)
