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
3. **Missing brackets.** `notation_slip` prints beside the ✓ in teaching ink. Shipped.
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
| JC Q13(a) explain | "no solutions for x, hence no stationary point" | **open** — Adrian to rule whether SEAB accepts it without "2 ≠ 0" (marker gave B0) |

Phrase bank (approved so far): "must know how to solve trig equations!", "which quadrant?",
"positive or negative?", "use the 2nd derivative for nature", "missing brackets",
"minus in between, plus within brackets", "careless!", "read the question again",
"show the reason", "don't divide — factorise". Anything new goes on the desk for a tick
before it reaches a student.

## 6. Gate and phases

- **Flag:** `MARKING_PEN_V2=1` on Fly turns on the phase-2 fields and drawing. Off by
  default. The marker still emits the shipped fields (notation_slip, is_second_pen,
  careless) with the flag off.
- **Trial:** one already-marked paper (Kassandra's TYS 2021 P1, the 3 Sep run) re-rendered
  with the flag on; both versions side by side on the desk; Adrian counts where the new pen
  matches his own on the parts he annotated. Three papers with his tick → flag on for all.
- **Log + alarm:** `job_runs` slug `pen-v2-trial` for each trial render; the desk's
  calibration page gets a "pen matches Adrian" column when the trial starts.

## 7. Shipped 5 Sep 2026 (phase 1, live on the bot)

- Verdict-owned glyphs (no crosses on cancelled work, no Gemini-typed marks).
- Per-part glyphs on the coarse rung + per-question line retry (no more unmarked parts).
- Per-photo solution cut after reconcile (each part printed once, where it lives).
- `notation_slip` beside the tick; `is_second_pen`; the `careless` kind (bot + site).
