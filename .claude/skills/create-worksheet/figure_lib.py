"""Deterministic figure rendering for generated worksheet questions.

The CONTRACT (see SKILL.md → Figures): the model never freehands a picture. It
writes a small parameter dict — the same numbers the question text and answer
are computed from — and this module draws it. A figure can then never disagree
with its mark scheme, and a better future model inherits the same renderers.

Genres (v1): graph, normal, histogram, boxplot, cumulative, points (labelled
plane geometry). A question that needs anything else is written WITHOUT a
figure or not at all — never with a described-but-missing diagram.

All output is exam-style black-and-white line art on white, serif labels,
sized for a ~10 cm print slot at 200 dpi.
"""

from __future__ import annotations

import math

import matplotlib
matplotlib.use("Agg")
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
}


def _f(expr: str):
    """Compile a y-of-x expression against the whitelisted namespace only."""
    code = compile(expr, "<figure expr>", "eval")
    for name in code.co_names:
        if name not in _SAFE and name != "x":
            raise ValueError("expression uses %r — not in the safe namespace" % name)
    return lambda x: eval(code, {"__builtins__": {}}, {**_SAFE, "x": x})


def _axes_through_origin(ax, xlim, ylim, names=("x", "y")):
    """School-style axes: spines through 0 with arrowheads, ticks kept light."""
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    if xlim[0] <= 0 <= xlim[1]:
        ax.spines["left"].set_position("zero")
    if ylim[0] <= 0 <= ylim[1]:
        ax.spines["bottom"].set_position("zero")
    ax.plot(1, 0, ">k", transform=ax.get_yaxis_transform(), clip_on=False, markersize=5)
    ax.plot(0, 1, "^k", transform=ax.get_xaxis_transform(), clip_on=False, markersize=5)
    ax.annotate(names[0], xy=(1, 0), xycoords=ax.get_yaxis_transform(),
                xytext=(8, -4), textcoords="offset points", style="italic")
    ax.annotate(names[1], xy=(0, 1), xycoords=ax.get_xaxis_transform(),
                xytext=(6, 4), textcoords="offset points", style="italic")


def _fig(width_in=None, height_in=None):
    width_in = width_in or DEFAULT_W_IN
    return plt.subplots(figsize=(width_in, height_in or width_in * 0.72))


def _finish(fig, out_path: str) -> str:
    fig.savefig(out_path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return out_path


# ---------------------------------------------------------------- graph ----

def _render_graph(spec, out_path):
    fig, ax = _fig()
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
                ax.annotate(c["label"], (x[at], y[at]),
                            xytext=(6, 5), textcoords="offset points", fontsize=10)
        xs_all.append(x)
        ys_all.append(y)
    shade = spec.get("shade")
    if shade:
        x = np.linspace(shade["from"], shade["to"], 300)
        y = np.asarray(_f(shade["expr"])(x), dtype=float)
        base = np.asarray(_f(shade["to_expr"])(x), dtype=float) if shade.get("to_expr") else 0
        ax.fill_between(x, y, base, color="0.82", zorder=0)
    for p in spec.get("points", []):
        ax.plot(p["x"], p["y"], "ko", markersize=4)
        ax.annotate(p.get("label", ""), (p["x"], p["y"]),
                    xytext=(5, 5), textcoords="offset points", fontsize=10, style="italic")
    for v in spec.get("vlines", []):
        ax.axvline(v["x"] if isinstance(v, dict) else v, color="k", lw=0.9, linestyle="--")
    for h in spec.get("hlines", []):
        yv = h["y"] if isinstance(h, dict) else h
        ax.axhline(yv, color="k", lw=0.9, linestyle="--")
        if isinstance(h, dict) and h.get("label"):  # e.g. an asymptote's "v = 30"
            ax.annotate(h["label"], xy=(1, yv), xycoords=ax.get_yaxis_transform(),
                        xytext=(-4, 5), textcoords="offset points", ha="right", fontsize=10)

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

    if P:
        centroid = sum(P.values()) / len(P)
        for name, pt in P.items():
            if spec.get("hide_points") and name in spec["hide_points"]:
                continue
            ax.plot(*pt, "ko", markersize=3)
            d = pt - centroid
            n = np.linalg.norm(d)
            off = (d / n * 12) if n > 1e-9 else np.array([8, 8])
            ax.annotate(name, pt, xytext=tuple(off), textcoords="offset points",
                        ha="center", va="center", style="italic", fontsize=11)
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
    return _finish(fig, out_path)


# ---------------------------------------------------------------- public ----

_RENDERERS = {
    "graph": _render_graph,
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
    for name, spec in samples.items():
        path = "%s/sample_%s.png" % (out, name)
        render(spec, path)
        print("rendered", path)
