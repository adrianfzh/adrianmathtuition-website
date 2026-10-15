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

**A hidden sub-skill is never asked for twins (9 Oct 2026).** `migrations/twin_queue_hidden_subgroups.sql`
re-creates the view so a seed's sub-skill is its best OPEN filing (`subgroups.visibility` 'all' or 'ip';
'hidden' and any unknown value are closed) and a question filed only under hidden sub-skills is not a
seed. `math_twin_units`, `twin.mjs queue`, the cloud door and the dashboard read the view, so none of
them changes. **Applied 9 Oct 2026** on the maths project (the file also re-sets the view's
`security_invoker` option, which CREATE OR REPLACE VIEW had dropped). Science has no hidden sub-skills (`subgroups` there has no
`visibility` column), so `science_twin_units` is unchanged.

**Up to 3 twins from one school question, for short sub-skills only (15 Oct 2026).** Adrian: *"Let one
school question seed up to 3 twins, but only for skills that are short. Each new twin must be clearly
different from the school question and from the earlier twins … > do it"*, *"Some very small skills may
not need 5 at all. Those can stay at 2 or 3. > agreed"*, *"yes, do all 3"*.
- **Maths** (`twin.mjs`, `SEED_CAP` 3): a sub-skill with fewer eligible seeds (text > 40) than the
  target lets each seed carry up to 3 twins; every other sub-skill keeps one a seed. After its fresh
  seeds, the queue offers `<uuid>~2` / `~3` (fewest twins first); `twins.sh` uses the name as run dir
  and claim unchanged. `brief` adds our own live twins at the level to the novelty corpus (**before
  this, the maths gate compared only against school rows**), lists the earlier twins of the seed in the
  author brief, and the moderator reads them too (reads_as_source covers "reads as an earlier twin").
  `publish` files a 2nd/3rd twin as `twin-<uuid>-<n>` (figure `twins/<uuid>-<n>.png`) — it used to
  overwrite by seed — and re-checks the cap. `math_twin_units.free_seeds` counts the same rule
  (applied 15 Oct 2026): at 5 a sub-skill, writable went 450 → 922 across Sec 1, Sec 2, E Math, A Math.
- **Science structured** (`sci-stwin.mjs`): a topic with fewer fresh seeds than it still wants lets a
  seed with 1–2 structured twins in that pool offer its next (`stwinItem(pool, seed, pass)` →
  `…-<n>`). Its corpus already held every row of the topic, our twins included. Tier-1 seeds after
  the change: Cell Structure 1 → 5, Movement 3 → 8, Enzymes 1 → 9, Nutrition in Plants 2 → 14.
  The MCQ side (`sci-twin.mjs`) is unchanged — the open topics' MCQ twins are already full.

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
- **The maths gap is ONE function (6 Oct 2026)** — `math_twin_units(levels, per_skill)` in the
  maths project (`migrations/math_twin_units.sql`): one row per sub-skill of a level family with
  its live VERIFIED twins ('AdrianMath' / 'Twin' — never a Practice-photo row), need, free seeds
  and `writable = least(need, free seeds)`. `twin.mjs queue / need` (the Fly lane), the cloud door
  (`lib/twin-store.ts mathUnits`) and the dashboard's twins tile all read it, and report
  `to_write` = the sum of `writable` (`lib/twin-gates.ts mathGapSummary`). The target is staged
  (`TWIN_STAGES` = 3, then 5 — Adrian, 3 Oct 2026); the door and twin.mjs default to 3. Before
  this the door counted to 5 and twin.mjs paged `twin_queue` unordered, so they disagreed
  (Sec 1 206 vs 4). On 6 Oct 2026 at 3 a sub-skill: **Sec 1 4 to write, Sec 2 480, A Math 0,
  E Math 4** (at 5: 196 / 738 / 223 / 429); sub-skills that cannot reach 3 from the seeds they
  have: Sec 1 20, Sec 2 43, A Math 23, E Math 43.
