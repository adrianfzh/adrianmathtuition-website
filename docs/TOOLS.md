# /tools — public interactive math tools

Static, self-contained HTML pages in `public/tools/<slug>.html`, listed as cards in
`src/app/tools/page.tsx` (`TOOLS` array — a card's slug must have a matching file, or
the card 404s). Conventions, all load-bearing:

- **Fully self-contained**: inline CSS+JS, IIFE, `"use strict"`, zero external requests
  (KaTeX CDN tags in the older pages are the grandfathered exception). No build step —
  a deploy ships the file byte-for-byte.
- **House style** (re-paletted 2026-08-12 — Adrian: "don't want beige"): the tools now
  use the **site palette**, so they read as part of adrianmathtuition.com rather than a
  separate warm-paper world — background `#F8FAFC`, ink `#142033`, muted `#5A6B80`,
  grid `#E3E9F1`, axis/rule `#AEBDCE`, panel `#FFFFFF` on `#DDE3EC`, and the four curve
  colours deepened for contrast on white: teal `#1F6F84`, orange `#C85A2E`,
  rose `#B04A62`, plum `#6B4E9C`. Georgia serif and the `‹ All tools` backlink chip
  (copy it from `sincos-unwrap.html` verbatim) are unchanged.
  - `scripts/tools-palette.mjs` performed the swap and is the record of the mapping —
    it is idempotent, so re-run it after porting an old page in. It deliberately
    **skips the five dark tools** (`argand-diagram`, `calculus-drill`,
    `graph-transformations`, `mental-math`, `vectors-3d`, all `--bg:#0f1419`) and
    `trig-graphs` (already cool): they were never beige, and dark suits those canvases.
  - Watch for **white-on-near-white**: fills that were `#fff` against warm paper now sit
    on `#F8FAFC` and need their border to carry them (the bar model in `add-fractions`,
    the matrix boxes). Anything still warm — cream card fills, tan greys — is a leftover
    the swap missed; the amber highlight tones are intentional and stay.
