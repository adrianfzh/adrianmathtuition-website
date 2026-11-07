"""Region panels drawn to MATCH each example's own question diagram (same window, proportions,
label places, printed size), then the split / the 2D solid beside it. Black-and-white safe."""
import sys, os
SK = '/Users/adrianfong/dev/adrianmathtuition-website/.claude/skills/create-worksheet'
sys.path.insert(0, SK + '/trig_figures'); sys.path.insert(0, '/tmp/av2')
import numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from solids2d import piece, target, solid_x, solid_y, axis_line, bare
plt.rcParams.update({"font.family": "serif", "mathtext.fontset": "dejavuserif", "font.size": 8.5, "hatch.linewidth": 0.6})
OUT = '/tmp/av2/fig/'; os.makedirs(OUT, exist_ok=True)
CM = 1 / 2.54
SIZES = {}          # file -> printed width in cm (used by the docx build)

def axes_xy(ax, xlim, ylim, xname='x', yname='y', O=True):
    ax.set_xlim(*xlim); ax.set_ylim(*ylim); ax.axis('off')
    ax.annotate('', (xlim[1], 0), (xlim[0], 0), arrowprops=dict(arrowstyle='-|>', lw=0.9, color='k', mutation_scale=8))
    ax.annotate('', (0, ylim[1]), (0, ylim[0]), arrowprops=dict(arrowstyle='-|>', lw=0.9, color='k', mutation_scale=8))
    dx, dy = xlim[1] - xlim[0], ylim[1] - ylim[0]
    ax.text(xlim[1] - 0.02 * dx, -0.09 * dy, xname, style='italic', ha='right', va='top', fontsize=9)
    ax.text(-0.04 * dx, ylim[1] - 0.02 * dy, yname, style='italic', ha='right', va='top', fontsize=9)
    if O: ax.text(-0.03 * dx, -0.03 * dy, '$O$', ha='right', va='top', fontsize=9)

def T(ax, x, y, s, **kw): ax.text(x, y, s, fontsize=kw.pop('fontsize', 8.5), **kw)
def L(ax, x, y, **kw): ax.plot(x, y, 'k', lw=kw.pop('lw', 1.1), **kw)

def compose(name, panels, ops=(), captions=(), result=None, max_w=15.2, gap=0.8):
    """panels: [(draw_fn, w_cm, h_cm)]; the FIRST panel keeps its own size when it can."""
    ws = [p[1] for p in panels]; hs = [p[2] for p in panels]
    total = sum(ws) + gap * (len(ws) - 1)
    if total > max_w and len(ws) > 1:                      # shrink the other panels, keep the original's size
        k = (max_w - ws[0] - gap * (len(ws) - 1)) / sum(ws[1:])
        ws = [ws[0]] + [w * k for w in ws[1:]]; hs = [hs[0]] + [h * k for h in hs[1:]]
        total = sum(ws) + gap * (len(ws) - 1)
    capH = 0.75 if captions else 0.1; resH = 0.6 if result else 0.0
    H = max(hs) + capH + resH
    fig = plt.figure(figsize=(total * CM, H * CM)); x0 = 0
    axs = []
    for (fn, _, _), w, h in zip(panels, ws, hs):
        ax = fig.add_axes([x0 / total, (resH + capH + (max(hs) - h) / 2) / H, w / total, h / H]); fn(ax); axs.append(ax); x0 += w + gap
    for i, s in enumerate(ops):
        a, b = axs[i].get_position(), axs[i + 1].get_position()
        fig.text((a.x1 + b.x0) / 2, (resH + capH + max(hs) / 2) / H, s, ha='center', va='center', fontsize=14)
    for ax, c in zip(axs, captions):
        p = ax.get_position(); fig.text((p.x0 + p.x1) / 2, (resH + capH - 0.15) / H, c, ha='center', va='top', fontsize=8.5)
    if result: fig.text(0.5, 0.05 / H, result, ha='center', va='bottom', fontsize=9)
    fig.savefig(OUT + name, dpi=220, facecolor='white', bbox_inches='tight', pad_inches=0.04); plt.close(fig)
    from PIL import Image as _I
    SIZES[name] = round(_I.open(OUT + name).size[0] / 220 * 2.54, 2)   # printed at 1:1

