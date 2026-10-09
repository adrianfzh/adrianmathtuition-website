"""Deterministic figure rendering for generated worksheet questions.

The CONTRACT (see SKILL.md → Figures): the model never freehands a picture. It
writes a small parameter dict — the same numbers the question text and answer
are computed from — and this module draws it. A figure can then never disagree
with its mark scheme, and a better future model inherits the same renderers.

Genres (v1): graph, normal, histogram, boxplot, cumulative, points (labelled
plane geometry); area_decomposition (10 Sep 2026: the region asked for = its
pieces, side by side, for an area solution). A question that needs anything else is written WITHOUT a
figure or not at all — never with a described-but-missing diagram.

All output is exam-style black-and-white line art on white, serif labels,
sized for a ~10 cm print slot at 200 dpi.
"""

from __future__ import annotations

import math

import matplotlib
matplotlib.use("Agg")
import matplotlib.patches
import matplotlib.pyplot as plt
import numpy as np

DPI = 200
DEFAULT_W_IN = 4.4          # ~11 cm print width
plt.rcParams.update({
    "font.family": "serif",
    "font.size": 11,
    "mathtext.fontset": "dejavuserif",
    "axes.linewidth": 1.0,
})

_SAFE = {
    "sin": np.sin, "cos": np.cos, "tan": np.tan, "asin": np.arcsin,
    "acos": np.arccos, "atan": np.arctan, "exp": np.exp, "ln": np.log,
    "log": np.log, "log10": np.log10, "sqrt": np.sqrt, "abs": np.abs,
    "pi": np.pi, "e": np.e,
    # max/min (10 Sep 2026): the lower edge of a region asked for is often "the
    # line where it is above the axis, else the axis" — max(3*x-8, 0).
    "max": np.maximum, "min": np.minimum,
}


def _f(expr: str):
    """Compile a y-of-x expression against the whitelisted namespace only."""
    code = compile(expr, "<figure expr>", "eval")
    for name in code.co_names:
        if name not in _SAFE and name != "x":
            raise ValueError("expression uses %r — not in the safe namespace" % name)
    return lambda x: eval(code, {"__builtins__": {}}, {**_SAFE, "x": x})


# ── point labels that no stroke crosses (Adrian, 7 Sep 2026: "diagram generation
# for A and B, they are not block by the lines") ──────────────────────────────
# A point on a curve, a line or a circle gets its label at the FIRST of eight
# offsets whose text box no drawn stroke passes through; ties keep the earlier
# candidate (north-east first, the textbook habit). Strokes = every Line2D and
# circle patch on the axes plus the two axis lines, sampled densely, all in
# display pixels after the limits are final — so place labels LAST.
_LABEL_OFFSETS = [(6, 5), (-6, 5), (6, -9), (-6, -9), (0, 8), (0, -11), (9, 0), (-9, 0)]


def _stroke_samples(ax):
    pts = []
    for ln in ax.lines:
        xy = np.asarray(ln.get_xydata(), dtype=float)
        if not len(xy) or ln.get_transform() is not ax.transData:
            continue
        ok = np.isfinite(xy).all(axis=1)
        xy = xy[ok]
        if len(xy) >= 2 and len(xy) < 50:          # a segment: densify it
            dense = [np.linspace(xy[i], xy[i + 1], 60) for i in range(len(xy) - 1)]
            xy = np.vstack(dense)
        if len(xy):
            pts.append(ax.transData.transform(xy))
    for pa in ax.patches:
        if isinstance(pa, plt.Circle):
            c, r = np.asarray(pa.center, dtype=float), float(pa.radius)
            th = np.linspace(0, 2 * math.pi, 240)
            pts.append(ax.transData.transform(np.c_[c[0] + r * np.cos(th), c[1] + r * np.sin(th)]))
    x0, x1 = ax.get_xlim(); y0, y1 = ax.get_ylim()
    if x0 <= 0 <= x1 and ax.spines["left"].get_visible():
        pts.append(ax.transData.transform(np.c_[np.zeros(200), np.linspace(y0, y1, 200)]))
    if y0 <= 0 <= y1 and ax.spines["bottom"].get_visible():
        pts.append(ax.transData.transform(np.c_[np.linspace(x0, x1, 200), np.zeros(200)]))
    return np.vstack(pts) if pts else np.zeros((0, 2))


