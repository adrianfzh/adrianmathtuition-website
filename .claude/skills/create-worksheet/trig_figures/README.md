# Trig figures the way Adrian draws them (12 Sep 2026, S3 Trigonometry sheet)

Matplotlib helpers, run under `/usr/bin/python3` (Pillow + numpy live there):

- `quad.py quadrant(out, quad, adj, opp, hyp, angle_name, pyth=…)` — the right-angled
  triangle drawn INSIDE the quadrant the angle lies in, on x–y axes, signed adjacent and
  opposite written along the legs, the hypotenuse value placed 0.3 of the way along with
  its arrow at 0.72 so the arrow never crosses a number ("arrow to hypotenuse cuts across
  the number"), the Pythagoras working right-aligned to the axis in 11 pt ("make the
  Pythagoras' theorem part font larger"). One diagram per angle; the three ratios sit in
  a ROW under their own diagram, never stacked.
- `astc.py astc(out, ticked, rad=False)` — the S A T C reference (2nd | 1st over
  3rd | 4th), the ticked quadrants in green with `180° − α` / `α` / `180° + α` /
  `360° − α` (or the π forms) under each letter, the others greyed.
- `axes.py arrow_axes(ax, xlabel='x', ylabel='y')` — **every graph goes through this.**
  The two spines cross at the origin, each ends in an arrowhead and carries its name
  ("the graphs should have x and y axis labelled with the arrow for x-axis and y-axis",
  14 Sep 2026); it also lifts the axis above the curve and haloes the tick numbers in
  white so a curve crossing a label leaves it readable. Call it AFTER `set_xlim`/
  `set_ylim` — the arrowheads are pinned to the ends of the axes. A quadrant reference
  square is not a graph and does not use it.
- `draw.py` — curve sketches for the graphs section (axes, degree/π ticks, marked points),
  plus `centre_line(ax, c, x0, x1, alpha=1.0)` — **a sketch of `y = a sin/cos bx + c`
  shows its centre line `y = c`, dotted** ("the graph in the solution should show the
  centre line (dotted)", 14 Sep 2026). Black, thin, unlabelled, under the curve; a
  second, fainter curve on the same axes gets its own centre line at `alpha=0.6`.
- `axes.py CYCLE_COLOURS` / `cycle_colour(i)` — **one colour per graph when the range
  holds more than one** ("if there are more than 1 graph, we should colour code to
  highlight the number of graphs", 14 Sep 2026), and **no numerals on the picture**
  ("for the trigo graphs, don't have to put the numbers", 14 Sep 2026) — the colour is
  the whole of the count. One graph in the range stays plain black. Five colours, because
  two graphs that touch must never share one. **A colour means a WHOLE graph** — a
  part-graph at the edge of the range is an offcut, so `cycle_colour('part')` draws it
  grey and it is left out of the count ("you misunderstand. this is ONE tangent graph",
  14 Sep 2026). The same palette serves `tgraphs.py` and `drawsteps.py`, so graph 2 is
  the same orange in both.
- `tgraphs.py` — the three basic shapes (sin, cos, tan) for a three-column notes block,
  plus six variation graphs showing what a, b and c each do. `variation(..., pieces=…)`
  does the colour coding; `cycles(xmax, period)` builds the runs for a curve
  that simply repeats. **Tangent graphs are drawn to 360°** ("draw until 360 degrees, to
  illustrate how many tangent graph there are in 360degrees", 14 Sep 2026) — one tangent
  graph is 180° wide, so `y = a tan bx` gives `b` of them in 180° and `2b` in 360°.
  **On a tangent curve a graph runs from one asymptote to the next, and only a WHOLE one
  is coloured** ("this is considered one tangent graph -> this should be same colour, then
  another set of this should be another colour" / "you misunderstand. this is ONE tangent
  graph", 14 Sep 2026): the stub at either end of the range is an offcut of the graph next
  door, so it takes colour number `'part'` and comes out grey. Give `pieces` one run per
  piece between asymptotes.
- `drawsteps.py` — the step-by-step SERIES for "how to draw a graph": six panels of the
  same axes, each adding one step (max/min → centre line → period and cycles → the five
  points → one cycle drawn → the cycle copied along, one colour per copy).
- `context_graph.py threshold_graph(...)` — **the graph for a worded question that never
  asked for a graph** ("question did not ask for a graph, but would be good if there is a
  graph to illustrate how to solve the question - the visual will be very helpful",
  14 Sep 2026, the tide/draft example): the model curve, the level it is tested against
  (dashed and named), the stretch where the answer is no (shaded), and the moment the
  question names (dashed drop to the curve, value beside it). `below=False` for a question
  that fails when the curve goes OVER the level.
- `rgraph.py` — the R-formula range picture (where `a cos θ + b sin θ` is largest and
  smallest over a restricted range).

Used from a sheet's `content.py` as `('figure', path, width_cm)` steps, usually in the
right column of a `('cols', [[working…], [('figure', …)]], [10.6, 3.9])` step.
See `../ADRIAN-STYLE.md` §Diagrams.
