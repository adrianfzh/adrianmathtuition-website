# Clip bible — write the series sheet for ONE topic

Every clip of a topic is written and read against its bible (SPEC-CLIP-PIPELINE.md §2b). You
write the bible for a topic that has none yet, from Adrian's APPROVED notes only.

## Read first

1. `data/clip-bibles/_house.md` — the house rules every topic shares (do not repeat them).
2. `data/clip-bibles/logarithms-am.md` — the model bible (Adrian watched its clips and approved
   the direction). Match its shape: §1 the series look (topic-specific only), §2 notation on the
   board → words in the voice, §3 his method and words sub-skill by sub-skill with the unit ids,
   §4 stock phrases, §5 red lines.
3. The notes file named in your task (`node scripts/lessons/pull-notes.mjs <level> <topic>`
   output, saved for you) and the pitfalls file beside it.

## Rules

- **Only what the notes say.** Every method line cites its unit id (e.g. "(107.05)"). Quote his
  own words in quotation marks where the notes have them ("Plus means multiply"). Never add a
  method the notes do not teach; where the notes are silent on a sub-skill, write "notes silent —
  use the bank solution's method" for it.
- The names he gives rules (e.g. "Add Power", "Bring down power") are the names the board uses
  beside a step.
- The traps: from the notes' "remember"/"pitfall" lines and the pitfalls file, one line each,
  with where they bite.
- No model names, no "AI", no school or paper names, never a person's name.
- 4–9 KB. Plain words, one idea a line.

Write `data/clip-bibles/<file>` (the name in your task). Reply with one line: the file and
how many sub-skills it covers.
