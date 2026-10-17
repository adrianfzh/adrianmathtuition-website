# Clip bible — A Math · Logarithms

The series sheet every Logarithms clip is written and read against (SPEC-CLIP-PIPELINE.md §2b).
The writer reads it before the board plan; the blind reader reads it before scoring.

**Source:** Adrian's approved notes on /notes — `AM · Logarithms` (109 units, ids 109.xx and
1082.xx) and `AM · Linear Law` (115.xx) — pulled with `node scripts/lessons/pull-notes.mjs`,
plus the approved pitfalls from the teaching-knowledge layer (`teaching_knowledge('AM',
['Logarithms'])`). Nothing in a clip may teach a method these do not teach.
**Written:** 15 Oct 2026.

## 1. Look and teaching rules → `data/clip-bibles/_house.md`

Every rule from Adrian's watches of the Logarithms clips (15–17 Oct 2026) now lives in the house
rules, §1–§2, because they hold for every topic. Read them there — this file keeps only what is
Logarithms-specific (notation, the method skill by skill, stock phrases).

## 2. Notation on the board, words in the voice

| Board | Voice says |
|---|---|
| `\log_3 x` | "log base three of X" |
| `\lg 7` | "log seven" (lg is base ten — the notes say so once, in the laws clip) |
| `\ln 2` | "L N two" |
| `e^{7.5k}` | "E to the power seven point five K" |
| `x^2` | "X squared" |
| `(\text{rej})` | "reject" |
| `\approx` | not used for a final answer: write `x = −8.57 (3 s.f.)`, say "correct to three significant figures" |
| `10^{1.2}` | "ten to the power one point two" |

Letters are capitals in `say` ("X", "K", "A") so the voice reads the letter, not the word.
Answers to 3 significant figures unless exact. A negative answer keeps its minus.

## 3. Adrian's method and words, skill by skill

### 3.1 Using the laws of logarithms
- His names for the laws: **Add Power** (log x + log y = log xy), **Minus Power**
  (log x − log y = log x/y), **Bring down "power"** (log xʳ = r log x), **Change of base**,
  **Swop base** (log_a b = 1 / log_b a). log_a 1 = 0, log_a a = 1.
- "Same base → you can combine. Different bases → change of base first" (to the smaller base).
- "Plus means multiply, minus means divide."
- "Base matches argument, so the log is 1."
- Worked example used: **109.1** — simplify log₃5 + log₃6 − log₃10 = log₃30 − log₃10 = log₃3 = 1.
- Trap (109.115, pitfall): the laws act on the argument only — (log x)(log y) is NOT log(xy).
  Only ADDED logs combine.

### 3.2 Solving logarithmic equations
- Two moves: **rewrite** into log_a( ) = log_a( ) with the laws, then **compare** the arguments.
- A number joins base-a logs as log_a aᶜ: "2 = 2 log₃3 = log₃9".
- "When solving logarithmic equations, check whether an answer must be rejected — every log
  argument must stay positive." Write the bad root as "(rej)".
- Worked example used: **109.28 / 109.26** — log₃(x − 8) = 2 − log₃x → x = 9, x = −1 (rej).
- Trap (109.26, pitfall): giving both roots. x = −1 makes log₃(−9) — undefined.

### 3.3 Solving exponential equations
- "Same base possible? Convert and compare powers. Can't match bases? Take log on both sides
  and bring the powers down."
- "lg 7 and lg 5 are just numbers — collect them like algebra, then press calculator."
- Order of moves (109.42): take lg both sides → bring the powers down → expand → x terms
  together, number terms together → factorise out x and divide.