def _place_label(ax, fig, text, xy, first=None, **kw):
    """Annotate `xy` with `text` at the first offset (in points) no stroke crosses."""
    renderer = fig.canvas.get_renderer()
    strokes = _stroke_samples(ax)
    cands = ([tuple(first)] if first is not None else []) + _LABEL_OFFSETS
    best, best_hits = None, None
    for dx, dy in cands:
        ha = "left" if dx > 0 else "right" if dx < 0 else "center"
        va = "bottom" if dy > 0 else "top" if dy < 0 else "center"
        ann = ax.annotate(text, xy, xytext=(dx, dy), textcoords="offset points", ha=ha, va=va, **kw)
        bb = ann.get_window_extent(renderer=renderer).expanded(1.15, 1.25)
        hits = 0
        if len(strokes):
            inside = (strokes[:, 0] >= bb.x0) & (strokes[:, 0] <= bb.x1) & (strokes[:, 1] >= bb.y0) & (strokes[:, 1] <= bb.y1)
            hits = int(inside.sum())
        if best is None or hits < best_hits:
            if best is not None:
                best.remove()
            best, best_hits = ann, hits
        else:
            ann.remove()
        if best_hits == 0:
            break
    return best


def _axes_through_origin(ax, xlim, ylim, names=("x", "y")):
    """School-style axes: spines through 0 with arrowheads, ticks kept light."""
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    # Each axis stands at 0 when the window holds it, else at the window's edge —
    # and its arrowhead + name go where the spine IS (10 Sep 2026: a graph whose
    # x-window started at 1.3 drew the y-arrow at data-x = 0, off the picture).
    x_axis_at = 0 if xlim[0] <= 0 <= xlim[1] else xlim[0]
    y_axis_at = 0 if ylim[0] <= 0 <= ylim[1] else ylim[0]
    if x_axis_at == 0:
        ax.spines["left"].set_position("zero")
    if y_axis_at == 0:
        ax.spines["bottom"].set_position("zero")
    ax.plot(1, y_axis_at, ">k", transform=ax.get_yaxis_transform(), clip_on=False, markersize=5)
    ax.plot(x_axis_at, 1, "^k", transform=ax.get_xaxis_transform(), clip_on=False, markersize=5)
    ax.annotate(names[0], xy=(1, y_axis_at), xycoords=ax.get_yaxis_transform(),
                xytext=(8, -4), textcoords="offset points", style="italic")
    ax.annotate(names[1], xy=(x_axis_at, 1), xycoords=ax.get_xaxis_transform(),
                xytext=(6, 4), textcoords="offset points", style="italic")


def _fig(width_in=None, height_in=None):
    width_in = width_in or DEFAULT_W_IN
    return plt.subplots(figsize=(width_in, height_in or width_in * 0.72))


def _finish(fig, out_path: str) -> str:
    fig.savefig(out_path, dpi=DPI, bbox_inches="tight", pad_inches=0.06, facecolor="white")
    plt.close(fig)
    # Cut the border to the ink (Adrian, 9 Sep 2026: "need not have so much
    # white space as its borders"). worksheet_lib trims again at embed time, so
    # a figure_lib PNG used anywhere else is tight too.
    try:
        from worksheet_lib import trim_to_ink
        trim_to_ink(out_path)
    except Exception:
        pass
    return out_path


# ---------------------------------------------------------------- graph ----

def _shade(ax, shade, color="0.82"):
    """Fill one region {from, to, expr, to_expr?} — or a list of them."""
    if not shade:
        return
    for sh in (shade if isinstance(shade, list) else [shade]):
        x = np.linspace(sh["from"], sh["to"], 300)
        with np.errstate(all="ignore"):
            y = np.asarray(_f(sh["expr"])(x), dtype=float)
            base = np.asarray(_f(sh["to_expr"])(x), dtype=float) if sh.get("to_expr") else 0
        ax.fill_between(x, y, base, color=sh.get("color", color), zorder=0)