def solid(fn_draw, xlim, ylim, axis='x', label=None):
    def f(ax):
        fn_draw(ax); axis_line(ax, axis); bare(ax, xlim, ylim)
        if label:
            if axis == 'x': ax.text(xlim[1], 0.05 * (ylim[1] - ylim[0]), label, fontsize=8.5, ha='right', style='italic')
            else: ax.text(0.04 * (xlim[1] - xlim[0]), ylim[1], label, fontsize=8.5, va='top', style='italic')
    return f

# =============================================================== Example 1a (left)  4.75 x 3.91 cm
p6 = np.pi / 6; X = np.linspace(0, 1.72, 300); Xt = np.linspace(0, 0.93, 200); xs = np.linspace(0, p6, 120)
def r1a(fill):
    def f(ax):
        L(ax, X, np.cos(X)); L(ax, Xt, np.tan(Xt)); ax.plot([p6, p6], [0, np.tan(p6)], 'k--', lw=0.8)
        fill(ax); axes_xy(ax, (-0.4, 1.9), (-0.55, 1.42))
        T(ax, p6, -0.08, r'$\pi/6$', ha='center', va='top')
    return f
def t1a(ax):
    ax.fill_between(xs, np.tan(xs), np.cos(xs), **target()); L(ax, [p6, p6], [np.tan(p6), np.cos(p6)])
    T(ax, 0.2, 0.62, '$R$', fontsize=10); T(ax, 0.98, 1.2, r'$y=\tan x$'); T(ax, 1.15, 0.6, r'$y=\cos x$')
compose('ex1a_left.png', [(r1a(t1a), 4.75, 3.91), (r1a(lambda ax: ax.fill_between(xs, 0, np.cos(xs), **piece(0))), 4.75, 3.91),
                          (r1a(lambda ax: ax.fill_between(xs, 0, np.tan(xs), **piece(1))), 4.75, 3.91)],
        ['=', '−'], ['region R', r'$\int_0^{\pi/6}\cos x\,dx$', r'$\int_0^{\pi/6}\tan x\,dx$'],
        r'Area $R=\int_0^{\pi/6}(\cos x-\tan x)\,dx$   (top curve minus bottom curve)', gap=0.6)

# =============================================================== Example 1a (right)  4.48 x 3.71 cm
yy = np.linspace(-0.48, 0.48, 400); xc = 1 / np.sqrt(1 - 4 * yy ** 2); ys = np.linspace(0, 0.25, 100); xcs = 1 / np.sqrt(1 - 4 * ys ** 2)
def r1b(fill):
    def f(ax):
        L(ax, xc, yy); ax.plot([0.5, 0.5], [-0.62, 0.6], 'k', lw=1.0); ax.plot([0, 1 / np.sqrt(0.75)], [0.25, 0.25], 'k--', lw=0.8)
        fill(ax); axes_xy(ax, (-0.35, 2.2), (-0.62, 0.6)); T(ax, -0.06, 0.25, r'$\frac{1}{4}$', ha='right', va='center')
    return f
def t1b(ax):
    ax.fill_betweenx(ys, 0.5, xcs, **target()); T(ax, 0.66, 0.1, '$R$', fontsize=10)
    T(ax, 0.75, -0.3, r'$x=\frac{1}{2}$'); T(ax, 1.2, -0.55, r'$4y^2=1-\frac{1}{x^2}$')
