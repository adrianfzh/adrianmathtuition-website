# Clip bible — A Math · Partial Fractions

The series sheet every Partial Fractions clip is written and read against (SPEC-CLIP-PIPELINE.md §2b).
The writer reads it before the board plan; the blind reader reads it before scoring.
The house rules (`_house.md`) apply on top — this sheet adds only what is particular to this topic.

**Source:** the approved notes on /notes — `AM · Partial Fractions` (25 units, ids 105.xx) — pulled
with `node scripts/lessons/pull-notes.mjs`, plus the approved pitfalls from the teaching-knowledge
layer (`teaching_knowledge('AM', ['Partial Fractions'])`). Nothing in a clip may teach a method
these do not teach.
**Written:** 15 Oct 2026.

## 1. The series look (this topic only)

- Heading = the split's short name ("Two linear factors", "Repeated factor", "Long division first").
- The plan line under the question names the split form before any working
  (e.g. `A/(x−1) + B/(x+2)`) — the form is the plan.
- The split line, the "comparing numerator" line and each "Sub x = …" are each their own line.
  Never merge "combine" and "compare" into one line when the notes write them apart (105.02).
- Each "Sub x = …" line carries the note of what it kills (`x = 1 kills B(x − 1)`), `near` = the
  bracket that becomes zero.
- A long-division board (105.19) is its own board: board 1 divides, board 2 splits.
- The answer line keeps every piece — the quotient too — boxed in emerald.

## 2. Notation on the board, words in the voice

| Board | Voice says |
|---|---|
| `\frac{A}{x-1}` | "A over X minus one" |
| `\frac{C}{(x-1)^2}` | "C over X minus one, all squared" |
| `\frac{Bx+C}{x^2+x+1}` | "B X plus C, over X squared plus X plus one" |
| `(x+2)(x-1)` | "X plus two, times X minus one" |
| `x^2` | "X squared" |
| `\tfrac{5}{9}` | "five ninths" |
| `-\tfrac{29}{4}` | "minus twenty-nine over four" |
| `\therefore` | "so" |
| `\deg` / degree | "degree three over degree two" |

Letters are capitals in `say` ("A", "B", "C", "X"). Constants stay exact — fractions, never decimals.

## 3. The method and words, skill by skill

### 3.1 Two linear factors (the basic split)
- "Splitting is the reverse of combining." (105.01) Start from the combined fraction, split it back.
- "Linear factors in the denominator → one constant (A, B, …) over each factor." (105.01)
- Order of lines (105.02): **write as two fractions** → **combine into one fraction** →
  **comparing numerator** → **sub x = …** for each constant → **write out the partial fractions**.
- "Same denominator as the original — so the numerators must match." (105.02)
- The compared line "is true for every value of x" (105.02) — that is why any x may be subbed.
- Choose x to make a bracket zero: "Subbing x = 1 makes B(x − 1) become zero." (105.02)
- Worked example used: **105.02** — (5x + 1)/((x − 1)(x + 2)): 5x + 1 = A(x + 2) + B(x − 1);
  x = 1 → A = 2; x = −2 → B = 3. Answer 2/(x − 1) + 3/(x + 2).
- A factor written (1 − x) keeps its own form; sub x = 1 to zero it (105.25). −1/(x − 1) and
  1/(1 − x) are "the same thing".

### 3.2 Factorize the denominator first
- "If a quadratic in the denominator can be factorized, factorize it before splitting." (105.05)
- "Always try to factorize the quadratic before you choose the split." (105.05)
- "Three linear factors → three constants." (105.06)
- Combining: "Each constant is multiplied by the other two factors." (105.06)
- Each zeroing value "kills" the other terms: "x = −1 kills both the A and B terms." (105.06)
- Worked example used: **105.06** — (3x + 1)/((x + 2)(x² + 4x + 3)) → (x + 2)(x + 3)(x + 1);
  C = −1, A = 5, B = −4. Answer 5/(x + 2) − 4/(x + 3) − 1/(x + 1).
- Also factorize a difference of squares: 4x² − 1 = (2x − 1)(2x + 1) (105.15); and a quadratic
  written backwards, 1 + x − 2x² = (2x + 1)(1 − x) (105.25).

### 3.3 Quadratic that cannot be factorized → Bx + C on top
- "When a quadratic factor cannot be factorized (like x² + x + 1), it stays whole in the
  denominator — and the numerator on top of it must be linear, not a constant." (105.07)
- "Cannot factorize the quadratic → Bx + C on top, never just B." (105.07)
- Finding the constants (105.08): sub the zeroing value for A; then "No other value zeroes a
  bracket — x = 0 keeps the working easy"; then "Any value works now — x = 1 keeps the numbers small."
