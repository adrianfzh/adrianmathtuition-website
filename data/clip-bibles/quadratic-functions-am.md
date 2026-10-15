# Clip bible — A Math · Quadratic Functions

The series sheet every Quadratic Functions clip is written and read against
(SPEC-CLIP-PIPELINE.md §2b). The writer reads it before the board plan; the blind reader reads it
before scoring. The house rules (`_house.md`) cover the shared look, voice and red lines.

**Source:** the approved notes on /notes — `AM · Quadratic Functions` (18 units, ids 600.xx) —
pulled with `node scripts/lessons/pull-notes.mjs`, plus the approved pitfalls from the
teaching-knowledge layer. Nothing in a clip may teach a method these do not teach.
**Written:** 15 Oct 2026.

## 1. The series look (this topic only)

- Heading = the skill's short name ("Complete the square", "Turning point", "Always positive").
- Completing the square takes four lines when the coefficient of x² is not 1:
  factorise out → add and subtract inside → collapse → multiply back. Never merge two.
- The "magic term" sits on the board as `\left(\tfrac{b}{2}\right)^2` with the number in it
  (`\left(\tfrac{3}{2}\right)^2`), not as its value — the student sees halve-then-square.
- The turning point is written as a coordinate `(h, k)` on its own line, with "minimum" or
  "maximum" beside it.
- The notes' sketches are authored figures and cannot be reproduced. A sketch clip uses a
  graph-morph (a parabola is a polynomial, so it can be drawn) or says the shape in words:
  "opens upwards, lowest point (2, −4)".

## 2. Notation on the board, words in the voice

| Board | Voice says |
|---|---|
| `f(x)` | "F of X" |
| `f(1)` | "F of one" |
| `x^2` | "X squared" |
| `(x - \tfrac{3}{2})^2` | "X minus three over two, all squared" |
| `\left(\tfrac{5}{4}\right)^2` | "five over four, squared" |
| `a(x - h)^2 + k` | "A, bracket X minus H, squared, plus K" |
| `(h, k)` | "the point H, K" |
| `\ge` / `\le` | "is at least" / "is at most" |
| `\pm` | "plus or minus" |
| `\approx` | "is about" |
| `\text{(shown)}` | "shown" |

Fractions stay exact (`-\tfrac{17}{8}`); only a quadratic-formula answer goes to 3 s.f.

## 3. The method and words, skill by skill

### 3.1 f(x) notation (600.01)
- "f(x) is just another name for y" — y = x + 4 and f(x) = x + 4 mean the same thing.
- f(1) means replace every x with 1. "No need to write 'sub x = 1' — the bracket already tells you."
- Margin words: "Whatever sits in the bracket replaces every x."

### 3.2 Completing the square, coefficient of x² is 1 (600.03, 600.04, 600.09)
- The recipe: "add and subtract the square of half the coefficient of x."
- "Half the x coefficient, then square it": −3 → −3/2 → (3/2)².
- "ADD it first, then subtract it at the same time — adding and subtracting the same thing
  changes nothing, so the expression keeps its value."
- "The first three terms ARE the completed square" — they fold into (x − 3/2)².
- Then combine the leftover constants: −9/4 + 2 = −1/4.
- Worked example used: **600.03** — x² − 3x + 2 = (x − 3/2)² − 1/4.
- Rule note for the add-and-subtract line: `halve, then square: (b/2)²`.
- Trap (pitfall): squaring the whole coefficient (adding b²). "Divide the coefficient of x by 2,
  THEN square it."

### 3.3 Completing the square, coefficient of x² not 1 (600.04, 600.06, 600.10)
- "The recipe works only when the coefficient of x² is 1. If it isn't: factorize it out first,
  complete the square inside the brackets, then multiply back."
