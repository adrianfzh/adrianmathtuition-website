# SPEC — The red pen: annotating a marked page the way Adrian does

**Status:** agreed 5 Sep 2026 from Adrian's own red-pen vetting of Kassandra's TYS 2021 P1
and a JC paper (screenshots in the 5 Sep session). Bug fixes shipped the same day (bot
commit "the four things Adrian saw"); the pen itself is **phase 2, behind a flag, trialled on
one paper before any student sees it.** Owner of the standard: Adrian. Builder: the bot's
marker (`ai/paper-marker.js` prompt) + overlay (`ai/photo-overlay.js` placement,
`ai/annotate.js` drawing).

> Doctrine step 1. This is the spec the marker follows verbatim. Change it here, in the
> open, then change the prompt.

## 0. What Adrian said, in one line each

- Notes beside the working, *just* beside, saying exactly why THAT mistake, beat a neat
  column at the side — even though the column is neater.
- Circle the mistake and write the correct thing right next to it.
- Then **continue from the student's own working** to show how they could have finished,
  instead of a full solution from scratch.
- Strong advice is allowed and wanted: *"must know how to solve trig equations!"*
- Missing brackets: draw them in and say "missing brackets" — no mark lost.
- "Careless" is a real category and very common.
- Green-pen (second-colour) work is the student's own later correction — not marked. The
  colour decides, never the amount: a page written wholly in green is wholly corrections
  (Adrian, 9 Sep 2026).
- Notes must be plain and to the point, in the student's own numbers, never obscure.
- Solutions: only for the parts that lost marks, only where that part's working is, once;
  in the blank space when there is any, **together with** the quadrant figure; and never
  with the last word orphaned on its own line.

## 1. Inputs

The marker's per-page JSON (`MARK_JSON_SPEC` in `ai/paper-marker.js`): `lines[]` with
verdicts, `parts[]` with marks, `correct.full_solution_latex`. Plus, from 5 Sep 2026:

| field | on | meaning |
|---|---|---|
| `lines[].notation_slip` | a **correct** line | ≤ 60 chars: the slip and the right form ("missing brackets: write lg(5×3^(x+1))"). Shipped. |
| `lines[].is_second_pen` | any line | second ink colour = later self-correction → neutral, no credit. Shipped. Since 9 Sep 2026 the PIXELS are scanned first (`lib/ink-colour.js`: green fraction + the bands it sits in) and the reader is told "green ink in bands …" before it reads; `annotation_debug[].ink_scan` records it, the desk shows a watch-out when a green page was credited (`computeAutoHold`, "green ink on page N was not treated as a correction"). Categorical since 9 Sep 2026: green/red/purple are the correction pen by hue, even when they cover the whole page; a part whose only standing work is green scores 0 and is flagged (`correction_pass` + `uncertainty.notes`). |
| `lines[].error_type` | a wrong line | one of the **nine** kinds (concept, arithmetic, transfer, sign, rounding, units, misread, incomplete, **careless**). Shipped. |
| `lines[].slip_token` | a wrong line | the exact wrong token as written, ≤ 24 chars ("+48", "lg 5", "4(3/2)"). Shipped 8 Sep 2026 — a base field on every path since 9 Sep (`applyPenLineFields`). |
| `lines[].fix_short` + `fix_kind` | a wrong line | ≤ 20 chars, what belongs EXACTLY where `slip_token` is ("3(3/2)", "−8x", "x + 2"); `fix_kind` `replace` \| `insert`. Shipped 9 Sep 2026 (Adrian: "write the correct number beside the circle") — base fields. |
| `lines[].notation_slip.insert` | a correct line with a missing symbol | ≤ 4 chars, the symbol itself ("dx", "°", "+C"); `span_token` is then the text the symbol should FOLLOW, so the pen writes it in at the gap and points there. Shipped 9 Sep 2026 (Denise Q4: "arrow should be pointed at the space that dx should be"). Existing runs show it only after a re-mark. |
| `lines[].why_short` | a wrong line | phase 2 — ≤ 12 words, why, in the student's numbers ("52.56 is already cm — no ×100") |
| `parts[].verdict_line` | a part that lost marks | phase 2 — ≤ 8 words in Adrian's voice, from the phrase bank (§5) |
| `parts[].continuation` | an attempted part that lost marks | phase 2 — `{ from_line_index, steps_latex[≤6], final_latex }`: the corrected line and the next steps **in the student's notation**, ending at the answer |

