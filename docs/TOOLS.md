# /tools — public interactive math tools

Static, self-contained HTML pages in `public/tools/<slug>.html`, listed as cards in
`src/app/tools/page.tsx` (`TOOLS` array — a card's slug must have a matching file, or
the card 404s). Conventions, all load-bearing:

- **Fully self-contained**: inline CSS+JS, IIFE, `"use strict"`, zero external requests
  (KaTeX CDN tags in the older pages are the grandfathered exception). No build step —
  a deploy ships the file byte-for-byte.
- **House style**: warm paper `#F4EFE6`, Georgia serif, palette rose/teal/orange/plum;
  copy the `‹ All tools` backlink chip from `sincos-unwrap.html` verbatim.
- DPR-aware canvas, pointer events with `touch-action:none`, generous drag targets.
- `curve-sketcher.html` holds the **safe expression parser** (whitelist tokenizer +
  recursive descent, no `eval`); `graph-transformations.html` carries a ported copy —
  they're commented as siblings, keep fixes in sync.
- The **maths mini-renderer** (`^2`/`^{…}` superscript, `{a}/{b}` stacked fraction, no
  KaTeX) lives in three copies: `solution-stepper.html` (origin), `trig-proofs.html`
  and `trig-proof-steps.html`. Same "keep in sync" deal as the parser above.
- `trig-proofs.html` and `trig-proof-steps.html` are a deliberate **pair over the same
  identities**: the first asks for the next line, the second shows it and explains the
  choice (`see` → `rule` → `buys` per step). They share the five-move vocabulary and
  cross-link, so proof lines edited in one should be edited in the other.
- `sincos-unwrap.html` has a **2D/3D view toggle** (localStorage `sincos_view`,
  default 2D): 2D = flat unit circle + tangent construction (GeoGebra pJqvn9pR style)
  with the three graphs unrolling beside it; 3D = the original crate unwrap (its
  tangent-construction inset shows only in 3D — in 2D it IS the main view).
- `constructions.html` is the one page built as a **scrubbable video**: the whole
  picture is a pure function of the clock `t`, so dragging the timeline backwards is
  free (nothing is stored as "already drawn"). Traps that bit during the build:
  an arc sweep must go the *short* way (`a0 + normalised delta`, never the raw
  `atan2` of the second arm, or arms straddling ±π sweep a whole circle), and a
  half-plane is named by its **normal** — the perpendicular bisector runs along
  `n`, so shading "nearer to A" takes `u`. Passing `n` clips the region to nothing.
- `ratio-drill.html` is the only **question generator** in `/tools`: 9 families ×
  variants, each returning figure + wording + answer + worked steps in one object.
  Its step fade is rAF-driven **with a `setTimeout` backstop** — rAF never fires in a
  throttled/background tab, which left the highlights stuck at alpha 0. Any new
  canvas fade here needs the same guaranteed final frame.
- Both pages keep an info panel overlaid on the canvas on desktop; below 640px
  `constructions.html` **moves that node into the lesson bar** (`placeBadge`) rather
  than shrinking the figure to make room.
