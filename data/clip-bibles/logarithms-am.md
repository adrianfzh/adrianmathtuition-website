# Clip bible — A Math · Logarithms

The series sheet every Logarithms clip is written and read against (SPEC-CLIP-PIPELINE.md §2b).
The writer reads it before the board plan; the blind reader reads it before scoring.

**Source:** Adrian's approved notes on /notes — `AM · Logarithms` (109 units, ids 109.xx and
1082.xx) and `AM · Linear Law` (115.xx) — pulled with `node scripts/lessons/pull-notes.mjs`,
plus the approved pitfalls from the teaching-knowledge layer (`teaching_knowledge('AM',
['Logarithms'])`). Nothing in a clip may teach a method these do not teach.
**Written:** 15 Oct 2026.

## 1. The series look

- One chalk board, one `equation-steps` scene, heading = the skill's short name.
- The question on line 1, exactly as the notes print it. The working one line at a time.
  The answer last, in emerald, boxed on its word.
- **≤ 6 tokens a line, ≤ 6 lines** — and the whole board must fit on a phone screen (look.mjs checks). A line that is long is ONE token (it shrinks to fit).
- Margin words are Adrian's own (§3) or the law used (§1b), as a `note` with `near` = the token it explains.
- One pointing gesture per beat at most (underline = "this part", circle = "watch this",
  box = the answer). The trap gets the circle, once, where it bites.
- No character, no stickers, no prose on the board.

## 1b. Adrian's notes after watching the first cut (15 Oct 2026) — binding

- **The key step is its own line.** "Show the intermediate step of taking lg on both sides. That's
  the key step." Every move his notes write as a line is a line on the board: `lg 7ˣ⁻¹ = lg 5ˣ⁻³`
  before `(x − 1) lg 7 = …`; `log₃(x − 8) + log₃x = 2` (moving across) before joining;
  `ln e^(7.5k) = ln 2` before `7.5k = ln 2`; `ln y = ln A + ln e^(−nx)` before `ln y = −nx + ln A`.
  Never merge two moves into one line to save room — cut words, not steps.
- **The plan first.** "An overall idea that to solve the equation is to compare logs at the end
  first." Say the aim before the first move ("get one log on each side, then compare what is
  inside") and write it under the question.
- **The law beside the step.** "Show the log property that is used (side by side)." Every line made
  by a law carries that law as its note, in his names: `Add Power: log x + log y = log xy`,
  `Minus Power: …`, `Bring down power: lg xʳ = r lg x`, `log_a a = 1`, `Take ln: ln eˣ = x`,
  `Un-log: lg x = c ⇒ x = 10ᶜ`.
- **Highlight, then the law under that line, then the law applied as its own line** (15 Oct 2026:
  "when you say plus means multiply, that's when you can just highlight log5+log6, then bring in the
  property right under this line, then the next line shows log(5x6), then the next line is log30").
  Highlight only the terms the law acts on, on the word that names the move; in a clip a highlight
  stays lit (yellow chalk) through its beat and the next.
- **The base in its own colour** (15 Oct 2026, second watch: "should emphasize on the base 3 (perhaps
  highlighting them with a different colour) when saying that"). When the voice talks about the base
  ("same base", "the base matches"), light the bases: `{"do": "highlight", "token": [...], "part": "sub"}`
  lights only a log's small base, in blue. (Exponentials, where the base is the big number, highlight
  the whole power.) The clip checker flags a "base" line with no highlight.