- Comparing coefficients (x² terms, constants) is also used in the notes' answers (105.1, 105.27).
- Worked example used: **105.08** — (x + 5)/((x + 2)(x² + x + 1)): x = −2 → A = 1; x = 0 → C = 2;
  x = 1 → B = −1. Answer 1/(x + 2) + (−x + 2)/(x² + x + 1).

### 3.4 Repeated linear factor
- "A factor like (x − 1)² is a repeated linear factor. It needs two terms in the split: one
  denominator without the square and one with the square." (105.11)
- "One squared factor in the question → two fractions for it in the split." (105.11)
- "The numerator is just 5 — no x terms, and that is fine." (105.12)
- "No zeroing value is left for B — sub x = 0 and use A and C." (105.12) Comparing x² also works (105.14).
- x² on its own is a repeated factor too: A/x + B/x² (105.16).
- Worked example used: **105.12** — 5/((x + 2)(x − 1)²): x = 1 → C = 5/3; x = −2 → A = 5/9;
  x = 0 → B = −5/9. Answer 5/(9(x + 2)) − 5/(9(x − 1)) + 5/(3(x − 1)²).

### 3.5 Improper fraction → long division first
- "Compare degrees. Top degree less than bottom → proper, split straight away. Top degree at
  least the bottom → improper — long-divide first to get a quotient plus a proper fraction." (105.17)
- "The degree check comes before everything else." (105.17)
- Order of lines (105.19): **check the degrees** (expand the denominator) → **divide the leading
  terms** → **divide again** → stop when "the remainder has smaller degree" → **rewrite as
  quotient + proper fraction** → split the proper fraction as in 3.1.
- "Quotient 4x − 1; remainder x − 5 stays over the original denominator." (105.19)
- "The quotient 4x − 1 is part of the answer — keep it." (105.19)
- Degree 3 over degree 3 is improper too: the quotient is a constant (105.26).
- Worked example used: **105.19** — (4x³ + 7x² − 13x − 2)/((x + 3)(x − 1)) = 4x − 1 +
  (x − 5)/((x + 3)(x − 1)); B = −1, A = 2. Answer 4x − 1 + 2/(x + 3) − 1/(x − 1).
- Given-form questions ("find A, B, C, D", 105.2, 105.21, 105.28, 105.29): the form tells you the
  quotient's shape (A, or Ax + B). Long-divide to read the quotient, then split the remainder.
  105.2 instead multiplies up and compares x²: A = 2.

### 3.6 Which split? (choosing the form)
- The three steps (105.23): **Step 1** improper → long division first. **Step 2** factorize the
  denominator fully. **Step 3** match each factor — linear → constant on top; repeated linear →
  without and with the square; unfactorizable quadratic → Bx + C on top.
- "The denominator's factors dictate the form — read them one factor at a time." (105.23)
- This clip writes forms only — no constants found. One line per factor type, from 105.23's table.

## 4. Stock phrases (the series voice)

- Opening line = the question: "Express five X plus one, over X minus one times X plus two, as
  partial fractions."
- "One constant over each linear factor." · "Comparing numerator." · "Sub X equals one — it kills B."
- "Factorize first." · "Cannot factorize — B X plus C on top." · "One without the square, one with."
- "Check the degrees first." · "Improper — long division first." · "Keep the quotient."
- The trap: one plain sentence where it bites ("A repeated factor needs both terms.").

## 5. Traps — one line each, where they bite

- **Improper, split straight away** (pitfall): bites at the first line of any fraction with top
  degree ≥ bottom. "Check degrees first."
- **Dropped quotient** (105.19, pitfall): bites on the answer line after long division. "Keep the quotient."
- **Constant B over an unfactorizable quadratic** (105.07, pitfall): bites at the split line.
  "Bx + C on top, never just B."
- **Bx + C over a quadratic that factorizes** (105.05, pitfall): bites at the split line for
  x² + 4x + 3. "Factorize first."
- **Missing middle term for a repeated factor** (105.13, pitfall): writing only A/(x + 2) +
  C/(x − 1)²; the contradiction shows later, comparing x² gives 0 = A. "One denominator without
  square & one with square."
- **Messy substitutions** (pitfall): subbing values that keep every unknown alive. "Sub values
  that make a bracket zero; only when none is left, use x = 0."

## 6. Red lines

- No model names, no "AI", no paper or school names on the board or in the voice.
- Never name any person (students hear "we").
- The notes' method, not a textbook's: the notes find constants by subbing zeroing values,
  then x = 0 / x = 1 or comparing coefficients. Never call it "cover-up" — the notes never do.
