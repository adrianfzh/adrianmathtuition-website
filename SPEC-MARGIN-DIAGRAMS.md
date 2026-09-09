# SPEC-MARGIN-DIAGRAMS — tiny teaching diagrams beside marking annotations

> Approved by Adrian 2026-08-29 ("margin diagrams > yes"). v1 scope locked to the
> two families below. **Build home is the BOT repo** (`~/dev/adrianmath-telegram-math-bot`)
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
> - **`buildAnchoredRightTriangle(spec, anchor, opts)` added same day** (bot
>   `86d8dbb`, reworked for 3D `2c55c40` after Adrian's "doesn't give the 3D
>   feel" on the v1 demo): same validated spec plus an image-pixel anchor
>   `{from:[x,y], to:[x,y], lean?}` = the printed ground segment. Drawn with
>   **oblique-projection conventions** so it reads as standing OUT of the
>   plan: the pole at `to` is **page-vertical** (v1's perpendicular-to-segment
>   pole read as another plan line), the right-angle box is a parallelogram
>   *asserting* the unprojected 90°, and the vertical triangle carries a faint
>   **sail fill** (opacity 0.1) — the depth cue. `lean` tilts the pole up to
>   ±22° to dodge ink (bearings diagrams print a page-vertical north line at
>   the exact vertex the pole stands on); beyond that, or a printed segment
>   within 30° of page-vertical, → refuse and fall back to the margin panel.
>   Pole height is schematic (base/2); the printed segment is never re-traced
>   and printed letters never repeated (pole-top name only — target for
>   elevation, observer for depression). Returns `{ok, svg, bbox}` in IMAGE
>   coordinates for the photo compositor. **SHELVED 2026-08-29** after two
>   demo rounds on Kayla's real bearings page (v1 blue perpendicular-pole,
>   v2 green oblique with sail + lean 14°): Adrian — still reads flat. Root
>   cause is perceptual, not a bug: the printed plan fixes the whole figure's
>   projection, and a single added vertical (plus fill) cannot override it —
>   textbook 3D figures convince because the ENTIRE scene, ground plane
>   included, is drawn in the oblique convention. That consistent-scene
>   drawing is exactly the margin figure's `scene: true` panel, which stays
>   the production 3D carrier alongside the flat true-ratio triangle.
>   Renderer + tests kept dormant (nothing calls them); anchor emission /
>   photo-overlay compositing is **out of the accuracy-bundle scope**, and
>   `anchor` stays out of the marking prompt.
> - **VARIANT B — the lifted pole — BUILT 2026-08-31** (bot `4abda07`; Adrian:
>   "go for B, watch out for marking"). Answers the shelving cause head-on: if
>   the printed plan reading as *lines* is what defeats a lone vertical, give
>   the overlay a **ground**. Two new optional anchor fields:
>   `ground?: [[x,y], …]` — the printed plan's outline, washed at 7% so the
>   region reads as a **surface**; and `across?: [x,y]` — a second printed
>   ground direction. At the pole's foot B draws a **corner tile** spanned by
>   two of the plan's own directions (back along the printed segment, and
>   across it), leaning **into** the plan by a point-in-polygon test.
>   Deliberate calls, each one a render that failed first:
>   · the wash is **neutral slate, not the pen colour** — washing it red tinted
>     the sail's own backdrop and cost the triangle its contrast (grey = the
>     page's figure, red = Adrian wrote this);
>   · the tile is a **corner** tile, not a centred one — the foot is normally a
>     corner of the plan, and a patch centred there is always half off the
>     figure, which read as a sticker beside C rather than ground at C;
>   · **no third fallback.** A synthesised recede direction (the segment swung
>     ~50° into the page) was built and then cut: with no outline there is no
>     "inside", so the tile hung off the figure into the margin — ink on a
>     student's script bought with nothing. **Ground we cannot locate is ground
>     we do not draw**, so an emitter that wants this overlay must supply
>     `ground` (or `across`); with neither, B degrades to the flat v2 that was
>     already judged insufficient, and the question belongs in the margin panel.
>   Fail-closed additions: a ground outline that isn't a polygon, has more than
>   `anchorGroundMaxPts` corners, or whose area exceeds `anchorGroundMaxAreaK ×
>   base²` (a bad anchor that would tint half a marked script) all REFUSE.
>   16 anchored tests (4 pre-existing unchanged), file 104/104 green.
>   **Still dormant** — nothing calls it, `anchor` is still out of the marking
>   prompt and the photo compositor, and it stays that way until Adrian
>   eyeballs the render and says otherwise.
> - **VARIANT C — the dashed sight line + the cast shadow — BUILT 2026-08-31**
>   (bot `3d8a26f`; Adrian: "how about the line of sight as a dotted line?", and "how do people
>   draw to create a 3d effect"). Two changes on top of B, both from how
>   illustrators and animators actually buy depth on flat paper:
>   · **the line of sight is dashed.** The pole is a thing that exists; the
>     sight line is where an eye points. Drawn solid they read as the same kind
>     of object and compete; dashed is the textbook way to say "construction,
>     not edge", and it makes the pole the one dominant vertical. On an overlay
>     it pays twice: the sight line is the ONE line that must cross the page
>     diagonally over the student's own working, and a dashed line lays down
>     roughly half the ink there. Its rhythm is deliberately longer than the
>     depression eye-level's dots so the two dashed lines stay distinguishable.
>   · **a cast shadow at the foot.** The depth-cue literature is unambiguous:
>     Kersten's ball-in-a-box (1997) shows the position of an object's cast
>     shadow decides whether it reads as resting on a surface or floating above
>     it, and that it **overrides** the other cues — size, lighting direction —
>     when they disagree; infants use it by 6–7 months. Animators use the same
>     thing as a contact shadow to weld a character to the floor. It is the
>     cheapest depth available on a marked script: one grey sliver, no extra
>     geometry to get wrong, and it must TOUCH the foot (a detached shadow is
>     literally how you draw something hovering).
>   The shadow runs along the **corner's bisector**, not along either ground
>   direction — cast down `across` alone it lies on the plan's own printed edge,
>   doubling a line already on the page and reading as a smudge (the first C
>   render did exactly that). The bisector is the one direction at that corner
>   guaranteed to head INTO the surface, and it is the tile's own diagonal, so
>   the shadow extends the patch instead of fighting it. Fail-closed like the
>   rest: with a `ground` outline the far end is walked back until it lands
>   inside the polygon, and if it cannot land, **no shadow is drawn**; with no
>   ground direction at all there is no shadow to begin with.
>   106/106 green in the file (2 new anchored tests). **Still dormant** —
>   nothing calls it, `anchor` is still out of the marking prompt and the photo
>   compositor, and it stays that way until Adrian eyeballs the render.
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

---

## Addendum — `trig_graph`: the graphical-solution figure (10 Sep 2026)

> **Adrian, 10 Sep 2026**, on Isabelle's GCE 2024 A Math P1 Q10: *"because student
> drew the wrong line on the trigo graph, would be good if can draw the diagram of
> the trigo graph with the correct line drawn, and also the table that is used to
> obtain the 2 points to draw the line."*

**BUILT** in the bot's `ai/margin-diagram.js` as a fourteenth kind, `trig_graph`
(`validateTrigGraph` + `buildTrigGraphSvg`), with `test/margin-diagram-trig-graph.test.js`.

### The question shape

Q10 is the whole family: *sketch y = 4 cos 2x for 0 ≤ x ≤ 2π; hence solve
4 cos 2x = −(4/π)x graphically.* The method is to draw the line y = −(4/π)x from
two points off a **two-row table** — (0, 0) and (2π, −8) — and count where it cuts
the curve (two solutions). One wrong table row is one wrong line is the wrong
answer, which is exactly what happened. So the figure has to carry the **table**
as well as the graph: the table is where the marks were actually lost, and a line
with no working behind it teaches nothing.

### Spec

```json
{
  "kind": "trig_graph",
  "curve": { "fn": "cos", "a": 4, "b": 2, "c": 0, "domain": [0, "2π"] },
  "line":  { "through": [[0, 0], ["2π", -8]] },
  "table": true,
  "expect_solutions": 2,
  "caption": "$y = -\\frac{4}{\\pi}x$ through $(0,0)$ and $(2\\pi,-8)$ cuts the curve twice"
}
```

- **`curve`** is `y = a·fn(bx) + c`. `fn` is `"sin"` or `"cos"`; `a ≠ 0`; `b > 0`;
  `c` (vertical shift) defaults to 0. `domain` is the interval the question prints.
- **π-multiples, both ways round.** Every x — the two domain ends and the table's
  x-values — takes either a plain number or a π string: `"2π"`, `"π/2"`,
  `"-3π/4"`, `"pi"`, `"\pi"`. A decimal that *is* a π multiple (6.283185…) is
  snapped back and typeset as `2π`, so the two input forms produce a
  byte-identical SVG. y-values are plain numbers.
- **`line`** is the line the student was asked to draw, given as the two rows a
  table would hold: `through: [[x1,y1],[x2,y2]]` (preferred), or `m`/`c`, in which
  case the renderer derives the table at the two ends of the domain. At most one
  line — a `lines` array is refused. `table: false` suppresses the table (on by
  default whenever there is a line).
- **`expect_solutions`** is the number of intersections, from the marker's own
  answer. Optional but strongly preferred.

### What it draws

Axes with an arrowhead and `$x$`/`$y$`/`$O$`; x-ticks in **π multiples**
(`π/2, π, 3π/2, 2π` for a 2π span — the coarsest step giving ≤ 6 labels, plus both
domain ends), typeset through `pen-math` so no π glyph depends on a font; y-ticks
at the curve's own max and min and at each table point's y. The curve is sampled
at 480 points and clipped to the window; the line is drawn **across the whole
domain**; the two table points get small filled dots with `(x, y)` labels; every
intersection gets an **open ring**. Beneath the sketch sits a tight ruled two-column
`x | y` table with the two rows. Both equation labels — `$y = 4\cos 2x$` and
`$y = -\frac{4}{\pi}x$` — are **derived from the numbers**, never from a
model-supplied string, and the gradient prints as a π fraction when it is one
(rational → m·π → m/π → 3 s.f.). Padding is `fontSize × 0.35` throughout; the
table sits `0.35 × fontSize` under the sketch, per Adrian's dislike of padding
around figures.

### Fail-closed checks

The kind refuses (returns `{ok:false, reason}`, and the caller drops the figure)
when:

| Check | Refusal |
|---|---|
| `fn` is `tan` | asymptotes are not drawn yet — a continuous curve through infinity teaches a worse error than the one being marked |
| `fn` unknown, `a = 0`, `b ≤ 0`, `domain` not `[from, to]`, `from ≥ to` | the curve is not drawable |
| domain holds > 8 cycles, or < 0.1 of a cycle | a blur, or nothing that reads as a trig curve, at margin size |
| a `lines` array, or `through` without exactly 2 points | at most one line; the table has exactly two rows |
| the two table points share an x | they cannot fix a line |
| a table point lies outside the sketched domain | it cannot be plotted here |
| `through` **and** `m`/`c` given, and a point is off that line | two claims about the same line disagree and there is no way to tell which is wrong, so **neither** is drawn — this is the Q10 error itself, made by the marker |
| the line climbs more than 6× the curve's height across the domain | unreadable |
| `expect_solutions` ≠ the crossings the renderer counts | the model cannot assert the answer |
| `expect_solutions` given with no line, or not a whole number 0–12 | — |
| the line **touches** the curve without crossing (a tangency), or comes within a hair of it at a turning point | a sketch cannot settle whether that is one solution or none, and a wrong count is worse than none — `y = 4` against `y = 4 cos 2x` is the whole family of this error |

The crossings themselves are counted here, not claimed: a 4000-sample sign-change
scan over `g(x) = curve − line`, each root bisected 60 times and de-duplicated.
Floats with tolerances, like `integral_region` and `right_triangle` — a sine curve
has no rational life, so the exact-rational route the `graph` family takes (its
`parseRational` rejects `2π` outright) was never open.

### Trigger

Item **14** of the marker's `DIAGRAM RULES` in `ai/paper-marker.js`
(`MARK_JSON_SPEC`), with Q10 as the worked example: emit it on a
graphical-solution question where the student **drew the wrong line**, drew the
wrong curve, or read off the wrong number of solutions — with the CORRECT line,
the two table points from the marker's *own* rearrangement of the equation (never
the student's table), and `expect_solutions` from its own answer. The opening
count in that block moved from "thirteen kinds" to "fourteen kinds".

### Known gap

`ai/qa-diagram.js`'s `QA_KINDS` allow-list does not include `trig_graph` (it is
also still missing `venn` from 9 Sep). The kind renders and is verified by its own
validator either way; it just will not be picked up by that QA sweep until the set
is extended.
