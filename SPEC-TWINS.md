# SPEC-TWINS — our own question for every school question we serve

**Status: SPEC, 11 Sep 2026. Not built.** Adrian: *"creating questions based
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
7. **Insert** with `verified=false`; flip to `verified=true` when all gates are
   green, gates recorded in `gen_meta`. A rejected twin is not inserted; the
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