- **`?solo=1` hands one tool to a student on its own** (added 2026-08-20, Adrian: "how
  can I send the tool to students without them being able to access the other tools?").
  Every page carries a two-line inline script after the backlink chip that removes the
  `‹ All tools` anchor when the query string contains `solo=1`, so
  `…/tools/trig-graphs.html?solo=1` has no visible way out to the rest of `/tools`.
  It is **presentation, not access control** — `/tools` stays public and linkable, and
  anyone can delete the query string. Real gating means putting the tool behind the
  student portal (`/app`), which already has login. Any new tool needs the snippet
  copied along with the backlink chip.
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
  - **Narration** (added to `quadratic-graphs.html` first, 2026-08-13 — port it to the
    rest of the family). Browser `speechSynthesis` only: no audio assets, no TTS
    endpoint, so the zero-request rule holds. Three things are load-bearing:
    a hand-written `NARR[scene][step]` script — captions are full of markup and
    symbols and speak badly, so they are **not** reused; nothing is spoken until the
    student has clicked once (`gestured`), because browsers refuse speech before a
    gesture and the toggle would otherwise look broken on load; and while playing the
    **voice sets the pace**, not the timer — `schedule()` treats `dwell` as a minimum
    and keeps re-checking `synth.speaking` so a step is never cut off mid-sentence.
    `NARR` length must track each scene's `steps` (27 lines for 27 steps here).
    The `🔊` toggle persists in localStorage (`qg_narr`).
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
  - **The four basic shapes are shown one per panel, never four on one axes**
    (2026-08-12 — Adrian: "it is not clear which graph is which, there are no
    emphasis, it's a bunch of information altogether at once"). `fourBoard()` in
    `exp-log-graphs.html` lays the four out on a 2×2 board where **the layout is the
    rule**: across = flip in the y-axis, down = flip in the x-axis. Each panel gets its
    own little axes, one curve, a large equation and a plain-English subtitle. The flip
    steps that lead up to it show ONE flip at a time, with a big heading naming it and
    the two curves labelled *before* / *after* — and those scenes carry **no readout
    panel**, because it repeated the heading word for word. When adding to these scenes,
    the test is: can a student say what changed without reading the caption?
  - **The three graph lessons draw sketch figures, not plots** (2026-08-12 — Adrian: the
    flips are the main point, keep the graphs simple and the type large). `exp-log-graphs`, `em-graphs` and `quadratic-graphs` have **no grid and no tick numbers**: `grid()` is gone and `axes()`
    draws two thicker rules plus the x / y letters. Numbers on the axes invite reading
    coordinates off a curve that is only schematic, and they cost the room the large
    labels need; points that matter carry their own coordinate label. Canvas type and
    curve widths in those two files are ~25% up on the rest of the family — if you port
    a scene between tools, expect to re-size it.
  - **Asymptotes are never drawn on top of an axis** (`asymptote()` in exp-log-graphs,
    `asym()` in em-graphs, both check `|value| < 1e-9`). A dashed line painted along the
    x-axis makes the axis itself look dashed and blurs the distinction the lesson is
    teaching; when the axis IS the asymptote the label says so — "y = 0 (the x-axis)" —
    exactly as Adrian's notes phrase it (flagged 2026-08-12). Off-axis asymptotes keep
    their dashed line, inset ~9 px from the plot edge so it reads as an annotation rather
    than a border. An on-axis label is also nudged clear of the little x / y axis letters,
    which live in the same corner.
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

- `trig-graphs.html` (the **Trigonometric Graphs Explorer**) is a sandbox, not a lesson —
  you type a, b, c into y = a·fn(bx) + c and the picture plus the side explanation follow.
  Rebuilt 2026-08-20 around one idea: *a student should SEE the period and the amplitude
  on the graph, not read about them.* What that costs, and why each piece is the way it is:
  - **The plot never fills the canvas.** `computeInsets()` reserves a band at the top
    (period bracket + the ①②③ badges) and 30 px at the foot (x-axis numbers), and `Y()`
    maps into what is left. Curves are `clip()`ped to that rect in `drawCurve`, or a tan
    branch running to ±∞ scribbles through the axis numbers.
  - **One colour and one number per complete repeat** (`cycleSpans` → `CYCLE` → badges),
    which is how "b = 3 means 3 waves in 360°" stops being a claim. A span is `full` only
    when it is a whole wave, or a tan branch with an asymptote at each end; the part-repeats
    the range slices off are drawn faded and never numbered, so the count is always honest.
    If NOTHING is full the colouring is dropped entirely — a curve drawn wholly in
    "faded, cut off" teal is unreadable, which is what `y = 2tan½x + 1` over 0–360° gave.
    b = 0 or a = 0 collapse the curve to a horizontal line: no repeats, no bracket, no arrow.
  - The **preset row "count the repeats"** carries its own x-range (`fn,a,b,c,x0,x1`)
    precisely so the counts come out whole — `y = 2tan3x` is offered over −30°…150°, which
    is 3 complete branches, not 2 branches and two halves.
  - **Chips place themselves.** Every label (centre line, max, min, |a|) is a white box
    offered a list of candidate positions and takes the first that does not collide with
    what is already down — the axis-number strips are reserved before anything is drawn,
    the |a| arrow claims its space before the guide chips, and if nothing is free the
    chip takes the position covering the least. Without this, "centre line y = 0" lands
    on "a = 2" on a phone, and on the x-axis numbers when c = 0.
  - The **|a| arrow** stands on the centre line and reaches the peak — but only a peak
    with 45 px of room either side. `y = cos x` over 0–360° peaks at both canvas edges,
    so with no comfortable peak the arrow is drawn at 24% across, measuring the centre
    line to the max line instead.
  - **Up to two curves, plus a reference.** Graph B is independent of A except for
    the x-range; the plain `y = fn x` reference is grey and dashed and can be switched off.
    Every guide and marker describes **graph A** — the chips say so (`A: max = 1`) as soon
    as B is on. Asymptotes are fine dots, never dashes, so they cannot be mistaken for the
    dashed reference curve. Both graphs are keyed into the **same panel** (B appears under
    a checkbox right below A, each row chipped `A` / `B`); a separate "two graphs" panel
    put the second equation nowhere near the first.
  - **A and B never share a colour family.** With B on, A's repeats switch from `CYCLE` to
    `CYCLE_B_ON` — teals and greens only — and B is the sole violet curve (`COL_B`); the
    period bracket steps from plum to slate ink (`C.markInk`) so it cannot be read as B.
    The default cycle's blue and magenta sat right next to B's old plum, and on
    `tan 3x` vs `tan 2x` you genuinely could not say which curve was which.
  - Axis numbers are **full-strength ink at 15 px with a white halo** (`haloText`), not
    the 11 px grey hint they were: they are the thing a student copies into an answer.
    `tickStep`'s label budget dropped from W/58 to W/78 to match. They are drawn in their
    own pass (`drawAxisNumbers`) **after every curve** — the halo cannot save a label that
    a wave is painted straight over, which is what happened to `0.5` on `y = sin 2x`.
  - The **period bracket carries arrowheads at both ends**, so it reads as a width being
    measured rather than a rule that happens to sit above the plot. Heads are dropped
    below 14 px of span, where two of them would merge into a blob.
  - **Phone layout is entry-first.** On a phone the a/b/c boxes sit ABOVE the canvas so a
    student types a number and watches the curve move without scrolling for it; the
    checkboxes, x-range, facts and explanation all come after. The two column wrappers
    (`.col-main` / `.col-side`) go `display: contents` under 900 px, which promotes their
    panels to flex items of `.layout` so each can be given its own `order` — panels nested
    inside a wrapper cannot otherwise be reordered past it. Desktop keeps the two columns.
  - **No instruction prose above the graph** and no preset row: the "decimals, negatives
    and fractions work" hint, the graph-B colour note and the whole "Try these" panel were
    cut (Adrian, 2026-08-20) — on a phone they pushed the picture off the screen. The
    subtitle is hidden under 700 px for the same reason, and `?solo=1` also drops the
    34 px of header headroom that exists only to clear the "‹ All tools" chip
    (`body:has(.tools-backlink)`).
  - The word is **"centre line"** everywhere — never "midline" (Adrian, 2026-08-20).
  - ⚠ Graph B's sin/cos/tan buttons **borrow the `.unit-btn` class** for their styling.
    The degrees/radians listener must therefore bind to `.unit-btn[data-unit]`, not to
    `.unit-btn` — unscoped, every click on a graph-B function set `unit = undefined`,
    which silently threw the whole tool into radians and rewrote the range boxes
    (a −3°…360° range came back as "−0.052 to 2pi"). Fixed 2026-08-20; the same trap
    is waiting for any new button that reuses a toggle class.

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