def _draw_graph(ax, fig, spec, shade=None, fontsize=10):
    """Draw a `graph` spec onto `ax` (curves, one shaded region, points, dashed
    lines, school axes, ticks, collision-free point labels). Returns the
    (xlim, ylim) it settled on, so sibling panels can share them."""
    xs_all, ys_all = [], []
    for c in spec.get("curves", []):
        lo, hi = c.get("domain", spec.get("domain", [-4, 4]))
        x = np.linspace(lo, hi, 600)
        with np.errstate(all="ignore"):
            y = np.asarray(_f(c["expr"])(x), dtype=float)
        y[~np.isfinite(y)] = np.nan
        clip = c.get("clip_y") or spec.get("clip_y")
        if clip:
            y[(y < clip[0]) | (y > clip[1])] = np.nan
        ax.plot(x, y, "k", lw=1.4)
        if c.get("label"):
            ii = np.where(np.isfinite(y))[0]
            if len(ii):
                at = ii[min(len(ii) - 1, int(len(ii) * float(c.get("label_at", 0.93))))]
                left = c.get("label_side") == "left"      # above-left of the curve instead
                ax.annotate(c["label"], (x[at], y[at]), xytext=(-6 if left else 6, 5),
                            textcoords="offset points", ha="right" if left else "left",
                            fontsize=fontsize)
        xs_all.append(x)
        ys_all.append(y)
    _shade(ax, shade)
    pending = []
    for p in spec.get("points", []):
        ax.plot(p["x"], p["y"], "ko", markersize=4)
        if p.get("label"):
            pending.append((p["label"], (p["x"], p["y"])))
    for v in spec.get("vlines", []):
        ax.axvline(v["x"] if isinstance(v, dict) else v, color="k", lw=0.9, linestyle="--")
    for h in spec.get("hlines", []):
        yv = h["y"] if isinstance(h, dict) else h
        ax.axhline(yv, color="k", lw=0.9, linestyle="--")
        if isinstance(h, dict) and h.get("label"):  # e.g. an asymptote's "v = 30"
            ax.annotate(h["label"], xy=(1, yv), xycoords=ax.get_yaxis_transform(),
                        xytext=(-4, 5), textcoords="offset points", ha="right", fontsize=fontsize)

    if spec.get("xlim"):
        xlim = spec["xlim"]
    else:
        xmin = min(float(np.nanmin(x)) for x in xs_all) if xs_all else -4
        xmax = max(float(np.nanmax(x)) for x in xs_all) if xs_all else 4
        pad = 0.08 * (xmax - xmin)
        xlim = (xmin - pad, xmax + pad)
    if spec.get("ylim"):
        ylim = spec["ylim"]
    else:
        ymin = min(float(np.nanmin(y)) for y in ys_all if np.isfinite(y).any()) if ys_all else -4
        ymax = max(float(np.nanmax(y)) for y in ys_all if np.isfinite(y).any()) if ys_all else 4
        pad = 0.10 * (ymax - ymin or 1)
        ylim = (min(ymin - pad, 0), max(ymax + pad, 0))
    _axes_through_origin(ax, xlim, ylim, tuple(spec.get("axis_names", ("x", "y"))))
    if not spec.get("ticks", False):
        ax.set_xticks(spec.get("xticks", []))
        ax.set_yticks(spec.get("yticks", []))
        # optional display labels, paired with xticks/yticks — lets a tick sit
        # at 5/3 but read "5/3" instead of 1.667 (mathtext like $\frac{5}{3}$ ok)
        if spec.get("xtick_labels"):
            ax.set_xticklabels(spec["xtick_labels"])
        if spec.get("ytick_labels"):
            ax.set_yticklabels(spec["ytick_labels"])
    ax.tick_params(labelsize=fontsize)
    for text, xy in pending:            # limits are final now — labels go off the strokes
        _place_label(ax, fig, text, xy, fontsize=fontsize, style="italic")
    return xlim, ylim


def _render_graph(spec, out_path):
    fig, ax = _fig()
    _draw_graph(ax, fig, spec, shade=spec.get("shade"))
    return _finish(fig, out_path)


# --------------------------------------------- area decomposition ----
# Adrian, 10 Sep 2026, on Isabelle's Practice Again sheet (area between a cubic,
# its tangent and the x-axis): "would be good if a diagram can be drawn to show
# the areas required." The question figure shows WHAT is asked; this one shows
# HOW it is made — the region asked for, "=", then each piece the working
# integrates or measures, "−"/"+" between them, its expression under each.
# Same curves, points and limits in every panel; only the shading changes.

