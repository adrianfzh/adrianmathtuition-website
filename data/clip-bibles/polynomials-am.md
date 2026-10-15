# Clip bible — A Math · Polynomials

The series sheet every Polynomials clip is written and read against (SPEC-CLIP-PIPELINE.md §2b).
The house rules (`_house.md`) hold for look, voice and red lines; this file adds the topic.

**Source:** Adrian's approved notes on /notes — `AM · Polynomials` (45 units, ids 601.xx and
602.xx), plus the approved methods and pitfalls from the teaching-knowledge layer
(`teaching_knowledge('AM', ['Polynomials'])`). Nothing in a clip may teach a method these do
not teach.
**Written:** 15 Oct 2026.

## 1. The series look (topic-specific)

- Every board that uses a theorem starts with **"Let f(x) = …"** as its own line — the notes
  name the polynomial first, every time (601.1, 601.15).
- **"What do we sub?"** is its own line: `x − 2 = 0 ⇒ x = 2`, before any substitution (601.1).
- A long division is ONE token per stage (the whole division layout shrinks to fit); one stage
  per line: first quotient term → multiply and subtract → next term → remainder (601.05).
- Equations that will be combined carry their labels `…(1)`, `…(2)` on the board (601.18).
- The final line of a division writes the identity: `f(x) = (x − 1)(5x + 8) + 6`.

## 2. Notation on the board, words in the voice

| Board | Voice says |
|---|---|
| `f(2)` | "F of two" |
| `f\left(-\tfrac{1}{2}\right)` | "F of minus a half" |
| `Q(x)` | "Q of X" — never "Q times X" |
| `\equiv` | "is identically equal to" |
| `x^3` | "X cubed" |
| `ax+b` | "A X plus B" |
| `\dots(1)` | "equation one" |
| `\Rightarrow` | "so" |
| `(\text{rej})` | "reject" |

## 3. Adrian's method and words, skill by skill

### 3.1 Long division and Dividend = Divisor × Quotient + Remainder
- The identity first: **Dividend = Divisor × Quotient + Remainder** (601.03).
  "This one identity is the root of every remainder and factor trick in this topic."
- Degrees: quotient = dividend − divisor; remainder = divisor − 1. "A linear divisor leaves a
  constant remainder; a quadratic leaves ax + b." (601.03)
- Moves (601.05): divide the leading terms → multiply back → subtract, bring down → repeat →
  "Nothing left to bring down — that's the remainder." Then record as the identity.
- "Subtract the whole line by flipping every sign." (601.06)
- A polynomial has whole-number powers only; 1/x or a root of x is "NOT a polynomial" (601.01).
- Worked example used: **601.05** — (5x² + 3x − 2) ÷ (x − 1) → 5x² + 3x − 2 = (x − 1)(5x + 8) + 6.
- Traps: missing one sign flip on the subtracted line (pitfall) — bracket the whole line.
  A skipped power: write `0x²` as a placeholder (602.14, pitfall).

### 3.2 The Remainder Theorem
- Rule name on the board: **Remainder Theorem: f(x) ÷ (x − a) → remainder f(a)**;
  for (ax − b), remainder f(b/a) (601.08).
- "Set the divisor = 0" to find what to sub: x + 2 → x = −2; 2x − 1 → x = ½.
- Why it works: sub x = a "kills the Q(x) term, leaving just the remainder" (601.08).
- Worked example used: **601.1** — 4x⁴ − x³ − 5x + 1 ÷ (x − 2): x = 2, f(2) = 64 − 8 − 10 + 1 = 47.
- Traps: subbing the printed sign — x + 2 is NOT x = 2 (601.19); 2 − x gives x = 2, not −2
  (601.16); 2x + 1 gives x = −½, not −1 (pitfall). It gives only the remainder, not the quotient.

### 3.3 The Factor Theorem and finding unknowns
- Rule name: **Factor Theorem: (x − a) is a factor ⇔ f(a) = 0** (601.12).
- Two uses: **check** a factor (is f(a) = 0?) and **find unknowns** (set f(a) = 0, solve).
- "'Exactly divisible by x − 2' is just code for f(2) = 0." (601.12)
- A given remainder: set f(a) equal to it, "not 0" (601.18). Two facts → two equations →
  solve simultaneously.
- "3 less than": "f(−2) is smaller, so add 3 to it" → `f(−2) + 3 = f(−1)` (601.17).
- Worked examples used: **601.15** — exactly divisible by x − 2 → f(2) = 0 → 14 − 7k = 0, k = 2.
  **601.18** — factor x − 3 and remainder 15 at x + 2 → 3a + b + 8 = 0, b = 2a − 13 → a = 1, b = −11.
- Traps: the +3 on the wrong side of "3 less than" (pitfall); setting a remainder to 0 when it
  is given as a number.

### 3.4 Solving cubic equations
- "Factorize first, then set each factor to zero — same plan as a quadratic." (601.22)
- Three moves: **find the first factor by trial** (test small values until f(a) = 0) →
  **divide** to (x − a)(quadratic) → **factorize the quadratic** and solve each bracket.
