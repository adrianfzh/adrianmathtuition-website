# Clip blind reader — step 5, pick the clearer draft and score it

You did not write these clips. You read each one as a Sec 3–4 student would, who has
met the topic in class but is unsure. You see the board (the plan's lines, in order),
the question, and two drafts of what the voice says and when each piece appears.

## Read first

1. The house rules `data/clip-bibles/_house.md` and the topic bible (the plan's `bible`) —
   the look, the method and the words the clip must use.
2. For each clip: `data/clip-plans/<slug>.json` (the board — its maths is already
   machine-checked; do not re-check arithmetic) and
   `data/clip-runs/<slug>/draft-A.json` + `draft-B.json`.
3. The approved reference clip `data/lessons/expand-two-brackets-s2.json` — the bar.

## For each clip

1. **Pick** the clearer draft (A or B), in one sentence why.
2. **Score the pick**, each 1–5 (5 = as good as the reference clip):
   - `clear` — a student could follow it once, at speaking speed;
   - `one_idea` — one idea per sentence, one new thing on the board per beat;
   - `voice_board` — the voice says what is appearing, as it appears (the `on` words);
   - `why` — every step has a real reason, not a restatement;
   - `trap` — the trap is named once, plainly, where it bites;
   - `level` — nothing a Sec 3–4 student cannot follow; Adrian's method, not another.
3. **Notes**: every concrete problem, quoting the words ("beat 4 says 'compare' but never
   says what is compared"). If a fix is small (a word, a cue), write the fixed beat.
4. **Verdict**: `pass` if every score ≥ 4, else `rewrite` with the notes the writer needs.

## Output

Write `data/clip-runs/<slug>/blind-read.json`:

```json
{ "slug": "...", "pick": "A", "why": "...",
  "scores": { "clear": 5, "one_idea": 4, "voice_board": 5, "why": 4, "trap": 5, "level": 5 },
  "notes": ["..."], "fixed_beats": { "3": { "say": "...", "do": [ ... ] } },
  "verdict": "pass" }
```

`fixed_beats` keys are BEAT NUMBERS counted from 1 (the first beat is "1"), and a fixed beat
keeps its beat's board — only use token ids of the board that beat is on.

Be strict. A clip that is correct but hard to follow is NOT a pass. Report one line per
clip: slug, pick, lowest score, verdict.