compose('ex1a_right.png', [(r1b(t1b), 4.48, 3.71), (r1b(lambda ax: ax.fill_betweenx(ys, 0, xcs, **piece(0))), 4.48, 3.71),
                           (r1b(lambda ax: ax.fill_betweenx(ys, 0, 0.5, **piece(1))), 4.48, 3.71)],
        ['=', '−'], ['region R', r'$\int_0^{1/4}\frac{1}{\sqrt{1-4y^2}}\,dy$', r'$\int_0^{1/4}\frac{1}{2}\,dy$'],
        r'Area $R=\int_0^{1/4}(x_1-x_2)\,dy$   (right curve minus left line)', gap=0.6)

# =============================================================== Example 1b  7.54 x 5.19 cm
f1 = lambda x: 4 / (4 * x ** 2 + 1) - 1; r3 = np.sqrt(3) / 2; X = np.linspace(-2.55, 2.55, 500)
def r1bb(fill, labels=True):
    def f(ax):
        L(ax, X, f1(X)); ax.plot([-2.6, 2.6], [-1, -1], 'k--', lw=0.8)
        fill(ax); axes_xy(ax, (-2.65, 2.75), (-1.3, 3.25))
        for xv, s in [(-2, '$-2$'), (-r3, r'$-\frac{\sqrt{3}}{2}$'), (r3, r'$\frac{\sqrt{3}}{2}$'), (2, '$2$')]:
            T(ax, xv, 0.08, s, ha='center', va='bottom', fontsize=8 if labels else 6.5)
        if labels: T(ax, 0.08, 3.0, '3'); T(ax, 0.55, 1.55, r'$y=\frac{4}{4x^2+1}-1$'); T(ax, 2.0, -1.12, '$y=-1$', va='top')
    return f
def t1bb(ax):
    xs_ = np.linspace(-2, 2, 400); ax.fill_between(xs_, 0, f1(xs_), **target())
    for xv in (-2, 2): L(ax, [xv, xv], [0, f1(xv)], lw=0.9)
def a1(ax): xs_ = np.linspace(0, r3, 200); ax.fill_between(xs_, 0, f1(xs_), **piece(0))
def a2(ax): xs_ = np.linspace(r3, 2, 200); ax.fill_between(xs_, 0, f1(xs_), **piece(1)); L(ax, [2, 2], [0, f1(2)], lw=0.9)
compose('ex1b.png', [(r1bb(t1bb), 7.54, 5.19), (r1bb(a1, False), 7.54, 5.19), (r1bb(a2, False), 7.54, 5.19)],
        ['=', '+'], ['shaded region', r'$A_1=\int_0^{\sqrt{3}/2}y\,dx$', r'$A_2=-\int_{\sqrt{3}/2}^{2}y\,dx$'],
        r'Area $=2(A_1+A_2)$   (symmetrical about the $y$-axis; $A_2$ is below the $x$-axis, so take its negative)', gap=0.9)

# =============================================================== Example 1c  4.62 x 5.20 cm
a = np.sqrt(3) / 4
def r1c(ax):
    xe = np.linspace(-a, a, 400); ye = np.sqrt(np.maximum(3 - 16 * xe ** 2, 0)); L(ax, xe, ye, lw=1.4); L(ax, xe, -ye, lw=1.4)
    x = np.linspace(0, a, 300); ax.fill_between(x, 0, np.sqrt(np.maximum(3 - 16 * x ** 2, 0)), **target())
    s0 = 0.17; ax.fill_between([s0, s0 + 0.04], 0, np.sqrt(3 - 16 * (s0 + 0.02) ** 2), facecolor='white', hatch='////', edgecolor='k', lw=0.6)
    ax.annotate('one strip:\nheight $y$,\nwidth $dx$', (s0 + 0.03, 1.0), xytext=(0.5, 1.45), fontsize=8, arrowprops=dict(arrowstyle='->', lw=0.6))
    axes_xy(ax, (-0.72, 0.85), (-2.0, 2.15), O=False)
    T(ax, 0.03, 1.78, r'$\sqrt{3}$', fontsize=9); T(ax, 0.03, -1.95, r'$-\sqrt{3}$', fontsize=9)
    T(ax, a + 0.02, 0.12, r'$\frac{\sqrt{3}}{4}$', fontsize=9); T(ax, -a - 0.02, 0.12, r'$-\frac{\sqrt{3}}{4}$', ha='right', fontsize=9)
    T(ax, 0.05, 0.4, '$A$', fontsize=10)