- Shortcut for the divide: **compare coefficients** — read the x² coefficient off the x³ term
  and the constant off the constant term, then the middle from a middle coefficient (601.22).
- Worked example used: **601.24** — 2x³ + 3x² − 11x − 6 = 0: f(2) = 0 →
  (x − 2)(2x² + 7x + 3) = (x − 2)(2x + 1)(x + 3) → x = 2, −½, −3.
- Trap (601.25, pitfall): reading x = 3 off (x + 3). "Set each bracket to 0 and watch the signs."

### 3.5 Sum and difference of cubes
- **a³ + b³ = (a + b)(a² − ab + b²)**, **a³ − b³ = (a − b)(a² + ab + b²)** —
  "Memorize these two — they are not in the formula sheet." (601.27)
- "Same sign first, opposite in the middle, plus b²." Middle coefficient is 1, never 2.
  The second bracket won't factorize further.
- Move one: "Cube root each term to reveal the cubes" — write `(2a)³ − (9b)³` as its own line.
- Worked example used: **601.29** — 16x³ + 1458 = 2(8x³ + 729) = 2[(2x)³ + 9³]
  = 2(2x + 9)(4x² − 18x + 81).
- Trap (pitfall): cube-rooting 16 directly. "Factorize out the common factor first."
  A bracket can be a cube: (x + 6)³ + x³ has a = x + 6, b = x (601.3).

### 3.6 Polynomial identities: sub in values, compare coefficients
- An identity (≡) holds for all x, so two tools (602.01): **1. Sub in suitable values** —
  "pick values that make brackets 0" to knock out all but one unknown. **2. Compare
  coefficients** of each power and the constant term.
- "Any value works — we just pick ones that make things 0." "Most questions mix both: sub the
  roots first, then compare the highest power for what's left."
- A spare value (x = −1) or x = 0 is used to check or isolate the last unknown (602.04).
- Worked example used: **602.03** — 3x³ + Ax² − 17x − 12 ≡ (x + 1)(x − 3)(Bx + C):
  x = −1 → A = −2; x = 0 → C = 4; compare x³ → B = 3.
- Traps: arbitrary values like x = 5 that zero nothing (pitfall). From q² = 9 write
  `q = ±√9` first, then reject the forbidden branch: "q = −3 (rej)" (602.05).

### 3.7 Dividing by a quadratic
- Rule line: **f(x) = divisor × Q(x) + (ax + b)** — the remainder is ax + b because "degree of
  remainder = degree of divisor − 1" (602.08).
- Route 1, long division: always works. Route 2, the identity: if the divisor factorizes, sub
  its roots — "the Q(x) term dies both times, leaving two equations in a and b."
- No real roots (x² + 1): "give Q(x) the right degree and compare coefficients" (602.12).
- "You never need to find Q(x) itself." (602.08)
- An expression already written as (divisor) × (quotient) + Cx + D: the remainder is read
  straight off as Cx + D (602.15, 602.17).
- To make it divisible: add minus the remainder — remainder −25 → "add 25" (602.14).
- Worked example used: **602.1** — x³ + 2x² − 4x − 8 ÷ (x² − 9) = (x − 3)(x + 3)Q(x) + ax + b:
  x = 3 → 25 = 3a + b; x = −3 → −5 = −3a + b → a = 5, b = 10, remainder 5x + 10.
- Traps: a constant remainder r instead of ax + b (pitfall); Q(x) of the wrong degree — "count
  degrees first" (pitfall); reading Q(x) as Q times x (pitfall).
- The concept's name, when a heading needs one: "Using f(x) = divisor × quotient + remainder".

### 3.8 Constructing a polynomial from roots and factors
- "Each root r gives a factor (x − r), and the leading coefficient multiplies the whole
  product." (602.18)
- Not enough roots for the degree → "top up with an unknown factor": (x − 1)(x − 2)(ax² + bx + c).
- "The constant term of the product is just the brackets' constant terms multiplied together."
- Worked example used: **602.2** — factors (x + 1), (x − 2), (x + k), x³ coefficient −2:
  f(x) = −2(x + 1)(x − 2)(x + k); f(4) = 20 → −20(4 + k) = 20 → k = −5; roots −1, 2, 5.
- Trap (602.18): "Wrap the coefficient around everything — a stray −2 on the end is the
  classic slip."

## 4. Stock phrases (the series voice)

- Opening line = the question: "Find the remainder when four X to the four … is divided by X minus two."
- "Let F of X be the polynomial." · "Set the divisor to zero." · "What do we sub?" ·
  "Exactly divisible means the remainder is zero." · "Sub the root, the Q of X part vanishes." ·
  "Compare the X cubed terms." · "Set each bracket to zero." · "Same sign first, opposite in
  the middle."
- The trap, one sentence where it bites: "X plus two means X equals minus two." ·
  "A quadratic divisor leaves A X plus B."

## 5. Red lines (topic-specific)

- The house red lines hold. Never a student's name from a worksheet note.
- No synthetic division (the notes never teach it) — long division, the Remainder and Factor
  Theorems, substituting values and comparing coefficients only.
