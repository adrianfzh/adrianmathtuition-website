---
name: science-bench
description: Build and run the SEEDED-SCRIPT bench for science marking (SPEC-SCIENCE-BENCH.md §1) — fake students with defects chosen in advance so every part's correct mark is known before marking, handed in through the real 🌙 queue, scored with the bot's calibration harness into calibration_results as truth_source 'seeded'. Trigger on "science bench", "seeded scripts", "seed physics scripts", "run the science bench", "re-run the bench after a physics/chemistry/biology rule change". Needs no marked paper from anyone. Runs on a Mac with both repos checked out (any Claude account); not a cloud-session task (service keys).
---

# The science marking bench — seeded scripts (§1)

Read `SPEC-SCIENCE-BENCH.md` first (the why, the defect vocabulary, the grade
profiles). This file is the HOW, written so a session on any account can run it
end to end without this conversation. Nothing here needs Adrian to mark anything.
Adrian's decision (17 Sep 2026): the scheme and examiner convention are the ground
truth; the bench measures faithfulness to them.

## What you are making

Thirty fake physics scripts (later chemistry, then biology) for papers whose mark
scheme we hold, each with a **defect plan chosen in advance**, typeset onto page
images and handed in through the normal marking route. The marker does not know
they are fakes. Each script has a truth file with the correct mark per part. The
bench result is one table: per defect kind, how often the marker was exactly right.

## Where things live

| thing | where |
|---|---|
| Website repo (admin API, dashboard) | `~/dev/adrianmathtuition-website` (or the `-2` clone if another session holds it) |
| Bot repo (brains, harness, science bank access) | `~/dev/adrianmath-telegram-math-bot` (or `-2`) |
| Existing seed tool (one point removed, one question) | bot `scripts/synthetic-script.js` — extend, do not rewrite |
| The harness that scores + saves | bot `scripts/eval-mark-model.js <runId> --truth <file> --from-stored --save` |
| Truth file shape | bot `scripts/calibration-truth.example.json` |
| Where results land | Supabase (math project) `calibration_results`; dashboard `/admin/calibration` |
| Where the bench's scripts + truth files are kept | website repo `data/science-bench/<subject>/<paper-key>/seed-<nn>/` (pages, `truth.json`, `plan.json`) — committed, so any session can re-hand-in the SAME scripts after a rule change |
| The science brains being tested | bot `ai/subjects/physics.js`, `chemistry.js`, `biology.js` (each run stamps `rules_version`) |

## Secrets you need (never in a cloud session)

- Website `.env.local`: `ADMIN_PASSWORD` (Bearer for every `/api/admin/*` call).
  Parse with `require('dotenv').parse`, trim, never grep — values carry trailing
  newlines.
- Bot `.env`: `SUPABASE_URL_SCIENCE` + `SUPABASE_SERVICE_KEY_SCIENCE` (the science
  bank, for schemes), `ANTHROPIC_API_KEY` only if you choose the API lane.
- The bot's harness needs `SUPABASE_URL` of the MATH project passed on the command
  line (it is not in the bot `.env`): `SUPABASE_URL=https://nempslbewxtlikfzachi.supabase.co`.
- Always call the site as `https://www.adrianmathtuition.com` (the apex redirect
  drops the Authorization header).

## Step 0 — pick the papers

Physics first. A paper qualifies when we hold its full scheme with per-part marks:

- **Preferred:** a `paper_schemes` row (math project) for a physics paper — a scheme
  a student or Adrian attached, already extracted per part. `GET /admin/schemes`
  lists them; the table has `subject, paper_key, questions`.
- **Otherwise:** the science bank (adrianscience project) — structured Paper 2
  questions with `parts[].subparts[].solution` carrying the marking points in
  **bold** (physics/chemistry) or numbered lines in `answer` (biology). This is
  what `synthetic-script.js` already reads. Take ONE school+year paper's questions,
  not a mix, so the fake script is one coherent paper.

Two or three papers, about 30–40 marks of parts each, is enough for 30 scripts
(10 per grade profile). Record each paper's key and source in `plan.json`.

## Step 1 — write the defect plan per script

For each script decide, part by part, one code from the vocabulary in
`SPEC-SCIENCE-BENCH.md §1` (`CLEAN`, `MISS_POINT`, `HALF_POINT`, `WRONG_WORD`,
`NO_UNIT`, `EARLY_ROUND`, `SLIP_CARRY`, `WRONG_FORMULA`, `EXTRA_WRONG`, `BLANK`)
and derive the truth mark from the scheme's own rule for that defect. Grade
profiles: **A** = 2–3 defects, rest `CLEAN`; **C** = about a third of parts seeded;
**E** = most parts seeded, several `BLANK`. Make sure every code appears at least
five times across the 30 scripts, and `HALF_POINT` at least ten (it is the 10 Sep
finding). `plan.json`:

```json
{ "subject": "physics", "paperKey": "5054 2014 P2", "grade": "E", "seed": 7,
  "parts": [ { "question": "3", "label": "(b)", "max": 2, "defect": "HALF_POINT", "truth": 1,
               "why": "point 2 stated half-right → 0 for that point" } ] }
```

Every `truth` must be derivable from the scheme text plus the defect code by a
reader who has not seen the answer. If it is not, the part is not a bench part —
mark it `CLEAN`.

## Step 2 — author the answers (plan-billed, in-session)