compose('ex1c.png', [(r1c, 4.62, 5.20)], [], [r'$A=\int_0^{\sqrt{3}/4}y\,dx$: add up the strips'])

# =============================================================== Example 2a  4.79 x 3.79 cm
X = np.linspace(0, 1.75, 300); s2 = np.sqrt(2)
def r2a(fill):
    def f(ax):
        L(ax, X, X ** 2); ax.plot([-0.95, 1.75], [2, 2], 'k', lw=1.0); fill(ax)
        axes_xy(ax, (-0.95, 1.75), (-0.5, 2.85)); T(ax, -0.12, 1.85, '2', ha='right', va='top'); T(ax, 1.2, 1.85, '$y=2$', va='top'); T(ax, 0.3, 2.45, '$y=x^2$')
    return f
yb = np.linspace(0, 2, 150); xb = np.linspace(0, s2, 150)
def fa(ax): ax.fill_betweenx(yb, 0, np.sqrt(yb), **piece(0)); T(ax, 0.22, 1.2, '$R$', fontsize=10, bbox=dict(fc='white', ec='none', pad=0.4))
compose('ex2a_a.png', [(r2a(fa), 4.79, 3.79), (solid(lambda ax: solid_y(ax, yb, np.sqrt(yb), k=0), (-1.9, 1.9), (-0.3, 2.6), 'y', 'y'), 5.0, 3.79)],
        ['→'], ['region R', r'turned about the $y$-axis: radius $x=\sqrt{y}$'], r'(a)  $V=\pi\int_0^2 x^2\,dy=\pi\int_0^2 y\,dy$', gap=1.2)
def fb(ax):
    ax.fill_between(xb, xb ** 2, 2, **piece(0)); ax.plot([s2, s2], [0, 2], 'k:', lw=0.8); T(ax, s2, -0.12, r'$\sqrt{2}$', ha='center', va='top')
    T(ax, 0.22, 1.35, '$R$', fontsize=10, bbox=dict(fc='white', ec='none', pad=0.4))
def sb(ax):
    solid_x(ax, xb, 2 + 0 * xb, xb ** 2, k=0); ax.annotate('hole', (1.05, 0.5), xytext=(1.6, 1.7), fontsize=8, arrowprops=dict(arrowstyle='->', lw=0.6))
compose('ex2a_b.png', [(r2a(fb), 4.79, 3.79), (solid(sb, (-0.4, 2.0), (-2.4, 2.4), 'x', 'x'), 5.4, 3.79)],
        ['→'], ['region R', 'turned about the $x$-axis: a cylinder with a hole'], r'(b)  $V=\pi\int_0^{\sqrt{2}}\left(2^2-(x^2)^2\right)dx$   (outer radius 2, hole radius $x^2$)', gap=1.2)

# =============================================================== Example 2b  (solids only)
x = np.linspace(0, 1, 200); g = 2 * x / (1 + x ** 2); W = 4.6
compose('ex2b.png', [(solid(lambda ax: solid_x(ax, x, g, k=0), (-0.15, 1.3), (-1.2, 1.2), 'x', 'x'), W, 3.4),
                     (solid(lambda ax: solid_x(ax, x, x, k=1), (-0.15, 1.3), (-1.2, 1.2), 'x', 'x'), W, 3.4),
                     (solid(lambda ax: solid_x(ax, x, g, x, k=0), (-0.15, 1.3), (-1.2, 1.2), 'x', 'x'), W, 3.4)],
        ['−', '='], [r'from the curve: $\pi\int_0^1\left(\frac{2x}{1+x^2}\right)^2dx$', r'from the line (a cone): $\pi\int_0^1x^2dx$', 'solid formed by R (hollow inside)'],
        'Volume = (solid from the top curve) − (cone from the line)', gap=0.9)

