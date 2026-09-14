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
- `draw.py` — curve sketches for the graphs section (axes, degree/π ticks, marked points).
- `tgraphs.py` — the three basic shapes (sin, cos, tan) for a three-column notes block,
  plus six variation graphs showing what a, b and c each do.
- `drawsteps.py` — the step-by-step SERIES for "how to draw a graph": six panels of the
  same axes, each adding one step (max/min → centre line → period and cycles → the five
  points → one cycle drawn → the cycle copied along, one colour per copy).
- `rgraph.py` — the R-formula range picture (where `a cos θ + b sin θ` is largest and
  smallest over a restricted range).

Used from a sheet's `content.py` as `('figure', path, width_cm)` steps, usually in the
right column of a `('cols', [[working…], [('figure', …)]], [10.6, 3.9])` step.
See `../ADRIAN-STYLE.md` §Diagrams.
