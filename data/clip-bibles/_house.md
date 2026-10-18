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
  longer than a phone screen (more than about 7 lines); `assemble.mjs` scrolls only then. A plan whose lines
  and notes are too tall under the question on a phone sets `"scroll": true` to force it (the look check says "taller than the screen"). Never point
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
  takeaway in bold. It is CLOSED by default ("make the written drop-down closed by default > student can click if they need
  explanation"). It lives ON the board, so nothing under the board moves ("when the popup appears, it
  pushes the slider down > any better, more elegant way?"): a small "💡 Why?" chip in the board's top
  corner; a tap lays the explanation over the board and pauses the clip; "Hide" carries on, and moving
  on to the next part closes it again. No new
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
- **A question that can confuse gets explained FIRST** (18 Oct 2026, Log scales: "able to have an
  introduction of the question? because students may be confused by the question itself > do an
  explanation of the question first"): before any working, a short "First, what the question says"
  step writes the given formula, says what each letter means (a note: `N = noise rating (dB), I =
  intensity, k = a constant`), the given values, and what we must find, in plain words. Then
  "Now solve it". Do this for every word problem or formula the student may not have met.
  **Each meaning its own line, its letter lit as it is named, and each given value SUBSTITUTED on
  the board** (18 Oct 2026: "when narrator says I is its intensity, we can highlight I, likewise for
  k … show how we can sub in 50 dB then the intensity of which is ... call it I_pump > show the
  substitution on the screen … whatever you think needs to be on screen for better clarity > do
  so"): `N: noise rating, in dB` (N lit), `I: intensity …` (I lit — `"part": "num"` lights a
  fraction's top, `"den"` its bottom), then `Pump: N = 50, I = I_p` → `50 = 10lg(I_p/k)`. The
  standing test: if the voice says it and it helps, it is on the board.
- **Write what we are asked to find, then in letters** (18 Oct 2026, Log scales: "should show on screen
  intensity of the dishwasher / intensity of the pump = ? while narrating … hence it's I_d / I_p = ?"):
  `We want (intensity of dishwasher)/(intensity of pump) = I_d/I_p = ?`, each part on the words that say it.
- **Name each letter ON the board as the voice names it** (18 Oct 2026, Log scales: "should write on
  screen let intensity of the pump be I_p with the narration > will be much clearer"): "Call the
  pump's intensity I P" writes `Let I_p = intensity of pump` on those words.
- **Light the terms a step moves** ("we can highlight the x, so students can see the x terms
  clearly"): when the voice says "X terms to the left", light those terms, and keep the x in the same
  colour on the lines that follow.

- **Start from what the question gives, and say why the first move is the move** (18 Oct 2026, Log
  scales: "62-50=10 lg ... needs to be further explained. it is unclear why this step works and why
  start from this step"): write each given reading as its own equation first (`50 = 10lg(I_p/k)`,
  `62 = 10lg(I_d/k)`), say what we want and what stops us (k is unknown), then why the move gets
  round it (subtracting joins the logs and k cancels) — and only then the combined line.

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
- **A graph clip ALWAYS draws the graph** (18 Oct 2026: "how do you teach sketching a graph without
  drawing the graph?" — the Sketching clip had been put back to a cut that only SAID "draw that shape
  on your paper"). Every sketching step is drawn on the board as it is said: the basic shape, the curve
  against its dashed asymptote, the finished sketch with every label. Never "draw it on your paper".
- **Teach the family before the case** (18 Oct 2026, Sketching: "perhaps can introduce the four basic
  shapes of logarithmic graphs first"): a clip that uses a set of basic shapes or standard forms
  first SHOWS the set — one sketch with every curve labelled (`graph.curves`), each lit as the voice
  names it and says how it is flipped — then does the question.
- **A method's steps are listed on screen and stay in view** (18 Oct 2026: "when narrator says four
  steps: should list it out on screen, then use those steps and show how to build from those steps
  (keeping those steps in view) highlight the steps when it comes to their turn"): the plan's
  `pinned` steps sit above the board for the whole clip (they never scroll), shown on the beat that
  names them (`pin: 0`) and each lit on its turn (`pin: n`).
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

## 6. Redoing a clip — what we learnt (16–18 Oct 2026, the 7 A Math Logarithms clips)

Adrian, 18 Oct 2026: "great, remember all we have learnt from redoing the clips so far". The rules a
clip must follow are §1–§2; this is HOW to change one without making it worse.

### What went wrong, and the rule it gave
- **Putting a clip back can lose what it needs.** The Sketching cut we went back to never drew the
  graph. → after a revert, check the clip against §1–§2 again (a graph clip draws, a word problem is
  explained first).
- **A full rebuild of an approved clip made it worse.** Laws of logarithms, Log scales and Sketching
  were rebuilt in the scrolling style; Adrian: "badly redone. Before redo is better … screen keep
  shifting up and down". They were put back. → Change an approved clip ONLY where he asks; a short
  clip stays a fixed board.
- **"Fast" turned into shortcuts** ("a lot of the explanations seems to give shortcuts"). → Fast only
  for algebra the level knows; every law and concept is explained: what, how it is used here, why.
- **The board font was too big for a scrolling board**, so earlier lines left the screen. → fit 0.74.
- **The question card cut the question off.** → the whole question, always.
- **A said-but-not-written step** (the t = 0 substitution, "P = 2 × 100"). → what the voice works out
  is written as it is said.
- **A detour in a separate clip broke the flow** (a new page, then a sheet). → a side point is a short
  WRITTEN explanation on the board, closed until tapped (§1).
- **The scrolling board was measured too small on a phone** (18 Oct 2026): it counted the stage's
  empty min-height as taken and shrank to 240 px, so lines slid off the top early with an empty band
  above the subtitle. Fixed in the player (`scrollClipBoard`: only the stage's bottom padding sits
  under the board). Check a scrolling clip's LAST frames at phone size, not only the first.
- **Anything that appears under the board moves the slider.** → new things go ON the board (overlay),
  never in the page flow under it.

### The redo recipe (each step, in order)
1. Change the plan / draft only where asked (`data/clip-plans/<slug>.json`, `data/clip-runs/<slug>/draft-*.json`,
   and `blind-read.json` `fixed_beats` — it overrides the draft, so edit it too).
2. `assemble.mjs` → `gate.mjs` (must PASS) → the tests (`clip-ask.test.ts` names board lines; catalog
   minutes in `lesson-catalog.ts` must match the plan).
3. Voice: `generate-narration.mjs <slug> --force` then **`align-narration.mjs <slug> --force`** — without
   `--force` the old timings stay and every cue fires early. Then `--verify` / `asr-score.mjs`.
4. Push `dev`, wait for the preview, move the alias, then `look.mjs` against adrianmath-dev and LOOK at
   it yourself at phone size (375 wide): nothing talked about hidden, slider not moving, question whole.
4b. **The two checks that stand in for Adrian** (18 Oct 2026: "currently still need a lot of
   hand-holding … able to one shot this?" → "build #1 … build #2"):
   - **Said but not shown** (`src/lib/clip-said-shown.ts`, run by verify-lesson as part of `rules`):
     every number and named letter the voice says is on the board by the end of its beat.
   - **The stand-in reviewer** (`node scripts/clips/review.mjs <slug>`, after look.mjs so it gets the
     phone frames): a second model gives the notes Adrian would give, against this file. Fix every
     `must`, re-run until it passes; the gate's `review` check needs a pass newer than the lesson.
     Only then does Adrian watch it. Every new note he gives is a miss of the reviewer: add it here
     (§2) AND to its checklist (`scripts/clips/prompts/reviewer.md`).
5. Write Adrian's note into §2 here, dated, his words — same commit. Tell him the link, the login
   (admin) and where to tap.

### The reference for a word problem: Log scales (Adrian, 18 Oct 2026: "this is way better, remember what did here for future videos")
`data/lessons/log-scales-am.json` (plan `data/clip-plans/log-scales-am.json`, draft W2) is the clip to
copy for any question with a story or a formula. Its shape, in order:
1. **"First, what the question says"** — the formula on the board; each letter LIT as it is named
   (`part` "num"/"den" for a fraction's top/bottom) and its meaning written (`N: noise rating (dB),
   I: intensity, k: a constant` — one line, so the formula stays in view).
2. **Each given value substituted, on the board** — `Pump: N = 50, I = I_p` (the letter named as the
   voice names it), then the formula with them in (`50 = 10lg(I_p/k)`), the formula lit as they go in.
   Same for each other object.
3. **"Now solve it"** — what we want, in words then letters (`We want (intensity of dishwasher)/
   (intensity of pump) = I_d/I_p = ?`).
4. **Why the first move** — what stops us (k unknown) and how the move gets round it (subtract: the
   logs join, k cancels) — before the move's line.
5. The working, each law lit then written, the answer boxed. No Watch out unless asked.
The test for every beat: if the voice says it and it helps, it is on the board as it is said.

### Where each clip stands (18 Oct 2026, test site only — nothing promoted)
| Clip | State |
|---|---|
| Solving log equations | New scrolling style (G9), every watch note applied; side point "log of a negative" written |
| Solving exponential equations | New style (R3), x terms lit, no Watch out |
| Linear form with logs (Linear Law) | New style (R1 + fixes) |
| Growth and decay | Approved cut + his edits: t = 0 working, why k / why ln, divide then ln, no Watch out, written "Why ln" |
| Laws of logarithms | Put back to the version before the rebuild (fixed board) |
| Log scales | **The word-problem reference (approved 18 Oct: "way better").** The version before the rebuild + (18 Oct) "Let I_p = intensity of pump, I_d = …" written, the two readings as equations, why we subtract (draft W2); its "not 12" Watch out dropped; "We want … = I_d/I_p = ?" written; now it SCROLLS (`"scroll": true` in the plan); opens with "First, what the question says" (the formula, each letter, what to find) |
| Sketching log graphs | The version before the rebuild + (18 Oct) the 4 basic shapes first, the 4 steps pinned and lit, real sketches: the shape of ln(−x), the curve against x = 2, the labelled sketch (draft W2; it scrolls) |

Still offered, not answered: rewrite the explanations in log equations, exponential and Linear Law so
no step is a shortcut (the 18 Oct rule). Update this table whenever a clip changes.