# =============================================================== Example 2c  4.82 x 2.94 cm
y1 = np.linspace(0, 1, 200); x1 = np.cbrt(y1); y2 = np.linspace(1, 2, 200); x2 = 1 - np.sqrt(y2 - 1)
def r2c(fill):
    def f(ax):
        xx = np.linspace(0, 1.36, 300); L(ax, xx, xx ** 3); xq = np.linspace(0, 1.95, 300); L(ax, xq, 1 + (xq - 1) ** 2)
        fill(ax); axes_xy(ax, (-0.08, 2.5), (-0.12, 2.55), O=False); T(ax, -0.03, -0.04, '0', ha='right', va='top')
        T(ax, -0.03, 2.0, '2', ha='right', va='center'); T(ax, 0.42, 2.25, '$y=x^3$'); T(ax, 1.45, 1.38, '$y=1+(x-1)^2$', fontsize=8); T(ax, 0.93, 1.12, '$A$')
    return f
def fc(ax):
    ax.fill_betweenx(y1, 0, x1, **piece(0)); ax.fill_betweenx(y2, 0, x2, **piece(1)); ax.plot([0, 1], [1, 1], 'k--', lw=0.8)
    T(ax, 0.28, 0.5, '$V_1$', bbox=dict(fc='white', ec='none', pad=0.3)); T(ax, 0.1, 1.28, '$V_2$', bbox=dict(fc='white', ec='none', pad=0.3))
def d2c(ax): ax._span_y, ax._rmax = 2.0, 1.0; solid_y(ax, y1, x1, k=0); solid_y(ax, y2, x2, k=1)
compose('ex2c_a.png', [(r2c(fc), 4.82, 2.94), (solid(d2c, (-1.5, 1.5), (-0.2, 2.35), 'y', 'y'), 4.2, 2.94)],
        ['→'], ['split R at $y=1$', 'turned about the $y$-axis'], r'(a)  $V=V_1+V_2=\pi\int_0^1(\sqrt[3]{y})^2dy+\pi\int_1^2(1-\sqrt{y-1})^2dy$', gap=1.2)
X1 = np.linspace(0, 1, 200)
def fcb(ax): ax.fill_between(X1, X1 ** 3, 1 + (X1 - 1) ** 2, **piece(0)); T(ax, 0.22, 0.85, '$R$', fontsize=10, bbox=dict(fc='white', ec='none', pad=0.3))
compose('ex2c_b.png', [(r2c(fcb), 4.82, 2.94), (solid(lambda ax: solid_x(ax, X1, 1 + (X1 - 1) ** 2, X1 ** 3, k=0), (-0.3, 1.4), (-2.2, 2.2), 'x', 'x'), 4.6, 2.94)],
        ['→'], ['region R', r'turned about the $x$-axis (hole from $y=x^3$)'], r'(b)  $V=\pi\int_0^1\left[(1+(x-1)^2)^2-(x^3)^2\right]dx$', gap=1.2)

# =============================================================== Example 2d  5.43 x 5.17 cm
yy = np.linspace(-3, 4, 200); xo = 4 + np.sqrt(yy + 4); xi = 4 - np.sqrt(yy + 4)
def r2d(ax):
    xx = np.linspace(0.3, 7.6, 400); L(ax, xx, (xx - 4) ** 2 - 4, lw=1.0)
    for yv in (4, -3): ax.plot([-0.3, 8.0], [yv, yv], 'k--', lw=0.7)
    ax.fill_betweenx(yy, xi, xo, **piece(0)); T(ax, 4, 1.4, '$R$', ha='center', fontsize=10, bbox=dict(fc='white', ec='none', pad=0.4))
    axes_xy(ax, (-0.8, 8.4), (-4.8, 9.5))
    for xv in (2, 4, 6): T(ax, xv, -0.2, str(xv), ha='center', va='top', fontsize=7.5)
    T(ax, 7.4, 8.0, '$C$'); T(ax, -0.15, 4.0, '4', ha='right', va='center', fontsize=7.5); T(ax, -0.15, -3.0, '$-3$', ha='right', va='center', fontsize=7.5)
