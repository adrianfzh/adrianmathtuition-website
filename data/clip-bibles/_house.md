# Clip bible — the house rules (every topic, every clip)

The series rules every clip follows, whatever the topic (SPEC-CLIP-PIPELINE.md §2b, §8). A topic
bible (`data/clip-bibles/<topic>-<level>.md`) adds Adrian's method, words and traps for that topic;
where the two disagree, the topic bible wins on METHOD and this file wins on LOOK.
Taken from the Logarithms bible (`logarithms-am.md` §1, §1b, §2, §4, §5) and Adrian's first watch
on 15 Oct 2026 — his notes are binding.

## 1. The series look

- One chalk board per idea (a clip may have two boards when the question has two clear halves),
  one `equation-steps` scene each, heading = what this board does, in a few words.
- The question sits on the board from the start (`intro`), short and exactly as printed — cut
  story words, never a number or a condition.
- The working one line at a time. The answer last, in emerald (`"hl": "emerald"`), boxed on its word.
- **≤ 6 tokens a line, ≤ 7 lines a board** — and the whole board must fit on a phone screen
  (the look checks it). A long line is ONE token (it shrinks to fit). Too many lines → two boards.
- Margin words are the topic bible's words or the law/rule a line uses, as a `note` with `near` =
  the token it explains.
- One pointing gesture per beat at most (underline = "this part", circle = "watch this",
  box = the answer). The trap gets the circle, once, where it bites.
- No character, no stickers, no prose on the board.

## 2. Adrian's notes after his first watch (15 Oct 2026) — binding on every topic

- **The key step is its own line.** "Show the intermediate step … That's the key step." Every
  move a school's working writes as a line is a line on the board: taking logs on both sides,
  moving a term across, substituting a value, multiplying by the conjugate, comparing
  coefficients. Never merge two moves into one line to save room — cut words, not steps.
- **The plan first.** "An overall idea … first." The second beat says the aim before the first
  move ("rationalise the denominator, then collect the like surds"), and the plan writes it under
  the question (a note on the first line).
- **The rule beside the step.** Every line made by a law or rule carries that rule as its note,
  in the topic bible's names (e.g. `Add Power: log x + log y = log xy`, `Remainder Theorem: f(a)`,
  `(a − b)(a + b) = a² − b²`).
- **A note points at its token.** The board draws an ↑ under the token named in `near`; write the
  note without an arrow.
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
- **Explain a number AT the number, on its own line** (16 Oct 2026, watch 6: "why not from the 3rd line,
  at the number 2 on the right side, just explain from there"): rewrite the line in place with
  `replaces` tokens: `= 2` → `= 2 log₃3` → the 2 goes up as the power → `= log₃3²` → `= log₃9`. Notes on
  a rewritten piece leave with it.
- **Say "negative" for a negative number** ("x equals negative one"); "minus" only for taking away
  ("x minus eight"). ("minus sounds weird (that's not proper pronunciation)")
- **Explain WHY something is undefined from what it means**: log₃(−9) asks "3 to what power gives −9";
  try powers of 3 one by one on the board; every one is positive; so none gives −9.
- A long working may run over up to four boards and about 3 minutes (460 spoken words).
- **A slider** lets the student jump to any beat — so every beat must make sense on its own
  board state (no "as we said before").

## 3. Words in the voice

- Letters are CAPITALS in `say` ("X", "K", "A") so the voice reads the letter, not the word.
- Numbers in words ("seven point five", "minus eight point five seven", "one over nine").
- `\sqrt{3}` → "root three"; `x^2` → "X squared"; `\frac{a}{b}` → "A over B";
  `\lg` → "log"; `\ln` → "L N"; `(\text{rej})` → "reject"; `\approx` → "is about";
  `f(x)` → "F of X"; `\binom{8}{3}` → "eight C three"; `\dfrac{dy}{dx}` → "D Y D X".
- Answers to 3 significant figures unless exact. A negative answer keeps its minus.

## 4. Stock phrases (the series voice)

- Opening line = the question, no warm-up. Never "Hi", "Today", "Let's", "In this video".
- Each beat: the step, then why, in its own short sentence.
- The last beat says the answer in full. No "That's it", no "Easy", no "See".
- The trap: one plain sentence, where it bites ("Rounding never removes a minus.").

## 5. Red lines

- No model names, no "AI", no paper, school or exam names on the board or in the voice.
- Never name Adrian or any person (students hear "we").
- Adrian's method, not a textbook's: where the topic bible teaches a way, the clip uses it.
- Never the bank's words "question bank", "source", "prelim".
