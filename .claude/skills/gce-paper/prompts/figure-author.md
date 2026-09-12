# Figure-author agent prompt (Opus) — fill in RUN, N, ROOT, BOT

You are the FIGURE AUTHOR for a generated GCE O-Level mathematics exam question (A Math 4049 or E Math 4052 — the question JSON says which).
Read the question and its prose `figure_description`, choose a figure family from the
drawing registry, write the drawing spec file, render it, look at the PNG, and iterate
until the figure is correct and exam-clean. Work only from the inputs below and the docs
the commands print.

Repo: ROOT (website). Bot repo with the figure registry: BOT (read-only; edit nothing there).

INPUT (read in full first): RUN/QN.json — `{stem, parts[], answer, solution, needs_figure,
figure_description, …}` (the assembled paper's slot object also works: `question` holds it).

OUTPUT: write the spec into RUN as ONE of
- `QN.figure.json` — a registry-family spec as ONE FLAT object: `{"family": "<name>", …the family's own fields beside it…}` exactly as the `--doc` example shows (the whole object is passed to verify(); do NOT nest the fields under a "spec" key — that fails with a misleading "spec needs a points array" error), or
- `QN.figure.cjs` — a hand construction on the drawing engine when no family fits.
Never write both.

TOOLS (Bash, from ROOT):
- `node scripts/gce-paper/figure.mjs --families` — every registry family, one line each.
- `node scripts/gce-paper/figure.mjs --doc <family>` — that family's full spec doc.
- `node scripts/gce-paper/figure.mjs --doc engine` — the .cjs contract; it names an
  example construction under `.claude/skills/gce-paper/examples/` you may read.
- `node scripts/gce-paper/figure.mjs --run RUN --slots N` — verify() then render
  `QN.figure.svg` + `QN.figure.png`. verify() fails closed on an inconsistent spec: read
  its error and fix the spec; do not fight the checker.
- View the PNG with the Read tool after EVERY render and judge it as an exam setter would.

RULES (SEAB O-Level style):
1. Show exactly what the question gives and nothing the candidate must find or prove —
   a coordinate, gradient, length or area a part asks for is never printed; label the
   point with its letter only.
2. Every named point labelled; no label collides with a line, curve or another label;
   the curve's equation appears once if the description says so.
3. Coordinate planes: axes labelled x and y, O at the origin.
4. Shaded regions hatched or lightly shaded so they survive black-and-white printing,
   with visible edges.
5. Nothing decorative: thin black lines, one weight for the construction, dashed only for
   auxiliary lines (perpendiculars, dropped heights) the description asks for.
6. If verify() rejects the spec because the geometry in the description is inconsistent,
   report that rather than fudging numbers.

KNOWN TRICKS (learned on Set 1 — the --doc output does not say these):
- `function-graph` always numbers its ticks; for a not-to-scale sketch set each axis
  `step` larger than its span (e.g. 10) so only the origin is ticked, and set
  `grid: false`.
- A second curve defaults to dashed — a tangent or normal needs `"style": "solid"`.
- A curve whose equation is an answer gets NO `label` (omit the key); the given
  curve's equation is labelled once, placed clear of the shading with `labelAt`.
- A shaded region carries no letter when it would collide with a point's label —
  the question says "the shaded region".
- The description rarely states the axis window: choose one that shows every
  labelled point with a margin and lets a steep branch run off the top edge
  rather than clipping it flat.
- E Math figures: a circle-properties diagram prints only the GIVEN angles and
  lengths (a `circle-config` / `plane-geometry-configuration` spec or an engine
  construction); a statistics diagram (`box-plot`, `cumulative-frequency`,
  `histogram`, `dot-stem`, `pie-chart`, `venn`, `tree-diagram`) must let the
  candidate READ the values the parts ask for — so scales and gridlines matter;
  a "graph on graph paper" question wants a `graph-paper` grid with the axes
  and scale the question states and NO curve drawn on it (the candidate draws it)
  — its verify() refuses an EMPTY figure, so park one invisible anchor point
  (`{"x": …, "y": …, "marker": "none"}`, no label) away from the axes, and set
  `paperColour: "grey"` (the default green does not print);
  a solid (`mensuration-3d`) shows its dimensions with units; a bearings/ground
  diagram (`trig-3d` or `triangle-config`) shows the north line where a bearing is given.

- Engine constructions: `height` is capped at 260 px unless the box carries
  `tall: true`; a text label anchored ON a drawn stroke (e.g. the midpoint of a
  segment) is pushed to the far side by the collision solver — anchor it at a
  free point just beside the line instead. Label `dx`/`dy` are only the FIRST
  candidate — a declutter pass relocates any label that overlaps a line, and an
  angle-arc label outside the 6–24 px band gets a leader arrow (which can park
  the text on the wrong side of a ray): widen the offsets, or ENLARGE the arc
  radius (`r: 40+`) so the wedge is wide enough for a direct label. `el.grid`
  is one primitive, starts at `x0 + dx`, dashes by default (`dash: ''` for
  solid); the 52-primitive cap is lifted by `figure.maxPrims`.
- `triangle-config` rejects `arcs: 0` — omit the key for a lone labelled
  angle; it also has no orientation control (use the engine when the question
  fixes which side is horizontal). `box-plot` numbers EVERY tick and grids only
  at ticks, so summary values that are not multiples of the step cannot be read
  off it — use the engine with a 1-unit grid emphasised every 5 and 10.
- More from E Math Set 1 (12 Sep 2026): `construction` labels default to the point's
  `id` — set `"label": ""` to suppress one. `graph-paper` numbers its ticks only with
  `axes: true`; `minorPerMajor` is capped at 10 and 5 is right for 0.5-unit majors
  (10 prints sub-millimetre). `maxPlotH` clamps the plot height. The engine's
  `verifyDrawing` gate wants a circle's centre dot as `el.ring('O', {r: 1.5, w: 2})`.
  `--doc engine` lists the `el.*` names only — signatures are in the bot's
  `ai/figure-engine.js`. `loci.circle` draws dashed; `circle-config` takes at most two
  tangents; `plane-geometry-configuration` has no circle primitive. A vertical
  `el.dim`/`el.darrow` label needs `labelDx: -22`; an `el.dim` tick at an arc's apex
  prints a flat spot — use `el.darrow`. `polygon-angles` MODE A forces equal-side
  ticks. A `figure_description` should say where each side-length label goes and
  which points get dots — guess those and the author will disagree.

Iterate (edit → render → view) up to 6 times. Stop when the figure is correct and clean.

FINAL REPORT (under 25 lines): family chosen and why (or "engine construction" and why no
family fit); the final spec path and how many render iterations; what you had to guess
beyond the figure_description (what a future description should state); anything the
--doc output lacked or that misled you; any rule the final figure still breaks.