_OPS = {"+": "+", "-": "\u2212", "\u2212": "\u2212"}


def _render_area_decomposition(spec, out_path):
    pieces = spec.get("pieces") or []
    if not pieces:
        raise ValueError("area_decomposition needs at least one piece")
    target = spec.get("target") or {}
    if not target.get("shade"):
        raise ValueError("area_decomposition needs target.shade — the region asked for")
    for pc in pieces:
        if not pc.get("shade"):
            raise ValueError("every piece needs a shade")
    panels = [target] + list(pieces)
    n = len(panels)
    fs = float(spec.get("fontsize", 9.5))
    width_in = float(spec.get("width_in", 6.4))
    panel_w = width_in / n
    height_in = float(spec.get("height_in", panel_w * 0.95 + 0.45))
    fig, axes = plt.subplots(1, n, figsize=(width_in, height_in))
    axes = np.atleast_1d(axes)
    fig.subplots_adjust(left=0.03, right=0.97, top=0.96, bottom=0.26,
                        wspace=float(spec.get("wspace", 0.42)))

    base = {k: v for k, v in spec.items()
            if k not in ("kind", "target", "pieces", "result", "shade", "curve_labels")}
    xlim = ylim = None
    captions = []
    for i, (ax, panel) in enumerate(zip(axes, panels)):
        sub = dict(base)
        if xlim is not None:                 # every panel is the same picture
            sub["xlim"], sub["ylim"] = xlim, ylim
        if i and spec.get("curve_labels", "first") != "all":   # name the curves once
            sub["curves"] = [{k: v for k, v in c.items() if k != "label"} for c in sub.get("curves", [])]
        xlim, ylim = _draw_graph(ax, fig, sub, shade=panel["shade"], fontsize=fs)
        cap = panel.get("caption")
        if cap:
            captions.append(ax.text(0.5, -0.1, cap, transform=ax.transAxes, ha="center",
                                    va="top", fontsize=fs + 1))

    # "=" after the target, then each piece's own sign (default "+")
    fig.canvas.draw()
    for i in range(n - 1):
        a, b = axes[i].get_position(), axes[i + 1].get_position()
        op = "=" if i == 0 else _OPS.get(str(panels[i + 1].get("op", "+")), "+")
        fig.text((a.x1 + b.x0) / 2, a.y0 + a.height / 2, op, ha="center", va="center",
                 fontsize=fs + 5)
    result = spec.get("result")
    if result:                              # one line under the whole row, clear of every caption
        renderer = fig.canvas.get_renderer()
        inv = fig.transFigure.inverted()
        lows = [inv.transform((0, t.get_window_extent(renderer=renderer).y0))[1] for t in captions]
        lows.append(min(ax.get_position().y0 for ax in axes))
        fig.text(0.5, min(lows) - 0.06, result, ha="center", va="top", fontsize=fs + 1.5)
    return _finish(fig, out_path)


# --------------------------------------------------------------- normal ----

def _render_normal(spec, out_path):
    mu, sigma = float(spec["mu"]), float(spec["sigma"])
    fig, ax = _fig(height_in=DEFAULT_W_IN * 0.55)
    x = np.linspace(mu - 4 * sigma, mu + 4 * sigma, 500)
    y = np.exp(-((x - mu) ** 2) / (2 * sigma ** 2))
    ax.plot(x, y, "k", lw=1.4)
    shade = spec.get("shade")
    if shade:
        lo = mu - 4 * sigma if shade[0] is None else float(shade[0])
        hi = mu + 4 * sigma if shade[1] is None else float(shade[1])
        m = (x >= lo) & (x <= hi)
        ax.fill_between(x[m], y[m], color="0.82")
        for b in (shade[0], shade[1]):
            if b is not None:
                ax.axvline(float(b), color="k", lw=0.9, linestyle="--")
    ticks = spec.get("xticks", [mu])
    ax.set_xticks(ticks)
    ax.set_xticklabels([("%g" % t) for t in ticks])
    ax.set_yticks([])
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    if spec.get("xlabel"):
        ax.set_xlabel(spec["xlabel"], style="italic")
    return _finish(fig, out_path)


