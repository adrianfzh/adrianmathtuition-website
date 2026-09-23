# One photo question, on the plan

You are a sheet slot with no sheet to write. A student photographed a question on
the Practice tab and is waiting for a similar one (SPEC-PRACTICE-PHOTO §3). Your
job this session: claim ONE `generation_requests` row, author the question, run
the gate battery through fresh-context subagents, insert it ONLY with
`--insert-gated`, and stop. Nothing else. No digest, no top-up loop.

You are in the bot repo. Its `.env` carries the Supabase key. Prefix every
worker command with the project URL:

```bash
export SUPABASE_URL=https://nempslbewxtlikfzachi.supabase.co
```

## Steps

1. `node scripts/topup-plan-worker.js --claim`
   - `NO_PENDING` → stop. Another slot took it.
   - `CLAIMED` + JSON with `request.practice_photo` **false** → this is a
     nightly top-up row, not a photo: `node scripts/topup-plan-worker.js --release <id>`
     and stop. (The claim order puts photo rows first, so this is rare.)
   - `CLAIMED` + JSON with `request.practice_photo` **true** → continue. Read
     `request` (topic, tier, count, figure_mode, `intent` = what the student
     photographed, `figure_expected`, `seed_id`), `system` and `prompt`. The
     prompt is the production authoring brief — follow it exactly.

2. AUTHOR one question the way `.claude/skills/topup-bank/SKILL.md` §Loop step 2
   says (build backwards, LaTeX with single backslashes, marks in band, solve
   your own question from scratch before gating). The photo rules on top:
   - **Re-skin, never a clone.** With a seed, the new question keeps the seed's
     skill and shape but changes the context AND the numbers; a number swap
     alone is rejected by the worker's novelty gate. Without a seed, write from
     scratch on the filed sub-skill at the photographed marks.
   - The student's `intent` says what THEIR question asked. Match its sub-skill
     and its marks (±1), not the whole topic.
   - `figure_expected` true → the candidate must carry `figure_py` (the skill's
     figure rules), or the worker rejects it.
   - **Write the `hint` too** (23 Sep 2026, SKILL.md step 4 "Hint"): the
     student's 💡 "How to approach it" — at most three short lines in student
     words, how to start and what to look for, never a number they must find,
     never the answer, no names. It is served with the question; the website
     only writes one itself when the candidate carries none.

3. Run the PLAN GATE BATTERY exactly as SKILL.md §Loop step 3 (3a CODE + 3b
   BLIND in parallel, 3c SKILL, 3d DIFFICULTY, 3e FIGURE when figure_mode).
   Every gate subagent sees only the question text — never your answer. Never
   fill `plan_gates` from your own reasoning.

4. Write the candidate + evidence JSON (SKILL.md step 4 shape) to
   `/tmp/photo-<reqId>.json` and run
   `node scripts/topup-plan-worker.js --insert-gated <reqId> /tmp/photo-<reqId>.json`
   - `INSERTED <qid> DONE` → the worker has already told the website (the
     student's "Writing…" row becomes the live question). Stop.
   - `INSERTED <qid> NEED_MORE` → count is 1 for photos; treat as done. Stop.
   - `GATE_FAIL <gate>: <reason>` → fix and redo from step 2 (novelty: change
     more than the numbers). After 3 rejected candidates:
     `node scripts/topup-plan-worker.js --fail <reqId> "<reason>"` — the
     student's row is revoked with the reason — and stop.

## Rules

- ONE row. Do not call `--claim` a second time.
- Never insert into Supabase yourself; never edit the repo; never push.
- If a subagent errors, spawn a replacement once; still failing → the gate fails.
- Keep to the printed level and syllabus. The question must be answerable
  from its own text (and its figure).
- Finish with one line: `PHOTO <reqId> inserted <qid>` / `PHOTO <reqId> failed: <reason>` / `PHOTO none`.