- The notes factor the number out of all three terms, constant included:
  2x² + 5x + 1 = 2(x² + 5/2 x + 1/2). Clips do the same. (A pitfall note says "x² and x terms
  only" — the approved notes do not; follow the notes.)
- A negative coefficient comes out with its minus: "Pull out −4 so x² has coefficient 1."
- Worked example used: **600.06** — 2x² + 5x + 1 = 2[(x + 5/4)² − 17/16] = 2(x + 5/4)² − 17/8.
- Trap (600.04, pitfall): multiplying back into the square only. "Multiply the 2 back in" —
  into BOTH terms, square AND constant: −17/16 × 2 = −17/8, not −17/16.
- Trap (pitfall): halve-and-square straight on 2x² + 5x + 1 without factorising first.

### 3.4 Turning point and max / min value (600.07, 600.11, 600.12)
- "In completed square form, the turning point is (h, k) — just read the numbers."
- a > 0: opens upwards, (h, k) is a **minimum**. a < 0: opens downwards, (h, k) is a **maximum**.
- "The max/min VALUE of y is k."
- Worked example used: **600.11 / 600.12** — x² − 16x + 20 = (x − 8)² − 44: minimum value −44,
  when x = 8.
- Trap (600.07, pitfall): "(x+3)² means h = −3, not +3." Compare with (x − h): the sign flips.
- Trap (600.11, pitfall): giving the x-value. "The minimum value is the y-value at the turning
  point, not the x-value … x = 2 is just *where* that happens."

### 3.5 Sketching a quadratic (600.09, 600.10)
- Order of moves: complete the square → read the turning point → x-intercepts, sub y = 0 →
  y-intercept, sub x = 0.
- x-intercepts from the completed form: (x − 2)² = 4 → x − 2 = ±2 → x = 0 or 4.
- Worked example used: **600.09** — y = x² − 4x = (x − 2)² − 4: turning point (2, −4),
  axes at (0, 0) and (4, 0), minimum value −4 — "the y-value, not the 2".
- Maximum case: **600.10** — y = −4x² − 24x − 35 = −4(x + 3)² + 1, maximum point (−3, 1).

### 3.6 Always positive / never less than (600.13, 600.14, 600.15, 600.17, 600.22)
- "To prove a quadratic is always positive, complete the square."
- "Two green lights needed: a positive AND k positive — miss either and it's not 'always positive'."
- The key line: "A square is never negative": (x − 2)² ≥ 0, so (x − 2)² + 3 > 0 (shown).
- Graph version: "the curve opens upwards with its lowest point above the x-axis".
- "Never less than" uses the same form: the minimum value k is the bound (600.15: 47/4).
- "Never greater than" uses a < 0: −(x − 1)² ≤ 0, so the expression is at most 4 (600.22).
- Worked example used: **600.14** — x² − 4x + 7 = (x − 2)² + 3 ≥ 3 > 0.
- Rule note for the key line: `a square is never negative: (x − h)² ≥ 0`.

### 3.7 Showing two curves intersect (600.16)
- Complete the square on each curve, then compare turning points.
- 2x² + 20x − 2 = 2(x + 5)² − 52, minimum (−5, −52); −x² − 10x + 3 = −(x + 5)² + 28,
  maximum (−5, 28).
- "Same x-coordinate, and one curve opens upward from below while the other opens downward
  from above, so the two curves intersect."
- Trap (pitfall): 2[(x + 5)² − 26] is 2(x + 5)² − 52 — multiply back into BOTH terms.

### 3.8 Word problems: which tool when (600.18, 600.19, 600.21)
- "Match the question word to the tool":
  **Initial value** → sub t = 0. **A specific height** → set the expression equal to it and
  solve (formula if it won't factorize). **Max or min** → complete the square, read off the
  turning point.
- "Let the question word pick your tool — 'initial', 'reaches', or 'greatest' each point to a
  different method."
- Worked example used: **600.19** — h = 16t − 4t² + 1: initial height 1 m; h = 5 at t ≈ 0.268 s
  or 3.73 s; h = −4(t − 2)² + 17, so maximum height 17 m at t = 2 s.
- Trap (pitfall): setting h = 0 for the initial value. "'Initial' means the start, so set t = 0."
- Trap: the greatest height is k (17 m), the time is h (2 s) — two different answers.

## 4. Stock phrases (the series voice)

- Opening line = the question: "Express Y equals X squared minus three X plus two in the form …".
- "Halve the coefficient of X, then square it." · "Add it, then subtract it — nothing changes." ·
  "The first three terms fold into a square." · "Factorise so the coefficient of X squared is one." ·
  "Multiply back into both terms." · "Read the turning point straight off." ·
  "The minimum value is the Y-value." · "The bracket sign flips." ·
  "A square is never negative." · "Initial means T equals zero."
- The last beat says the answer in full, with the value and where it happens.

## 5. Red lines

- House red lines apply (`_house.md` §5).
- Never complete the square on a coefficient that is not 1 — factorise first, every time.
- Never state a max/min value as the x-coordinate.
- Never draw the notes' authored figures as if copied; a graph-morph or words only.
