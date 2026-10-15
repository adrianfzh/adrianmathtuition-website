# Clip bible — A Math · Surds

The series sheet every Surds clip is written and read against (SPEC-CLIP-PIPELINE.md §2b).
House rules (look, voice, red lines) are in `_house.md` — this file adds only Surds.

**Source:** Adrian's approved notes on /notes — `AM · Surds` (42 units, ids 107.xx) — pulled
with `node scripts/lessons/pull-notes.mjs`, plus the approved pitfalls from the
teaching-knowledge layer (`teaching_knowledge('AM', ['Surds'])`). Nothing in a clip may teach a
method these do not teach.
**Written:** 15 Oct 2026.

## 1. The series look (Surds only)

- Every surd keeps its root sign on the board: `3\sqrt{2}`, never `3·1.414`.
- A big surd broken down gets its own line: `\sqrt{4}\sqrt{5}` before `2\sqrt{5}` (107.06).
- Multiplying by the conjugate is its own line, the fraction × `\frac{\text{conj}}{\text{conj}}`
  written out in full, before any expanding (107.14).
- The denominator's difference of squares is shown: `(\sqrt{5})^2 - (\sqrt{3})^2` before `5 - 3`.
- The trap circle goes on the token where it bites: the `(\sqrt{2})^2`, the middle sign of the
  conjugate, the sign of a term crossing `=`, the false root.

## 2. Notation on the board, words in the voice

| Board | Voice says |
|---|---|
| `\sqrt{5}` | "root five" |
| `3\sqrt{2}` | "three root two" |
| `\sqrt[3]{16}` | "cube root of sixteen" |
| `(\sqrt{2})^2` | "root two, squared" |
| `\sqrt{x+5}` | "root of X plus five" |
| `\frac{2}{\sqrt{3}}` | "two over root three" |
| `\frac{7}{3}\sqrt{10}` | "seven thirds root ten" |
| `a + b\sqrt{3}` | "A plus B root three" |

Surd answers stay exact — never a decimal unless the question asks.
The words for the parts: **rational part** (the plain number) and **surd part** (the √ term).

## 3. Adrian's method and words, skill by skill

### 3.1 Add, subtract, multiply, divide surds (107.01)
- "Adding and subtracting only works on 'like' surds": `2\sqrt{5} + 7\sqrt{5} = 9\sqrt{5}`.
- For × and ÷, "work the numbers inside the surds": `\sqrt{a}\sqrt{b} = \sqrt{ab}`,
  `\frac{\sqrt{a}}{\sqrt{b}} = \sqrt{\frac{a}{b}}`.
- "Number times number, surd times surd": `2\sqrt{3} \times 5\sqrt{7} = 10\sqrt{21}`.
- "A surd times itself equals the number inside: √2 × √2 = 2."
- Expanding brackets: "Just expand as usual — four products" (107.03).
- Worked example used: **107.03** — `(2\sqrt{2} + 5\sqrt{3})(1 - 3\sqrt{2})`
  = `2\sqrt{2} - 12 + 5\sqrt{3} - 15\sqrt{6}`. "No like surds left to collect."
- Traps (pitfalls): √2 + √5 is NOT √7 — only same-inside surds collect.
  3√2 × 4√5 is 12√10 — keep the two channels apart.

### 3.2 Simplest form: break big surds into small surds (107.05)
- "If the number inside the surd is big, break it into a perfect square times something":
  `\sqrt{18} = \sqrt{9 \times 2} = \sqrt{9}\sqrt{2} = 3\sqrt{2}`.
- "The trick: break each number into numbers you can square root."
- "After breaking big surds into small surds, like terms appear."
- Cube roots: use perfect **cubes** — `16 = 8 \times 2` (107.09).
- Worked example used: **107.06** — `\sqrt{20} + \sqrt{27} - \sqrt{125}`
  → `\sqrt{4}\sqrt{5} + \sqrt{9}\sqrt{3} - \sqrt{25}\sqrt{5}` → `2\sqrt{5} + 3\sqrt{3} - 5\sqrt{5}`
  → `3\sqrt{3} - 3\sqrt{5}`.
- Trap (pitfall): the minus stays glued to its surd through the breakdown — −√40 is −2√10.

### 3.3 Rationalizing: a single surd below (107.1)
- "Rationalizing the denominator means removing the surd from the bottom of a fraction."
- "Multiply the top AND the bottom by that same surd." `\sqrt{3} \times \sqrt{3} = 3` clears it.
- "A number in front of the surd (3√5) stays put — only the surd needs clearing":
  `\frac{10}{3\sqrt{5}} \times \frac{\sqrt{5}}{\sqrt{5}} = \frac{10\sqrt{5}}{15} = \frac{2\sqrt{5}}{3}`.
- "You are only multiplying by 1 — same value, just written differently."
- Worked example used: **107.1** — `\frac{2}{\sqrt{3}} = \frac{2\sqrt{3}}{3}`.
- Trap (pitfall): multiplying only the bottom changes the value.

### 3.4 Two terms below: multiply by the conjugate (107.13)
- "Multiply top and bottom by the conjugate — the same pair with the middle sign flipped."
- "Conjugate: just change the sign (only the one in the middle)."
- The rule beside the denominator line: `(a + b)(a - b) = a^2 - b^2`.
- After rationalizing, break any big surd down (107.15): "Break down big surds into small surds."
- Worked example used: **107.14** — `\frac{2}{\sqrt{5} + \sqrt{3}}`
  × `\frac{\sqrt{5} - \sqrt{3}}{\sqrt{5} - \sqrt{3}}` → `\frac{2\sqrt{5} - 2\sqrt{3}}{5 - 3}`
  → `\sqrt{5} - \sqrt{3}`.