## 2. Output on the page — placement rules, in priority order

1. **At the line.** Tick/cross beside the ink (unchanged). A wrong line's `fix_short`
   goes **right beside the mistake**; its `why_short` on the same row if it fits, else the
   row below, with the short leader. The side column is the **fallback**, never the first
   choice (Adrian, 5 Sep: beside beats neater).
   **Which line (9 Sep 2026).** The ✗ sits on the line where the error is MADE — the
   first line that is wrong on its own terms — never on a later line that merely inherits
   the value. Alessi's AM 2021 P2 Q10: "Gradient = (0 − 0)/(2π/3 − 0) = 3/(2π)" is the
   wrong line (a zero numerator cannot give 3/(2π)); the next line "y = 3/(2π) x" only
   carries it and is correct under ECF. The ✗, the kind label, the ring and the fix all
   land on the gradient line; the equation line gets no ✗ unless it errs anew. Adrian:
   "the gradient calculation is wrong, but no cross there." The originating-line rule in
   the marker's prompt (`ai/paper-marker.js` "THE ✗ GOES WHERE THE ERROR IS MADE") is
   what places it; `dedupeKindLabels` then writes the kind once, at that topmost ✗.
2. **The circle.** Ask placement for a box round `slip_token` only. Draw the circle only if
   the box lies inside the line's box, is under 60% of its width and under 1.3× its
   height. Otherwise **underline the whole line** and write the fix beside it. A circle in
   the wrong place is worse than none — it is never a guess. **Every arrow lands on the
   ring's edge** (9 Sep 2026 — `ringEdgeToward`, `aimLeader(…, ring)`): the kind label's
   leader, the note's leader and the fix's leader all stop at the ellipse, never inside the
   digits and never on the ✗. With no ring, the head stops at the line's top or bottom edge
   above/below the token. The fix is written beside the ring as "3(3/2) · careless".
3. **Missing brackets.** `notation_slip` prints beside the ✓ in teaching ink, and when the
   overlay can box the span (`span_token`) a red `(` `)` pair is drawn round it. Shipped.
   **Missing symbol** (9 Sep 2026): with `insert` set, the symbol is written in red at the
   span's end with a caret and the note's arrow points at that gap, not at the tick.
4. **The verdict line.** One per lost part, red, with a bracket along the wrong lines'
   right edge, in Adrian's voice. Never more than one per part; never on a full-marks part.
5. **Continue from here.** For an attempted part that lost marks, print the
   `continuation` in the blank space under that part — header "From your line …" — and
   **not** the full solution. The full solution stays only for a part left blank or scored
   zero. Built-in check: the continuation is printed only if `final_latex` equals the
   part's correct answer; otherwise nothing is printed and the full solution is used.
6. **Solutions.** Only the parts that lost marks (shipped 1 Sep), only the parts this
   page still holds after reconcile (shipped 5 Sep), once per question. Blank space first,
   footer second. The quadrant/ASTC figure travels **with** the solution block — same
   territory, placed right after it — and falls to the footer only together with it.
   Footer wrapping never leaves a one-token last line.
7. **Second pen.** Green/red/purple lines get nothing drawn and earn nothing; the part's
   summary says once: "green-pen corrections not counted — marked on your original".
   The colour decides, never the amount (9 Sep 2026, Alexis's 2023 P2 Q4(a): thirteen
   green lines were credited 5/5 as "the page's main pen"): a whole page or part in
   green is a page of corrections — scored 0 for absence of standing work, with
   `correction_pass` filled and an `uncertainty.notes` line so the desk flags it.
