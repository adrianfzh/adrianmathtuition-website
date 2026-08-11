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
