# Adrian's Annotation Style Guide

Extracted from hand-made worksheets ("AM 16 Trigonometry 01 Trigonometric Ratios",
"A REV 2026 8 Binomial Normal and Sampling Distributions"). Follow exactly.

## Document skeleton

**Topical teaching notes** (per concept section, numbered `1. 2. 3.`):
1. Concept explanation — short prose, diagrams/tables where they carry the idea.
   Bold sub-headings. Key facts underlined. Memory aids welcome (ASTC-style diagrams,
   "memorize this!" tables) and casual asides in parentheses/italics
   ("well, special because their ratios are nice fractions").
2. `Example Na / Nb` — worked examples, full annotated solution in a BORDERED BOX.
3. `Practice N` — 2–4 bank questions, numbered, sub-parts a. b. c., answers as
   right-aligned orange `[Ans: (a) … (b) …]` immediately after each question.
   Stretch questions labelled `(Optional)`.
4. Student instructions in bold where needed: "Memorize the table before attempting
   this practice. Do not refer to the table."

**Revision set**:
1. Section opens with SUMMARY BOXES (bordered tables): notation, formulas,
   conditions — terse, not prose. Italic usage notes inside the box
   ("If a question asks for assumptions… usually we use point 3 and 4 (state in
   the context of the question)").
2. `Example  [<source citation> modified]` — real paper questions with per-part
   marks `[2]` right-aligned, then boxed annotated solution.
3. No practice sections needed unless asked — revision sets are example-driven.

**Headers/footers**: header line 1 "ADRIAN'S MATH TUITION" (or "A Level Revision"
for JC rev sets), line 2 = subject. Title: topic number + name, main title bold
CAPS. Footer: "<LEVEL>: <Topic Name>".

## The annotation vocabulary (signature moves — use ALL of these)

1. **← arrows with terse reasons** after a step, on the same line:
   `← apply formula`, `← rationalize`, `← multiply by 2 to remove the fraction`,
   `← just read from the triangle`, `← note the variance of 5 = 0`,
   `← form an expression for W`, `← compare with part (ii), 12Y is different`.
   Terse = 3–8 words. Never a full sentence essay.
2. **Labelled fraction parts**: stack `← opposite` / `← hypotenuse` beside
   numerator/denominator when introducing a ratio.
3. **Italic strategy opener** as the first line of a solution (the "how to think"):
   "You can draw a diagram for this question. You need to know which quadrant…",
   "The distributor pays less than $3000 if at most 2 of the 4 shipments are
   compensated."
4. **Explicit variable definitions**: "Let X be the number of cherry flavoured
   candies, out of 30 candies in a packet." — always "out of …" context.
5. **Common Error blocks**: underlined heading `Common Error:`, then the WRONG
   working in grey, with a one-line reason it fails
   (`← the calculation of variance will be incorrect`).
6. **Alternative Method blocks**: underlined heading `Alternative Method: …`,
   full working.
7. **Calculator syntax lines** (grey): `← normalcdf: lower = 191.5, upper = 192.4,
   μ = 325, σ = √7.68`; `← binomcdf: n = 30, p = 0.2, X-value = 5`.
8. **Colour semantics** (docx RGB):
   - Grey `808080`: secondary/expansion working, calculator syntax, restated
     question fragments, faded "read from triangle" repeats
   - Red `C00000`: values carried forward from earlier parts (the thread the
     student must see), critical formula reminders
   - Blue `0070C0`: key logical statements/translations
     ("P(a box is rejected) = P(X>2) = 0.1", "⟹ P(Y=y+1) > P(Y=y)" with meaning)
   - Orange `843C0C`: answers in practice keys ONLY
9. **Underline** decisive conclusions mid-solution: "∴ B must lie in the 3rd quadrant."
10. **Bold "Note that …"** callouts for sign/domain traps.
11. **Exact → 3sf convention**: show `= 0.46552 ≈ 0.466`; bold the key intermediate
    value when it gets reused.
12. **Answer requirement notes** where papers demand them: "In this question you
    should state the parameters of any normal distributions you use." (bold, before
    the example).