8. **Chip captions** are plain text: a part label never carries `$…$`; strip it, and never
   let the model put a description in `label`.

## 2b. Next on the pen (agreed 5 Sep evening, not built)

- **A missing sign or symbol is drawn in, not ringed.** Shipped: when the fix is a lone
  "−", "+" or bracket and the token box is trusted, the symbol is written at the token's
  left edge. A wrong value is written just above its ring (Adrian's "(−4)" → "16").
- **Skipped questions get their solution in the blank space.** Today a part with no ink
  has no region, so its solution falls to the footer. The overlay should ask for the box
  of the PRINTED question text for a not-attempted part and write the solution beneath
  it, where the student would have worked (Sijia's Q7).
- **Solutions read like Adrian's.** Each step of a skipped part's solution carries its
  reason in words before the numbers: "c is the centre line: c = (2 + (−8))/2 = −3";
  "period = 2π/b, the amount of x for one cycle; from the graph, period = π/2". Rule added
  to the marker's prompt.
- **Drawing on the printed diagram.** Adrian draws the centre line at c, labels a, and
  marks 2 and −8 on the axis so the student sees where c and a live. Design: ask
  placement for the boxes of the printed features (the max point, the min point, the
  axes), then draw the dashed line at the midpoint height, the label, and the axis ticks
  from those boxes; fail closed like a ring. Same for sign tables: a cross inside the
  wrong cell needs cell boxes.

## 3. Writing rules for every note (the clarity rule)

- One idea per note. ≤ 12 words at the line; ≤ 25 in the column; ≤ 8 for a verdict.
- Use the student's own numbers and symbols ("52.56 is already cm", not "check the units
  of the number you divided").
- Name the exact slip, then the fix. Never a paragraph, never a lecture, never a
  restatement of the question, never marker's vocabulary ("transfer") — write "copied
  wrongly".
- A note that could sit under any question is wrong. If it does not mention this line's
  own content, delete it.
- **No universal laws.** "Percentages must be multiplied, not added" is not always true and
  teaches nothing here (Adrian, 5 Sep, Q14 GNI). Say what THIS step should have been, with
  these numbers: "a 5.56% fall is ×0.9444: 103.63 × 0.9444 = 97.87, not 103.63 − 5.56".
- Strong is fine ("must know …!"). Sarcasm, blame and "always"/"never" about the student
  are not.

## 4. Red lines (never)

- Never change a mark from this layer. Everything here is display.
- Never draw a glyph on a neutral, crossed-out or second-pen line.
- Never leave the line where the error is made unmarked while a downstream line carries
  its ✗ (9 Sep 2026, Alessi Q10's gradient line).
- Never print a solution for a full-marks part, or for a part this page does not hold.
- Never a circle without a passing box. Never a continuation that does not reach the
  answer. Never a verdict line off the approved phrase bank without Adrian's sign-off.

## 5. Adrian's worked examples (the phrase bank seeds)

From his red pen, 5 Sep 2026:

| where | student wrote | Adrian wrote |
|---|---|---|
| Q8(b) nature of stationary point | `dA/dx > 0` as the test | "To determine nature of stat. pts, use d²A/dx² (2nd derivative)" — beside the wrong line |
| Q9(c) shoelace | `+48` inside the bracket | circled `+48`: "minus in between, plus within brackets" |
| Q10(b) trig | `sin 2θ = 1/√5` | "positive or negative? which quadrant?" pointing at the line; a bracket over the block: "must know how to solve trigo equations!"; an arrow from `tan 2θ = −½` down to "basic angle = tan⁻¹ ½" |
| Q12(a) logs | `lg 5×3^(x+1)` | drew the brackets in, in red: "missing brackets" — full marks kept |
| Q12(b) logs | `lg x lg 3 / lg 9` | "lg x / lg 3 = 2 lg x / lg 9, not lg x lg 3 / lg 9" |
| JC Q9(a) discriminant | factorised instead of discriminant | beside it: "quadratic graph > 0 ⇒ graph above x-axis ⇒ discriminant < 0" |
| JC Q8(b) Argand | `i·→BC = →BA` | complex numbers are not vectors: `i(z_C − z_B)`, never `i·→BC` |
| JC Q13(a) explain | "no solutions for x, hence no stationary point" | **ruled 5 Sep: give the mark** — a non-zero constant numerator makes the reason plain; the marker's prompt now says so, and Kiara's run was overridden to 3/3 |

Phrase bank (approved so far): "must know how to solve trig equations!", "which quadrant?",
"positive or negative?", "use the 2nd derivative for nature", "missing brackets",
"minus in between, plus within brackets", "careless!", "read the question again",
"show the reason", "don't divide — factorise". Anything new goes on the desk for a tick
before it reaches a student.

## 6. Gate and phases

- **Flag:** `MARKING_PEN_V2=1` on Fly turns on the phase-2 fields and drawing. **On since
  5 Sep 2026** (Adrian: "able to do it if confidence is high?" → yes, with the gate below).
- **Confidence gate, per page:** the pen's reach follows the rung that placed the marks.
  Whole-page line pass → rings, drawn-in brackets and verdict braces. Per-question retry →
  fix labels only. Coarse rung → nothing beyond phase 1. A ring or bracket is also dropped
  when its mark landed far from the token. Continuations and notes are text and ride every
  rung.
- **Trial done 5 Sep:** Kassandra's TYS 2021 P1 re-marked with the pen on (73/90, same as
  the 3 Sep run); pages sent to Adrian. Known: crowding on dense columns; the side strip
  overran the edge on the trial's low-resolution pages (production pages draw on the
  high-resolution original).
- **Side-strip note placement (11 Sep 2026):** a strip note with a known wrong line
  sits LEVEL with that line, so its arrow is a short hop; only a note with no aim
  (nothing attempted, a whole-part verdict) still sits under the part's score chip.
  Adrian, on Isabelle's Q26: "the side annotations can be written closer to the
  error, so that the arrow need not be drawn so long" — the 29 Aug chip-anchor rule
  had parked every note under its chip, a page above the error on a long part. Bot
  `ai/annotate.js` (the `stripCandidates` anchor), commit 7ca9e24; the pen bench's
  `leaders-short` check measures the drop.
- **A bracket or ring encloses only what is wrong (11 Sep 2026):** a note that
  asks the student to ADD something never encloses correct text. Missing units →
  the whole final answer is bracketed and the units sit at its side; a missing
  conclusion or reason → nothing is bracketed, the note goes beside the tick; a
  correct phrase ("for all x") is never inside a bracket or ring. Adrian, on
  Alessi's returned A Math 2021 P1 sheet: "no need to put brackets around 9/4 …
  brackets around √3π/2 + 9/4 then put units at the side" and "for all x is
  correct … student may be misled to think that statement is wrong". Bot
  `ai/paper-marker.js`, commit 1b16bf7 — the marker's `notation_slip.span_token`
  contract.
- **Log + alarm:** `job_runs` slug `pen-v2-trial` for each trial render; the desk's
  calibration page gets a "pen matches Adrian" column when the trial starts.

## 7. Shipped 5 Sep 2026 (phase 1, live on the bot)

- Verdict-owned glyphs (no crosses on cancelled work, no Gemini-typed marks).
- Per-part glyphs on the coarse rung + per-question line retry (no more unmarked parts).
- Per-photo solution cut after reconcile (each part printed once, where it lives).
- `notation_slip` beside the tick; `is_second_pen`; the `careless` kind (bot + site).

## 8. Shipped 9 Sep 2026 (Alexis's EM + Denise's AM screenshots)

Bot commits 1eb6296 · 14801e5 · 9a976a1 · 2a59302 · 445aabc · 1fa7e89; site 1bc31b8a.

- **Arrows land on the mistake.** Ring-edge aim for every leader (kind label, note, fix);
  the no-ring fallback stops at the line's edge; a wrong Answer line's ✗ sits beside the
  student's value (`answerLine` — the ink walk ends at a 1¼-line gap, so the printed
  "[2]" is never "the end of the writing").