- **A seed's sub-skill is fixed (12 Oct 2026)** — `migrations/twin_queue_stable_unit.sql`: the view's
  pick tied for a seed filed under several sub-skills with no primary (most Sec 3 rows) and
  returned a different one on different reads, so a sub-skill's twin count moved (988 read 9, then
  5) and the lane wrote past the cap of 5 (E Math ~120 extra over 46 sub-skills). The sub-skill id
  is now the last ORDER BY key. At 5 a sub-skill that day: **E Math 9 to write, A Math 205, Sec 1
  100, Sec 2 246**.
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

## 11. Science twins — our own MCQ for every sub-skill (5 Oct 2026)

Adrian, 5 Oct 2026: *"yes > start with Challenge"*, then *"do the twins for science like for
math — twins jobs run all day whenever marking is quiet"*, then the same afternoon: *"for science
twins, we don't need challenge questions most pressingly, we need twins questions of all
subskills like math — if we are to sell subscriptions on the app."* The Challenge-only target
(30 per open topic) lasted one batch; the goal is now coverage per SUB-SKILL.

**Goal.** **3 verified twins for every (pool, sub-skill)** — pools PHY / CHEM / BIO (pure, the
science bank's `subgroups`) and CS_PHY / CS_CHEM / CS_BIO (Combined: **only the sub-skills a Combined
school question is filed under** — the `combined_subskills` view in the science project, since
7 Oct 2026; before that it was every pure sub-skill of a topic the Combined bank has, which sent
runs to sub-skills Combined does not teach. The view fills as `file-subgroups-science` files the
Combined rows — every two hours, Combined first on ten of the twelve runs, `FILING_TIER=2` — so
the Combined pools write nothing until then). Order: the open practice topics first (`SCIENCE_PRACTICE_OPEN_TOPICS`
+ the Combined list), then every other topic; inside, fewest twins first, the six pools and the
topics taking turns. MCQ first; structured twins came on 14 Oct 2026 → §11b (each lane run now writes structured
twins first, then MCQ). Each twin is written **at its seed's level** (Core / Exam /
Challenge — `practice_difficulty`, results or the estimate); a seed with no level gets the level
of the checker's work score.

**The gap is ONE function** — `science_twin_units(open_topics, per_skill)` in the science project
(`migrations/science_twin_units.sql`): one row per (pool, sub-skill) with its twins, need, MCQ
seed count, up to five seeds and its rank. The Fly lane (`sci-twin.mjs gap / queue / need`) and
the cloud door (`/api/agent/twins/queue?bank=science`, `lib/twin-store.ts scienceUnits`) both read
it, so they never disagree. On 5 Oct 2026: **612 sub-skill units, 1 at 3, 605 short, 6 with no MCQ
seed — 1,792 twins to write, 292 of them on the open practice topics.**

**What a science twin is.** A NEW MCQ modelled on a real school row filed under the sub-skill: a
new situation and new numbers, the seed's demand (never easier), four options whose wrong ones are
real student mistakes, ONLY 6091 / 6092 / 6093 / Combined Science content (physics: no equations
of motion, no momentum, no circular motion). A Combined twin is modelled on a filed PURE seed (a
pure seed keeps the demand; the Combined rows only decide WHICH sub-skills count) and written inside the Combined syllabus. Figures only from the bot's
figure library (`lib/figures`, verify fails closed), never copied. The solution is the house
shape: **Key idea:**, one step a line, **Answer: X**, **Why not the others** (naming a mistake only
when it reproduces that option exactly). Nothing names a school, a year or a model.