- Worked example used: **109.42** — 7ˣ⁻¹ = 5ˣ⁻³ → x ≈ −8.57.
- Trap (109.43, pitfall): copying −8.56654 as 8.57. NOT used in the clip (Adrian, 17 Oct 2026: "it is
  not a common thing students do").

### 3.4 Linear-form modelling (lg / ln graphs)
- "When the variable sits in an exponent or a power, take logs on both sides — then you will
  get a constant." (115.1)
- "Exponential in x → plot ln y (or lg y) against x. Power of x → plot lg y against lg x.
  Recover the constants with a = 10ᶜ (or eᶜ)."
- Gradient from two points, then substitute a point for c (115.14).
- Worked example used: **115.185** — ln y against x through (2, 3) and (4, 7) for y = Ae^(−nx).
  Gradient 2, intercept −1, so −n = 2 and ln A = −1: n = −2, A = e⁻¹ ≈ 0.368.
- Traps (115.185, 115.28): "Un-log BOTH read-offs — the graph hands you ln A, not A." And watch
  the sign: the form has e^(−nx), so a positive gradient forces a NEGATIVE n.

### 3.5 Exponential growth & decay models
- "Initial value → sub t = 0. Solve for the time → isolate the exponential, then take lg/ln.
  Long run → let t → ∞." (1082.13)
- "ln is used because e is involved (ln e = 1)." Say it at the equation: we need k, k is in the power, a
  log brings a power down, e is involved so ln (side clip `why-ln-when-e-am`). "Starts at 100" means
  WHEN t = 0, P = 100. Make e^(…) the subject first, then take ln (Adrian, 18 Oct 2026).
- Worked example used: **1082.15** — P = P₀e^(kt), doubles every 7.5 hours from 100:
  P₀ = 100, 200 = 100e^(7.5k), e^(7.5k) = 2, k = ln 2 / 7.5 ≈ 0.0924.
- Traps: "to start with" means t = 0; doubling means P = 2 × 100 = 200, not 2; the long-run
  value is where the curve is heading, not where it started (1082.19).

### 3.6 Graphs & transformations of log / exp functions
- The four steps (1082.04): **1. Asymptote** — let the expression inside the log equal zero.
  **2. Shape** — read the signs (structure) of the equation. **3.** Draw the shape against the
  new asymptote. **4. Intercepts.**
- "Minus in front of the graph flips in the x-axis; minus in front of x flips in the y-axis;
  both flip twice." "The numbers and base don't matter for shape."
- Worked example used: **1082.07** — y = ln(2 − x): asymptote x = 2, shape of ln(−x),
  y-intercept ln 2, x-intercept 2 − x = e⁰ = 1 → x = 1.
- Trap (pitfall): asymptote = inside equals 0; x-intercept = inside equals 1. Two different
  equations.
- The board has no log-curve drawing yet (graph-morph draws polynomials only) — the clip
  teaches the four steps on the working board; a live graph is a later build (SPEC §2b).

### 3.7 Log scales: decibels, pH, Richter
- Substitute the given readings into the formula; when two readings are compared, subtract —
  the Minus Power law turns the difference into ONE log of the ratio, and the constant cancels.
- Worked example used: **1082.25** — N = 10 lg(I/k), 62 dB and 50 dB:
  62 − 50 = 10 lg(I_d / I_p) → lg(I_d / I_p) = 1.2 → ratio = 10^1.2 ≈ 15.8.
- Trap: answering 12 (the difference in decibels) — the question asks how many TIMES as
  intense; un-log with 10 to the power.

## 4. Stock phrases (the series voice)

- Opening line = the point, no warm-up: "Simplify log base three of five, plus …".
- Each beat: the step, then why, in its own short sentence.
- "Same base, so we can combine." · "Plus means multiply. Minus means divide." ·
  "Bring down the power." · "Drop the logs and compare." · "Check every root in the logs." ·
  "Take log on both sides." · "Rounding never removes a minus."
- The last beat says the answer in full. No "That's it", no "Easy".

## 5. Red lines

- No model names, no "AI", no paper or school names on the board or in the voice.
- Never name Adrian (students hear "we").
- Adrian's method, not a textbook's: where the notes teach a way, the clip uses it.