- **The fix beside the ring** — `fix_short`/`fix_kind` are base fields; "3(3/2) · careless".
- **The missing symbol drawn in** — `notation_slip.insert` + `span_token` for dx / ° / +C.
- **Typeset labels** — a kind label whose correction has `text_latex` is set in KaTeX
  ("calculation error — $19\pi y^3 = …$") when it fits, else plain; `$…$` no longer leaks
  into plain labels (`splitMathRuns` strips delimiters on short delimiter-like runs).
- **Crowded rows keep their label** — a second, 4½-line search before a kind label is dropped.
- **Solutions in the lost part's space** — the blank-space solution tries the band under the
  part that lost marks first (Denise Q9(b) — was written under (c)).
- **Row ticks** — a whole-question tick on a multi-line correct answer is split into one tick
  per written line (`rowTicks`; Alexis Q13/Q14 "little marking done").
- **Venn shading figure** — `diagram.kind: "venn"` (`lib/figures/venn` verify → `buildVennSvg`)
  draws the correct shading beside a shading question (Alexis Q17(a)).
- **Green ink by the pixels** — `lib/ink-colour.js` scan + hint before the read; desk watch-out.
- **Verified by dry-run renders**, not on live runs: `scripts/pen-dryrun.cjs` in the bot repo
  redraws a stored run's page with FRESH placement and uploads stubbed to a local folder
  (Adrian rejected a live redraw on 9 Sep). Placement varies run to run — twin lines such as
  a final line and its Answer-line echo can swap rows — so judge a fix on two renders.