Spawn one authoring agent per script (Sonnet 5 for the mechanical A/C profiles,
Opus 5 when a `SLIP_CARRY` or `EXTRA_WRONG` needs judgment — never leave agents on
the inherited model). Give it: the question text, the scheme for each part, the
defect plan. It returns, per part, the student's answer text in a student's words
(no scheme codes, no bold, no dollar signs — `synthetic-script.js plainMath` is the
rule for maths), and for a `BLANK` part nothing at all. Rules for the author:

- Exactly the planned defect and nothing else. A `CLEAN` part is fully right.
- A `HALF_POINT` states the point so it is recognisably aimed at the scheme line
  but misses its substance ("energy is lost" for "kinetic energy is converted to
  thermal energy").
- A `SLIP_CARRY` shows the slip in (a) and uses (a)'s wrong value correctly in (b).
- Keep the exam's notation and numbers; never friendlier values.

Then a **blind verifier** agent (the `qb-verifier` pattern: sees answers + scheme,
NOT the plan) names, per part, which defect it sees and what mark the scheme gives.
Any part where verifier and plan disagree is re-authored. Do not skip this — an
accidental second slip poisons the truth.

Write `truth.json` in the harness shape: `source: "seeded"`,
`label: "seeded · <grade> · seed <n>"`, one entry per part with `awarded`, `max`,
and `note` = the defect code.

## Step 3 — render the pages

Extend `synthetic-script.js renderPage` (bot) into a `--plan <plan.json>` mode:
one page per question, printed question text in a print face, the student's
answer in the handwriting face with the slight tilt and a filled-in name line
reading `Name: BENCH SCRIPT` — never a plausible student name, so the cover
reader can never match a real student (without these cues the pre-pass classes prose as an answer key and refuses —
2 Sep 2026). A `BLANK` part prints the question and leaves the space empty. Save
PNGs under the script's folder. Pages are clean on purpose: this is not a vision
bench.

## Step 4 — hand in through the real route

For each script, the same three calls the admin marking page makes:

1. **Upload each page:** `GET /api/admin/mark-paper-annotated-token?type=original&filename=page-1.png`
   (Bearer) → `{uploadUrl, url}`; `PUT` the PNG to `uploadUrl`
   (`x-upsert: true`, content-type image/png). Keep each returned `url`.
2. **Save the paper:** `POST /api/admin/mark-paper` with
   `{"phase":"save-paper","paperName":"BENCH · physics · <paperKey> · <grade> · seed <nn>","subject":"physics","totalMax":<sum of max>,"source":{"photos":[{"photo_index":0,"original_url":"<url>"},…]}}`.
   Add `"scheme_source":{"pages":[{"url":…}]}` inside `source` for a
   scheme-grounded run; leave it out for rules-alone. Response carries the run id as `run_id`.
3. **Queue it:** `POST /api/admin/mark-paper` `{"phase":"enqueue","id":"<run id>"}`.
   It waits for a Mac slot under 🖥 Mac plan only (≈US$0.37), or the API lane.

Name every run with the `BENCH ·` prefix — the desk and papers library filter on
names, and nothing named `BENCH` may ever be tagged to a real student. Record the
run id in `plan.json`. Do NOT release these runs (they are untagged, so they wait).

Run physics in both modes: rules-alone AND scheme-grounded (same scripts, two
hand-ins). Chemistry both; biology scheme-grounded only.

## Step 5 — score and save

When a run's totals are filled (`/api/admin/papers?days=1` shows `total_awarded`),
in the bot repo:

```bash
SUPABASE_URL=https://nempslbewxtlikfzachi.supabase.co node scripts/eval-mark-model.js <run id> --truth <path>/truth.json --from-stored --subject physics --save
```

One `calibration_results` row per script, `truth_source 'seeded'`. Before the first
`--save`, check the table's `truth_source` has no CHECK constraint that rejects
`seeded` (query `pg_constraint` on the math project; add the value if it does).
Then add a `?truth=seeded` filter to `/admin/calibration` so the bench sits apart
from students' teacher totals (small site change: `admin/calibration/route.ts` +
the page's chips).

## Step 6 — the table

Aggregate `per_question` across the bench: per defect code (the truth note), the
share of parts where awarded == truth, and the mean signed delta. Print it and
paste it under a dated heading in `SPEC-SCIENCE-MARKING.md` (the way the 10 Sep
numbers are). The two lines to watch: `HALF_POINT` and `WRONG_WORD`.

**Accepting a rule change:** its target line improves AND no other line worsens AND
the `rules_version` stamp on the new runs differs from the old. Re-hand-in the
committed scripts (Step 4) — never author new ones to test a fix, or you cannot
tell the fix from the sample.

## Cost and time

30 physics scripts × 2 modes ≈ 60 markings ≈ US$22 on the Mac lane, one evening
(slots read ~6 pages/min). Authoring is plan-billed. Nothing is sent to a student.

## Do not

- Do not mark the fakes with `markPaperDirect` from a script to save time — that
  bypasses the queue, the pre-pass and the stored-scheme cascade the students get
  (see memory `verify-marking-through-remarkrun`). Hand in through the route.
- Do not tag a bench run to a student, release it, or let it auto-tag: a name
  starting `BENCH ·` yields no student tokens to `lib/auto-tag.ts looseTypedName`
  (same as `CALIBRATION ·`), and the page's name line says BENCH SCRIPT; keep both.
- Do not "fix" a brain mid-bench. Finish the run, read the table, then change one
  rule, then re-run.
