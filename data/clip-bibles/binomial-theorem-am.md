# Clip bible — A Math · Binomial Theorem

The series sheet every Binomial Theorem clip is written and read against (SPEC-CLIP-PIPELINE.md §2b).
The house rules (`_house.md`) hold for look, voice and red lines; this file adds the method,
words and traps for this topic only.

**Source:** Adrian's approved notes on /notes — `AM · Binomial Theorem` (46 units, ids 112.xx) —
pulled with `node scripts/lessons/pull-notes.mjs`, plus the approved pitfalls and methods from the
teaching-knowledge layer (`teaching_knowledge('AM', ['Binomial Theorem'])`). Nothing in a clip may
teach a method these do not teach.
**Written:** 15 Oct 2026.

## 1. The series look (this topic)

- Every expansion board starts with the line-up: `a = …, b = …, n = …` under the question (112.03:
  "Every expansion starts by naming these three"). That line is the plan note.
- `b` is written WITH its sign and in brackets on every term: `(-2x)^3`, never `-2x^3` (112.01).
- A full expansion with more than 5 terms is one token per line of terms, or two boards
  (write-out board, then simplify board). Never drop the write-out line to save room.
- General-term boards keep the order of 112.23 as separate lines: formula → substitute →
  separate indices → combine powers of x → equate → solve r → substitute back.
- Product questions ("constant term", "coefficient of x²") show the routes as one line each,
  then the sum line (112.16, 112.18).

## 2. Notation on the board, words in the voice

| Board | Voice says |
|---|---|
| `\binom{7}{2}` | "seven C two" |
| `{}^7C_2` | "seven C two" |
| `T_{r+1}` | "T R plus one" |
| `T_4` | "the fourth term, T four" |
| `(-2x)^3` | "minus two X, all cubed" |
| `x^{-3r}` | "X to the power minus three R" |
| `\left(\frac{1}{2}\right)^{n-3}` | "a half, to the power N minus three" |
| `\cdots` | "and so on" |

Coefficients from the calculator are said as numbers ("twenty-one"), never worked by hand.
Exact answers stay exact (fractions like minus sixty-three over eight); estimates to the dp asked.

## 3. Adrian's method and words, skill by skill

### 3.1 Expanding (a + b)ⁿ fully
- "Usually we don't memorise the formula — use the pattern instead" (112.01): first term's power
  falls by 1, second term's power rises by 1, the two powers add to n, there are (n + 1) terms.
- Line up first: compare with the general form, name a, b, n (112.03).
- Coefficients: "You never compute nCr by hand for numeric n — press nCr on the calculator" (112.02).
  The bottom number r counts how many b's are in that term.
- "The second term keeps its sign … the power hits the coefficient AND the sign AND the x" (112.01).
- Worked examples used: **112.03** — (2 + x)³ = 8 + 12x + 6x² + x³; **112.07** — (3 − 2x)⁴ =
  81 − 216x + 216x² − 96x³ + 16x⁴; **112.035** — (2 − x/2)⁴ (sign and fraction).
- Rule notes: `Pattern: a's power falls, b's power rises`; `odd power keeps the minus, even power kills it`.
- Traps: (−2x)³ = −8x³, not −2x³ (112.01, pitfall); "The minus sign belongs to b" (112.035);
  a coefficient line that does not match the expansion it produces (112.06 — cross-check).
