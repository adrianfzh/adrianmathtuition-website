# Clip writer — step 2b, the narration on a checked board

You write the spoken part of ONE one-minute clip: its `beats`. The board is already
planned and maths-checked (`data/clip-plans/<slug>.json`, step 2a + step 4). You do
not change the board. You write what the voice says and when each piece appears.

## Read first (all of it)

0. The house rules `data/clip-bibles/_house.md` (every topic). A QUESTION clip (plan `kind:
   "question"`) explains how to do THIS question. **Do not read the question out — explain what it
   is asking** (Adrian, 26 Oct 2026: "don't have to read the question, but explain what the question
   is asking"; the whole question is shown beside / above the clip already): beat 1 says what the
   question is about and what it gives, in plain words ("This question is about a curve, drawn only
   where X is greater than negative one."), the next what it wants us to show or find — then the
   plan. Say it in the QUESTION'S words, not your own ("does not intersect the curve", never "misses
   it" — Adrian, 26 Oct 2026). When a power or root's reach matters, say what it covers ("the bracket
   two minus a half X, to the power eight"). Each later beat names the move AND why it is the move (the bible's lead-in
   question where it has one, e.g. "What do we sub?"). Never say a sentence that seems to
   contradict an earlier beat — if two steps look alike, say what is different.
1. The topic bible named in the plan (`bible`) — Adrian's method, his words, the traps,
   the notation table, the stock phrases. The clip uses HIS method and HIS words.
2. The plan: `lines` (each line's tokens with their `id`s — the only things you can
   write / mark / note near), `intro` (the question, printed on the board from the start
   when present), `outline` (the order of ideas — follow it; you may merge or split
   beats, never add a method).
3. The approved reference clip `data/lessons/expand-two-brackets-s2.json` — the
   standard Adrian approved ("let's keep to this quality"). Match its plainness.
   For a clip that teaches a NEW METHOD or object (the conjugate, a substitution), also read
   `data/lessons/rationalise-conjugate-am.json` — approved 21 Oct 2026 as the reference (house rules §6).
   For a WORD PROBLEM (a story or a formula), also read `data/lessons/log-scales-am.json` — the
   approved reference for explaining the question first, substituting each given value on the board
   and saying why the first move is the move (house rules §6).
4. The narration and word-cue rules are the Rules below — do not open docs/LESSONS.md (100 KB;
   everything a clip needs from it is restated here).

## Output

A JSON file: `{ "slug": "...", "draft": "A" | "B", "beats": [ ... ] }` — `beats` exactly
in the lesson format (`src/lib/lesson-script.ts` `Beat`):

```json
{ "say": "Two: A times minus three B is minus three A B.",
  "do": [
    { "do": "mark", "kind": "arc", "token": ["a", "d"], "label": "2", "on": "A times" },
    { "do": "write", "token": "p2", "on": "minus three A" }
  ] }
```

Actions you may use: `write` (`step: n` for a whole line, or `token: "<id>"`),
`highlight` (`token`), `mark` (`kind`: underline | circle | box | arc | arc-under,
`token`), `note` (`text`, `near: "<id>"`). Nothing else — no character, no sticker,
no focus, no clear.

## Rules (each one is checked)

- **Beats ≤ 24 words each, ≤ 460 words in all** — as many beats as the explanation needs (house rules §2).
- **House rules §2 is Adrian's standard** — every point in it is something he asked for after watching
  a clip. Read all of it before writing; a draft that breaks one is sent back.
- **The first beat says what the question is asking** — not a reading of it (Adrian, 26 Oct 2026); it
  writes the question's line. No warm-up.
- **The method Adrian uses, shown as he writes it**: dividing a polynomial is LONG DIVISION on the board
  (Adrian, 26 Oct 2026: "do long division instead"), built row by row as it is said — one token with
  pieces `\htmlClass{lsn-pc-q}{…}` (quotient), `p` (the product row), `r` (the remainder), each
  written with `{"do": "write", "token": "<id>", "inside": "<piece>"}` (copy `line-misses-curve-am`).
  Drawn like the real symbol (28 Oct 2026): the ")" meets the bar, every term in its column — 4x under
  4x, the quotient over its term — copy the `ld` token's tex exactly, changing only the terms.
- **A graph is labelled with its equation** beside the curve (Adrian, 26 Oct 2026: "put the equation
  y=(4x+2)/(x+1) beside the graph drawn (label the graph)") — the side sketch's `label` {text, x, y}.
- **Each beat: the step, then why** — in its own short sentence. ("Take log on both
  sides. Seven and five cannot be made the same base.")
- **Every line of the board is shown by some beat** (`write step: n`, or every token of
  it written by id).
- **The FIRST action of a beat has no `on`** (it fires as the beat starts) — or has one,
  your choice; **every LATER action must have `on`** = a word or short run of words
  copied EXACTLY from that beat's `say`, in spoken order, at least three words apart.
  Never `at`.
- **One new thing per beat** (two at most) plus at most one pointing mark.
- **The trap: one plain sentence, at the step where it bites**, with a `circle` on the
  token it is about. Not a warning speech before it.
- **The answer is boxed** (`mark` kind `box`) on the word where the voice says it.
- **Margin words** (`note`): the LAW a line uses, beside that line (bible §1b), or the bible's §3
  words — always with `near` = the token it explains (the board draws an ↑ under it; write no
  arrow). A note is plain handwriting text, not TeX: write × for times (never · — the hand font
  has no dot), ² ³ ˣ for powers (raised letters like ʳ ⁿ ᵏ draw as ticks; write the power out or
  leave it off), √ for roots, ⇒ for gives. **No decimals in a note** — the hand font drops the decimal point ("0.005" drew as "0 005", 20 Oct 2026); put numbers with a point on a board line instead. A note can only show once its line is on the board: put it after the action that
  writes the line, or in a later beat.
- **No "Step one / Step two" in the voice** except a graph-sketching clip (its steps are pinned): say the move.
- **Two answers side by side**: `"cols": true` lines — each answer worked straight down its own column.
- **A target-form plan floats in the corner** (Adrian, 20 Oct 2026): a plan line the whole working
  aims at (`Plan: 2^□ × 3^△ × 7^○`) gets `"corner": true` in the plan — written on the words that say
  it, it then stays in the top-right corner for the whole clip ("a constant reminder"). Approved after watching (20 Oct 2026: "so it's good to pin the plan on the top right-hand corner") — every clip with a plan line pins it.
- **Go straight to the method** (Adrian, 20 Oct 2026, Surds: "there is no need to say multiply by root
  five alone still... doesn't help in understanding > student will be wondering by you say that?"): never
  open with why another way fails. Say when the method is used ("When there are two terms below, multiply
  …"), what it is (the conjugate: only the middle sign flipped), and WHY it works — said once the move
  is done on the board (next rule), with a written drop-down for the worked detail.
- **Write it, do it, THEN say why it works** (Adrian, 20 Oct 2026): the new thing is written first
  (`Conjugate of √5 + √3 is √5 − √3`) and explained from that line; then the line that does the move; then the
  working, pointing out the form the rule needs (`(a + b)(a − b) = a² − b²`); then the step done; only
  then "That is why … works", at the line that shows it. The plan names the move in plain words ("multiply
  the top and the bottom by the conjugate"), never a vague aim ("the same value, written with no surd in
  the bottom" was "not useful, confusing").
- **Highlights: steady, few, on the words that name the part** (Adrian, 20 Oct 2026: "a lot of blinking
  and enlarging … usually a highlight will do"): never re-light what is still lit from the beat before;
  no highlight just to "draw attention". Name things exactly ("two surd terms"). A new object is written
  as a sentence on the board (`Conjugate of √5 + √3 is √5 − √3`), then the how is lit inside that line.
- **What the voice talks about is fully in view at every screen size**, a short laptop window too
  (Adrian, 20 Oct 2026: "the part you are referring to can be clearly seen"): check the look at the
  phone AND `--width 1280 --height 640`.
- **Pinned steps only for graph sketching** (or when Adrian asks): the plan's `pinned` + `pin` actions
  (`show` as the voice lists them, `lit` on each step's turn). An ordinary solve has no strip.
- **Motion is animated, and its graph draws out with it** (Adrian, 26 Oct 2026: "animation that shows how
  the dot moves from O to A to O to B to O and how the graph draws out > that's the most important
  understanding part. then how to find the values of unknowns from the graph"): for an oscillation give a
  line a `swing` ({ id, amp, period, ends: [first end, centre, other end], unit?, label? }) and play it with
  `{"do": "swing", "step": n}` on the words that describe the motion; then read a and n OFF the graph —
  light `<id>-amp` (the highest value), `<id>-per` (one full wave), `<id>-top` / `<id>-bot`. A question
  with a diagram starts with the diagram on the board, and nothing comes before "what the question says"
  (reference: `data/lessons/oscillating-dot-am.json`).
- **A graph is drawn as you go** (Adrian, 20 Oct 2026): no "draw it" step — each pinned step adds to the
  sketch; a stretch/slide of the basic shape comes BEFORE the intercepts, so each point is marked ON the
  curve; the sketch window keeps the curve's tail clearly off its asymptote; big enough to read on a phone.
- **A set of basic shapes first**: one `graph` with `curves` (each `id` + `label` + `labelAt`), a beat
  per curve that `highlight`s its id as the voice names it and says how it is flipped.
- **A horizontal line y = c that slides** (25 Oct 2026, "for which c does y = c miss / meet the curve"):
  the plan's `sketch.hline` `{label, at: [heights], labels?: [one per height]}`; `{"do": "sketch", "line": i}`
  draws it at `at[i]` or slides it there, and a dot appears wherever it then meets the curve — show a
  height that cuts the curve, the boundary, and one above. A sketch with no family of shapes leaves out
  `inset`: the `shape` stage then draws the curve on (a domain like x > −1: add `+ 0*sqrt(x + 1)` to `shape`).
- **Explain a word problem first** (house rules §2): a question with a story or a formula the student
  may not know opens with a "First, what the question says" step — the formula on the board, what each
  letter means (its own line each, the letter lit: `part` "num"/"den" for a fraction's top/bottom), each
  given value substituted on the board (`Pump: N = 50, I = I_p` then the equation), what we must find.
- **The plan first** (bible §1b): the second beat says the aim before the first move — and
  writes no working line (a highlight at most). Each working line
  appears in the beat whose voice explains it, on the words that name it.
- **Explain every part, don't rush** (house rules §2, Herbert Gross): every move gets its reason;
  light the exact part you are talking about as you name it; the note sits right under it; a
  rejection is explained (substitute, show what breaks) before "(rej)" appears on "reject". Up to
  340 spoken words.
- **Use the animation**: when a piece moves in the maths (a coefficient up into a power, the insides
  out of the logs, a base and an argument into an index equation), the board moves it — the later
  line's token has `from` the earlier one (a power `tight`), and a `move` action fires on the word.
- **"negative one", never "minus one"** for a negative number; "minus" only for subtraction.
- **Never say a piece "flies"** — say the maths ("bring the power up").
- **One scrolling board**: the plan is one board that scrolls (house rules §1); never write a beat that
  re-writes a carried line. When the working changes, the next LINE shows it — not a rewrite.
- **Routine steps go fast** (solving a quadratic at A Math): a few words a line. Once only numbers are left, use the calculator — no "one over" line, no "times its flip" line (Adrian, 19 Oct 2026). The new idea of the
  clip gets the slow, every-reason treatment.
- **Checks**: a log equation's check opens "For log equations, always check each answer."; the
  expression checked comes from the question line (a `move` from its token); EVERY answer is checked
  on the board, each log of the question named (`log₃x = log₃9 ✓`), never only in the voice.
- **A "why" detour is written, in a drop-down**: one line on the board states the fact, and the beat
  carries `"aside": {"text": "Why …?", "slug": "<topic>-<point>", "read": ["…", "…", "**takeaway**"]}`
  — up to 10 lines, one idea a line, inline `$…$` maths, the last line bold. No side clip is made.
- **A term the voice moves is seen moving** (Adrian, 19 Oct 2026): into a fraction's bottom too — the
  next line's token wraps the landing place in `\htmlClass{lsn-pc-<p>}{…}` and carries `"from"` + `"into": "<p>"`;
  write that line first (the bottom stays empty), then `move` on the words that say it. On a scrolling board
  never fly from a far line: write the equation again as the line's first tokens, and let the fraction
  token `replaces` them (`from` the moving term, `into` its landing piece) — rewritten in place. Every piece that changes
  place moves (`"also": [{"from": "<id>", "into": "<piece>"}]` for the others — "the animation … is not
  smooth" when they jumped); keep the = its own token so it slides. This move is APPROVED as the reference
  (Adrian, 19 Oct 2026: "good, this animation is good. remember it for future clips") — copy line 4 of
  `data/clip-plans/evaluate-10-to-the-x-am.json` for any term divided across into a fraction. Say WHY the
  step is done ("To simplify the expression, …") and name the property ("since it is divide, the powers minus").
- **While a piece moves, nothing else is written**: the `move` is the only action on its words.
- **Never skip a key step**: the plan's lines are the board — every line is written in its own
  beat or on its own word, and the voice says what the move is.
- **The base in its own colour**: a line that talks about the base ("same base", "the base
  matches") lights the bases — `{"do": "highlight", "token": [...], "part": "sub"}` for a log's base.
- **One equation, line by line** (Adrian, 19 Oct 2026): each move rewrites the whole equation on the
  next line, its reason in the voice and a note under it — no side line working on one piece, no
  section titles, unless the concept is really complex.
- **Pieces inside one token** (a fraction's a over a, b over b): wrap each in `\htmlClass{lsn-pc-<name>}{…}`
  in the plan's tex and light it with `{"do": "highlight", "token": "<id>", "inside": "<name>", "tone": "orange"|"sky"}`.
- **Light the question as the voice describes it** (Adrian, 31 Oct 2026: "highlight the part (and make it
  momentarily larger "like jump out") when narrator describes the question"): every beat that reads or
  describes a piece of the QUESTION (what it gives, what it asks: "the first three terms…", "then use them
  for the coefficient…") carries `{"do": "quote", "text": "<that piece, copied EXACTLY from the question,
  whole $…$ maths only>"}` — the question card lights it and a short piece jumps out. One per beat.
- **A law acting on two terms points at their middle**: give its note `"span": ["a", "b"]`; keep
  the law short enough for one line.
- **A mistake goes LAST, as a "Watch out" step**: after the answer is boxed, one beat opens
  "Watch out: …", circles the line it is about and writes a red `✗ Watch out: …` note under it —
  never say a trap without writing it, and never stop the working for one. A step of the method
  (rejecting a root) stays in place as a plain reason.
- **Spoken maths**: words, never symbols or TeX. Letters as CAPITALS ("X", "K", "A")
  so the voice reads the letter. Numbers in words ("seven point five", "minus eight
  point five seven"). Follow the bible's notation table (lg = "log", ln = "L N").
- **No** `?`, no "Hi" / "Today" / "Let's", no cheering ("Easy", "That's it", "See"),
  no "as you can see" / "on the board", no story, no model names, no "AI", never a
  person's name, no school or paper name.
- The last beat says the answer in full.
- **`asks` on every beat**: 1–3 short questions a student might ask at that step, in their words
  ("Why does plus become multiply?", "Which law is this?") — the ready questions of "Ask about this
  step" (SPEC-CLIP-PIPELINE §8b). `assemble.mjs` carries them; a beat without them fails the tests.

## Two drafts

You are draft **A** or **B** (the session tells you). Write your own best version —
do not look at the other draft. A blind reader will pick the clearer of the two.

Write each clip's file to `data/clip-runs/<slug>/draft-<A|B>.json`. Then check your own
work: word counts per beat and in all, every `on` appears in its beat's `say` in order,
every line shown.

**The machine check — run it, fix, run it again until it says PASS:**
`node scripts/clips/draft-check.mjs <slug> <your draft key>` (the same verifier the clip must
pass). Its exact numbers: at most **2 things APPEAR in a beat** — `write` and `note` each count,
`mark`/`highlight` do not (so a line + its rule note is a full beat; the circle may join them);
**4–24 words a beat**, ≤ 460 in all, ONE scrolling board; cued actions ≥ 3 spoken words apart. A
beat that needs a third thing is two beats.

Report one line per clip: slug, beats, words, and the draft-check result.

- **Said = shown is machine-checked** (`clip-said-shown.ts`): every number and named letter you SAY must be
  on the board by the end of that beat (write it on the words that say it). Then the stand-in reviewer
  (`review.mjs`) marks the clip against the house rules before Adrian sees it.
- A law note uses the topic bible's OWN name for the law (Logarithms: "Add Power", "Minus Power", "Bring down power") — never a textbook name like "Power law".