- Traps: flipping both signs or the first sign (pitfall) — only the middle one.
  `(\sqrt{2})^2 = 2`, not 4 (107.17): "a surd times itself equals the number inside."
  A negative bottom (`16 - 20 = -4`, 107.19) hands its minus to every term.

### 3.5 The simplifying game plan (107.2)
- "Two moves cover almost every 'simplify' question: a surd in the denominator → rationalize;
  a big surd anywhere → break it into smaller surds. Do both, then add up like terms."
- "Simplify the surds first — small surds make the like terms visible."
- A term outside the fraction "waits its turn" (107.21).
- "Break up the fraction to easily add up."
- Worked example used: **107.21** — `\frac{1 - \sqrt{7}}{3 + \sqrt{7}} + 2\sqrt{7}`
  → `\frac{10 - 4\sqrt{7}}{2} + 2\sqrt{7}` → `5 - 2\sqrt{7} + 2\sqrt{7}` → `5`.
  "The surds cancel — the answer is a whole number."

### 3.6 Comparing surds to find unknowns (107.25)
- "Rational parts match and surd parts match — separately."
- "Group each side into (number) + (number)√n shape first, then compare the two kinds."
- Rule beside the compare line: `p + q\sqrt{n} = r + s\sqrt{n} \Rightarrow p = r,\ q = s`.
- Why: "A rational number can never equal an irrational one."
- A root on one side: "Square both sides to remove the square root"; expand with
  `(a - b)^2 = a^2 - 2ab + b^2` — "keep the middle term" (107.27).
- A fraction equal to a form: "Cross multiply — no need to rationalize here" (107.28).
- "Group the √2 terms together, factorize √2 — we can compare now."
- Worked example used: **107.27** — `\sqrt{3} - 1 = \sqrt{a\sqrt{3} + b}` → square →
  `4 - 2\sqrt{3} = a\sqrt{3} + b` → `a = -2`, `b = 4`.
- Trap (pitfall): matching a rational term against a √ coefficient — group first, then match.

### 3.7 Application questions (107.295)
- "The situation hands you an equation — an area formula, Pythagoras, anything — and forming
  it is your job."
- Then the usual game plan: "make the unknown the subject, rationalize, break down, collect."
- Worked example used: **107.3** — triangle, base `2 + \sqrt{8}`, area `\frac{1}{2} + \frac{3}{2}\sqrt{2}`:
  `\tfrac{1}{2}(2 + \sqrt{8})h = \tfrac{1}{2} + \tfrac{3}{2}\sqrt{2}` → `h = \frac{1 + 3\sqrt{2}}{2 + \sqrt{8}}`
  → rationalize → `h = \frac{5}{2} - \sqrt{2}` m. "The double minus turns positive."
- Pythagoras (107.31): `BE^2 = BC^2 + EC^2`, keep the middle term `-14\sqrt{21}`.
- The notes mark a figure here; the board shows the formula line, not a drawing.

### 3.8 Surd equations, type 1: x outside the root (107.34)
- "The surds are just coefficients."
- "Group the x terms on one side, factorize x out, then divide."
- "Both crossing terms flip sign."
- "Multiply top and bottom by −1 to tidy the double minus."
- Worked example used: **107.35** — `x\sqrt{3} + 5 = 8x` → `x\sqrt{3} - 8x = -5` →
  `x(\sqrt{3} - 8) = -5` → `x = \frac{5}{8 - \sqrt{3}}` → × conjugate →
  `x = \frac{40}{61} + \frac{5}{61}\sqrt{3}`.
- Trap (pitfall): moving a term across = without flipping its sign. "Move a term, flip its
  sign — then sub the answer back to confirm."

### 3.9 Surd equations, type 2: x inside the root (107.38)
- "First isolate the root on one side, then square both sides to remove it."
- "Then check answers in the original — squaring can create false roots."
- Worked example used: **107.4** — `\sqrt{x + 5} - 2 = \sqrt{3}` → `\sqrt{x + 5} = \sqrt{3} + 2`
  → `x + 5 = 7 + 4\sqrt{3}` → `x = 2 + 4\sqrt{3}`.
- Trap (107.41, pitfall): keeping every root of the squared equation. `\sqrt{x + 8} - x = 2`
  gives x = 1 or x = −4; x = −4 gives 6 ≠ 2 — reject. "Square → solve → SUB BACK."
  Write the bad root as "(rej)".

### 3.10 Surd powers by factorization (107.43, optional)
- Notes silent beyond the try-it answer — use the bank solution's method: factorize the
  lowest power `(\sqrt{5})^3` out, then write the result as a power of 5.

## 4. Stock phrases (the series voice)

- "Only like surds add." · "Number times number, surd times surd." ·
  "A surd times itself is the number inside." · "Break the big surd into small surds." ·
  "Multiply the top and the bottom." · "Change only the middle sign." ·
  "Rational with rational, surd with surd." · "Move a term, flip its sign." ·
  "Square, solve, then sub back."

## 5. Red lines (Surds)

- No decimal approximations in a surd answer.
- Never rationalize by multiplying the bottom alone, not even "for speed" on the board.
- Never skip the false-root check in a type-2 equation, even when both roots survive.
