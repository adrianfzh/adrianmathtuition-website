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
- **A graph is drawn big, clear, and as you go** (20 Oct 2026, Exponential graphs, four notes):
  - "Graph is hard to see, y=e^x can hardly been seen (too small) - make sure graphs are clearly
    seen": the corner shapes and the working sketch are big enough to read on a phone, thick curves,
    readable labels (powers raised: `e^−x`). Look at the phone frames before calling it done.
  - "The asymptote should not be seen touching the axis": choose the sketch window so the curve's
    tail sits CLEARLY off its asymptote (Exponential graphs: x from −1.1, the tail ~9 px above y = 0) —
    a true curve that looks like it touches is a wrong sketch.
  - "When finding y intercept equals to 3 > the point (0, 3) should be directly drawn on the graph
    itself > not graph later shift to cut it": the curve already passes through a point when the point
    is marked. Any stretch or slide of the basic shape happens BEFORE the intercepts (on the words that
    say it: "they only stretch it").
  - "Last step shouldn't be draw it. There should be no last step. Just 3 steps will do. Draw the
    graph as you go through each step": no separate "draw" step — the pinned steps are the method's
    own (exponential: shape, asymptote, intercepts) and each one adds to the sketch as it is done.
- **Graph clips, Adrian's second watch** (20 Oct 2026, Exponential graphs):
  - "the equations of the graphs are covered in the mobile version": every label of the corner
    shapes sits wholly INSIDE its box at phone width (the player clamps them; check the inset frame).
  - "let's do y=2e^-3x + 1 instead > to showcase the minus effect and the shifting of the graph up":
    a graph clip picks a question that SHOWS the ideas of its skill (a minus that flips, a shift),
    not the plainest one. A shift is drawn: the basic curve first, then it slides up/down by c with
    its dashed asymptote (y = 0 → y = c) — the side sketch's `shift` stage.
  - "the highlight for e and x flickers (some bug?)": a lit piece stays steadily lit (fixed in the
    player 20 Oct 2026 — the maths was being rebuilt every tick). Watch a lit piece for a few seconds.
  - "3 and 2 don't change the shape, but it's pointing at y=e^x?": a note about some numbers points
    at THOSE numbers (its `near` is the token holding them), never at another line.
  - **The asymptote after a shift: just say the shift** (20 Oct 2026, replacing that night's "explain
    the asymptote with values" — Adrian, watching it: "don't have to say as x grows... just say +1 means
    shift the graph up by 1"). No "as x grows" line, no table of values, no "three times a number close
    to zero" sentence. Say "Plus one means shift the graph up by one", show the curve AND the dashed
    asymptote slide up on the sketch, and write `asymptote: y = 1`.
- **Two answers: work each straight down its own column** (19 Oct 2026: "for such working, put like
  this instead (directly below)" — his notes' layout `a = 1  or  a = 1/4`, then `2^{2x} = 1` under the
  one and `2^{2x} = 1/4` under the other). Give those lines `"cols": true` (tokens: left, "or", right;
  then left, right on each line after); the final answer line after them is boxed.
- **A condition only where it decides something** (19 Oct 2026, Solving by substitution: "introducing
  2^x>0 at this stage seems premature"): say "2^x is always positive" only on a question where it
  REJECTS a root (u = −2). When every value is allowed, say nothing about it.
- **No "Step one / Step two" in the voice** (19 Oct 2026: "don't have to say step 1 and step 2"): say
  the move itself ("The bases are…", "So substitute…", "Solve the quadratic…"). Only a graph-sketching
  clip, whose steps are pinned on screen, numbers them.
- **The result of a chain gets its own line** (19 Oct 2026: "put 5^(x+2) = 5^(2x-2) as another
  line"): after `5^{x+2} = (5^2)^{x-1} = 5^{2x-2}`, write `5^{x+2} = 5^{2x-2}` on the next line — that
  is the line the powers are compared from.
  When the long line ends at `(5^2)^{x-1}` (19 Oct 2026: "remove the part = 5^(2x-2), since the next
  line already has it, still make the narration smooth"), the voice says the result only on the beat
  that writes the next line ("Times power: multiply the two powers, two times the bracket X minus one."
  → "So five to the power X plus two equals five to the power two X minus two.").
- **Comparing powers: "since the base is the same, the powers must be the same"** (19 Oct 2026:
  "instead of a different power of five gives a different number.. and instead of saying bring the
  powers down … say since base is the same, hence the power must be the same, etc hence x+2 = 2x-2").
  The equation of powers is written on "hence", the powers moving down from the line above.
- **A simple linear (or simultaneous) solve is ONE step** (19 Oct 2026: "don't have to get into the
  nitty gritty of solving a linear equation > AM students know this well > going to details of solving
  a simple linear equation is not effective here"): "Solve it: X equals four." — the answer line, boxed.
  No `2 + 2 = 2x − x` line, no substitute-and-expand lines for a pair of linear equations.
- **Only numbers left → just use the calculator** (19 Oct 2026, Split the power, of the line
  `(3 − 1/9)/(1/3 − 9)`: "for this last part here can just use calculator"): after the powers have
  cancelled, go straight to the calculator's value (`26/9` over `−26/3`), then the answer. No line
  turning a negative power into "one over", no "times its flip" line. (The reviewer asked for both
  three times — Adrian's rule wins.)
- **One equation, line by line — no side workings** (19 Oct 2026, of Compare powers: "you don't have to
  do the powers first separate on another line, just make the equation go line by line, explaining
  along the way, having separate explanations break the flow > only do it if a concept is really
  complex"): each move rewrites the WHOLE equation on the next line (the power done in place, the
  brackets opened inside the powers); its reason is the voice and a note under the line. No line that
  works on one piece alone (`(a/b)² = …`, `a: (2x+2) − (3−y) = …`), no section titles. A side line only
  for a really complex concept.
- **Compare lines are labelled in words** (19 Oct 2026: "write comparing powers of a: instead of just
  a :"): `Comparing powers of a:` on its own line, the equation `2x + y − 1 = 9` under it; same for b.
  (A label, not a section title.)
- **Brackets when minusing a power: say WHY, with the common mistake, at that step** (19 Oct 2026:
  "instead of keep the brackets: the whole bottom power is taken away > say make sure you put brackets
  because its minus (explain that? a common mistake is students not putting brackets so they got their
  signs wrong)"): "Make sure you put brackets, because we minus the whole bottom power." then "A common
  mistake is leaving out the brackets. Then the signs inside come out wrong." with a `✗ Common mistake:`
  note under the line. A common mistake that is the REASON for a step is explained at that step; only a
  "Watch out" goes after the answer.
- **"Add up like terms"**, not "collect the terms" (19 Oct 2026).
- **A power of a power: multiply straight away, on the same line** (19 Oct 2026: "a power of a power
  means multiply the two powers, just multiply directly, show the continuation of the equation, don't
  have to separately show the multiplying of the two powers"): `5^{x+2} = (5^2)^{x-1} = 5^{2x-2}` —
  no separate `5^{2(x-1)}` line, no moving 2, no `2^{x\times2}` middle step. Times power is named in
  the note under it. (The reviewer once asked for that middle step — Adrian's rule wins.)
- **A term the voice moves is SEEN moving there** (19 Oct 2026, Evaluate 10ˣ: "when the narrator says
  first, group the fives on one side, but the screen doesn't show that > should show the animation of
  5^(2x-1) flying down underneath 5^(x-1)"): when a term goes to the other side or under another term,
  the board moves it — into a fraction's bottom too: wrap the landing place in the next line's tex,
  `\dfrac{5^{x-1}}{\htmlClass{lsn-pc-d}{5^{2x-1}}}`, give that token `"from": "<the term's id>",
  "into": "d"`, write the line, then `move` on the words that say it (the term its own token in the
  line it leaves).
  **The move happens where it can be seen: write the equation again, then move inside THAT line**
  (19 Oct 2026, of the same clip: "the previous equation can't be seen here, so can't see the
  animation of 5^(2x-1) flying down … have another line 2^(x+2) x 5^(2x-1) = 5^(x-1) <- then from
  that equation, animated moving 5^(2x-1) underneath 5^(x-1) at the same line"). Never fly a piece
  from a line far up a scrolled board: the line starts as the equation again (`g1 g× g5 g=`) and the
  fraction token `replaces` the last three, with `"from": "g5", "into": "d"` — the line is rewritten
  in place as 5^(2x−1) moves down under 5^(x−1).
  **A move is smooth** (19 Oct 2026: "the animation of moving the 5^(2x-1) is not smooth" — the rest
  of the line jumped and the piece landed across the fraction bar): every piece that changes place
  MOVES — the 5^(x−1) rises into the top (`"also": [{"from": "ge", "into": "n"}]`) while 5^(2x−1)
  goes under it; what stays on the line (the =) slides to its new place; each piece lands letter on
  letter. Write the = as its own token so it can slide.
  **Two steps: first under, THEN tidy** (19 Oct 2026: "animation is better, but can we move 5^(2x-1)
  under 5^(x-1) first, with 2^(x+2) and 5^(x-1), once its under, THEN move the expressions to make it
  nicer (to the end stage)"): the piece goes under its partner WHERE THE PARTNER STANDS while the
  rest of the line keeps still (it drops below the line first, then slides along — never through the
  =); **the fraction line is drawn as soon as it is under** (19 Oct 2026: "Can we have the line
  between fraction once the 5^(2x-1) goes underneath 5^(x-1)?"); a short pause; then the made
  fraction (both pieces and its line) and the = slide together to the final line. The player does
  this for any in-place rewrite with an `also` partner.
  **APPROVED — the reference move for every future clip** (19 Oct 2026: "good, this animation is
  good. remember it for future clips"). Copy it from `evaluate-10-to-the-x-am` line 4 of the plan:
  the equation written again as its own tokens (`g1 g× g5 g= ge`), the fraction token
  `{"from": "g5", "into": "d", "also": [{"from": "ge", "into": "n"}], "replaces": ["gx", "g5", "ge"]}`
  with `\htmlClass{lsn-pc-n}{…}` / `\htmlClass{lsn-pc-d}{…}` around top and bottom, then one `move`
  on the words that say it. Any term that goes to the other side as a divide (or a times into a
  fraction) moves this way.
- **Say WHY the step is done, and name the property of indices it uses** (19 Oct 2026: "instead of
  saying: first, group the fives on one side…, say : To simplify the expression, we can group the
  fives on one side.. and we can apply property of indices, since its divide, the powers minus.. and
  so on"): "To simplify the expression, we can group the fives on one side." … "We can apply a
  property of indices: since it is divide, the powers minus."
- **Say what we are finding, and why we need not find x** (19 Oct 2026: "instead of saying leave x
  alone, say we have to find the value of 10^x, not x. while it is possible to solve for x, we can
  manipulate the equation to solve for 10^x, without solving for x"; after watching it, the same
  evening: **"remove 'not x'"**): "Without a calculator, we have to find the value of ten to the
  power X." then "While it is possible to solve for X, we can manipulate the equation …".
- **The plan says what we need, and names the bases** (19 Oct 2026: "instead of saying The plan: put
  two to the power X..., say to find 10^x, we need 2^x times 5^x. Note the base is 2 and the other
  base is 5"): no "The plan:" opener and no "glue them" — say what the answer is built from, then
  name each base, each lit as it is named.
- **Show which parts make the shape** (18 Oct 2026, Sketching: "highlight ln(-x) in ln (2-x) when
  saying that is the shape"): when the voice says the question's curve "has the shape of" a basic one,
  light those parts in the question's equation (`ln(` `−x` `)`, not the 2), in the colour of that
  shape's curve in the corner (`"tone": "sky"`). Split the equation into tokens so the parts can light.
- **Teach the family before the case** (18 Oct 2026, Sketching: "perhaps can introduce the four basic
  shapes of logarithmic graphs first"): a clip that uses a set of basic shapes or standard forms
  first SHOWS the set — one sketch with every curve labelled (`graph.curves`), each lit as the voice
  names it and says how it is flipped — then does the question.
- **Steps pinned on screen ONLY where they help — not by default** (18 Oct 2026: "we don't have to
  always give steps like that. i only suggested it for graph sketching for logs because it's
  helpful"). Graph sketching (asymptote → shape → draw → intercepts) keeps them: the plan's `pinned`
  steps sit above the board, shown as the voice lists them (`pin` show) and lit on each one's turn
  (`pin` lit). An ordinary solve says its plan in the voice and shows it as maths on the board, with
  no strip.
- **Draw it when a picture teaches it** (17 Oct 2026: "if you need to include diagrams in the clips,
  please do so"): a graph question gets real sketches on the board — give the line a `graph`
  (curve, dashed asymptote, labelled points); show the shape, then the curve against its asymptote,
  then the finished sketch with every label the question asks for.
- **The base in its own colour** when the voice talks about the base (`"part": "sub"`).
- **Highlight the parts a law acts on**, colour-matched to the law (M orange, N blue), and keep those
  colours in the result line.
- **Light the pieces INSIDE a fraction when the voice pairs them** (19 Oct 2026, Compare powers — the
  reviewer's note "which a sits over which a", Adrian: "do it"): wrap each piece in the token's tex,
  `\htmlClass{lsn-pc-a}{a^{2x+2}}`, and light it with `{"do": "highlight", "token": "g1", "inside": "a",
  "tone": "orange"}` — the a's orange, the b's blue (`"inside": "b", "tone": "sky"`), same colours on the
  next line.

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
- **The notes' hand-written words blinked out during a move** (18 Oct 2026, seen by the stand-in
  reviewer in Same base, compare powers): the board grows as a piece moves, resizing the ink layer
  wipes it, and the ink came back only on the next frame. Fixed in the player (`chalk-writer.ts`:
  a resize re-lays the ink at once; a re-fit re-lays it in the next frame, never wiping first). →
  while a piece moves, check a frame at move + 0.7 s: every "Times power:" word and ↑ must be there.

- **The hand font drops a decimal point** (20 Oct 2026, Exponential graphs: the note `x = 1: 0.1, x = 2: 0.005` drew as "0 1", "0 005"). → numbers with a point go on a board line (KaTeX), never in a note.

- **A long chain on one line prints small on a phone** (19 Oct 2026, Compare powers: `a: (2x+2) − (3−y) = 2x+2−3+y = 2x+y−1` shrank to about 60 %). A line shrinks to fit the width, so keep a line to about 25 characters; put the result of a chain on the next line (or into the line that uses it).

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
   **Review before recording** (Adrian, 18 Oct 2026: "yes" to making clips cheaper): run the reviewer
   on the storyboard (`--no-frames`) as soon as the draft passes draft-check, fix, and run it AGAIN (it
   is not deterministic — take every must from both runs). Only then record the voice, ONCE. Then the
   phone look and one review with frames; a must there is fixed without changing the words if it can be
   (so the recording stays). Voice ≈ US$0.10, reviews ≈ US$0.10 (text) / US$0.20 (frames) a run.
   **One clip per fresh session**: a new clip is built in its own new session, never at the end of a
   long one — a long session re-reads its whole history every message. Everything a builder needs is in
   this file, the topic bible, `scripts/clips/prompts/writer.md` and the reference clips.
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
| **Indices: Same base, compare powers** (`same-base-compare-powers-am`) | Built 18 Oct in ONE go with both checks (the one-shot test); stand-in review: 0 must after two false alarms were fixed in the reviewer's brief. Waiting for Adrian's note count. |
| **Indices: Solving by substitution** (`solving-by-substitution-am`) | Built 18 Oct in one go (Indices clip 2). Stand-in review rounds: 2 must → 1 must → pass → (a fresh run found 1 more must: the key step's middle line) → pass with shoulds only. Waiting for Adrian's note count. |
| **Indices: Compare powers, two unknowns** (`compare-powers-two-unknowns-am`) | Built 19 Oct alone in a fresh session, recipe in order. Then ("do it") the a's light orange and the b's blue inside the fractions. Then (his power-of-a-power rule) (a^{x+1})² goes straight to a^{2x+2} on the same line; voice re-recorded. Then re-cut as one equation line by line (his "don't do the powers first separate on another line"; 10 lines, 2 min). Before that, his other 19 Oct rules: "since the base is the same, the powers must be the same, hence …", the simultaneous solve in one step, no "Step one" in the voice or titles; the 💡 Why? chip shrinks once its step has passed. Gate green 19 Oct. Storyboard reviews: 2 musts over 6 runs (a skipped middle line; "= 1" a beat late), both fixed before the voice. Phone review: pass; its "lines too small" should was taken (a long chain on one line shrinks — keep each line to about 25 characters). Waiting for Adrian's note count. |
| **Indices: Split the power, then factorise** (`split-the-power-am`) | Built 19 Oct alone in a fresh session (Indices clip 4, note 108.15 → −1/3), every 18–19 Oct rule applied: one expression line by line, no step numbers, no Watch out (the 3ⁿ + 3 mistake is said at the split, where it is the reason). Storyboard reviews: 1 must per run (plan line looked like part of the chain → "Plan:" label; then a "3⁻² = 1/9" line was added for the reviewer), then two passes. Phone review pass. **Adrian's first note (19 Oct): "for this last part here can just use calculator"** → the "one over" line and the "times its flip" line removed; after the cancel it goes 26/9 over −26/3 → −1/3 (his notes' layout); the last two voice lines re-recorded. Gate green. Waiting for more notes. |
| **Indices: Evaluate 10ˣ without finding x** (`evaluate-10-to-the-x-am`) | Built 19 Oct alone in a fresh session (Indices clip 5, note 108.23 → 10ˣ = 1/4), every 18–19 Oct rule applied: one equation line by line (11 lines, scrolls, ~3 min), `10^x = ?` then the key fact 10ˣ = 2ˣ × 5ˣ, the fives grouped, Minus power with the brackets mistake said at the step, split + negative power flips on one line (his notes' layout), cross multiply, 2ˣ × 5ˣ moving into 10ˣ, boxed 1/4; why not find x is a written drop-down. Storyboard reviews: the same 1 must in both runs (lighting the key fact far up the scrolled board → the Same power note goes under the 10ˣ line instead), then three passes; the "why split / why the right side is 1" shoulds taken before the voice. Phone look caught one look-back at the scrolled-off question line → removed (voice unchanged). Phone review pass (its one should, "cancels" → "is zero", not taken: it would put a lone 0 on the board). Gate green 19 Oct. **Adrian's first notes (19 Oct), all four applied the same day** (rules in §2): "we have to find the value of 10^x, not x … without solving for x"; "to find 10^x, we need 2^x times 5^x. Note the base is 2 and the other base is 5"; 5^(2x−1) now flies down under 5^(x−1) — then (his next note) the equation is written again and the 5^(2x−1) moves down inside that same line; then ("remove not x", "not smooth") "not X" dropped from the voice (one line re-recorded) and the move made smooth — 5^(x−1) rises as 5^(2x−1) drops, the = slides, letters land in place (new token fields `also` and `into` / `fromPiece` — the cross-multiplied 5ˣ moves up beside 2ˣ too); "To simplify the expression, we can group the fives … since its divide, the powers minus". Voice re-recorded (27 lines, ~3 min), gate green again. Then his move notes: write the equation again and move inside it; smooth; two steps (under first, then tidy); the fraction line drawn once it is under → **"good, this animation is good. remember it for future clips"** (the reference move, §2). Gate green 19 Oct. Waiting for more notes. |
| **Indices: Exponential graphs, the four basic shapes** (`exponential-graphs-am`) | **His third note (20 Oct): "don't have to say as x grows... just say +1 means shift the graph up by 1"** → the "as x grows", values and y → 0 + 1 lines removed; "Plus one means shift the graph up by one" slides the curve and the dashed asymptote; back to one fixed board (7 lines); beats 11–20 re-recorded; gate green. **His second notes (20 Oct), all five applied the same night** (rules in §2, "Graph clips, Adrian's second watch"): the question is now **y = 2e⁻³ˣ + 1** (the minus flips it, the +1 shifts it — the curve and the dashed asymptote slide up from y = 0 to y = 1); corner labels kept inside the box; the e/x flicker fixed in the player; the "2 and 3" note under the 2; the asymptote shown on the board with values. 11 lines, so the board scrolls (the summary is a new bottom line, never a look back up; the +1 is lit in `y → 0 + 1 = 1`, not on the scrolled-off question). Storyboard reviews: 2 musts (an id shared with a corner curve; the y = 0 substitution line missing) → fixed → both pass. Voice re-recorded (beats 6–22). Phone look + review caught: labels colliding (now one per corner), the shifted curve poking above the graph (now cut before the shift), decimals lost in a note (now a maths line), a line running under the sketch (split), the tail near the axis (x to 0.6, the x label under the axis). Gate green 20 Oct. Waiting for Adrian's notes. **Adrian's first notes (20 Oct), all four applied the same day** (rules in §2, "A graph is drawn big, clear, and as you go"): bigger sketch, the tail clear of the axis, the stretch to 3e²ˣ moved to "they only stretch it" so (0, 3) lands on the curve, 3 steps (no "draw" step); two voice lines re-recorded. Built 19–20 Oct alone in a fresh session (Indices clip 6, the first Indices graph clip, note 1081.04: sketch y = 3e²ˣ). Copied from Sketching: the four shapes eˣ, e⁻ˣ, −eˣ, −e⁻ˣ in the corner, each lit as named with how it is flipped; empty axes; 4 steps pinned and lit (shape, asymptote, intercepts, draw); "it is the minus sign that matters" — no minus, so the shape of eˣ, the e and x lit in the question, eˣ lifted from the corner; the 3 and 2 lit orange, "do not change the shape"; dashed y = 0; Sub x = 0 worked line by line to (0, 3), marked; Sub y = 0 → e²ˣ = 0 (no solutions), boxed, a written "Why is it never zero?"; draw: eˣ STRETCHES into 3e²ˣ through (0, 3) (new `sketch.to`). Fixed board, 7 lines, ~2.5 min. Storyboard reviews: 1 must each run ("divide by three" said but not seen → reworded; the reviewer's brief did not know about the stretch → told), then two passes. Voice once, 21/21 heard. Phone look: 11 px too tall (one note dropped) and the Why? chip covered step 4 (now goes to the bottom corner when steps are pinned). Phone review pass, gate green 20 Oct. Waiting for Adrian's notes. |
| Laws of logarithms | Put back to the version before the rebuild (fixed board) |
| Log scales | **The word-problem reference (approved 18 Oct: "way better").** The version before the rebuild + (18 Oct) "Let I_p = intensity of pump, I_d = …" written, the two readings as equations, why we subtract (draft W2); its "not 12" Watch out dropped; "We want … = I_d/I_p = ?" written; now it SCROLLS (`"scroll": true` in the plan); opens with "First, what the question says" (the formula, each letter, what to find) |
| Sketching log graphs | The version before the rebuild + (18 Oct) the 4 basic shapes first, the 4 steps pinned and lit, real sketches: the shape of ln(−x), the curve against x = 2, the labelled sketch (draft W2; it scrolls) |

Still offered, not answered: rewrite the explanations in log equations, exponential and Linear Law so
no step is a shortcut (the 18 Oct rule). Update this table whenever a clip changes.