# ---------------------------------------------------- histogram / boxplot ----

def _render_histogram(spec, out_path):
    fig, ax = _fig()
    density = bool(spec.get("density"))
    for lo, hi, freq in spec["bins"]:
        h = freq / (hi - lo) if density else freq
        ax.bar(lo, h, width=hi - lo, align="edge",
               facecolor="0.88", edgecolor="black", linewidth=1.0)
    ax.set_xlabel(spec.get("xlabel", ""), style="italic")
    ax.set_ylabel(spec.get("ylabel", "Frequency density" if density else "Frequency"))
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.margins(x=0.02)
    return _finish(fig, out_path)


def _render_boxplot(spec, out_path):
    fig, ax = _fig(height_in=DEFAULT_W_IN * 0.35)
    stats = [{
        "whislo": spec["min"], "q1": spec["q1"], "med": spec["median"],
        "q3": spec["q3"], "whishi": spec["max"], "fliers": [],
    }]
    ax.bxp(stats, orientation="horizontal", showfliers=False,
           boxprops={"color": "black"}, medianprops={"color": "black"},
           whiskerprops={"color": "black"}, capprops={"color": "black"})
    ax.set_yticks([])
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    if spec.get("xlabel"):
        ax.set_xlabel(spec["xlabel"], style="italic")
    if spec.get("xticks"):
        ax.set_xticks(spec["xticks"])
    return _finish(fig, out_path)


def _render_cumulative(spec, out_path):
    fig, ax = _fig()
    pts = sorted((float(a), float(b)) for a, b in spec["points"])
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    ax.plot(xs, ys, "k", lw=1.4)
    ax.plot(xs, ys, "k+", markersize=6)
    ax.set_xlabel(spec.get("xlabel", ""), style="italic")
    ax.set_ylabel(spec.get("ylabel", "Cumulative frequency"))
    ax.set_ylim(0, max(ys) * 1.06)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.grid(spec.get("grid", True), color="0.85", lw=0.6)
    return _finish(fig, out_path)


# --------------------------------------------------------------- points ----

