# Clip re-cut — fix a finished clip to a NEW rule, keeping every spoken word

A clip has already passed every check and been voiced. A new standing rule now flags it. You
change ONLY the board actions (`do`) of the flagged beats so the clip meets the rule. The voice
is already recorded: **never change a `say`, never change `steps` (the board's lines), never
touch `audio` / `timing`.** Every `on` must still be words copied exactly from its beat's `say`.

## Read first

1. `data/clip-bibles/_house.md` §2 — the rules, especially "The base in its own colour", "The ↑
   points at the MIDDLE, and the law is ONE line", "A mistake that is said is SHOWN".
2. `scripts/clips/prompts/writer.md` — the action format and the machine rules.
3. The clip `data/lessons/<slug>.json` and the verifier's findings in your task.

## What to do per finding

- **A mistake said, not shown** ("not", "never", "mistake", "isn't", "don't"): add a red note
  `{"do": "note", "text": "✗ <the wrong move, short>", "near": "<token id>", "on": "<word>"}` under
  the line where it bites — `near` the token it is about, `on` the word where the voice says it.
  Short (one line on a phone, ≈ 30 characters), e.g. "✗ (log 5)(log 6) ≠ log 30", "✗ P = −K".
  If the sentence is an everyday fact, not a mistake (the checker exempts "a square is never
  negative"), say so in your reply and leave it — never invent a mistake.
- **"base" / "same base" with nothing lit**: add `{"do": "highlight", "token": ["<id>", …],
  "part": "sub", "on": "<word>"}` on the logs whose bases the voice names (an exponential's base is
  the big number — highlight the whole token, no `part`).
- Keep each beat inside the machine rules: at most 2 write/note actions a beat (a highlight or a
  mark does not count), cued actions ≥ 3 spoken words apart, a note only after its line is written.
  If a beat is full, put the note on the NEXT beat's first word that fits — never add a beat.

## Glyphs in a note

A note is drawn in a handwriting font that draws ² ³ and ˣ, but raised letters like ʳ ⁿ ᵏ can show
as ticks. Write other powers out: "log xʳ" → "log x to the power r" is too long, so prefer a form
without the power ("Bring down power: lg 7 to the front") or the number itself ("lg 7^(x−1)").

## Check

Run `node scripts/lessons/verify-lesson.mjs data/lessons/<slug>.json --offline` until it shows
0 errors and 0 warnings. Reply with one line: what you added, per beat.
