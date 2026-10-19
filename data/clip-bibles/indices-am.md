# Clip bible — A Math · Indices

The series sheet every Indices clip is written and read against (SPEC-CLIP-PIPELINE.md §2b).
The writer reads it before the board plan; the blind reader reads it before scoring.
The house rules (`_house.md`) hold for look, voice and red lines; this file adds the topic.

**Source:** Adrian's approved notes on /notes — `AM · Indices` (57 units, ids 108.xx and
1081.xx), pulled with `node scripts/lessons/pull-notes.mjs`, plus the approved Indices pitfalls
from the teaching-knowledge layer. Nothing in a clip may teach a method these do not teach.
**Written:** 15 Oct 2026.

## 1. The series look (topic-specific)

- Heading = the skill's short name ("Compare powers", "Split the power", "Evaluate 10ˣ").
- Powers stay as powers on the board until the last line — never a decimal mid-working.
- A subtracted power is always written in brackets on the board: `a^{(2x+2)-(3-y)}`,
  then the tidy line after. The bracket line and the tidy line are two lines.
- Two bases → two compare lines, one per base, each labelled with its base (`a:`, `b:`).
- Graph clips DRAW the graph (since 18 Oct 2026): copy `sketching-log-graphs-am` — the four basic
  shapes small in the board's corner (`sketch.inset`, each curve lit as it is named), empty axes at the
  side, the asymptote dashed on its word, the basic shape lifted from the corner onto the axes and slid
  to its place, each intercept marked as it is found, the method's steps pinned and lit in turn (a
  graph clip is the one kind that numbers its steps). Any curve in x draws: `exp(x)`, `2^x`, `-3*2^(-x)`.

## 2. Notation on the board, words in the voice

| Board | Voice says |
|---|---|
| `a^{m+n}` | "A to the power M plus N" |
| `3^{n+1}` | "three to the power N plus one" |
| `2^{2x}` | "two to the power two X" |
| `a^{-m}` | "A to the power minus M" |
| `8^{\frac{2}{3}}` | "eight to the power two over three" |
| `\sqrt[3]{8}` | "cube root of eight" |
| `e^{-x}` | "E to the power minus X" |
| `10^x` | "ten to the power X" |
| `(\text{rej})` | "reject" |

## 3. Adrian's method and words, skill by skill

### 3.1 Laws of indices; zero, negative and fractional powers
- His names for the laws: **Add power** (aᵐ × aⁿ = aᵐ⁺ⁿ), **Minus power** (aᵐ ÷ aⁿ = aᵐ⁻ⁿ),
  **Times power** ((aᵐ)ⁿ = aᵐⁿ) (108.01). These are the notes beside a step.
- "Add power, minus power, times power — and matching powers let you merge the bases." (108.01)
- Same power, different bases → multiply the bases, keep the power: 5² × 3² = 15²,
  7⁴ ÷ 5⁴ = (7/5)⁴ (108.01).
- Power zero → 1. "Negative power flips the fraction." "In a fraction power the bottom is the
  root": 8^(2/3) = (∛8)² (108.03).
- Worked example: notes silent — use the bank solution's method.
- Trap (pitfall): 2ᵐ × 3ᵐ = 6²ᵐ. Adding powers needs the SAME base; matching powers merge
  the bases and the power stays put.

### 3.2 Compare powers to find two unknowns
- "Tidy first, compare after." Each side becomes one power of each base; matching bases carry
  matching powers. Two bases give two equations — solve simultaneously (108.05).
- Order of moves (108.06): do the power first ("times power") → group the same bases into one
  fraction → divide: minus the powers, keep the brackets → tidy up → compare powers of each
  base → solve simultaneously.
- Change to the same base first when the bases differ: 4ʸ = (2²)ʸ, 9ʸ = 3²ʸ (108.08, 108.09).
- Worked example used: **108.06** — (aˣ⁺¹ / b^(y−2))² × b^(x+2) / a^(3−y) = a⁹b
  → a^(2x+y−1) b^(x−2y+6) = a⁹b¹ → x = 3, y = 4.
- Also in the notes: **108.08** (2ᵐ3ᵐ = 6ᵐ, m = 3) and **108.09** (two equations, two bases,
  x = 2, y = −2).
- Trap (108.07, pitfall): the dropped bracket. a^(5x) ÷ a^(2−x) is a^(5x−(2−x)) = a^(6x−2),
  not a^(4x−2). "Minus a bracket flips every sign inside."
- Trap (108.05, pitfall): "a bare b on the right means b¹, not nothing." Write the invisible 1
  before comparing.

### 3.3 Split the power, then factorise
- "Split the power" — peel the constant off the exponent, the reverse of Add power:
  a^(x+k) = aˣ · aᵏ (108.13).
- "Sums or differences of near-identical powers? Split, factorize, cancel — then press the
  calculator." (108.13)
- "Looks complicated — change everything to the same base first." (108.16)
- Divisibility: split, factorise, and show "13 times an integer — that is divisibility." (108.17)
- Worked example used: **108.15** — (3ⁿ⁺¹ − 3ⁿ⁻²) / (3ⁿ⁻¹ − 3ⁿ⁺²) → 3ⁿ(3¹ − 3⁻²) / 3ⁿ(3⁻¹ − 3²)
  → (26/9) / (−26/3) = −1/3.
- Also in the notes: **108.16** (change base first, answer 14), **108.17** (divisible by 13:
  13 × 3ⁿ⁻¹).