- **The ↑ points at the MIDDLE, and the law is ONE line** ("the up arrow should point in the middle …
  the log property should be on one line, putting as two lines make it less clear"). A law that acts
  on two terms gets `"span": ["a", "b"]` — the ↑ sits under the middle of both. The board keeps a
  note on one line (beside the ↑ when it fits, else centred under it, shrunk if needed); the look
  fails a note on two lines. Keep laws short: the law itself, its name in front.
- **A mistake that is said is SHOWN — at the END, as a "Watch out" step** ("you should put that out
  and emphasize on that, not just say it > students will get confuse why you suddenly say that";
  16 Oct 2026: "put each common mistake at the end of its clip as a 'Watch out' step"). After the
  answer is boxed, a last beat opens "Watch out: …", circles the line the mistake is about and
  writes it as a red ✗ note under that line (`"text": "✗ Watch out: …"`). The working itself never
  stops for a mistake. (A step of the METHOD — rejecting x = −1, checking a root — stays in place,
  as a plain reason, not a ✗.) The clip checker flags a line that says "not / never / mistake"
  with no ✗ note, and a ✗ note before the answer's box.
- **Explain every part, don't rush** (16 Oct 2026, third watch: "take reference from how this professor
  (Herbert Gross) explains … the essence of how he explains each part very clearly (he doesn't rush)").
  Assume the student does not know WHY: each move gets its reason, in its own short sentence. A clip
  may run to about 2½ minutes (340 spoken words) when the steps need it — never cut a reason to save time.
- **Show, don't just say.** "SHOW the plan, instead of just saying" — the plan is written on the board
  as maths (e.g. `log₃(□) = log₃(△) ⇒ □ = △`) on the words that say it.
- **The explanation sits AT the thing it explains** ("right now the explanation is quite far away from
  2"). Light the exact part being talked about (`highlight`) as the voice names it, and put its note
  right under it. Turning a number into a form ("2 becomes log₃9") gets its own line of small steps:
  `2 = 2 log₃3 = log₃3² = log₃9`, one piece per beat, each with its reason.
- **Highlight the parts a law acts on**, colour-matched to the law (M orange, N blue; use M, N — not x,
  y — when the question already uses x), then the result line keeps those colours.
- **Don't skip the comparison step**: after "one log each side", light the insides, then write
  `x(x − 8) = 9` as its own line.
- **A rejection is EXPLAINED, then shown**: substitute the bad root into the question, show what goes
  wrong (log₃(−9): 3 to what power gives −9? none — 3 to any power is positive), and only THEN write
  "(rej)" on the word "reject" — a token of its own, never part of the roots line's first write.
- **Use the animation like a teacher's finger** (16 Oct 2026, fourth watch: "its an animation right? you
  should take advantage of the animation … like a teacher physically can use fingers to point and draw
  attention"). When a piece MOVES in the maths, move it on the board: the 2 of `2 log₃3` flies up into
  the power of `log₃3²` (`from` + `move`, the power token `tight`); the insides fly out of the logs to
  `x(x − 8) = 9`; the 3 and the −9 of `log₃(−9)` fly into `3^? = −9`. Light each part as it is named.
- **Say the reason for a comparison**: "both sides are equal, both log base three, so what is inside
  must be equal" — then the comparison line.
- **Each new board starts with the line the last one ended on** ("when switching over to the next screen,
  show x(x−8)=9 first"), so a student sees where it comes from.
- **Fifth watch (16 Oct 2026)**:
  - A chain that rewrites ONE thing stays on ONE line: `2 = 2log₃3 = log₃3² = log₃9` (Adrian: "can you
    do 2 = 2 log_3 3 = log_3 3^2 on the same line?"). In a beat clip a piece may move to a later token
    of its own line.
  - Never say a piece "flies" — say the maths: "bring the power up" ("don't say fly - say power bring up").
  - A moving piece keeps its shape: the player scales it the same both ways ("why is the 9 flattened
    in transition? … it's just a translation right?").
  - A log equation's check opens with "For log equations, always check each answer".
- **Say "negative" for a negative number** ("x equals negative one"); "minus" only for taking away
  ("x minus eight"). ("minus sounds weird (that's not proper pronunciation)")
- **Explain WHY something is undefined from what it means**: log₃(−9) asks "3 to what power gives −9";
  try powers of 3 one by one on the board; every one is positive; so none gives −9.
- A long working may run over up to four boards and about 3 minutes (460 spoken words).
- **A note points at its token.** "Arrow pointing leftwards … point[s] to nowhere." A note sits
  under its line with an ↑ under the token it explains (the board draws the ↑; write the note
  without an arrow).

## 2. Notation on the board, words in the voice

| Board | Voice says |
|---|---|
| `\log_3 x` | "log base three of X" |
| `\lg 7` | "log seven" (lg is base ten — the notes say so once, in the laws clip) |
| `\ln 2` | "L N two" |
| `e^{7.5k}` | "E to the power seven point five K" |
| `x^2` | "X squared" |
| `(\text{rej})` | "reject" |
| `\approx` | "is about" |
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
- Trap (109.43, pitfall): copying −8.56654 as 8.57. "Rounding never removes a minus."

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
- "ln is used because e is involved (ln e = 1)."
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
