# Clip writer — step 2b, the narration on a checked board

You write the spoken part of ONE one-minute clip: its `beats`. The board is already
planned and maths-checked (`data/clip-plans/<slug>.json`, step 2a + step 4). You do
not change the board. You write what the voice says and when each piece appears.

## Read first (all of it)

0. The house rules `data/clip-bibles/_house.md` (every topic). A QUESTION clip (plan `kind:
   "question"`) explains how to do THIS question: the first beat reads the question in `intro`
   (shorten story words, keep every number) — beat 1 is the question and nothing else, never
   "Let F of X be…" first, never a fragment — the second says the plan. Read the question in
   the printed word order, as a sentence, and say what each power or root covers ("ten plus K X,
   times two minus a half X, all to the power eight" / "the bracket two minus a half X, to the
   power eight"). Each later beat names the move AND why it is the move (the bible's lead-in
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

- **7–10 beats, each ≤ 24 words, ≤ 170 words in all.**
- **The first beat states the question** (if `intro` is present, read it; the first
  beat writes line 0). First word = the first word of the maths. No warm-up.
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
  has no dot), ² ³ ⁿ ˣ for powers, √ for roots, ⇒ for gives. A note can only show once its line is on the board: put it after the action that
  writes the line, or in a later beat.
- **The plan first** (bible §1b): the second beat says the aim before the first move — and
  writes no working line (a highlight at most). Each working line
  appears in the beat whose voice explains it, on the words that name it.
- **Never skip a key step**: the plan's lines are the board — every line is written in its own
  beat or on its own word, and the voice says what the move is.
- **Spoken maths**: words, never symbols or TeX. Letters as CAPITALS ("X", "K", "A")
  so the voice reads the letter. Numbers in words ("seven point five", "minus eight
  point five seven"). Follow the bible's notation table (lg = "log", ln = "L N").
- **No** `?`, no "Hi" / "Today" / "Let's", no cheering ("Easy", "That's it", "See"),
  no "as you can see" / "on the board", no story, no model names, no "AI", never a
  person's name, no school or paper name.
- The last beat says the answer in full.

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
**4–24 words a beat**, ≤ 170 in all, ≤ 2 boards; cued actions ≥ 3 spoken words apart. A beat that
needs a third thing is two beats. On a two-board plan every beat carries `"board": 0|1` and only
uses that board's token ids.

Report one line per clip: slug, beats, words, and the draft-check result.
