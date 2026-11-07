"""Black-and-white area pieces and 2D solids of revolution (Adrian, 7 Nov 2026:
"generate the diagrams such that it can be seen when printed black and white … and volume
clearly visible even when it's 2d").

Pieces are told apart by HATCH, not colour. A solid of revolution is drawn the textbook way:
the curve and its mirror image, an oval at each end, the solid hatched, a hole left white
with dashed edges, the axis of rotation dash-dot."""
import numpy as np
from matplotlib.patches import Ellipse, Arc

HATCHES = ['////', '\\\\\\\\', 'xxx', '...', '|||']
GREY = '0.86'          # the whole region asked for (target), before it is split

def piece(k):
    """kwargs for fill_between / fill_betweenx: piece k (0, 1, 2 …) as a hatch on white."""
    return dict(facecolor='white', hatch=HATCHES[k % len(HATCHES)], edgecolor='0.30', linewidth=0)

def target():
    return dict(facecolor=GREY, edgecolor='none', linewidth=0)

def _oval(ax, c, w, h, back_dashed=True, lw=1.0):
    """Oval centred at c; the far half dashed when it would be hidden."""
    if back_dashed:
        ax.add_patch(Arc(c, w, h, theta1=270, theta2=90, lw=lw, color='k'))          # front (right half)
        ax.add_patch(Arc(c, w, h, theta1=90, theta2=270, lw=lw * 0.8, color='k', ls=(0, (3, 2))))
    else:
        ax.add_patch(Ellipse(c, w, h, fill=False, lw=lw, color='k'))

def solid_x(ax, x, r_out, r_in=None, k=0, depth=0.16, mid=(), cut=()):
    """Solid from turning the region between r_in (or the axis) and r_out about the x-axis.
    depth = oval width as a fraction of its height. cut = x-values where pieces meet (oval drawn)."""
    x = np.asarray(x, float); ro = np.asarray(r_out, float)
    span = getattr(ax, '_span_x', None) or (x.max() - x.min()); rmax = getattr(ax, '_rmax', None) or float(np.nanmax(ro))
    W = lambda r: depth * span * (r / rmax)          # oval width in x-units, scaled to the panel
    ax.fill_between(x, -ro, ro, **piece(k))
    ax.plot(x, ro, 'k', lw=1.2); ax.plot(x, -ro, 'k', lw=1.2)
    if r_in is not None:
        ri = np.asarray(r_in, float)
        ax.fill_between(x, -ri, ri, facecolor='white', edgecolor='none', zorder=2)
        ax.plot(x, ri, 'k', lw=0.9, ls=(0, (3, 2)), zorder=3); ax.plot(x, -ri, 'k', lw=0.9, ls=(0, (3, 2)), zorder=3)
    for xi, r in ((x[0], ro[0]), (x[-1], ro[-1])):
        if r > 1e-6: _oval(ax, (xi, 0), W(r), 2 * r, back_dashed=(xi == x[0]))
    if r_in is not None:
        for xi, r in ((x[0], ri[0]), (x[-1], ri[-1])):
            if r > 1e-6: ax.add_patch(Ellipse((xi, 0), W(r), 2 * r, fill=False, lw=0.8, ls=(0, (3, 2)), zorder=4))
    for xc in cut:
        r = float(np.interp(xc, x, ro)); _oval(ax, (xc, 0), W(r), 2 * r)

def solid_y(ax, y, r_out, r_in=None, k=0, depth=0.16, cut=()):
    """Solid from turning the region between r_in (or the axis) and r_out about the y-axis."""
    y = np.asarray(y, float); ro = np.asarray(r_out, float)
    span = getattr(ax, '_span_y', None) or (y.max() - y.min()); rmax = getattr(ax, '_rmax', None) or float(np.nanmax(ro))
    H = lambda r: depth * span * (r / rmax)
    ax.fill_betweenx(y, -ro, ro, **piece(k))
    ax.plot(ro, y, 'k', lw=1.2); ax.plot(-ro, y, 'k', lw=1.2)
    if r_in is not None:
        ri = np.asarray(r_in, float)
        ax.fill_betweenx(y, -ri, ri, facecolor='white', edgecolor='none', zorder=2)
        ax.plot(ri, y, 'k', lw=0.9, ls=(0, (3, 2)), zorder=3); ax.plot(-ri, y, 'k', lw=0.9, ls=(0, (3, 2)), zorder=3)
    def flat(yc, r, dashed_back):
        if r <= 1e-6: return
        if dashed_back:
            ax.add_patch(Arc((0, yc), 2 * r, H(r), theta1=180, theta2=360, lw=1.0, color='k'))
            ax.add_patch(Arc((0, yc), 2 * r, H(r), theta1=0, theta2=180, lw=0.8, color='k', ls=(0, (3, 2))))
        else:
            ax.add_patch(Ellipse((0, yc), 2 * r, H(r), fill=False, lw=1.0))
    flat(y[0], ro[0], True); flat(y[-1], ro[-1], False)
    if r_in is not None:
        for yc, r in ((y[0], ri[0]), (y[-1], ri[-1])):
            if r > 1e-6: ax.add_patch(Ellipse((0, yc), 2 * r, H(r), fill=False, lw=0.8, ls=(0, (3, 2)), zorder=4))
    for yc in cut:
        flat(yc, float(np.interp(yc, y, ro)), True)

def axis_line(ax, which='x'):
    if which == 'x': ax.axhline(0, color='k', lw=0.8, ls='-.', zorder=5)
    else: ax.axvline(0, color='k', lw=0.8, ls='-.', zorder=5)

def bare(ax, xlim, ylim):
    ax.set_xlim(*xlim); ax.set_ylim(*ylim); ax.set_aspect('auto'); ax.axis('off')
