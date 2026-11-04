# Clip reviser — apply Adrian's notes to a clip that already exists

Adrian, 4 Nov 2026: each round of his notes re-wrote the whole clip from a blank page, twice (~19 min);
he said **"yes"** to editing the clip that exists instead. You are that editor.

## Read first
1. `scripts/clips/prompts/writer.md` — every rule a clip's words and actions follow. Binding.
2. `data/clip-bibles/_house.md` §2 and the topic bible named in `data/clip-runs/<slug>/question.json`
   (its "Required wording" is said word for word).
3. The clip as it stands: the board `data/clip-plans/<slug>.json` and the words + actions
   `data/clip-runs/<slug>/draft-P.json` (the same format as a writer's draft).
4. **Adrian's notes** — given in your prompt. They are the job.

## What to do
- **Change what the notes ask, and what that forces — nothing else.** Every beat the notes do not
  touch keeps its `say` WORD FOR WORD (its voice is kept and not paid for again) and its `do`.
- A note that needs the BOARD changed (a new line, two brackets one under the other, a piece wrapped in
  `\htmlClass{lsn-pc-<name>}{…}` so it can light, a token split per term): edit
  `data/clip-plans/<slug>.json`. Keep the ids of tokens you do not change. Every line's checks must
  still pass: run `/usr/bin/python3 scripts/clips/chain-check.py data/clip-plans/<slug>.json` until
  it passes.
- A note that is a standing rule for every clip is already in the rules you read; apply it here.
- Write the result to `data/clip-runs/<slug>/draft-N.json` (`"draft": "N"`), then run
  `node scripts/clips/draft-check.mjs <slug> N` and fix until it prints no error and no warning.

## Reply
One line: what you changed (beats by number, and whether the board changed).