compose('ex2d.png', [(r2d, 5.43, 5.17), (solid(lambda ax: solid_y(ax, yy, xo, xi, k=0), (-7.5, 7.5), (-4.0, 5.5), 'y', 'y'), 5.6, 5.17)],
        ['→'], ['region R', 'turned about the $y$-axis: a ring (hole radius $x_2$)'],
        r'$V=\pi\int_{-3}^{4}\left(x_1^2-x_2^2\right)dy$,  $x_1=4+\sqrt{y+4}$,  $x_2=4-\sqrt{y+4}$', gap=1.2)

# =============================================================== Example 2e  7.88 x 4.50 cm
xa = np.linspace(0.0, 1, 150); xb = np.linspace(1, 4, 200)
def r2e(ax):
    xx = np.linspace(0, 5.0, 400); L(ax, xx, 2 + np.sqrt(xx)); L(ax, xx, 2 - np.sqrt(xx))
    xh = np.linspace(0.2, 5.0, 300); L(ax, xh, 2 + 1 / xh); xn = np.linspace(-2.6, -0.24, 300); L(ax, xn, 2 + 1 / xn)
    ax.plot([-2.6, 5.0], [2, 2], 'k--', lw=0.8); ax.plot([4, 4], [-1.3, 4.6], 'k', lw=1.0)
    ax.fill_between(xa, 2 - np.sqrt(xa), 2 + np.sqrt(xa), **piece(0)); ax.fill_between(xb, 2 - np.sqrt(xb), 2 + 1 / xb, **piece(1))
    ax.plot([1, 1], [1, 3], 'k--', lw=0.7)
    T(ax, 0.3, 1.85, '$V_1$', bbox=dict(fc='white', ec='none', pad=0.3)); T(ax, 2.2, 1.55, '$V_2$', bbox=dict(fc='white', ec='none', pad=0.3))
    axes_xy(ax, (-2.8, 6.4), (-1.4, 4.7), O=False)
    T(ax, 0.9, 3.15, '(1, 3)'); T(ax, 4.6, 4.2, '$x=(y-2)^2$'); T(ax, 5.15, 1.75, '$y=2$'); T(ax, 4, -1.35, '$x=4$', ha='center', va='top')
    T(ax, -2.75, 1.0, r'$y=2+\frac{1}{x}$')
compose('ex2e.png', [(r2e, 7.88, 4.50), (solid(lambda ax: (setattr(ax, '_span_x', 4.0), setattr(ax, '_rmax', 3.0), solid_x(ax, xa, 2 + np.sqrt(xa), 2 - np.sqrt(xa), k=0), solid_x(ax, xb, 2 + 1 / xb, 2 - np.sqrt(xb), k=1)), (-0.6, 4.8), (-3.3, 3.3), 'x', 'x'), 6.0, 4.5)],
        ['→'], ['split R at $x=1$', 'turned about the $x$-axis (white = hole)'],
        r'$V=\pi\int_0^1\left[(2+\sqrt{x})^2-(2-\sqrt{x})^2\right]dx+\pi\int_1^4\left[\left(2+\frac{1}{x}\right)^2-(2-\sqrt{x})^2\right]dx$', gap=1.2)