def _render_points(spec, out_path):
    """Labelled plane geometry from coordinates: segments, circles, arcs,
    right-angle marks. No axes unless asked — a geometry figure is not a graph.

    spec["width_in"] widens the canvas. Labels are drawn at a fixed point size, so
    a long, shallow figure (a roof truss, a road) needs a wider canvas or the text
    is huge relative to the geometry and will not fit inside narrow wedges."""
    fig, ax = _fig(spec.get("width_in"))
    P = {k: np.array(v, dtype=float) for k, v in spec.get("points", {}).items()}

    for seg in spec.get("segments", []):
        a, b = P[seg[0]], P[seg[1]]
        style = "--" if (len(seg) > 2 and seg[2] == "dashed") else "-"
        ax.plot([a[0], b[0]], [a[1], b[1]], "k" + style, lw=1.3)
    for c in spec.get("circles", []):
        centre = np.array(c["center"], dtype=float)
        circ = plt.Circle(centre, float(c["r"]), fill=False, color="black", lw=1.3)
        ax.add_patch(circ)
        if c.get("label"):
            ax.plot(*centre, "ko", markersize=2.5)
            ax.annotate(c["label"], centre, xytext=(4, 4),
                        textcoords="offset points", style="italic")
    # Right-angle mark at B for corner A-B-C
    for a_, b_, c_ in spec.get("right_angles", []):
        A, B, C = P[a_], P[b_], P[c_]
        u = (A - B) / np.linalg.norm(A - B)
        v = (C - B) / np.linalg.norm(C - B)
        s = float(spec.get("mark_size", 0.28))
        p1, p2, p3 = B + u * s, B + (u + v) * s, B + v * s
        ax.plot([p1[0], p2[0], p3[0]], [p1[1], p2[1], p3[1]], "k", lw=1.0)
    for arc in spec.get("angle_arcs", []):
        A, B, C = P[arc["from"]], P[arc["at"]], P[arc["to"]]
        r = float(arc.get("r", 0.45))
        a0 = math.degrees(math.atan2(*(A - B)[::-1]))
        a1 = math.degrees(math.atan2(*(C - B)[::-1]))
        while a1 < a0:
            a1 += 360
        if a1 - a0 > 180:            # always the interior angle
            a0, a1 = a1, a0 + 360
        th = np.radians(np.linspace(a0, a1, 60))
        ax.plot(B[0] + r * np.cos(th), B[1] + r * np.sin(th), "k", lw=1.0)
        if arc.get("label"):
            mid = math.radians((a0 + a1) / 2)
            lp = B + (r + 0.28) * np.array([math.cos(mid), math.sin(mid)])
            ax.annotate(arc["label"], lp, ha="center", va="center", fontsize=10, style="italic")

    pending = []
    if P:
        centroid = sum(P.values()) / len(P)
        for name, pt in P.items():
            if spec.get("hide_points") and name in spec["hide_points"]:
                continue
            ax.plot(*pt, "ko", markersize=3)
            d = pt - centroid
            n = np.linalg.norm(d)
            off = (d / n * 12) if n > 1e-9 else np.array([8, 8])
            pending.append((name, pt, (float(off[0]), float(off[1]))))
    for lab in spec.get("labels", []):
        kw = {}
        if lab.get("halo"):
            # White box behind the text: a dimension label that has to sit on or
            # near a line stays readable instead of being crossed out by it.
            kw["bbox"] = dict(boxstyle="square,pad=0.12", facecolor="white",
                              edgecolor="none")
        ax.annotate(lab["text"], tuple(lab["at"]), ha="center", va="center",
                    fontsize=lab.get("size", 10), **kw)

    ax.set_aspect("equal")
    ax.autoscale()
    ax.margins(0.14)
    if spec.get("axes"):
        _axes_through_origin(ax, ax.get_xlim(), ax.get_ylim())
        ax.set_xticks([])
        ax.set_yticks([])
    else:
        ax.set_axis_off()
    for name, pt, off in pending:       # axes decided, limits final — now off the strokes
        _place_label(ax, fig, name, tuple(pt), first=off, style="italic", fontsize=11)
    return _finish(fig, out_path)


# ---------------------------------------------------------------- public ----

# ---------------------------------------------------- binomial pairing ----
# Adrian, 9 Sep 2026 (Alessi's AM 2021 P2, Q6 "no term in 1/x"): "explanation is
# okay, but can also use arrows to show the expansion → more visual. Both
# explanations will be good because students tend to have a hard time knowing
# how to obtain the coefficients." Two brackets side by side; a coloured arrow
# from each term of the first bracket to the partner it pairs with in the
# second; the product written under the partner in the same colour.

PAIR_COLOURS = ["#0432FF", "#EE0000", "#00B050", "#7030A0"]


