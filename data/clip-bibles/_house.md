# Clip bible — the house rules (every topic, every clip)

The series rules every clip follows, whatever the topic (SPEC-CLIP-PIPELINE.md §2b, §8). A topic
bible (`data/clip-bibles/<topic>-<level>.md`) adds Adrian's method, words and traps for that topic;
where the two disagree, the topic bible wins on METHOD and this file wins on LOOK.
Taken from the Logarithms bible (`logarithms-am.md` §1, §1b, §2, §4, §5) and Adrian's first watch
on 15 Oct 2026 — his notes are binding.

**Keep this file current — the habit (Adrian, 17 Oct 2026: "make sure what we have learnt in building
the clips are going to be used in future clips … in other claude accounts too").** Every note Adrian
gives after watching a clip is written into §2 below in the SAME commit — his words, the rule, dated.
When a later note replaces an earlier one, edit the old rule (never leave two that disagree). When a
rule can be checked by a machine, also add it to `scripts/clips/prompts/writer.md` and to
`clipIssues` in `src/lib/lesson-verify.ts`. This file is what every clip writer, checker and session
reads — on every Claude account, because it lives in the repo.

## 1. The series look

- **A clip that fits ONE screen stays one fixed board** (18 Oct 2026, of the rebuilt Laws clip: "Laws
  of logarithms is badly redone. Before redo is better. The explanation flow is hard to follow. And
  screen keep shifting up and down - can't see"). Use the scrolling board only when the working is
  longer than a phone screen (more than about 7 lines); `assemble.mjs` scrolls only then. Never point
  the voice back up at an old line while the board is scrolled — write the step again on a new line
  below instead, so the eye only ever moves DOWN.
- **Explain the method, never just the shortcut** (18 Oct 2026: "explanation of concepts or how to use or
  methods must be clear. A lot of the explanations seems to give shortcuts but doesn't explain
  clearly"). Each step says WHAT we do, HOW the rule is used here (which part is which), and WHY it is
  allowed — never "X cancels", "just un-log", "bring it across" without the reason. "Fast" is only for
  algebra the level already knows; every concept and every law is explained in full.
- **The whole question is shown** above the clip (never cut off), and on a scrolling board the maths is
  smaller (fit 0.74) so the lines before stay in view ("font is too large, so when narration goes to the
  next part, previous parts can't be seen").
- **Show the working of every substitution** (18 Oct 2026: "should show the working of subbing in t=0
  and P=100, then showing the working of how P_0 = 100"): write the substituted line, then each
  simplification (k(0) = 0, e⁰ = 1), then the result — never jump from the given values to the answer.
  What the voice works out is WRITTEN as it is said ("when t = 7.5, P = 2 x 100 < write that on screen
  when narrating"): `t = 7.5, P = 2 × 100 = 200`.
- **A side point is WRITTEN, in a drop-down under the board — not a side clip** (18 Oct 2026: Adrian
  tried both on Growth and decay — "how about instead of a popup clip, we have a written explanation
  (drop down)? … i compare which is better?" → "Keep the written drop-down, drop the popup clip"). The
  beat's `aside` carries `read`: up to 10 lines, one idea a line, inline maths, the last line the
  takeaway in bold. The 💡 chip opens it under the board and pauses the clip; "Hide" carries on. No new
  side clip is made for a side point (an `aside` without `read` still falls back to the old sheet).
- **No Watch out by default** (18 Oct 2026, of "P is 200, not 2": "there is no need for the watch out at
  the end that watchout is NOT helpful"). Add one only when Adrian asks for it, or the mistake is one
  his students really make on this exact step.
- **Say WHY a method is chosen before using it** (18 Oct 2026, Growth and decay): "emphasize that need
  to find k > since k is the power, we can take lg or ln to bring the power down > since e is involved,
  ln is used instead". The "why this and not that" detour is a written drop-down (`aside.read`).
  Then the order on the board: make the power part the subject FIRST, THEN take the
  log of both sides, then bring the power down in front of ln e, and ln e = 1.
- **An approved clip is changed only where Adrian asks.** Don't rebuild a clip he passed into a busier
  one; apply his named change and keep everything else.
- **ONE scrolling board** (`"scroll": true` on the one `equation-steps` scene; Adrian, 16 Oct 2026:
  "make the lines move up, like scrolling up, then we don't have to change screen"). The maths stays
  full size; when the newest line would reach the subtitle the board glides up and older lines fade off
  the top. Never split a clip into boards / screens. Each step's title is a `heading` on its first
  line ("Step 2: join the logs, then compare"). Never repeat a line just to carry it forward.
- The question is the first line, exactly as printed (cut story words, never a number or condition).
- The working one line at a time. The answer last, in emerald (`"hl": "emerald"`), boxed on its word.
- **≤ 6 tokens a line** (a `replaces` token does not count); a long line is one token (it shrinks to
  fit). Lines are not limited — the board scrolls.
- Margin words are the topic bible's words or the law a line uses, as a `note` with `near` = the token
  it explains. One pointing gesture per beat at most (underline / circle / box = the answer).
- No character, no stickers, no prose on the board.
- What the PLAYER does for every clip (nothing to write): fades, the scroll glide, keeping just-written
  things in view, finger / wheel look-back with "Back to now", the video-bar slider with ⏪ 10 / 10 ⏩,
  ← / → keys, seeks that redraw the board cleanly, moving pieces that keep their colour, size and shape,
  and the whole question (the plan's `question`) shown ABOVE the clip on a phone / beside it on a
  laptop ("the question should be at the top (but not in the clip?)") — so every clip's plan needs a
  `question`: the full question as printed, with its conditions ("giving your answer to 3 s.f.").

## 2. How Adrian wants a clip to teach (his watches of 15–17 Oct 2026 — binding on every topic)

Quotes are his. Rules a later watch replaced are gone from this list; SPEC-CLIP-PIPELINE.md §8 keeps
the history.

### Pace
- **Explain every part, don't rush** (Herbert Gross: "he explains each part very clearly (he doesn't
  rush)"). Assume the student does not know WHY: each move gets its reason, in its own short sentence.
  Up to about 3 minutes (460 spoken words).
- **But routine steps go FAST** ("for solving of quadratic equations > can go faster … at AM level,
  students should know this well"): algebra the level already knows is a few words a line ("Expand,
  then bring nine across." "Factorise it into two brackets.").

### What goes on the board
- **The plan first, SHOWN as maths** ("SHOW the plan, instead of just saying"): the second beat writes
  the plan (e.g. `log₃(□) = log₃(△) ⇒ □ = △`) on the words that say it.
- **The key step is its own line** ("Show the intermediate step … That's the key step"). Never merge
  two moves to save room — the board scrolls. Don't skip the comparison step (`x(x − 8) = 9`).
- **The rule beside the step**: a line made by a law carries the law as its note, in the topic bible's
  names (`Add Power: logₐM + logₐN = logₐMN`). A law acting on two terms: `"span": [a, b]`, the ↑ under
  their middle; the law on ONE line ("putting as two lines make it less clear").
- **Highlight, then the law under that line, then the law applied as its own line** ("highlight
  log5+log6, then bring in the property right under this line, then the next line shows log(5x6),
  then the next line is log30").
- **Explain a number AT the number** ("explain it at the number 2 itself … the explanation is quite far
  away from 2"): the part being explained is lit as it is named, its note right under it.
- **A new line under the old one, not a rewrite** ("why not just have log₃(x−8) + log₃x = log₃9 on the
  next line … then scroll up"): when the working changes, write the next line and let the board
  scroll; keep the notes. A chain that rewrites one thing may grow on its own line
  (`2 = 2log₃3 = log₃3²`) — but its result goes on the next line.
- **A mistake that is said is SHOWN, at the END** ("put each common mistake at the end of its clip as
  a 'Watch out' step"): after the answer is boxed, a beat opens "Watch out: …", circles the line and
  writes a red `✗ Watch out: …` note. The working never stops for a mistake. A step of the method
  (rejecting a root) stays in place as a plain reason. **Only a mistake students COMMONLY make gets a
  Watch out** (17 Oct 2026, of "rounding never removes the minus": "we don't have to write the watch
  out … it is not a common thing students do") — no Watch out at all is fine.
- **Light the terms a step moves** ("we can highlight the x, so students can see the x terms
  clearly"): when the voice says "X terms to the left", light those terms, and keep the x in the same
  colour on the lines that follow.

### Checks and answers
- **A log equation's check opens "For log equations, always check each answer."**
- **Show where a checked expression comes from** ("it's from the first line, so students may have
  forgotten"): move it from the question line (`from` + `move`) before substituting.
- **Check EVERY answer on the board, not only in the voice** ("you didn't show for x=9 why the answer
  is okay instead you only narrated"), naming each log of the question (`log₃x = log₃9 ✓`, "isn't
  relevant?" was the bare `log₃9`).
- **A rejection is explained, then shown**: substitute, show what breaks, and only then write "(rej)"
  (its own token) on the word "reject".
- **A "why" detour is a written drop-down** ("a popup hint … that students can link to"; written since
  18 Oct 2026): say the fact in one line on the board ("a log of a negative number is undefined") and
  give the beat an `aside` with `read` lines that explain why. Never stop the main working for it.

### Animation (the teacher's finger)
- **When a piece moves in the maths, move it on the board** ("its an animation right? you should take
  advantage of the animation … like a teacher physically can use fingers to point"): a coefficient
  goes up into the power (`from` + `move`, the power `tight`), the insides come out of the logs, the
  base and the argument go into `3^? = −9`.
- **While a piece moves, NOTHING else moves** ("only thing that moves is 2 going up … then you can shift
  the frame"). Only the moving piece moves; the space it leaves closes after it lands (the player does
  this when the power token `replaces` the piece).
- **Nothing the voice talks about is hidden, even partly** (17 Oct 2026: "make sure content is not
  obscure (even partially) when narrator is talking about it"). The player keeps every target of the
  current part in view; when a piece must come from a line far above (the question line), add a beat
  that LOOKS BACK at it first ("Look back at the question…", highlight it) — the board scrolls up to
  it, then glides back down as the piece comes down. The look check fails a talked-about piece under
  the fade.
- **Draw it when a picture teaches it** (17 Oct 2026: "if you need to include diagrams in the clips,
  please do so"): a graph question gets real sketches on the board — give the line a `graph`
  (curve, dashed asymptote, labelled points); show the shape, then the curve against its asymptote,
  then the finished sketch with every label the question asks for.
- **The base in its own colour** when the voice talks about the base (`"part": "sub"`).
- **Highlight the parts a law acts on**, colour-matched to the law (M orange, N blue), and keep those
  colours in the result line.

### Voice
- **A rounded answer is "correct to three significant figures"** (17 Oct 2026: "say x=8.57 correct to
  3 sf"): the board writes `x = −8.57 (3 s.f.)` — not `x ≈ −8.57` — and the voice says "X equals
  negative eight point five seven, correct to three significant figures", never "is about".
- **Never say "fly"** — say the maths ("don't say fly - say power bring up").
- **"Negative" for a negative number** ("x equals negative one"); "minus" only for taking away
  ("minus sounds weird").
- Every beat must make sense on its own (the slider, ⏪ 10 and ← jump to any beat) — no "as we said".

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