## 9. Placement — where a mark lands, and why it lands there twice (9 Sep 2026)

Adrian: "why does gemini line placement varies between renders? … what do you
suggest to fix the problem, and also be more efficient if a remark is necessary?"
→ the four-step plan, built the same day. The failure it answers: on Alexis's
2023 P1 Q12(b) two lines carried the same text (the final line and its copy on
the printed Answer rule); asked "where is the line that says X?" the model had no
way to tell them apart and the whole question's marks slid a row between renders.

1. **Stored placement** (`lib/annotation-store.js`). The line pass returns its
   boxes (normalised, per `line_index`); the pack keeps them, every annotation's
   pixel `bbox` + pen fields, the part regions and the image `space` (~3 KB a
   page). `reusableGrounding(pack)` → `annotateAndUpload(…, { reuse })` re-derives
   the glyphs from the CURRENT lines (rung 0 of `annotateToBuffer`,
   `glyphsFromStoredBoxes`): an override or a pen change applies; unchanged, the
   page is pixel-identical (0 of 10.3 M pixels moved on the harness). Readers:
   the desk redraw (`ai/reannotate-page.js`), a page re-mark (`enqueuePaper`
   keeps `previous_annotation_debug`; `remarkRun` passes `reusePlacement` for
   every page not re-read). Before this, `trimAnn` kept only `*_percent` fields
   and every redraw re-asked Gemini.
2. **Rows first** (`ai/row-place.js`, rung 0b). One call per photo lists every
   ROW of writing — box, transcription, hand/print/mixed. OUR matcher aligns the
   marker's lines to those rows: order-preserving, similarity-scored (normalised
   text, Levenshtein + containment), skips free, matches below 0.5 forbidden —
   the way diff aligns two lists, so identical texts on adjacent rows resolve by
   ORDER. Part regions still come from the coarse part call (run in parallel);
   rings from one crop call for the lines that carry a slip. Portrait pages
   without sketch features; `PLACEMENT_ROWS=0` turns it off; anything short of
   60 % of the markable lines falls through to the old ladder unchanged.