def _render_binomial_pairing(spec, out_path):
    left = list(spec["left"])            # mathtext terms of the first bracket, e.g. ["2x^{2}", "1"]
    right = list(spec["right"])          # terms of the expansion, e.g. ["64", "-576x^{-1}", ...]
    # right_more / left_more: True when the bracket shows only the FIRST terms
    # of a longer expansion — "+ ⋯" is drawn after the last one (11 Sep 2026)
    pairs = list(spec["pairs"])          # [{"l": 0, "r": 3, "product": "2x^{2}\\times(-4320x^{-3}) = -8640x^{-1}"}, ...]
    result = spec.get("result")          # optional last line, e.g. "\\text{coefficient of } x^{-1} = -8640 + (-576) = -9216"
    target = spec.get("target")          # optional caption, e.g. "the terms that give x⁻¹"
    if not left or not right or not pairs:
        raise ValueError("binomial_pairing needs left[], right[] and pairs[]")
    for pr in pairs:
        if not (0 <= pr["l"] < len(left) and 0 <= pr["r"] < len(right)):
            raise ValueError("binomial_pairing: pair index out of range: %r" % (pr,))

    fs = 13
    width_in = float(spec.get("width_in") or 6.2)
    # vertical budget, in inches from the top
    y_caption = 0.22 if target else 0.0
    y_arrows = y_caption + 0.55                     # arc apex sits above the bracket line
    y_line = y_arrows + 0.42                        # baseline of the brackets
    y_first_product = y_line + 0.62
    row = 0.36
    y_result = y_first_product + row * len(pairs) + (0.12 if result else 0)
    height_in = y_result + (0.32 if result else 0.08)
    fig = plt.figure(figsize=(width_in, height_in))
    fig.patch.set_facecolor("white")
    renderer = fig.canvas.get_renderer()
    W = width_in * fig.dpi

    def fy(inches_from_top):
        return 1.0 - inches_from_top / height_in

    def put(x, y_in, s, **kw):
        t = fig.text(x, fy(y_in), s, fontsize=kw.pop("fontsize", fs), ha="left", va="baseline", **kw)
        bb = t.get_window_extent(renderer)
        return t, bb.width / W

    def split_sign(term, first):
        term = term.strip()
        neg = term.startswith("-") or term.startswith("\u2212")
        body = term[1:].strip() if neg else term
        return ("-" if neg else ("" if first else "+")), body

    x = 0.03
    gap = 0.012
    left_pos, right_pos = [], []

    def bracket(terms, positions, more=False):
        nonlocal x
        _, w = put(x, y_line, "("); x += w + gap * 0.5
        for i, term in enumerate(terms):
            sep, body = split_sign(term, i == 0)
            if sep:
                _, w = put(x, y_line, r"$%s$" % sep); x += w + gap
            _, w = put(x, y_line, r"$%s$" % body)
            positions.append((x, x + w))
            x += w + gap
        if more:
            # The expansion shown is only its first few terms (Adrian, 11 Sep
            # 2026: "there should be ... after −720/x³ to indicate there are
            # more terms") — say so inside the bracket, after the last one.
            _, w = put(x, y_line, r"$+\cdots$"); x += w + gap
        _, w = put(x, y_line, ")"); x += w + gap * 1.5

    bracket(left, left_pos, bool(spec.get("left_more")))
    bracket(right, right_pos, bool(spec.get("right_more")))
    if x > 0.99:
        raise ValueError("binomial_pairing: the brackets do not fit — shorten the terms or pass width_in")

    box_h = 0.30 / height_in                        # dotted box around each paired term
    box_bottom = fy(y_line + 0.08)
    arrow_y = fy(y_line - 0.24)
    for k, pr in enumerate(pairs):
        c = pr.get("color") or PAIR_COLOURS[k % len(PAIR_COLOURS)]
        (l0, l1), (r0, r1) = left_pos[pr["l"]], right_pos[pr["r"]]
        lx, rx = (l0 + l1) / 2, (r0 + r1) / 2
        fig.patches.append(matplotlib.patches.FancyArrowPatch(
            (lx, arrow_y), (rx, arrow_y), transform=fig.transFigure,
            connectionstyle="arc3,rad=%.2f" % (-0.22 - 0.05 * k), arrowstyle="-|>",
            mutation_scale=12, color=c, lw=1.4, shrinkA=0, shrinkB=0))
        for (a, b) in ((l0, l1), (r0, r1)):
            fig.patches.append(matplotlib.patches.Rectangle(
                (a - 0.005, box_bottom), (b - a) + 0.010, box_h, transform=fig.transFigure,
                fill=False, lw=1.0, ls=(0, (2, 2)), color=c))
        if pr.get("product"):
            put(0.03, y_first_product + row * k, r"$%s$" % pr["product"], color=c, fontsize=fs - 1)
    if target:
        put(0.03, y_caption, target, fontsize=fs - 2, style="italic", color="#555555")
    if result:
        put(0.03, y_result + 0.1, r"$%s$" % result, fontsize=fs - 1)
    fig.savefig(out_path, dpi=DPI, facecolor="white")
    plt.close(fig)
    try:
        from worksheet_lib import trim_to_ink
        trim_to_ink(out_path)
    except Exception:
        pass
    return out_path


_RENDERERS = {
    "graph": _render_graph,
    "area_decomposition": _render_area_decomposition,
    "binomial_pairing": _render_binomial_pairing,
    "normal": _render_normal,
    "histogram": _render_histogram,
    "boxplot": _render_boxplot,
    "cumulative": _render_cumulative,
    "points": _render_points,
}

GENRES = sorted(_RENDERERS)


