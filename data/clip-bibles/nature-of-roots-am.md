# Clip bible — A Math · Nature of Roots

The series sheet every Nature of Roots clip is written and read against (SPEC-CLIP-PIPELINE.md §2b).
The writer reads it before the board plan; the blind reader reads it before scoring.
House rules (look, voice, red lines shared by every topic) are in `_house.md` — not repeated here.

**Source:** Adrian's approved notes on /notes — `AM · Nature of Roots` (57 units, ids 103.xx) —
pulled with `node scripts/lessons/pull-notes.mjs`, plus the approved pitfalls and method card from
the teaching-knowledge layer. Nothing in a clip may teach a method these do not teach.
**Written:** 15 Oct 2026.

## 1. The series look (this topic only)

- Every board names its condition early: the line that writes `b^2 - 4ac > 0` (or `= 0`, `< 0`,
  `\geq 0`) carries the question's own words as its note ("tangent", "two distinct points").
- `a`, `b`, `c` get their own line, after the quadratic is arranged and before the condition.
- A range answer ends on the graph step: one line with the two roots, then the answer line.
  The board has no inequality sketch of its own — the note says "roots −6 and 3; > 0 is outside".
- An always-positive / always-negative board writes the `a` condition on its own line near the
  top, and the "(rej)" on the answer line.

## 2. Notation on the board, words in the voice

| Board | Voice says |
|---|---|
| `b^2 - 4ac` | "B squared minus four A C" |
| `b^2 - 4ac > 0` | "B squared minus four A C is greater than zero" |
| `\geq` / `\leq` | "is greater than or equal to" / "is less than or equal to" |
| `\pm` | "plus or minus" |
| `(-8)^2` | "minus eight, squared" |
| `4(2)(5-k)` | "four times two times, five minus K" |
| `(k-8)(k+2) > 0` | "K minus eight, times K plus two, is greater than zero" |
| `(\text{rej})` | "reject" |
| `\therefore` | "so" |
| `(3k-1)^2` | "three K minus one, all squared" |
| `\ldots (1)` | "equation one" |

The quantity is "B squared minus four A C" in the voice; the word "discriminant" may be said once,
the way the notes name it (103.03).

## 3. Adrian's method and words, skill by skill

### 3.1 What a root is, and the three cases
- "A **root** is a solution to an equation" (103.01). "'How many roots?' is just asking 'how many
  solutions?'"
- The number **inside the square root** of the quadratic formula decides: positive → two answers;
  zero → "± 0 changes nothing, one answer"; negative → "cannot square root it, no solutions"
  (103.02).
- b² − 4ac > 0: 2 real roots · = 0: 1 real root · < 0: no real roots (103.03).
- "'Real' just means the root is a real number — one real root just means one root." (103.03)
- Worked example used: **103.02** — x² + 6x + 5 = 0 (16, two roots), x² + 12x + 36 = 0 (0, one
  root), 3x² − 2x + 5 = 0 (−56, none).

### 3.2 Words into conditions (the translation table)
- From **103.42**:
  - distinct real roots · cuts at two points · intersects at two points → b² − 4ac > 0
  - equal real roots · tangent · touching → b² − 4ac = 0
  - no real roots · do not intersect · do not meet → b² − 4ac < 0
  - real roots (can be 1 or 2) · meets → b² − 4ac ≥ 0 (103.19, 103.53)
- "Translate the words first — after that, every question is the same four conditions."
- "Equal roots means only 1 root" (103.15).

### 3.3 Line meets curve: sub, arrange, then b² − 4ac
- "A line meeting a curve is **simultaneous equations** in disguise." (103.05)
- His order (103.06, 103.08, 103.16): label the equations (1) and (2) → "Sub (1) into (2)" →
  arrange "x² term, then x term, then constant" → identify a, b, c → apply the condition → solve.
- "Each intersection point is one root — so b² − 4ac counts the meeting points." (103.05)
- "Can't solve for x because of the unknown constant? Good — b² − 4ac never needed x." (103.05)
- "Multiply both sides by −1 to make the x² term positive." (103.08)
- A range: "This is now a quadratic inequality — finish it with a graph." (103.08)
- Worked examples used: **103.06** — y = 2x + k tangent to y = 2x² − 6x + 5 → 2x² − 8x + 5 − k = 0,
  64 − 40 + 8k = 0, k = −3. **103.08** — y = px − 1 meets y − x = xy twice → p(p − 4) > 0,
  p < 0 or p > 4. **103.16** — y = 12x − 2p misses y = (p + 3)x² → p < −6 or p > 3.
- A curve that is not a quadratic after subbing (a cubic, 103.51): notes use gradients instead —
  "the line has gradient −1", set dy/dx = −1. Notes silent beyond that one try — use the bank
  solution's method.
