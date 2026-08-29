# SPEC-MARGIN-DIAGRAMS — tiny teaching diagrams beside marking annotations

> Approved by Adrian 2026-08-29 ("margin diagrams > yes"). v1 scope locked to the
> two families below. **Build home is the BOT repo** (`~/Desktop/adrianmath-telegram-math-bot`)
> — this spec lives website-side with the other SPEC-* docs so every session finds it.
>
> ✅ **BUILT 2026-08-29** (bot commits `45b1b4c` + `9235b29`, 22 new tests, suite
> 1272 green; the reconcile work this waited on landed as `65e481c`). **As-built
> deviations from the design below — deliberate, stated openly:**
> - The two families are **kinds in `ai/margin-diagram.js`** (`right_triangle`,
>   `integral_region`), NOT new `lib/figures/` families. The marker's margin
>   pipeline already had a spec→validate→solve→fail-closed→caption→scale→place
>   flow with ten kinds; riding it means placement, leader-obstacle handling,
>   scaling and drop-logging all came free. Contract is the same in spirit:
>   typed spec, validator re-derives the maths, fails closed.
> - `angleAt` param dropped — the **renderer owns the angle vertex** (elevation
>   → observer at the bottom; depression → observer at the top + dashed
>   eye-level + the equal alternate angle at the target). The model cannot put
>   the angle at the wrong corner, which was the very error being taught.
> - `colourIdx` dropped — region colours auto-assigned in order from a fixed
>   palette (green/amber/violet/cyan, fills at 0.35 opacity). **No blue in the
>   palette**: the figures draw in the annotation pen's TEACH_BLUE, so region
>   colour vs pen ink stays unambiguous.
> - Extra gates beyond the spec: right_triangle refuses angles outside
>   [8°, 82°] (undrawable wedges), requires label↔value numeric agreement, and
>   verifies EVERY stated number against the solved triangle; integral_region
>   refuses band overlap, unreferenced curves, and upper<lower anywhere in a
>   region ("split the region" is the refusal message).
> - Prompt-side eligibility gate = rules 11–12 in `MARK_JSON_SPEC`
>   (`ai/paper-marker.js`), shared by both marking modes.
> - **`scene: true` panel added same day** (Adrian: "show both diagrams so
>   students can see the 3D picture"): when the triangle stands on a plan/
>   bearings diagram, a second panel draws the ground as a plane with the
>   segment (e.g. $BC$) lying ON it and the vertical rising OUT of it, beside
>   the flat true-ratio triangle. Schematic angle; flat panel carries truth.
> - Demo renders (Kayla EM P2 Q3 elevation with scene panel; Kassandra AM 2021
>   P1 Q14 area) shown to Adrian 2026-08-29 from verified-solution numbers only.
> - **Remaining DoD**: bot deploy (with the accuracy bundle; marking queue must
>   be empty), then the doctrine checkpoint — Adrian eyeballs the first real
>   paper carrying a margin diagram before anything releases (auto-release is
>   paused globally anyway). The design text below stands as the approved
>   record; where it says `lib/figures/`, read `ai/margin-diagram.js` kinds.

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