3. **The pixel gate** (`row-place.js pixelGate`, then `filterLineBoxes`): a box
   goes on the page only if it holds ink (≥ 0.4 % dark, ≥ 15 px), an Answer line
   only if it sits on a printed rule (`whitespace.js ruleMask`, dotted rules
   included), one mark per row, reading order kept. Evidence WE compute — a model
   switch changes how often we fall back, never where a mark lands.
4. **Temperature 0 + a fixed seed** on the row call and the crop call (`visionGenerate`
   `seed`). Hygiene: repeatable on the same image, prompt and model version.

**Measured** (`scripts/pen-dryrun.cjs`, `PEN_DRYRUN_PLACER=rows|line`,
`PEN_DRYRUN_REPEAT=2` — two draws per path per page; "moved" = pixels that
differ between the two draws):

| page | rows path: placed / markable | moved (rows) | moved (old ask) |
|---|---|---|---|
| Alexis 2023 P1 p7 — the swap page | 14/14 | 0.000 % | 0.629 % |
| Alexis 2023 P2 p13 — dense two-column | 21/21 | 0.233 % (two different scans) | 0.316 % |
| Alexis 2023 P1 p8 | 11/11 | 0.008 % | 0.042 % |
| Denise 2021 P1 p12 | 9/9 | 0.052 % | 0.283 % |

Every mark on p13 was checked on the render: the Answer-line values on the
printed rule, not the identical line in the working; a line level with another
in the next column kept; the two identical last lines each with their own ✓.
What the dense page taught (worker on Opus, 9 Sep 2026): most of the loss was
the SCAN, not the matching — the model wrote an orphan quote before a key on
nearly every row, and partway down stopped transcribing and sent boxes alone.
`parseRows` now reads the reply four ways and keeps the most rows; a scan with
under 70 % of rows transcribed is re-asked once with the failure named (a new
seed alone returned the same degraded reply — temperature 0 is deterministic).
The remaining variance is the scan's row granularity (27 vs 40 rows on one
page: fractions split or not), which the merge pass absorbs.
ON by default on the bot since the evening of 9 Sep 2026; `PLACEMENT_ROWS=0`
turns it off. The old line pass still runs for spreads, sketch pages, and any
page the rows path cannot place at 60 %+.

**What a re-mark costs now.** One page: the Mac reads that page, every other
page draws from its stored boxes, no model placement. Override / re-issue / pen
change: no model call. A never-marked page: one row call + one part-region call
(+ one crop call when a line carries a slip), the printed-text crop check gone.

Not done: sketch features on drawn graphs (keep the feature-box ask), spreads
(the old per-half pass), snapping a box's vertical extent to the ink rows inside
it (would remove the residual jitter — `annotate.js _inkRowBands` has the pieces).

## 12 Sep 2026 — two rulings from Rainie's set 3 papers

- **No ticks after the ✗ in a part that scored nothing.** Q2(b)(iii) (P2, 0/2) and Q11(b) (P1, 0/4): working built on the wrong object came back ticked. Marker rule "A PART THAT SCORED NOTHING CARRIES NO TICKS AFTER ITS ✗" + the deterministic `quietZeroParts` (bot `ai/marker-assemble.js`): on a page with a 0/n part, a 'correct' line after a wrong line carrying a zero code — or, since the same evening, a code-less wrong line whose error kind is the zero part's kind — becomes 'neutral' until an earning code, a line opening the next part ("(c) …") or the next question. Lines before the ✗ keep their ticks; marks never move. Golden fixtures `em-set3-p2-zero-part-ticks`, `am-set3-p1-zero-part-no-code`.
- **A fix with a power, index or surd is typeset.** Q7(a) (P2): "(−2)^r" was drawn as typed. `fix_short` carrying an exponent/index/surd/fraction is ONE `$…$` span (prompt), and `texFromPlainMath` (`ai/pen-math.js`, called from `applyPenLineFields` before the cap) converts a plain-typed one; prose, bare values, signs and existing spans are untouched.