def render(spec: dict, out_path: str) -> str:
    """Render one figure spec to a PNG at out_path. Raises on unknown genre or
    bad spec — a worksheet script must fail loudly, never ship a blank box."""
    kind = spec.get("kind")
    if kind not in _RENDERERS:
        raise ValueError("unknown figure kind %r — supported: %s" % (kind, ", ".join(GENRES)))
    return _RENDERERS[kind](spec, out_path)


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    samples = {
        "graph": {"kind": "graph",
                  "curves": [{"expr": "x**2 - 4*x", "domain": [-1, 5], "label": "y = x² − 4x"}],
                  "points": [{"x": 2, "y": -4, "label": "M"}],
                  "xticks": [2], "yticks": [-4], "ticks": True},
        "normal": {"kind": "normal", "mu": 50, "sigma": 5, "shade": [55, None],
                   "xticks": [50, 55], "xlabel": "mass (g)"},
        "histogram": {"kind": "histogram",
                      "bins": [[0, 10, 4], [10, 20, 9], [20, 30, 14], [30, 40, 8], [40, 50, 5]],
                      "xlabel": "time (min)"},
        "boxplot": {"kind": "boxplot", "min": 12, "q1": 18, "median": 24, "q3": 30, "max": 42,
                    "xlabel": "marks", "xticks": [12, 18, 24, 30, 42]},
        "cumulative": {"kind": "cumulative",
                       "points": [[0, 0], [10, 6], [20, 22], [30, 55], [40, 82], [50, 100]],
                       "xlabel": "mass (g)"},
        "points": {"kind": "points",
                   "points": {"A": [0, 0], "B": [6, 0], "C": [6, 4], "D": [2.5, 4]},
                   "segments": [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"], ["A", "C", "dashed"]],
                   "right_angles": [["A", "B", "C"]],
                   "angle_arcs": [{"at": "A", "from": "B", "to": "D", "label": "θ"}]},
    }
    # Isabelle's AM sheet, Example 2 (10 Sep 2026): y = (x−2)³, tangent at
    # P(3, 1) is y = 3x − 8 meeting the x-axis at R(8/3, 0); area bounded by
    # the curve, the tangent and the x-axis = ∫₂³(x−2)³dx − triangle.
    samples["area_decomposition"] = {
        "kind": "area_decomposition",
        "curves": [{"expr": "(x-2)**3", "domain": [1.3, 3.3], "label": "$y=(x-2)^3$",
                    "label_at": 0.995, "label_side": "left"},
                   {"expr": "3*x-8", "domain": [2.55, 3.25]}],
        "points": [{"x": 3, "y": 1, "label": "P"}, {"x": 8 / 3, "y": 0, "label": "R"}],
        "xticks": [2], "ylim": [-0.6, 2.4],
        "target": {"shade": {"from": 2, "to": 3, "expr": "(x-2)**3", "to_expr": "max(3*x-8, 0)"},
                   "caption": "required area"},
        "pieces": [{"shade": {"from": 2, "to": 3, "expr": "(x-2)**3"},
                    "caption": r"$\int_2^3 (x-2)^3\,dx$"},
                   {"op": "-", "shade": {"from": 8 / 3, "to": 3, "expr": "3*x-8"},
                    "caption": r"$\frac{1}{2}\times\frac{1}{3}\times 1$"}],
        "result": r"$= \frac{1}{4} - \frac{1}{6} = \frac{1}{12}$",
    }
    samples["binomial_pairing"] = {
        "kind": "binomial_pairing", "target": "the terms that give x⁻¹", "right_more": True,
        "left": ["2x^{2}", "1"],
        "right": ["64", "-576x^{-1}", "2160x^{-2}", "-4320x^{-3}", "\\cdots"],
        "pairs": [{"l": 0, "r": 3, "product": "2x^{2}\\times(-4320x^{-3}) = -8640x^{-1}"},
                  {"l": 1, "r": 1, "product": "1\\times(-576x^{-1}) = -576x^{-1}"}],
        "result": "\\text{coefficient of } x^{-1} = -8640 - 576 = -9216",
    }
    for name, spec in samples.items():
        path = "%s/sample_%s.png" % (out, name)
        render(spec, path)
        print("rendered", path)