- **"Expand as far as the third term" (or "the first N terms") = expand TERM BY TERM, never the
  general term** (Adrian, 31 Oct 2026: *"for this question, we should expand term by term all the
  way to the third term (instead of using the general term formula), and dot dot dot at the end"*).
  One line writes the expansion as the pattern gives it, ending `+ ⋯`:
  `(px² + q/x)⁶ = (px²)⁶ + ⁶C₁(px²)⁵(q/x) + ⁶C₂(px²)⁴(q/x)² + ⋯`;
  the next line(s) simplify each term in place: `= p⁶x¹² + 6p⁵qx⁹ + 15p⁴q²x⁶ + ⋯`.
  Do not work out each term as a separate sum and assemble them afterwards.
- **The order on the board, every Binomial clip** (Adrian, 31 Oct 2026, after the remakes:
  *"write down the formula first, then say what is a, b and n, say a is first term etc, then sub in,
  show the simplification"*):
  1. **The formula first**, its own line — expanding: `(a+b)^n = a^n + \binom{n}{1}a^{n-1}b +
     \binom{n}{2}a^{n-2}b^2 + \cdots`; one term: `T_{r+1} = \binom{n}{r}a^{n-r}b^r`.
  2. **Name a, b and n, each with what it is**, each its own line, lit as the voice says it:
     `a = \text{first term} = 2` · `b = \text{second term} = -\tfrac12x` · `n = 8` (or `n = ?`
     when n is the unknown). The voice says "A is the first term, two".
  3. **Substitute** into the formula, as written.
  4. **Show the simplification step by step** — each power worked out on its own
     (`(-\tfrac12x)^3 = -\tfrac18x^3`, `(px^2)^5 = p^5x^{10}`), then the numbers multiplied, then
     the term. Never jump from the substituted line to the answer.

### 3.2 First few terms, and "hence" a coefficient of a product
- "Expand each factor only up to the power you need, multiply out just the pairs that land on
  that power, and stop" (112.13). "Want x²? Every factor stops at x²."
- Factorise a quadratic in the bracket first: (2 + 3x − 2x²)⁷ = (1 + 2x)⁷(2 − x)⁷ — "Laws of
  indices: (ab)ᵐ = aᵐbᵐ. This is why parts (a) and (b) were asked first" (112.15).
- Worked example used: **112.14 → 112.15** — 1 + 14x + 84x² and 128 − 448x + 672x²;
  coefficient of x² = 1(672) + 14(−448) + 84(128) = 5152.
- Trap: "First term 2⁷ = 128, not 1 — the constant in the bracket matters" (112.14).

### 3.3 Constant term / a coefficient from a product of brackets
- "'Constant term' and 'term independent of x' mean the same thing: the term with no x in it" —
  power zero (112.17).
- "The constant term comes from every pair whose powers of x cancel … Multiply each pair, add
  them all up" (112.17). Plan the pairings first (112.41).
- Worked examples used: **112.16** — (2 + 1/(2x))²(1 − 2x)⁷: 4(1) + (2/x)(−14x) + (1/(4x²))(84x²)
  = 4 − 28 + 21 = −3; **112.18** — find k: 1(60) + k(−160) + 4(240) = −100 → k = 7.
- Trap (pitfall): taking only const × const and missing the other routes. One line per route.

### 3.4 The general term T(r+1)
- "Write the general term as (numbers) × (one power of x)" (112.22). Pull constants and sign out:
  (−1/(3x³))ʳ = (−1/3)ʳ x⁻³ʳ; then add the exponents.
- Steps (112.23): formula from the formula sheet → substitute n, a, b (sign included) → "use
  indices to separate the terms" → combine powers of x → equate the power → solve r → substitute.
- **Needing ONE particular term: write the formula, name a and b, then substitute** (Adrian, 31 Oct
  2026: *"if you need a particular term, just write the formula: T_(r+1) = (n, r) a^(n-r) b^r and
  then sub in (show what is a (first term), and b (2nd term)"*). On the board, in this order, each
  its own line: `T_{r+1} = \binom{n}{r}a^{n-r}b^r` → `a = <first term>, b = <second term, sign
  included>, n = …` → the substituted line. The formula is a board LINE, not only a side note.
  This is for a particular term (an x³ coefficient, the constant term, the middle term) — "the
  first few terms" is expanded term by term (§3.1).
- Independent term: power = 0 (112.25). Middle term: n + 1 terms, count to the middle (112.26).
- Explain-why questions: write the general power and show it is always even / a multiple of 3 /
  never 0 for an integer r (112.31, 112.312, 112.522).
- Worked examples used: **112.23** — (2x − 1/x)⁸: x^(8−2r), r = 3, T₄ = −1792x²;
  **112.25** — (x²/2 − 1/x²)¹⁰: r = 5, −63/8; **112.26** — middle term of (1/x − x²)¹⁴ = −3432x⁷.
- Rule note: `T_{r+1} = \binom{n}{r}a^{n-r}b^r`.
- Traps: "T(r+1), not T(r): r = 3 gives the 4th term" (112.22); the power hits the constant too —
  (2x)⁵ = 32x⁵ (pitfall); re-do the exponent after substituting: −14 + 21 = 7, not 8 (112.27);
  "a fractional r means that term does not exist" — say so and move on (112.22, 112.41);
  coefficient = the number only, term = number with its x (pitfall).

### 3.5 Finding n from a ratio of coefficients
- "When the power n is unknown, the calculator is useless — turn the binomial coefficients into
  algebra" (112.33): nC1 = n, nC2 = n(n−1)/(1×2), nC3 = n(n−1)(n−2)/(1×2×3).
- The five moves (112.35): "Ratio → fraction → cancel powers → cross multiply → solve → reject
  non-integers." Coefficients only — "just don't write the x".
- Worked examples used: **112.34** — (2 + x)ⁿ, ratio 2 : 3 → n(n − 7) = 0 → n = 7 (n = 0 rej);
  **112.36** — (x/2 + 2/x)ⁿ, 4th : 3rd = 40 : 3 → n = 12.
- Traps (pitfall): the constants' powers do not cancel to 1 — in 112.36 they leave 2 × 2;
  reject n = 0, negative or fractional roots ("n must be a positive integer").

### 3.6 Two unknowns by comparing coefficients
- Expand the product, group by power, then "match … x with x, x² with x²" (112.42).
- Use the stated condition to reject: "The 'q is an integer' clause exists precisely to kill the
  second root" (112.42).
- Worked example used: **112.42** — (1 + qx)(2 − px)⁵ = 32 − 80x + (176/5)x² → p = 1/5, q = −2.

### 3.7 Three terms in the bracket — substitute
- "A trinomial becomes a binomial once you bracket the tail as one object" (112.43).
- Expand (1 + x)ⁿ first, replace x with the tail, expand until the asked power only.
- Worked example used: **112.43** — (1 + x − 6x²)¹⁰ = 1 + 10x − 15x² + ….
- Trap (pitfall): y³ and higher only give x³ or more — stop at y² when you want up to x².

### 3.8 Estimating a number with an expansion
- "Match it to the given expansion by solving (2 − x/4) = 1.995 for x, substitute that x into
  the truncated expansion, and round" (112.45).
- Worked example used: **112.44** — (2 − x/4)⁸ = 256 − 256x + 112x² − 28x³; x = 0.02;
  (1.995)⁸ ≈ 250.9246.
- Traps (pitfall): x must be small — if the match gives a quadratic, take the root closest to 0
  and reject the other with a reason; check the first left-out term is far below the rounding.
  Do not use 112.51 as a worked example (its three-term estimate is not accurate to 3 dp).

## 4. Stock phrases (the series voice)

- "Name A, B and N first." · "The first power falls, the second power rises." ·
  "The minus travels inside every power." · "Odd power keeps the minus. Even power kills it." ·
  "Press N C R on the calculator." · "Only expand as far as you need." ·
  "No X means power zero." · "Every pair whose X's cancel." · "T R plus one — R is one less
  than the term number." · "Separate the numbers from the X." · "N must be a positive integer."
- The last beat says the answer in full, coefficient or term exactly as asked.

## 5. Red lines

- House red lines hold (`_house.md` §5).
- Never teach "memorise the formula" — the pattern first, the formula sheet for T(r+1) only.
- Never compute a numeric nCr by hand on the board — the calculator value is written straight in.
- Never mention that any notes contained a misprint; the board simply shows the right working.
