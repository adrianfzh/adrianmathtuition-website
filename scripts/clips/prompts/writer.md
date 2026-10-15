# Clip writer — step 2b, the narration on a checked board

You write the spoken part of ONE one-minute clip: its `beats`. The board is already
planned and maths-checked (`data/clip-plans/<slug>.json`, step 2a + step 4). You do
not change the board. You write what the voice says and when each piece appears.

## Read first (all of it)

1. The topic bible named in the plan (`bible`) — Adrian's method, his words, the traps,
   the notation table, the stock phrases. The clip uses HIS method and HIS words.
2. The plan: `lines` (each line's tokens with their `id`s — the only things you can
   write / mark / note near), `intro` (the question, printed on the board from the start
   when present), `outline` (the order of ideas — follow it; you may merge or split
   beats, never add a method).
3. The approved reference clip `data/lessons/expand-two-brackets-s2.json` — the
   standard Adrian approved ("let's keep to this quality"). Match its plainness.
4. `docs/LESSONS.md` § Narration and § Word cues.

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
- **Margin words** (`note`) come from the bible's §3 words for this skill, start with
  "← ", ≤ 8 words, `near` the token they explain. One or two per clip.
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
every line shown. Report one line per clip: slug, beats, words.
