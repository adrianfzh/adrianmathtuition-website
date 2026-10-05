# SPEC-TWINS — our own question for every school question we serve

**Verified by the checks since 30 Sep 2026** (Adrian: *"if they pass the checks consider them verified"*): `publish` runs only after every gate, the blind solve and the moderator passed, so it writes `verified=true` (`gen_meta.verified_by = 'checks'`); Adrian's per-twin read is no longer a step, Retire on `/admin/generated` takes one out. The 51 twins written before the change were flipped the same day. Flipping a topic to ours-only stays his. **Status: phase 2 BUILT 30 Sep 2026** — `serving_policy` + `serving_school_rows()` + the `twin_readiness` view (`migrations/serving_policy.sql`), the four serving RPCs admit school rows only where the policy says so, `practiceEligibility {schoolRowsRetired}` mirrors it, `GET|POST /api/admin/serving-policy` (409 below the threshold), the 👯 Flip section on `/admin/ops` (`lib/serving-policy.ts` pure/tested); Adrian flips, nothing flips itself. **Phase 1 BUILT** the same day (the Fly worker's `twins` lane). **Phase 0 BUILT 30 Sep 2026** — the `twin_queue` view + the `kiosk_pool` verified guard (`migrations/twin_queue.sql`; every serving door now refuses an unverified `ai_generated` row), `scripts/twins/twin.mjs` (queue · brief · check · publish · review) and the `twin-question` skill (Opus author → gates → Sonnet blind solve → Opus moderate → figure → insert `verified=false`). 40 E Math twins written for Adrian's read the same day (Adrian: "40 in review page is good, we can go ahead"). **Phase 1 BUILT 30 Sep 2026** — the Fly worker's `twins` lane (bot `worker/fly/twins.sh` + `jobs.sh`, every 15 min at nice 15 behind marking, ≤3 sources a run, EM first via `TWINS_LEVEL`, `job_runs` `twin-batch`, `docs/OPS.md`) and Adrian's per-twin ✓ Verify on `/admin/generated` (`POST /api/admin/generated {action:'verify'}`). Phase 2 (`serving_policy` + the flip) waits until verified twins ≥ the drawn school rows of a topic. **Spec written 11 Sep 2026.** Adrian: *"creating questions based
off the schools' questions and then serving our own questions, and not serving
schools' questions — in the end our serving bank will just be wholly our own
questions. need to consider running as a proper company."* Then: *"write the
generator spec."* Policy context: [`docs/CONTENT-POLICY.md`](docs/CONTENT-POLICY.md)
(national rows are already grounding-only; school rows are served today and
this is the road off them).

## 1. What a twin is

A twin is **the same practice value as its source, in our own expression**.