# =============================================================== Example 2f  4.86 x 3.80 cm
def r2f(ax):
    xl = np.linspace(-4.6, -1.22, 300); L(ax, xl, xl / (xl + 1)); xm = np.linspace(-4.6, 0.4, 50); ax.plot(xm, -xm, 'k--', lw=0.8)
    ax.plot([-1, -1], [-0.5, 5.0], 'k--', lw=0.7); ax.plot([-4.8, 0.6], [1, 1], 'k--', lw=0.7); ax.plot([-4, -4], [-0.5, 4.6], 'k--', lw=0.7)
    xs_ = np.linspace(-4, -2, 100); ax.fill_between(xs_, xs_ / (xs_ + 1), -xs_, **target()); T(ax, -3.55, 2.2, '$R$', fontsize=10)
    axes_xy(ax, (-4.9, 1.0), (-0.6, 5.0), O=False)
    T(ax, -4, -0.12, '$-4$', ha='center', va='top'); T(ax, -1, -0.12, '$-1$', ha='center', va='top'); T(ax, 0.06, 1.05, '1')
ys1 = np.linspace(4 / 3, 2, 100); ys2 = np.linspace(2, 4, 100)
def r2f2(ax):
    yc = np.linspace(1.1, 4.4, 300); L(ax, (3 * yc - 4) / (yc - 1), yc); ym = np.linspace(0, 4.4, 50); ax.plot(4 - ym, ym, 'k--', lw=0.8)
    ax.fill_betweenx(ys1, 0, (3 * ys1 - 4) / (ys1 - 1), **piece(0)); ax.fill_betweenx(ys2, 0, 4 - ys2, **piece(1)); ax.plot([0, 2], [2, 2], 'k--', lw=0.7)
    axes_xy(ax, (-0.9, 5.0), (-0.6, 5.0))
    T(ax, -0.12, 4 / 3, r'$\frac{4}{3}$', ha='right', va='center'); T(ax, -0.12, 2, '2', ha='right', va='center'); T(ax, -0.12, 4, '4', ha='right', va='center')
    T(ax, 2.3, 3.1, r'$x=\frac{3y-4}{y-1}$', fontsize=8); T(ax, 2.6, 0.9, '$x=4-y$', fontsize=8)
def d2f(ax): ax._span_y, ax._rmax = 2.67, 2.0; solid_y(ax, ys1, (3 * ys1 - 4) / (ys1 - 1), k=0); solid_y(ax, ys2, 4 - ys2, k=1)
compose('ex2f.png', [(r2f, 4.86, 3.80), (r2f2, 4.86, 3.80), (solid(d2f, (-2.6, 2.6), (0.8, 4.6), 'y', 'y'), 4.0, 3.80)],
        ['→', '→'], [r'rotate about $x=-4$', 'shifted 4 units right', 'turned about the $y$-axis'],
        r'$V=V_1+V_2=\pi\int_{4/3}^{2}\left(\frac{3y-4}{y-1}\right)^2dy+\pi\int_2^4(4-y)^2dy$', gap=0.9)

# =============================================================== Example 2g  (solids only)
x = np.linspace(0.25, 0.5, 200); hx = (x / (1 - x)) ** 0.25; lx = 4 * x - 1
compose('ex2g.png', [(solid(lambda ax: solid_x(ax, x, hx, k=0), (0.18, 0.6), (-1.2, 1.2), 'x', 'x'), 4.6, 3.4),
                     (solid(lambda ax: solid_x(ax, x, lx, k=1), (0.18, 0.6), (-1.2, 1.2), 'x', 'x'), 4.6, 3.4),
                     (solid(lambda ax: solid_x(ax, x, hx, lx, k=0), (0.18, 0.6), (-1.2, 1.2), 'x', 'x'), 4.6, 3.4)],
        ['−', '='], [r'from the curve: $\pi\int_{1/4}^{1/2}\left(\frac{x}{1-x}\right)^{1/2}dx$', r'from the line (a cone): $\pi\int_{1/4}^{1/2}(4x-1)^2dx$', 'solid formed by R'],
        'Volume = (solid from the top curve) − (cone from the line)', gap=0.9)

import json; json.dump(SIZES, open('/tmp/av2/fig/sizes.json', 'w')); print(SIZES)
