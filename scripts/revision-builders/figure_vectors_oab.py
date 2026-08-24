# -*- coding: utf-8 -*-
"""Redraw the OAB vector figure.

a and b are arbitrary non-parallel vectors, so the picture is free to choose
them; these two are picked to reproduce the proportions of the printed figure
(A far right, B up and slightly right of O) rather than the tall thin triangle
that a = (1,0), b = (0,1) would give.  Every labelled point is then computed
from the vector definitions, so the figure cannot drift from the algebra.
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.family'] = 'serif'
plt.rcParams['font.serif'] = ['DejaVu Serif']
plt.rcParams['mathtext.fontset'] = 'dejavuserif'

a = np.array([1.0, 0.0])
b = np.array([0.28, 0.42])

O = np.zeros(2)
A = 3 * a
B = 6 * b
C = 2 * a + 2 * b          # part (a)
P = C / 2                  # midpoint of OC
Q = 0.25 * B               # part (b): n = 1/4

fig, ax = plt.subplots(figsize=(6.0, 3.6), dpi=260)
ax.set_aspect('equal')
ax.axis('off')

LW = 1.25
for X, Y in [(O, A), (O, B), (B, A), (O, C), (A, Q)]:
    ax.plot([X[0], Y[0]], [X[1], Y[1]], color='black', lw=LW, solid_capstyle='round',
            zorder=1)


def arrow(X, Y, frac=0.55):
    """A direction arrowhead partway along XY, for the two given vectors."""
    tip = X + frac * (Y - X)
    ax.annotate('', xy=tip, xytext=X + (frac - 0.12) * (Y - X),
                arrowprops=dict(arrowstyle='-|>', color='black', lw=LW,
                                mutation_scale=13), zorder=2)


arrow(O, A)   # 3a
arrow(O, B)   # 6b


def ticks(X, Y, n, size=0.075):
    """n short cross-strokes at the midpoint of XY, marking the 2:1 ratio."""
    mid = (X + Y) / 2
    d = (Y - X) / np.linalg.norm(Y - X)
    perp = np.array([-d[1], d[0]])
    for k in range(n):
        c = mid + d * (k - (n - 1) / 2) * 0.085
        ax.plot([c[0] - perp[0] * size, c[0] + perp[0] * size],
                [c[1] - perp[1] * size, c[1] + perp[1] * size],
                color='black', lw=1.0, zorder=2)


ticks(B, C, 2)   # BC = 2 parts
ticks(C, A, 1)   # CA = 1 part

for pt, lab, dx, dy, ha, va in [
    (O, 'O', -0.13, -0.02, 'right', 'center'),
    (A, 'A',  0.12, -0.02, 'left',  'center'),
    (B, 'B', -0.04,  0.14, 'center', 'bottom'),
    (C, 'C',  0.10,  0.08, 'left',  'bottom'),
    (P, 'P', -0.02,  0.12, 'center', 'bottom'),
    (Q, 'Q', -0.13,  0.05, 'right',  'center'),
]:
    ax.text(pt[0] + dx, pt[1] + dy, f'${lab}$', fontsize=13, ha=ha, va=va)

for pt in (C, P, Q):
    ax.plot(*pt, 'o', color='black', ms=3.2, zorder=3)

# the two given vectors
ax.text(*(O + 0.5 * (A - O) + np.array([0.0, -0.20])), r'$3\mathbf{a}$',
        fontsize=13, ha='center', va='top')
ax.text(*(O + 0.5 * (B - O) + np.array([-0.16, 0.02])), r'$6\mathbf{b}$',
        fontsize=13, ha='right', va='center')

ax.margins(0.10)
fig.tight_layout(pad=0.2)
# Flatten to opaque RGB: an alpha channel left in the PNG shows up as a grey
# backing box once Word composites it onto the page.
fig.patch.set_facecolor('white')
ax.set_facecolor('white')
fig.savefig('vec_fig.png', bbox_inches='tight', pad_inches=0.06,
            facecolor='white', transparent=False)

from PIL import Image
with Image.open('vec_fig.png') as im:
    flat = Image.new('RGB', im.size, 'white')
    flat.paste(im, mask=im.split()[-1] if im.mode == 'RGBA' else None)
    flat.save('vec_fig.png')
print('wrote vec_fig.png', flat.mode, flat.size)
