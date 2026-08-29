# SPEC-MARGIN-DIAGRAMS — tiny teaching diagrams beside marking annotations

> Approved by Adrian 2026-08-29 ("margin diagrams > yes"). v1 scope locked to the
> two families below. **Build home is the BOT repo** (`~/Desktop/adrianmath-telegram-math-bot`)
> — this spec lives website-side with the other SPEC-* docs so every session finds it.
>
> ⚠ **Build timing**: the annotation pipeline files (`ai/marker-annotate.js`,
> `ai/photo-overlay.js`, `ai/annotate.js`) are owned by another session's staged
> reconcile/reannotate work as of 2026-08-29. Do not start this build until that
> work is committed and deployed; margin diagrams join the same overlay code.

## Why

The annotated photo PDF (the one Adrian and students actually use —
`mode:'photos'`) explains errors in red-pen prose. For two recurring error
shapes, a two-inch picture teaches faster than any sentence:

1. **Elevation/depression setup errors** — student puts the angle at the wrong
   vertex, or swaps opposite/adjacent. The fix is *seeing* the right triangle.
2. **Integral-area sign/region errors** — student integrates straight across a
   sign change or subtracts curves in the wrong order. The fix is *seeing* the
   region split, each piece tied to its integral term.

A small margin diagram beside the annotation turns "your angle should be at B"
into the triangle itself.

## v1 families (only these two)

### 1. `right-triangle-elevation`
A right triangle with:
- the horizontal/vertical legs and hypotenuse, right-angle box marked;
- the elevation/depression angle arc at the correct vertex, labelled with the
  given value (or θ if sought);
- side labels with given values; the **sought** side/angle highlighted (thicker
  stroke + colour);
- optional eye-level dashed line + observer/object glyphs for depression cases.

Spec params (typed, all required unless noted): `{ angleAt: 'base'|'top',
kind: 'elevation'|'depression', angle: {value?, label, sought?}, horizontal:
{value?, label, sought?}, vertical: {value?, label, sought?}, hypotenuse?:
{value?, label, sought?} }` — exactly one element `sought`.

`verify()`: with ≥2 known numeric elements, re-derive the third
(tan/sin/cos/Pythagoras) and require agreement with any stated solution value
within 0.5% — else **fail closed** (no diagram).

### 2. `integral-region`
A curve sketch (or curve pair) with the integration region shaded, split at
every boundary the correct solution splits at:
- x-axis, curve(s) drawn from the actual functions (plotted server-side, not
  freehand);
- each sub-region flood-shaded in its own colour;
- beneath/beside: the matching integral terms, each typeset in the SAME colour
  as its region — the colour IS the mapping;
- intersection/root x-values ticked on the axis.

Spec params: `{ curves: [{tex, fn}], regions: [{from, to, upper, lower?,
colourIdx, termTex}], xRange, yRange? }` where `fn` is a safe expression string
the renderer evaluates on a grid (same sandboxed evaluator as the bot's
`function-graph` family).

`verify()`: numerically integrate each region's `upper - lower` over
`[from, to]` and require the sum to match the solution's stated area within
0.5%; require each region's integrand to be sign-consistent over its interval
(that's the very error being taught) — else fail closed.

## Architecture — same contract as the figure library

Follows the bot's `lib/figures/` registry contract exactly
(`{ FAMILY, verify(spec), render(spec) }`, verify re-derives the maths and
fails closed). These are two NEW families in that registry — margin use is just
a small render size; nothing about the contract changes. CLAUDE.md's figure
rule applies: never hand-write SVG for these.

**The model picks WHEN and fills params; the renderer draws.** During
annotation planning, the marker may attach to any annotation:
`margin_figure: { family, spec }`. It never emits drawing instructions —
only the typed spec. Grounding rule: every numeric in the spec must come from
the question or the verified correct solution, never from the student's wrong
working (the diagram shows what SHOULD have happened).

Eligibility gate (prompt-side): only where the error is *structural* (wrong
vertex, wrong region, wrong order) — not for arithmetic slips. Expect roughly
0–2 diagrams per paper, not one per question.

## Placement & rendering

- Rendered as a compact SVG→PNG block (target ≈ 260×200 px at overlay scale),
  placed by the existing margin-placement engine in `ai/photo-overlay.js`.
- Joins the **leader-line obstacle set** (approved bundle item 4): a placed
  diagram must never be crossed by later leaders, and must never cover student
  ink (same ink-edge detection as note placement).
- If the margin band at that annotation is too tight for the block, drop the
  diagram, keep the text annotation. **The diagram is an enhancement — its
  absence is never an error; its wrongness always is.** (Hence fail-closed
  everywhere.)
- Colour: the overlay pen palette + distinct region fills at ~35% opacity so
  student pencil beneath stays legible.

## Failure handling

`verify()` fail, render error, placement overflow → skip that diagram, log
`margin_figure_dropped` with the reason into the run's result_json (so triage
can show "1 diagram dropped"), never block or degrade the release. No retry
loops — one shot per annotation.

## Out of scope (v2 candidates, decide later)

Sine/cosine-rule triangles, circle-theorem configs, vector diagrams,
normal-curve shading, bearings compass rose. All are existing or near-existing
registry families; add only after v1 proves students actually look at the
margins.

## Definition of done (v1)

- Two families registered in the bot's `lib/figures/` with unit tests on
  `verify()` (consistent spec passes, inconsistent fails, sign-mixed region
  fails).
- Marker prompt addition + `margin_figure` schema in the annotation planner.
- Placement integrated with the obstacle set; visual check on one real
  elevation question and one real integral-area question (synthetic fixtures —
  student pages never become test assets).
- Doctrine checkpoint: Adrian eyeballs the first real marked paper carrying a
  margin diagram before the feature releases anything to a student.