**The gates** (`scripts/science-twins/`, every role a plan-billed `claude -p` or Claude Code
agent, never the API):
1. **Author** (Opus) — `sci-twin.mjs brief --pool P --subgroup S` → `author-brief.md` → `Q1.json`.
2. **Automatic checks** — `sci-twin.mjs check`: format, house style, scope words, forbidden words,
   originality (trigram Jaccard ≤ 0.4 vs the seed AND every bank row of the topic incl. our twins,
   number-swap, ≥ 3 of the seed's options reused), the figure renders.
3. **Blind solve** (a fresh Opus) — sees only `Q1.solve.md`, never the key.
4. **Checker** (a fresh Opus) — key right, blind agrees, one defensible answer, in syllabus,
   original, same sub-skill, `level_ok` (work score in the seed level's band — Core 1–2, Exam 3,
   Challenge 4–5 — or one above, never below), real distractors, house style, honest "why not"
   lines, student-safe.
One rewrite from the problems or the checker's fixes; a second failure drops the seed (`parked`,
logged). The lane skips a sub-skill after 3 dropped seeds (`/data/science-twins/skip/`). **Since 12 Oct
2026 a Combined "outside the Combined syllabus" verdict is one ordinary drop** (Adrian: "yes") — until then
it skipped the sub-skill at once, and 26 Combined sub-skills (~53 twins owed) were dropped after 1–2 tries,
often over what the author put into the twin rather than the sub-skill; their skip marks under 3 drops were
removed the same day (`.drops` counts kept).

**A tried seed is passed over, the next one is offered (11 Oct 2026).** The lane's `parked` /
`published` marks live only on the worker's disk, so `science_twin_units()` kept offering the same
first seeds; the lane dropped every one and reported "0 of 0" from 10 Oct with 247 twins over 172
sub-skills still owed and ~700 seeds unread. `sci-twin.mjs queue` now reads those marks itself
(`--done-dir` | `SCI_TWINS_RUNS_DIR` | `/data/science-twins`; no such folder = no filter): a
tried seed is removed before the pick, a skipped sub-skill is left out. The function returns at
most five seeds a sub-skill, and three drops skip it, so five is enough.

**New science sub-skills (12 Oct 2026).** 16 types added to the science tree after a read of the
2,159 questions the filer had set aside as "fits none" — most were correct skips under a second
topic tag; ~150 were real gaps → [`docs/science-subskill-review-2026-10-12.md`](docs/science-subskill-review-2026-10-12.md).
Each new sub-skill owes 3 twins once its questions are filed.

**Filed as ours** (`sci-twin.mjs publish` / the door, science project): `school='AdrianMath'`,
`exam_type='Twin'`, level = the pool's bank level (PHYS… or CS_PHYS…), `twin_of` = the seed,
`gen_meta` (`twin_item` = `sci-twin-<seed>` pure, `sci-twin-<pool>-<seed>` Combined; gates, blind
answer, verdict, `level_written`, `subskill`), `verified=true` + `practice_checked_at` (passing
every check IS the verify — Adrian, 30 Sep 2026), the sub-skill filing, and `practice_difficulty`
at the level written, `source='twin'` (`SERVED_DIFFICULTY_SOURCES` includes `'twin'`; students'
results replace it after 20 first tries). A figured twin waits for the science figure check (bot
figfit, `FIGFIT_BANK=science`) to stamp `clean`. Columns from `migrations/science_twins.sql`.

**Where Adrian sees them:** `/admin/generated` → **🧪 Science twins**: the coverage table (per
science: sub-skills, done, short, twins to write) and every twin with its seed folded under it;
Retire = `practice_hidden` + `verified=false`.

**The lane:** bot `worker/fly/science-twins.sh`, started by `jobs.sh` every 15 min when
`lane_room` has room (CPU, memory, lanes, no ship) and, by day, only when the marking queue is
empty — ≤ 3 twins a run, one per sub-skill. Switch `science-twins` on `/admin/switches`; ON while
`/data/science-twins/.on` exists on the worker (since 5 Oct 2026 15:39; `SCI_TWINS_LANE=0` parks
it). Run dirs `/data/science-twins/<pool>-<seed>/`. Stamps `job_runs` `science-twins` (rhythm 30 h).
The first batch (the ten Challenge drafts of the morning, `scripts/science-twins/first-batch/`)
went through on the worker: 7 published, 3 dropped by the checker.

