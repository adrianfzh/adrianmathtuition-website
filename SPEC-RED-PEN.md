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
- Green-pen (second-colour) work is the student's own later correction — not marked.
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
| `lines[].is_second_pen` | any line | second ink colour = later self-correction → neutral, no credit. Shipped. |
| `lines[].error_type` | a wrong line | one of the **nine** kinds (concept, arithmetic, transfer, sign, rounding, units, misread, incomplete, **careless**). Shipped. |
| `lines[].slip_token` | a wrong line | phase 2 — the exact wrong token as written, ≤ 12 chars ("+48", "lg 5") |
| `lines[].fix_short` | a wrong line | phase 2 — ≤ 20 chars, what belongs there ("−48", "( )", "which quadrant?") |
| `lines[].why_short` | a wrong line | phase 2 — ≤ 12 words, why, in the student's numbers ("52.56 is already cm — no ×100") |
| `parts[].verdict_line` | a part that lost marks | phase 2 — ≤ 8 words in Adrian's voice, from the phrase bank (§5) |
| `parts[].continuation` | an attempted part that lost marks | phase 2 — `{ from_line_index, steps_latex[≤6], final_latex }`: the corrected line and the next steps **in the student's notation**, ending at the answer |

## 2. Output on the page — placement rules, in priority order

1. **At the line.** Tick/cross beside the ink (unchanged). A wrong line's `fix_short`
   goes **right beside the mistake**; its `why_short` on the same row if it fits, else the
   row below, with the short leader. The side column is the **fallback**, never the first
   choice (Adrian, 5 Sep: beside beats neater).
2. **The circle.** Ask placement for a box round `slip_token` only. Draw the circle only if
   the box lies inside the line's box, is under 60% of its width and under 1.3× its
   height. Otherwise **underline the whole line** and write the fix beside it. A circle in
   the wrong place is worse than none — it is never a guess.
3. **Missing brackets.** `notation_slip` prints beside the ✓ in teaching ink, and when the
   overlay can box the span (`span_token`) a red `(` `)` pair is drawn round it. Shipped.
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
- **Log + alarm:** `job_runs` slug `pen-v2-trial` for each trial render; the desk's
  calibration page gets a "pen matches Adrian" column when the trial starts.

## 7. Shipped 5 Sep 2026 (phase 1, live on the bot)

- Verdict-owned glyphs (no crosses on cancelled work, no Gemini-typed marks).
- Per-part glyphs on the coarse rung + per-question line retry (no more unmarked parts).
- Per-photo solution cut after reconcile (each part printed once, where it lives).
- `notation_slip` beside the tick; `is_second_pen`; the `careless` kind (bot + site).