## Tone rules

- Speak TO the student, imperative and direct: "Draw a diagram.", "Do not refer to
  the table.", "Ask your tutor how to remember all the formulas."
- Confident, occasionally playful, never verbose. One idea per line of working.
- A student should be able to learn by reading alone — every non-obvious step gets
  a reason, every trap gets a callout.

## docx house style (matches create-worksheet skill)

Times New Roman; body 9.5pt (`size: 19`), title 12pt bold centred; 1.5 line spacing
(`line: 360`); A4; margins top 2cm / bottom 1cm / sides 2.5cm; marks tab-right at
`8789` DXA as `[n]`; answers right-aligned orange `843C0C`.
Solution boxes = single-cell Table, border `{ style: SINGLE, size: 4, color: "000000" }`,
cell margins ~100 DXA, width = content width (9070 DXA).
Summary boxes = bordered tables, bold mini-headings per cell.
Math as Unicode text (√, ², ⁿ, ∈, ⊂, ∩, ∪, ∅, ξ, ′, ≤, −, ×, ⟹, ∴, ←).
Never use "\n" inside a TextRun — one Paragraph per line of working.
Annotations: separate TextRun on the same Paragraph, 2 spaces + `← reason`
(grey/red/blue per colour semantics; default black for primary reasons).
Validate with the docx skill's validate.py, then convert to PDF → images and
visually inspect EVERY page before presenting.

**Readability (BINDING, Adrian 2026-08-30 — see teaching_style/FEEDBACK.md):**
- One idea per line: explanation prose never runs multiple thoughts into one
  continuous paragraph; each sentence starts its own line.
- Worked-solution equation steps go ONE PER LINE with the `=` signs vertically
  aligned (OMML eqArr aligned on `=`, or borderless two-column LHS|=RHS, or a
  fixed tab at the `=` column). Derivation chains (`a = b = c`) break into
  aligned `= …` continuation lines. Maths lines stand alone — prose introduces
  the step on the line above, never beside it.


## Adrian's own explanations — captured 2 Sep 2026 (BINDING on every surface)

He rewrote two worked examples by hand (a "draw a suitable line to solve"
question and a chained-percentages question) and asked for the difference to
be followed in notes, worked examples, sheets and the bot's answers alike. The
full diff is in `teaching_style/FEEDBACK.md` § "How Adrian explains". The rules:

- **Grey italic principle lines open the box** (general → the trick → applied
  to this question, 2–3 lines), then a blank line, then **auto-numbered steps**
  that each say what you are doing before the lines that do it.
- **The general rule sits inside the step, green bold, in square brackets**:
  `y = [the expression on the other side of the equal sign] is the graph you
  need to draw`.
- **Every move gets a grey `←` naming its TARGET** — `← divide by −2 to obtain
  x³ − 3x²`, `← add 2 to obtain x³ − 3x² + 2 (which is the graph drawn)`.
- **Colour = meaning, identical in the principle line and the working**:
  blue `0432FF` = the expression being matched; red `EE0000` = the piece added
  or changed to complete the match; green `00B050` = the rule and the result it
  produces; bold + underline = the BASE in a percentage chain ("From 2019 to
  2020 → 2019 is the base (100%)"); black bold `←` = a plain instruction
  ("← write percentages as decimals"). Grey `808080` Common Error working, ONE
  red `C00000` warning line — not two.
- **Percentages**: the conversion facts with their reason first ("A rise of 12%
  multiplies by 1.12 (because 100% + 12% = 112% = 112/100 = 1.12 ← write
  percentages as decimals)"), the unit declared in bold, one block per base,
  full-word equation lines ("exports in year 2020 = 100 × 1.12 = 112"), the
  formula in words before the numbers.
- **Headings name the skill as an action, Title Case**: "Find the Required Line
  To Draw To Solve An Equation Graphically".
- **"never" is not used** — "not", "does not", "is not".
- **No source citations on anything a student reads**; 1.5 line spacing inside
  boxes too; practice items auto-numbered.