## 11b. Structured science twins — our own multi-part questions with a mark scheme (14 Oct 2026)

Adrian, 14 Oct 2026: *"Aim at the structured questions now, then combined science, then the rest
of the topics. I will unpause them myself later"* → *"yes, and those twins will be generated by the
cloud workers right?"* (yes — the Fly worker's `science-twins` job).

**What one is.** OUR OWN structured question modelled on a real school structured row filed under
a sub-skill: a new situation, new numbers, new sentences; the **same parts, the same marks per
part and the same command words** (state / explain / calculate…). Every part is answered by
TYPING (no plot-on-the-grid, no complete-the-table, no drawing on a figure; no tables in the text).
The mark scheme is in the bank's structured shape, which the live practice grader reads
(`lib/practice-grade-prompt.ts` collectScheme): `parts[] {label, text, marks, answer, solution}`
(sub-parts as `subparts[]`). Each part's `solution` is one mark point a line ending in its code —
`(B1)` `(M1)` `(A1)` `(C1)` — the codes adding to the part's marks (or "Any N of:"), then a bold
`**Answer:** …` line; "Accept: …" lines may follow it. The row's `solution` is the parts' schemes
joined "(a) … (b) …"; `answer` is null.

**The gates** (`scripts/science-twins/sci-stwin.mjs` — same modes and files as `sci-twin.mjs`;
prompts in `scripts/science-twins/prompts/structured/`; tests `sci-stwin.test.mjs`):
1. **Author** (Opus) — the brief shows the seed's stem, parts, scheme and figures (to read, never copy).
2. **Automatic checks** — same labels and marks as the seed, every part has text/answer/scheme, codes
   add up, Answer line last, one point a line (≤ 260 characters), nothing typed-unanswerable, no table,
   no figure word without a figure, forbidden / out-of-scope words, novelty (trigram Jaccard ≤ 0.4 vs
   the seed and every bank row of the topic, number-swap, ≥ half the seed's parts reworded), the
   figure renders (bot figure library).
3. **Blind solve** (a fresh Opus) — answers every part from `Q1.solve.md` only.
4. **Checker** (a fresh Opus) — scheme correct, the blind answers marked with the scheme
   (`blind_marks`), blind agrees, scheme markable (a correct answer a good student might give that
   the scheme would not credit = false), one reading, typed-answerable, self-contained, in syllabus,
   original, same skill, same demand, level, house style, student-safe.
Publish only when every point holds, the blind solve earns all the marks (≤ 3 marks) or all but one,
and the checker scores ≥ 4. One rewrite, then the seed is dropped — as for MCQ twins.

**Filed as ours:** `school='AdrianMath'`, `exam_type='Twin'`, `twin_of`, `verified=true`,
`practice_checked_at` (so Structured practice serves it at once), `gen_meta.kind =
'science-structured-twin'`, `twin_item = sci-stwin-<seed>` (Combined `sci-stwin-<pool>-<seed>`),
the sub-skill filing, and `practice_difficulty` (the seed's level, else the checker's work score,
`source 'twin'`). `science_twin_units()` counts **MCQ twins only** since 14 Oct 2026, so a structured
twin never stops an MCQ twin being written for its sub-skill.

**The order** (`sci-stwin.mjs gap | queue`, computed in the script from the bank — not
`science_twin_units()`):
1. **Tier 1 — the open PURE topics** (`SCIENCE_PRACTICE_OPEN_TOPICS`, 13 topics).
2. **Tier 2 — the open Combined topics** (`SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS`); a Combined twin
   prefers a Combined seed, else a pure one, and is written inside the Combined syllabus.
3. **Tier 3 — every other topic.**
Inside a tier the thinnest topic first, the topics taking turns; inside a topic the sub-skill with
the fewest structured twins first. A topic is full at **40 servable structured questions**
(`SCI_STWINS_TARGET`) — checked school rows (the nightly `science-qcheck`) and our structured twins
both count. One twin per seed per pool, so a topic with few seeds stops short. Seeds with a
plot / table / draw-on-the-figure part are left out (no typed twin keeps that demand).
On 14 Oct 2026: tier 1 wanted 329, tier 2 279, tier 3 ~4,160.

**The split with MCQ twins (the lane).** Bot `worker/fly/science-twins.sh`, the same job, switch,
`job_runs` stamp and 30 h rhythm: each run writes up to `SCI_TWINS_STRUCT_PER_RUN` (2) structured
twins first, then MCQ twins fill the rest of `SCI_TWINS_PER_RUN` (3) in their own order — so MCQ
writing never stops. `SCI_TWINS_STRUCT_PER_RUN=0` = MCQ only. Run dirs `/data/science-twins/S-<pool>-<seed>/`,
skip marks `skip/S-<pool>-<subgroup>` (3 drops). The job_runs summary says how many were structured.
**Paused** as it was on 14 Oct 2026 — Adrian unpauses the lane himself.

**First samples (14 Oct 2026, by hand on the Mac, the lane's exact steps):** see
`docs/HANDOFF-2026-10-14.md` §Structured science twins.

## 12. Practice levels — Core / Advanced / Challenge (15 Oct 2026, AGREED, not yet wired)

Adrian, 15 Oct 2026, after a sorted sample of 40 A Math twins: *"students must be able to answer level 1 and level 2 > that is a must"* … *"core should be B3-A1, advanced should be A1 and above"* … challenge = *"bonus questions that say raffles institute or raffles girls school set"*. Replaces the earlier Core / Exam / Challenge names (science, 5 Oct) and the maths Standard / Advanced column (`questions.difficulty`, hand-guessed at extraction, 96 % "Standard").

| Level | Line under the button (student sees) | Meaning (for the sorter) |
|---|---|---|
| **Core** | Every exam question you must be able to do. | Routine AND typical multi-step exam questions with a signposted or standard method, however long. All of them mastered = B3 to A1. |
| **Advanced** | For A1 and above, and harder school papers. | The student must DECIDE the approach with no signpost (substitution, identity, case split, model from a context, two topics joined), or a genuine trap. Top of the A1 band; what harder schools set. |
| **Challenge** | Beyond the exam. | Bonus-style top-school questions: non-standard set-up, several unsignposted decisions. Never promoted from Advanced to fill the bucket. |

**How the sort works (Adrian, 15 Oct 2026: "most questions should be core. a better way would be to identify the advanced and the challenge questions").** Every question is **Core by default**. The sorter only looks for the exceptions: (1) a cheap first screen flags candidates — many marks, a last-in-paper position on the seed, a low share of students right where results exist, an unsignposted "hence"/set-up; (2) a careful Opus read decides Advanced or Challenge for the candidates only, and must name the decision the student has to make. No reason named → stays Core. Cheaper, and errs towards Core.

Inside Core the student can also pick **Short** (1–4 marks) or **Long** (5+ marks). No source type (school, national) is ever a choice — sources are never shown to students.

**The sample** (`docs/samples/am-twins-levels-sample-v2.html`, 40 A Math twins, 22 topics, one Opus read with the meanings above): Core 32 (8 short, 24 long), Advanced 8, Challenge 0. Twins copy normal school questions, so Challenge must be WRITTEN on purpose (a harder twin of a hard seed, same gates, blind solve still full marks) — a later job.

**Next, in order:** Adrian's ticks on the sample → sort every twin (one overnight run; ~3,600) → every new twin carries its level from the twin writer → the picker's Standard/Advanced toggle becomes Core/Advanced/Challenge (+ Short/Long) → science keeps its results-based sort but shows the same three names (its `exam` folds into Core, its `challenge` into Advanced until real Challenge questions exist). Labels live in `lib/practice-levels.ts`.
