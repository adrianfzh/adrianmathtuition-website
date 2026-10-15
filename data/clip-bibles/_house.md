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
- **A mistake that is said is SHOWN** ("you should put that out and emphasize on that, not just say
  it > students will get confuse why you suddenly say that"). Write it on the board as a red ✗ note
  (`"text": "✗ Common mistake: …"`) under the line where it bites, and lead into it from that line
  ("Careful: the times sits inside one log.") so it never comes from nowhere. The clip checker
  flags a line that says "not / never / mistake" with no ✗ note.
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