- The **guided-lesson family** is now `first-principles`, `completing-square`, `r-formula`,
  `exp-log-graphs`, `add-fractions`, `quadratic-graphs`, `em-graphs` and `matrix-multiply`.
  They share one engine by copy (scenes × steps, dots, Prev/Next, ← →, ▶ Play all, 500 ms
  crossfade, DPR resize, `REDUCED`), and the four newest also share the canvas maths
  renderer + `bandRect`/`clearOfReadout` layout helpers. A fix to the engine or those
  helpers should be applied across the set — they are copies, not imports, because the
  tools stay single-file and zero-request.
  - `add-fractions.html` (S2 algebra, from Adrian's *Algebra 3: Fractions* notes) is the
    only one that **typesets rather than plots**: `drawAtoms` lays out lines of fractions
    with ×n tags, highlight washes and per-line annotations. Two layout rules are
    load-bearing: a ×n tag gets its **own left gutter** (`tagPad`) or it lands on the
    preceding operator, and a line carrying an `under` note gets **extra vertical room**
    or the note collides with the numerator below it.
  - `quadratic-graphs.html` draws ONE parabola (y = x² − 6x + 5) in every scene so
    "three forms, one curve" is seen rather than asserted; `Q(a,b,c)` derives all three
    forms, so the sandbox can never print a factorised form that disagrees with the curve.
    Every scene shows its **working** beside the figure (`splitRects` + `workingPanel`):
    the substitutions that produce each intercept and the turning point, revealed in step
    with the graph. Three rules there: the panel replaces the readout on those scenes (the
    same numbers twice just crowds the figure); on a phone only the CURRENT step's lines
    are drawn, since the accumulated block does not fit; and rounded values are printed
    with `≈` (via `approx`/`eqs`), including the factorised and completed-square headers,
    so the sandbox never claims a rounded decimal is exact. `workingPanel` fades the newest
    line in from a step clock — the sandbox has no such clock, so it passes `{instant:true}`
    or every line renders at alpha 0.
  - `em-graphs.html` covers the EM *Graphs* page (x^n for n = −2…3, a^x, the minus flip,
    shifting). `plotBreak` starts a new subpath when the pixel jump exceeds the plot
    height — without it 1/x is drawn with a false vertical line through the asymptote.
  - `geometry-proofs.html` is the **proof** half of plane geometry — `circle-theorems.html`
    shows the theorems holding as you drag; this one writes the proof, statement then
    reason, with the figure highlighting only what the current line talks about. Two
    rules kept it honest: angle arcs **always sweep the short way** (normalise the delta
    into (−π, π] — the raw `atan2` of the second arm sweeps a whole circle when the arms
    straddle ±π, the same trap as `constructions.html`), and **every figure is drawn to
    its own labelled angles** — the arcs in the worked question are chosen so ∠ACB really
    is 58° and ∠ADC really is 106°, so a student who measures is not misled. Proofs are
    hand-written and checked; the tool never generates one.
  - `matrix-multiply.html` + `matrix-calc.html` are a **deliberate pair** (lesson, then
    your own numbers) and share `drawMatrix`/`multiply`/`entryWorking` by copy — keep
    them in sync, same deal as the parser and the trig-proof pages.
- `exp-log-graphs.html` is the fourth **guided animated lesson** (same scene engine as
  `first-principles` / `completing-square` / `r-formula`: scenes × steps, dots, ▶ Play
  all, 500 ms crossfade), and the first to end in a **drill** — 9 scenes, the last two
  being a live sandbox and a two-stage quiz (shape, then asymptote). Things that bit
  during the build, all still load-bearing:
  - **Log curves are sampled in equal steps of y** (`t = ln(inside)`), never by x: it
    is the only way the near-vertical run beside the asymptote and the flat tail are
    both accurate, and `frac` then draws the curve outward *from* the asymptote, the
    way it is sketched by hand. Exponentials sample by x at ~1 px, which is exact for
    a single-valued y = f(x) however steep.
  - It carries its own **canvas maths renderer** (`drawMath`: `^{…}` / `_{…}`, string
    or `{t,c}` runs) plus `htmlMath` for the same markup in the answer buttons. It is
    NOT the `solution-stepper` HTML mini-renderer — that one does stacked fractions and
    lives in the DOM; this one draws to canvas. Passing a bare string inside the parts
    array throws, which is why the array form is normalised.
  - The rAF loop wraps its body in `try/finally` so a bad frame can never stop the
    scheduling — an uncaught throw inside `frame()` used to freeze the whole lesson on
    a half-drawn canvas with no console trace visible to the student.
  - Label placement is deliberate, not decorative: `bandRect` reserves a strip above
    the plot for the equation title (a centred title inside the plot lands on the
    y-axis), `clearOfReadout` insets the plot on wide screens so the readout panel
    never covers the curve, `mark()` flips an intercept label that would fall off an
    edge, and a vertical asymptote's label goes to the end the curve does NOT run off.

## Photo extraction (`/api/tools/vision` → bot `/api/tools-vision`)

Snap-a-photo features on two tools: **graph-transformations** (digitize a printed
graph with no equation → interpolant → all JC transforms of it) and **linear-law**
(read the question's data table → fill, fit, recover a and b).

- Browser POSTs `{kind: 'graph-curve'|'linear-law', image: dataURL}` to the PUBLIC
  Next route `src/app/api/tools/vision/route.ts` (no auth — the tools are public);
  it validates kind/size and forwards to the bot's `/api/tools-vision` with
  `BOT_INTERNAL_SECRET` + the visitor IP in `x-tool-client-ip`.
- Bot side (`handlers/webchat.js` + `ai/vision-extract.js`, unit-tested cleaners):
  rides the marking `visionGenerate` Gemini ladder; **rate limits live there** —
  12/hour per visitor IP, 400/day global — because the single Fly machine can hold
  them in memory; Vercel can't. 429 messages are user-facing.
- Response contracts (clamped server-side, degrade to `{found:false, note}`):
  `graph-curve` → `{found, xmin, xmax, ymin, ymax, points[[x,y]…], vasymptotes[],
  labelled_points[], note}`; `linear-law` → `{found, x[], y[], xname, yname, model,
  note}`. Vision output is untrusted data — tools must treat it as numbers only.
- A new photo-extraction surface = a new `kind` in BOTH the bot's `KINDS` and the
  proxy's set, plus a cleaner + tests in `ai/vision-extract.js`. Don't mint a second
  endpoint.