- Trap (pitfall): splitting with a plus. 3ⁿ⁺¹ is 3ⁿ × 3¹, never 3ⁿ + 3. A split is always a
  product.

### 3.4 Evaluate 10ˣ without finding x
- "Don't chase x — it's usually not a nice number." Treat 10ˣ as one block (108.22).
- Key fact on the first line: 10ˣ = 2ˣ × 5ˣ (also 14ˣ = 2ˣ7ˣ, 18ˣ = 2ˣ3²ˣ) (108.22).
- "Group each prime base on its own side, then glue 2ˣ · 5ˣ back into 10ˣ." (108.22)
- Order of moves (108.23): key fact → group base 5 to one side (minus the powers) → simplify
  the power → split the power of 2 → cross multiply → rebuild 10ˣ and make it the subject.
- Worked example used: **108.23** — 2ˣ⁺² × 5²ˣ⁻¹ = 5ˣ⁻¹ → 2ˣ · 2² = 1/5ˣ → 10ˣ · 4 = 1
  → 10ˣ = 1/4.
- Trap (pitfall): solving for x first. The question asks for the block; rebuild it.

### 3.5 Solving: same base, compare powers
- Method 1 "(from E Math)": rewrite both sides with the same base, then compare powers
  (108.26).
- "Same base both sides — the powers must match." (108.27)
- Worked example used: **108.27** — 5ˣ⁺² = 25ˣ⁻¹ = 5²ˣ⁻² → x + 2 = 2x − 2 → x = 4.

### 3.6 Solving by substitution (a quadratic in disguise)
- Method 2, when the equation can't collapse to one power a side: "Two terms where one power
  is double the other? Substitute u = aˣ and solve the quadratic." (108.26)
- "2²ˣ has twice the power of 2ˣ — a quadratic in disguise." (108.28)
- Order of moves (108.28, 108.29): change to one base → split off any constant in the power →
  substitute → solve the quadratic → bring back x.
- The letter: his worked examples write "Let a = 2ˣ"; when the question names u, use u.
- "You are solving for x, not a — bring back x." Each value needs its own line: 2ˣ = 2 = 2¹ ⇒ x = 1.
- Worked example used: **108.28** — 4ˣ − 3(2ˣ) + 2 = 0 → a² − 3a + 2 = 0 → a = 2 or 1
  → x = 1 or x = 0.
- Also in the notes: **108.29** — 4²ˣ⁺¹ − 5(2²ˣ) + 1 = 0 → 4a² − 5a + 1 = 0 → x = 0 or −1.
- Trap (108.31, pitfall): answering the u-values. u = 1 or 2 are not x; solve 2ˣ = u.
- Trap (pitfall): dropping the split-off constant. 4²ˣ⁺¹ = 2⁴ˣ · 2² = 4a², not a².
- Trap (pitfall, 108.32): a negative root. 2ˣ is always positive — 2ˣ = −2 is "(rej)".

### 3.7 Exponential graphs: the four basic shapes
- y = aˣ grows "faster and faster"; the x-axis is the asymptote; it passes through (0, 1)
  (1081.01).
- "Minus in front of the graph flips in the x-axis; minus in front of x flips in the y-axis;
  both minuses flip twice." (1081.02)
- "Most importantly, learn the SHAPE of the graphs." The numbers in front and the base "do not
  alter the shape" — "it is the minus sign that matters." (1081.04)
- Fractions first: rewrite (1/4)ˣ = 4⁻ˣ so the shape is obvious (1081.05).
- Intercepts: "Sub x = 0" for y; "Sub y = 0" gives e²ˣ = 0 — "(no solutions)".
- Worked example used: **1081.04** — y = 3e²ˣ: shape of eˣ, y-intercept 3, no x-intercept.
- Also in the notes: **1081.05** — y = −3(2)⁻ˣ flipped twice through (0, −3); (1/4)ˣ = 4⁻ˣ
  through (0, 1).

### 3.8 Shifting exponential graphs up and down
- For y = ke^(±x) + c: "draw the basic curve first, then shift it by c" — +c up, −c down; the
  asymptote moves from y = 0 to y = c (1081.08).
- "Write the constant last so the structure is clear": 1 + 5(2⁻ˣ) = 5(2⁻ˣ) + 1 (1081.11).
- "Re-find the y-intercept by subbing x = 0 into the FULL equation — and check y = 0 for an
  x-intercept (often no solution)." (1081.08)
- Worked example used: **1081.09** — y = 3eˣ + 1: asymptote y = 1, y-intercept 4,
  eˣ = −1/3 has no solutions.
- Also in the notes: **1081.1** (y = −2e⁻ˣ − 3, asymptote y = −3, through (0, −5)).
- Trap (pitfall): taking logs of 2⁻ˣ = 0 or of a negative. An exponential is never zero or
  negative — write "no solutions".

## 4. Stock phrases (the series voice)

- "Add power. Minus power. Times power." · "Same power — multiply the bases."
- "Tidy first, compare after." · "Two bases give two equations."
- "Minus a bracket flips every sign inside." · "A bare B is B to the power one."
- "Split, factorise, cancel." · "Don't chase X — rebuild the block."
- "A quadratic in disguise." · "We are solving for X, not U — bring back X."
- "Two to the power X is always positive." · "The numbers don't change the shape."

## 5. Red lines (topic-specific)

- Adrian's two methods only for equations: same base, or substitution. Never take logs to solve
  an Indices clip's equation — logs are the Logarithms series.
- Never reach for a calculator before the powers have cancelled ("only numbers remain —
  calculator time").