- "Meets at one point but not a tangent" → a vertical line (103.41 c).

### 3.4 Already a quadratic: an equation with roots
- "No line and curve here — no simultaneous equations needed." Identify a, b, c straight away
  (103.11), after arranging everything on one side (103.13, 103.14).
- "Divide by 4 before factorising — smaller numbers." (103.11)
- Worked example used: **103.11** — (m + 2)x² − 2mx + 1 = 0, two distinct roots →
  (m − 2)(m + 1) > 0, m < −1 or m > 2.
- When a is a letter, the notes add "m ≠ 0, else the equation is not quadratic" (103.13, 103.46).

### 3.5 Always positive / always negative (curve above or below the x-axis)
- "That takes two things at once" (103.2):
  - always positive: a > 0 **and** b² − 4ac < 0
  - always negative: a < 0 **and** b² − 4ac < 0
- "The x-axis is the line y = 0." Sub (1) into (2) with y = 0 (103.21).
- "A minimum point means the curve opens upwards." (103.21)
- Write "opens upwards" / "opens downwards" in working — "smiley/frown face" is the informal
  name, said aloud at most, never written (103.2, 103.25).
- Order (103.21, 103.24): read the scenario → write the a condition → arrange, name a, b, c →
  b² − 4ac < 0 → divide by the negative and flip → graph → reject with the a condition.
- "Never negative" uses ≤ 0 for the crossing condition (103.4). "Above the line y = x + 1" means
  move everything to one side first (103.29); "> 4" means move the 4 over (103.28).
- Worked examples used: **103.21** — y = (k − 6)x² − 8x + k, no x-intercept, minimum point →
  (k − 8)(k + 2) > 0 → k < −2 (rej) or k > 8 → k > 8. **103.24** — k(x² + 2x + 3) − 4x − 2
  always negative → k < −2.

### 3.6 Show questions: prove the sign
- "In a **show** question nothing is unknown — you must prove the discriminant has the right sign
  for every value of the parameter." (103.3)
- "You cannot just sub into b² − 4ac = 0 — you have to *prove* it equals 0." (103.3)
- Start from b² − 4ac = …, sub in, expand, simplify. "At this stage it is hard to tell the sign"
  → "One technique is to complete the square." (103.32, 103.33)
- Clear fractions first: "Clearing denominators first makes a, b, c easy to read." (103.31)
- "Real combines both cases — show b² − 4ac ≥ 0." (103.32)
- End with a statement: "Once proved, conclude with a statement." (103.31)
- Worked examples used: **103.31** — y = x/k + k/2 tangent to y² = 2x → 4x² − 4k²x + k⁴ = 0,
  b² − 4ac = 16k⁴ − 16k⁴ = 0. **103.32** — 3x(x + k) + x = −k → 9k² − 6k + 1 = (3k − 1)² ≥ 0.
  **103.33** — two curves → 4(p + 5/2)² + 15 > 0.

## 4. Stock phrases (this topic)

- "A tangent just touches the curve — one intersection, one root."
- "Sub one into two." · "Arrange: X squared term, then X term, then constant."
- "Now name A, B and C." · "Sub A, B, C in, then solve for K."
- "Dividing by a negative number flips the inequality sign."
- "Roots minus six and three; greater than zero is outside the roots."
- "Always positive needs two conditions." · "Opens upwards, so reject K less than minus two."
- "Start from B squared minus four A C — never assume it."
- "A square is never negative." · "Conclude with a statement."

## 5. Traps — one line each, where they bite

- **One condition only** (103.25, pitfall) — always positive/negative: giving both ranges from
  b² − 4ac < 0. Bites on the answer line; the a condition rejects one range.
- **a, b, c off an unarranged equation** (pitfall, 103.16) — (p + 3)x² = 12x − 2p read as is gets
  b and c with wrong signs. Bites at the a, b, c line: arrange first.
- **Assuming what to show** (103.3, pitfall) — writing b² − 4ac = 0 (or ≥ 0) at the top of a show
  question. Bites on the first working line: start from b² − 4ac = (expression).
- **Dividing by a negative, sign kept** (103.16, pitfall) — −8p² − 24p + 144 < 0 ÷ −8. Bites on
  the divide line: flip in the same breath.
- **Equal roots as two roots** (103.15, pitfall) — equal roots = 1 root = b² − 4ac = 0. Bites at
  the condition line.
- **"Real" as > 0** (103.19, 103.39, pitfall) — real roots and "meets" are ≥ 0; > 0 drops the
  endpoints. Bites at the condition line.
- **Tangent vs two points** (method card) — tangent = 0, two distinct points = > 0. Bites at the
  condition line.

## 6. Red lines (topic)

- Never "smiley face" or "frown face" written on the board — "opens upwards / downwards".
- Never solve for x in a line-and-curve range question — the condition never needed x.