Same: the sub-skill (the source's `question_subgroups` filing), the level, the
part structure and the marks per part, the difficulty tag, the method the
student must find, and the syllabus phrasings that belong to everyone
("Express … in the form", "Hence, or otherwise", "correct to 3 significant
figures", "Show that").

Different, always: the numbers and quantities; the context or story where the
source had one (a different object, place, person, scenario); the sentences
themselves; the figure, which is drawn by us from a spec, never cropped from a
scan; the worked solution and the key, which are ours and in Adrian's voice.

The test the moderator applies: *would a teacher holding both say "that is the
school's question with the numbers changed"?* If yes, reject. Structure may
match, because structure is the skill; wording, numbers, context and figure may
not. The mechanical floor is the GCE generator's novelty gate (word-trigram
Jaccard ≤ 0.4 against the source and against every real question at the level)
plus a number-swap detector (the source with its digits masked must not equal
the twin with its digits masked).

Why this is enough, and why less is not: copyright protects the expression of a
question, not the mathematical idea. A twin that swaps one number keeps the
school's expression. A twin that reads as a new question is ours.

## 2. Inputs

- One source row of `questions` (a school row, or a national one — a twin of a
  national question is ours and worth having): `question_text`, `parts[]`
  (label, text, marks, answer), `solution`, `answer`, `level`, `topics`, the
  `question_subgroups` filing, `difficulty`, `total_marks`, the figure
  (`image_url` / `figure_url`) and its family if one was ever specified.
- Adrian's teaching material for the topic through `teaching_knowledge()`
  (`lib/teaching-knowledge.ts` — methods and pitfalls), so the solution is
  written the way he teaches it.
- The figure registry (bot `lib/figures/`, 33 families with `verify(spec)` that
  fails closed) for the redraw.

## 3. Output — one row

| column | value |
|---|---|
| `school` | `AdrianMath` |
| `exam_type` | `Twin` |
| `ai_generated` / `verified` | `true` / `false` until every gate passes, then `true` |
| `twin_of` | the source row's id — **new column**, `uuid` nullable, FK `questions(id)`, indexed |
| `level`, `topics`, `difficulty`, `total_marks` | copied from the source |
| `question_subgroups` | the source's filing, copied (the twin serves the same sub-skill) |
| `question_text`, `parts[]` | the twin — `parts[].marks` equal to the source's part for part |
| `solution`, `answer` | ours; house style (one idea per line; ONE orange right-aligned `[Ans: …]` at the end of the question, never per part) |
| `figure_url`, `has_image` | the redrawn figure and `true`, or null/`false`; **never** `image_watermark_status='clean'` (that stamp is the five fitness checks' alone) |
| `gen_meta` | `{kind:'twin', twin_of, author_model, blind_model, moderate_model, gates:{novelty, number_swap, structure, blind_agree, figure_verify}, figure:{family, spec}, generated_at, verified_at}` |
| `year` | the generation year |

Never touch the source row: it stays for grounding (marking, the solver), for
the twin's own provenance, and for Adrian's reference.

## 4. The pipeline per twin — the GCE generator's method, reused

The `gce-paper` skill already runs author → blind solve → moderate under the
plan with a different model per role; twins use the same shape and the same
scripts where they fit (`scripts/gce-paper/`: the novelty gate, the figure
step, `assemble`'s gate logic).

1. **Author** (Fable, a plan-billed `Agent` spawn — never the API): reads the
   source, §1's rules, the topic's teaching material, and writes the twin: the
   question, every part with its marks, the key, a worked solution in Adrian's
   voice, and a figure spec if the source had a figure.
2. **Novelty gate** (script): trigram Jaccard against the source ≤ 0.4 and
   against every real question at the level ≤ 0.4; number-swap detector; a
   part-by-part check that no part's text is a substring of the source's.
3. **Structure gate** (script): same number of parts, same labels, same marks
   per part and total, same difficulty tag; every part has an answer.
4. **Blind solve** (Opus — a different model from the author): sees only the
   question text and figure, never the key or the source; returns answers.
5. **Moderate** (Fable): sees the twin, the key, the blind answers, and the
   source; passes only when the blind answers agree with the key, the twin
   exercises the source's sub-skill at the same difficulty, it reads as a
   real exam question in SEAB style, and it does **not** read as the source
   re-numbered. Any doubt is a reject with a one-line reason.
6. **Figure** (script): `verifyFigure(spec)` then render → `figure_url`. A spec
   the registry refuses is a reject when the source had a figure; a twin may
   drop a purely decorative figure the source had only if the moderator says
   the question stands without it.
7. **Insert** with `verified=true` once all gates are green (the only way to
   reach publish), gates recorded in `gen_meta`. A rejected twin is not inserted; the
   reason goes to the batch log so the next attempt can avoid it (up to two
   retries per source, then the source is parked with the reasons).

## 5. Which sources, in what order

Serve-side coverage is a few thousand rows, not the bank's 35,000. The queue
is built from what students actually receive:

1. School rows drawn in the last 90 days — the practice picker
   (`student_attempts`), the kiosk (`kiosk_prints`), printed papers
   (`generated_papers`), Find (`portal_generation_log`), From Adrian
   (`portal_assignments`), and the Practice Again sheets' bank ids.
2. Then the rest of the serving pool by sub-skill, so every sub-skill the
   picker can draw from reaches the flip threshold (§6).
3. National rows last: they are grounding-only already, so their twins add
   coverage rather than replace anything served.

A view `twin_queue` (source id, level, sub-skill, draws in 90 days, has a
verified twin?) is the whole scheduler; the batch takes the top rows.

## 6. The flip — per (level, topic), then everywhere

School rows leave serving one topic at a time, never by surprise:

- A `serving_policy` table: `(level, topic, school_rows boolean default true,
  flipped_at, flipped_by)`. The four serving RPCs (`practice_next`,
  `practice_pool`, `kiosk_pool`, `practice_candidates`) join it and, where
  `school_rows` is false, admit only rows with `school in ('AdrianMath',
  'AI Generated')`. `practiceEligibility` mirrors it for direct reads, as it
  does for `national` today.
- The ops board shows, per topic: verified twins, school rows drawn in 90
  days, and a **Flip** button that is enabled when verified twins ≥ drawn
  school rows. Adrian flips; nothing flips itself (doctrine: the outward step
  is his).
- Lessons' "real bank checks" and the notes reader's worked examples swap to
  twins the same way (they already go through `practiceEligibility`).
- End state: every topic flipped, the serving bank wholly ours. School and
  national rows stay in the bank for marking, the solver, provenance and
  Adrian's reference.

## 7. Red lines

- **Never the Anthropic API for authoring** — plan-billed agents, as the GCE
  generator does. (The live "Made for you" path on Find stays API-backed; it
  is on-demand, capped at 10 a day, and out of scope here.)
- Never copy a figure, a sentence beyond syllabus phrasing, or the source's
  numbers. Never keep the source's context.
- Never serve a twin before `verified=true`; never flip a topic below the
  threshold; never flip without Adrian.
- Never delete or edit the source row.
- Never set `image_watermark_status='clean'` on a twin.
- Solutions in Adrian's voice, one `[Ans:]` line per question; student-facing
  copy says "app", never "portal".

## 8. Worked examples

**A — algebra, no figure (source: a 2022 prelim, complete the square).**
Source: *Express x² − 6x + 7 in the form (x + q)² + p. [2] Explain why the
minimum value of y = x² − 6x + 7 is p. [1] Given that 2r = √((p + r³)/r), find
p when r = 2. [2] Express r in terms of p. [2]*
Twin: *The curve y = x² + 10x + 19 is to be written as y = (x + a)² + b. Find a
and b. [2] State, with a reason, the least value of y. [1] The quantities u and
k satisfy 3u = √((k + u³)/u). Find k when u = 3. [2] Make u the subject. [2]*
Same skill, same marks, new numbers, new sentences, no shared context. Trigram
overlap with the source is well under 0.4; the masked-digits test differs.

**B — a context question (probability with a tree diagram).**
Source: two beads drawn without replacement from a bag of red and blue beads;
(a) draw the tree diagram, (b) P(both red), (c) P(different colours).
Twin: a box holds 5 working torches and 3 faulty ones; two are taken at random
one after the other. (a) Complete the tree diagram. (b) Find the probability
that both work. (c) Find the probability that exactly one is faulty. Same tree,
same marks, a different world and different counts; the tree is drawn by the
`tree-diagram` family from its spec.

**C — a figure question (bearings).**
Source: a triangle ABC with AB = 8 km on a bearing of 040°, BC = 5 km on a
bearing of 130°; find AC and the bearing of C from A.
Twin: a drone flies from P to Q, 12 km on a bearing of 065°, then to R, 7 km on
a bearing of 155°. Find PR and the bearing of R from P. The figure is the
`bearing` family with the new numbers; `verify(spec)` re-derives PR before it
draws. The GCE generator validated exactly this figure step blind on 9 Sep 2026.

## 9. Trigger, log, alarm (doctrine steps 4–5)

- An in-app scheduled task `twin-batch` (queue-only, like `inbox-extract`):
  each run takes ten sources from `twin_queue`, runs §4, stops. Runs every
  30 minutes while the desktop app is open; four in parallel when Adrian wants
  the fleet on it (each with its own RUNNER name).
- **The pick is per sub-skill across both years (1 Oct 2026, Adrian: "we need a
  twin (or a few twins) for every skill/type of question … Sec 3 A Math and Sec 3
  E Math are quite similar right?").** The bank files Sec 3 rows under the Sec 4
  sub-skills (S3_AM → AM's, S3_EM → EM's), so `twin.mjs queue` works the FAMILY
  (`AM`+`S3_AM`, `EM`+`S3_EM`): the rows drawn in 90 days first, then ONE row for
  every sub-skill with no twin in either year (largest first), then the rest one
  row per sub-skill per round; inside a sub-skill the lane's own level goes
  first. A lane started for either level draws from both. Measured that morning:
  A Math 209 sub-skills / 36 covered, E Math 310 / 35 — the target is those
  ~520 sub-skills, not the 36,000 school rows. Sum-and-product-of-roots (sub-skill
  1522, out of the syllabus since 2021) was stamped `legacy_syllabus` the same day
  so the queue skips it.
- Every run stamps `job_runs` `twin-batch` with counts (verified / rejected /
  parked); a `JOB_RHYTHMS` line so a dead task alarms by absence; the ops
  board's content row shows twins verified, pending, parked, and per-topic
  readiness for the flip.
- One Monday line to Adrian: twins verified this week, topics ready to flip,
  and a link to a 20-twin sample for his eye. A student flag on a twin
  (`flagged_count`) routes to the pair, source beside twin, on the flags
  board.

## 10. Phasing and cost

| phase | what | size |
|---|---|---|
| 0 | `twin_of` column, `twin_queue` view, the `twin-question` skill (the §4 method, one source at a time), 20 twins run by hand for Adrian's read | 1 day |
| 1 | the batch task on the drawn set (~3,000 sources); four slots at ~10 twins an hour each | 1–2 weeks of fleet time |
| 2 | `serving_policy` + the RPC joins + the ops Flip button; first topics flipped | 2 days, then Adrian's ticks |
| 3 | lessons and notes checks swap; the rest of the serving pool | ongoing |
| 4 | every topic flipped: serving bank wholly ours | — |

Plan-billed throughout, so the API cost is nil; on the API it would be roughly
S$0.10–0.30 a twin. Adrian's time: the 20-twin read in phase 0 and one tick per
topic in phase 2.

## 11. Science twins — our own Challenge MCQs (5 Oct 2026)

Adrian, 5 Oct 2026: *"yes > start with Challenge"*, then *"do the twins for science like for
math — twins jobs run all day whenever marking is quiet"*.

**Goal.** Every OPEN science practice topic (`SCIENCE_PRACTICE_OPEN_TOPICS` + the Combined list
in `src/lib/portal-beta.ts`) reaches **30 servable Challenge MCQs**. A topic stops at 30. The gap
on 5 Oct 2026 was 362 (pure Chemistry already full; Biology, Physics and the Combined topics short).
`node scripts/science-twins/sci-twin.mjs gap` prints it from the same filters the app serves with.

**What a science twin is.** A NEW MCQ modelled on a real Challenge (else Exam) row of the same
sub-skill (`question_subgroups`): a new situation and new numbers, harder reasoning, four options
whose wrong ones are real student mistakes, ONLY 6091 / 6092 / 6093 / Combined Science content
(physics: no equations of motion, no momentum, no circular motion). Figures only from the bot's
figure library (`lib/figures`, verify fails closed), never copied. The solution is the house shape:
**Key idea:**, one step a line, **Answer: X**, **Why not the others** (naming a mistake only when it
reproduces that option exactly). Nothing names a school, a year or a model.

**The gates** (`scripts/science-twins/`, every role a plan-billed `claude -p`, never the API):
1. **Author** (Opus) — `sci-twin.mjs brief` → `author-brief.md` → `Q1.json`.
2. **Automatic checks** — `sci-twin.mjs check`: format, house style, scope words, forbidden words,
   originality (trigram Jaccard ≤ 0.4 vs the seed AND every bank row of the topic, number-swap,
   ≥ 3 of the seed's options reused), the figure renders.
3. **Blind solve** (a fresh Opus) — sees only `Q1.solve.md`, never the key.
4. **Checker** (a fresh Opus) — key right, blind agrees, one defensible answer, in syllabus,
   original, same skill, genuinely Challenge (work score ≥ 4 on the estimator's scale), real
   distractors, house style, honest "why not" lines, student-safe.
One rewrite from the problems or the checker's fixes; a second failure drops it (`parked`, logged).

**Filed as ours** (`sci-twin.mjs publish`, science project): `school='AdrianMath'`,
`exam_type='Twin'`, `twin_of` = the seed, `gen_meta` (gates, blind answer, verdict, source_ref),
`verified=true` + `practice_checked_at` (passing every check IS the verify — Adrian, 30 Sep 2026),
the seed's sub-skill filing, and `practice_difficulty` `level='challenge'`, `source='twin'`
(`SERVED_DIFFICULTY_SOURCES` includes `'twin'`; students' results replace it after 20 first tries).
A figured twin waits for the science figure check (bot figfit, `FIGFIT_BANK=science`) to stamp
`clean`. Columns from `migrations/science_twins.sql` (science project).

**Where Adrian sees them:** `/admin/generated` → **🧪 Science twins** (seed folded under each,
Retire = `practice_hidden` + `verified=false`).

**The lane:** bot `worker/fly/science-twins.sh`, started by `jobs.sh` every 15 min when
`lane_room` has room (CPU, memory, lanes, no ship) and, by day, only when the marking queue is
empty — ≤ 3 twins a run, biggest gap first, one sub-skill at a time. Switch `science-twins` on
`/admin/switches`; ON once `/data/science-twins/.on` exists on the worker (`SCI_TWINS_LANE=0`
parks it). Run dirs `/data/science-twins/<seed>/`. Stamps `job_runs` `science-twins` (rhythm 30 h).
The ten drafts written by hand on 5 Oct 2026 (`scripts/science-twins/first-batch/`) were the lane's
first batch.

## 12. Cloud sessions write twins too (5 Oct 2026)

Adrian: *yes* — claude.ai cloud sessions write twins, maths and science, with no database key.
Same gates, same filing; the server re-runs every deterministic check (`lib/twin-gates.ts`) and
files the row (`gen_meta.written_by='cloud-session'`). Doors, token and setup: `docs/CLOUD.md`
§Cloud twins; the playbook: `.claude/skills/cloud-twins/SKILL.md`. Stricter than the local
scripts in three places: maths novelty also against our other twins and the whole family's
nearest rows, the number-swap test against the bank (not only the seed), and a maths solution
must carry the bold **Answer** line.

