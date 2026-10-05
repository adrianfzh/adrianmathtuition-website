# Maths bank audit — 200 random practice questions (5 Oct 2026)

Adrian: "do the random sample of 200 math questions using cloud credit". This folder is for a
claude.ai CLOUD session. It holds 200 randomly sampled school questions that practice can serve
(`sample.json`: id, level, topics, marks, question_text, parts, answer, solution, image_url).
School exam questions — private: never paste them anywhere public, never commit them to `dev`/`main`.

Figures: `image_url` is a JSON list of paths; each picture is at
`https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/<path>` — open every one.

## What to do (in batches of ~20 questions, parallel agents, Opus)
For each question:
1. **Blind solve** — a FRESH agent that sees only the question text, parts and figure (never the
   stored answer or solution) solves every part.
2. **Check** — a second Opus agent compares: is the stored `answer` right for every part? Is the
   stored `solution` correct, complete, and readable (one step a line, ends with the answer)?
   Is the figure OK (matches the text, readable, not cut off, no stray text/watermark)?
   Is the question itself complete (no missing given value, no lost part)?
3. Write one line per question to `results.jsonl`:
   `{"id","level","answer_ok":true|false,"solution_ok":true|false,"figure_ok":true|false|null,
     "question_ok":true|false,"problems":"plain words, short","fix":"the corrected answer/step if wrong"}`
   Strict: any real doubt = false, and say why.

## Finish
Write `REPORT.md`: counts per level of each failure kind, the error rate overall (with the
honest margin for a sample of 200), the 10 worst examples in plain words, and whether the
problems cluster (a level, a topic, a source school/year pattern, old vs new extraction).
Commit `results.jsonl` + `REPORT.md` to THIS branch (`audit/maths-200`) and push. Do not
change the database (there is no key here) — fixes are applied later on the Mac.
