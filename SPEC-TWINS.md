# SPEC-TWINS — our own questions for every skill we serve (a few per skill, not one per school question)

**🎯 Where things stand (15 Oct 2026, Adrian: *"finish 3 per skill first for both math and science, then we consider 5 next"*).** Maths lanes stop at **3** twins per sub-skill (bot `fly.worker.toml` `TWINS_TARGETS = '3'`, was `'3 5'`; the stuck report's E Math / A Math sub-skills also stop at 3). Science lanes write **multiple-choice twins to 3 first** and no structured twin until that list is empty, then structured again by themselves (`SCI_TWINS_MCQ_FIRST = '1'`, bot `worker/fly/science-twins.sh`). JC maths is still not in the lanes (Adrian 1 Oct: *"there is no need for JC yet"*). Left on 15 Oct: maths Sec 1–4 ≈ 190 writable to reach 3, science ≈ 120 multiple-choice. **Free API credit (16 Oct 2026):** `scripts/twins/api-twins.mjs` writes twins on the promotional credit with the same gates — trial 16/20 maths + 15/19 science long questions, US$14 spent; the full run (stop line US$120) waits for Adrian → §14. **Going to 5 is Adrian's next decision** — then put `TWINS_TARGETS` back to `'3 5'` and remove `SCI_TWINS_MCQ_FIRST`.

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

**Part skills (17 Oct 2026, SPEC-PART-SKILLS §Twins).** Every part of a twin gets its own sub-skill in
`question_part_subgroups`: copied from the seed at publish when the seed's parts are labelled and line up,
otherwise labelled by the filer's twins-only job (`file-twin-parts`). The main filing above never changes.

**Paused for part labels, then two phases (20 Oct 2026).** Adrian: *"can we make per part skill labelling the priority first, when finish, then twins can continue"* and *"make sure all science long questions hit 3 per skill first before moving on to 5 per skill for both math and science"*. The worker does it by itself (bot `worker/fly/jobs.sh` `twins_after_labelling`, 48c7ade6), stamping job_runs `twins-phase` at each change:
1. **While part labels run:** `twins` and `science-twins` switched off.
2. **Phase A — every filing lane idle:** `science-twins` ON, **long (structured) questions only, to 3 a sub-skill** (`SCI_STWINS_PER_SKILL=3`, 3 long a run, no multiple-choice); maths `twins` stays OFF.
3. **Phase B — three science runs in a row find no long question left to try at 3:** maths `twins` ON (to 5, `TWINS_TARGETS '3 5'`); science back to its normal settings — long questions 3→5, multiple-choice to 5, 2 long + 1 multiple-choice a run.
To skip ahead, flip the switches at /admin/switches; the API credit run is separate.

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
   **A drawing per part (15 Oct 2026, Adrian: *"diagrams should be at their corresponding parts?"*).**
   A drawing that belongs to ONE part (it sits at that part in the seed, or only that part uses it)
   is described on that part (or sub-part) as its own `figure_description`, drawn as
   `Q1<key>.figure.json|.cjs` (key = the labels without brackets: `Q1b`, `Q1bii`) and published into
   that part's `parts[].image_url`; the top `figure_description` / `figure_url` is only for a drawing
   the whole question uses (empty when every drawing belongs to a part). The brief tells the author
   where the seed's pictures sit (`plan.figure_layout`); `twin.mjs figures --run` fails when any
   picture Q1.json asks for is not drawn (the Fly lane parks on it); the cloud door takes
   `part_figure_specs {"b": {…}}` beside `figure_spec`. **`has_image` = a picture ABOVE the
   question**: a twin whose drawings all sit at their parts has `has_image=false`,
   `figure_url=null` — the serving gates (`has_image=false or figure_url or clean`) then admit it,
   every bank renderer draws `parts[].image_url` (practice `questionStructured`, kiosk/Find sheets
   `flattenParts`, printed papers `render-paper-pdf`), and the bot's two "no unchecked pictures"
   filters (`lib/portal-practice.js`, `ai/practice-questions.js`) count a part picture too.
   `gen_meta.figure.parts = {key: {label, url, family, spec, description}}`; an engine `.cjs` drawing
   now keeps its source in the spec so it can be redrawn. Back-fill of the twins written before:
   §13.
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
  seeds, the queue offers `<uuid>~2` / `~3` (fewest twins first); `twins.sh` claims by the name and runs in
  `<uuid>__2` (17 Oct 2026: the claude file tools refuse a `~` path). `brief` adds our own live twins at the level to the novelty corpus (**before
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
- **Progress is reported by skill, never by school question (11 Oct 2026, Adrian, the fourth
  time: *"Twins should be for every skill, not every question"*).** A status report had led with
  "school questions that now have a twin: 1,364 of 5,054 (27%)", which reads as if 5,000 twins
  were the goal. Say, per level: skills at the target, skills still short, twins left to write
  (`to_write` above; science §11) — and that the writer stops at the target (3, then 5).
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

## 12. Practice levels — Core / Advanced / Challenge (15 Oct 2026, AGREED; taps saved, results correction built)

Adrian, 15 Oct 2026, after a sorted sample of 40 A Math twins: *"students must be able to answer level 1 and level 2 > that is a must"* … *"core should be B3-A1, advanced should be A1 and above"* … challenge = *"bonus questions that say raffles institute or raffles girls school set"*. Replaces the earlier Core / Exam / Challenge names (science, 5 Oct) and the maths Standard / Advanced column (`questions.difficulty`, hand-guessed at extraction, 96 % "Standard").

| Level | Line under the button (student sees) | Meaning (for the sorter) |
|---|---|---|
| **Core** | Every exam question you must be able to do. | Routine AND typical multi-step exam questions with a signposted or standard method, however long. All of them mastered = B3 to A1. |
| **Advanced** | For A1 and above, and harder school papers. | The student must DECIDE the approach with no signpost (substitution, identity, case split, model from a context, two topics joined), or a genuine trap. Top of the A1 band; what harder schools set. |
| **Challenge** | Beyond the exam. | Bonus-style top-school questions: non-standard set-up, several unsignposted decisions. Never promoted from Advanced to fill the bucket. |

**How the sort works (Adrian, 15 Oct 2026: "most questions should be core. a better way would be to identify the advanced and the challenge questions").** Every question is **Core by default**. The sorter only looks for the exceptions: (1) a cheap first screen flags candidates — many marks, a last-in-paper position on the seed, a low share of students right where results exist, an unsignposted "hence"/set-up; (2) a careful Opus read decides Advanced or Challenge for the candidates only, and must name the decision the student has to make. No reason named → stays Core. Cheaper, and errs towards Core.

**Calibrated on Adrian's ticks (15 Oct 2026, sample v2).** Of 8 flagged Advanced he kept 3 and moved 5 to Core. KEPT: a trig identity needing the 130° → 50° → 25° link; two log equations where the logs themselves must be treated as the unknowns; an inequality whose always-negative denominator flips the sign (a trap). MOVED TO CORE: setting up lengths from a diagram before the R-formula; a "hence" substitution (x = 2θ, x = 4^y); choosing the circle theorems; arguing a displacement sign change in kinematics. **Rule:** a decision the student must make is NOT enough — if it is a move routinely drilled for that topic (a substitution, a set-up from a diagram, picking the theorem, a standard kinematics argument), it is Core. Advanced needs an idea NOT usually drilled for the topic, or a genuine trap most good students fall into.

**Sample 3 (15 Oct 2026, 40 new A Math twins, the rule above): 37 of 40 agreed with Adrian.** He moved to Core: a "Hence, solve the inequality" whose negative denominator comes straight from part (i) (the question leads the student there); explaining from completed-square forms that two paths never meet. He moved UP to Advanced a 4-mark Core: the range and greatest value of h(x) = 10 / (3 − 2cos(x − π/3)) — the reciprocal turns the denominator's least value into h's greatest, an idea not drilled. **Refinement:** a step the question leads to ("hence", "using your result in (a)") is Core even if it hides a trap; a short question can be Advanced when its one idea is undrilled (a reciprocal flipping max and min; a "for every real x" condition that must be rearranged into a discriminant before it can be used — the sample-2 inequality he kept).

**The shortlist method (Adrian, 15 Oct 2026: "seems like advanced questions are hard to identify?" → shortlist + his tap, yes; "where the question came from … is not a good way, because even from a harder school, quite a lot of questions are standard"; results "better, but we need data").** The reader does not decide Advanced; it makes a GENEROUS shortlist, Adrian taps the real ones, everything untapped stays Core, and students' results correct it later. First run, A Math (756 twins, four Sonnet readers with the calibration above): **49 shortlisted (16 likely, 33 maybe)**; it caught all 4 questions Adrian had called Advanced and none of the 7 he had moved to Core. Page: `docs/samples/am-twins-advanced-shortlist.html`, built by `scripts/practice-levels/sample-page.py` (mode `shortlist`). Next: store his taps (a level on each twin), then E Math, Sec 1, Sec 2 the same way.

**A Math done (15 Oct 2026).** Adrian tapped the 49: **29 Advanced, 2 Challenge, 17 Core** (one left untapped = Core). The "likely" list was right 15 of 16; "maybe" 16 of 33. Saved on the 756 A Math twins in the existing `questions.difficulty` column (Core = `Standard`, Advanced = `Advanced`, Challenge = `Challenging`): now 725 / 29 / 2. Old values backed up in `_backups/am-twins-difficulty-before-2026-10-15.json`. (Writes to `questions` time out above a handful of rows per update — batch of 5.)

**E Math, Sec 1, Sec 2 shortlists (15 Oct 2026).** Same method, readers told the level (O-Level 4052; lower secondary Sec 1 / Sec 2). Shortlisted: E Math 93 of 1,411 (18 likely, 75 maybe), Sec 1 47 of 725 (9 / 38), Sec 2 39 of 547 (10 / 29). Pages: `docs/samples/{em,s1,s2}-twins-advanced-shortlist.html`. Three twins had a table with no `$$` round it (raw code on every surface) — wrapped, backup `_backups/twins-bare-array-before-2026-10-15.json`.
- **Sec 2 done:** Adrian tapped all 39 — **15 Advanced, 1 Challenge, 23 Core**. Likely right 7 of 10; maybe 9 of 29 (8 Advanced + 1 Challenge). Sec 2 twins now 531 Standard / 15 Advanced / 1 Challenging. Backup `_backups/s2-twins-difficulty-before-2026-10-15.json`.

- **99 "Sec 1" twins moved to Sec 2 (15 Oct 2026, Adrian: "these should be sec 2 questions, not sec 1?" → yes).** Their seeds are real Sec 1 papers from schools that teach ahead or from before the 2020 syllabus (NYGH, CHS IP, VS, MGS …), so they used Sec 2 work: expanding two brackets and the (a ± b)² identities, factorising quadratics / grouping, algebraic fractions × ÷ and equations with x in a denominator, changing the subject, linear inequalities, simultaneous equations, direct/inverse proportion, mean / median / mode, dot and stem-and-leaf diagrams, cones / pyramids / spheres. Four Sonnet readers checked all 725 against a Sec 1 / Sec 2 split of today's MOE syllabus. Each moved twin: `level` → S2, filed under one Sec 2 sub-skill (`question_subgroups.source = 'level-move-2026-10-15'`), its Sec 1 filings removed — practice serves by sub-skill filing, so the level alone would still have shown it to Sec 1. Checked: 0 of 99 in `practice_pool('S1')`, 99 in `practice_pool('S2')`. Twins now Sec 1 626, Sec 2 646. Backup (levels + all 180 filings) `_backups/s1-twins-level-move-before-2026-10-15.json`. The Sec 1-judged shortlist had 17 of these 99; read again as Sec 2, only 6 — the level skewed the reader. New pages: `s1-twins-advanced-shortlist.html` (30 of 626), `s2-moved-twins-advanced-shortlist.html` (6 of 99). **Not moved:** 14 flagged "Sec 3+" (8 compound interest, 3 quadrant arcs, a fractional index, 2 series puzzles) — awaiting Adrian on where today's syllabus puts them. **Sorted the same day (Adrian: "yes"):** the 13 Sec 1 sub-skills that are Sec 2 work are hidden (`visibility = 'hidden'`), and 207 Sec 1 school questions / twins needing Sec 2 work moved to Sec 2 (61 more that clash with a Sec 2 row of the same paper number got `legacy_syllabus`), so the twin writer gets no Sec 1 slots in them (`math_twin_units(['S1'])` writable 44 → 29). Compound interest and quarter circles are Sec 1 (Adrian) — those 11 of the 14 waiting twins stay Sec 1; the other 3 (a fractional index, 2 series puzzles) still wait. The split and the full result: [`docs/LOWER-SEC-SYLLABUS-SPLIT.md`](docs/LOWER-SEC-SYLLABUS-SPLIT.md).

- **Moved twins done (15 Oct 2026):** Adrian tapped the 6 — **2 Advanced, 4 Core** (the 1 likely was right; maybe 1 of 5). The other 93 moved twins are Core. All Sec 2 twins now 628 Standard / 17 Advanced / 1 Challenging. Backup `_backups/s2-moved-twins-difficulty-before-2026-10-15.json`.

- **Sec 1 done (15 Oct 2026):** Adrian tapped the 30 — **16 Advanced, 2 Challenge, 12 Core**. Likely right 5 of 7 (4 Advanced + 1 Challenge); maybe 13 of 23. Sec 1 twins now 608 Standard / 16 Advanced / 2 Challenging. Backup `_backups/s1-twins-difficulty-before-2026-10-15.json`. E Math (93 shortlisted) still waits for his taps.

- **E Math done (15 Oct 2026):** Adrian tapped all 93 — **43 Advanced, 1 Challenge, 49 Core**. Likely right 12 of 18 (11 Advanced + 1 Challenge); maybe 32 of 75. E Math twins now 1,367 Standard / 43 Advanced / 1 Challenging. Backup `_backups/em-twins-difficulty-before-2026-10-15.json`.
- **All four maths twin levels now carry Adrian's taps (15 Oct 2026):** A Math 725/29/2, E Math 1,367/43/1, Sec 2 628/17/1, Sec 1 608/16/2 (Standard/Advanced/Challenging). Across the three new subjects "likely" was right 24 of 35 and "maybe" 63 of 133 — keep the maybe list generous; the reader still misses on level (Sec 2 work in Sec 1 looked "undrilled"). Two page fixes found on the way: `sample-page.py` now draws pipe tables and keeps `$$` tables on one line; twins never put a drawing at its part (one combined `figure_url` on top) — a separate task.

- **Sec 3 E Math done (15 Oct 2026):** 5 shortlisted of 123 (0 likely, 5 maybe); Adrian tapped **1 Advanced, 4 Core** → 122 Standard / 1 Advanced. Backup `_backups/s3em-twins-difficulty-before-2026-10-15.json`.
- **Sec 3 A Math done (15 Oct 2026):** 6 shortlisted of 62 (2 likely, 4 maybe); Adrian tapped **1 Advanced, 5 Core** (both likely → Core) → 61 Standard / 1 Advanced. Backup `_backups/s3am-twins-difficulty-before-2026-10-15.json`. **Every maths twin set now carries Adrian's starting level.** Sec 3 sets are mostly routine — few Advanced.

**Adrian's rule, in his words (15 Oct 2026):** *"a question is only Advanced if it needs an un-drilled idea or a genuine trap, not just a choice step … even if a question requires higher level thinking, schools may drill students until it becomes a standard question. so those questions not seen before may actually be the advanced questions, especially if they can't be easily solved."* And: *"the best way may just to open up the questions, then let the data from the students sort out the difficulty levels > that is the most accurate way."* → The tapped levels are the STARTING labels; once a question has enough first attempts, students' results replace them (as science does, `lib/practice-difficulty.ts`: 20 first tries; < 25 % wrong → Core, > 55 % wrong → Advanced).

**Results correct the start — BUILT 15 Oct 2026 (Adrian: "build this"), dormant until students practise.** Nightly 3:45am SGT, `/api/cron/math-practice-difficulty` (pure rules in `lib/practice-difficulty.ts` maths section, tests `practice-difficulty-math.test.ts`):
- **What counts.** Each student's FIRST try at a maths bank question in practice (`student_attempts`, `attempted_via = 'portal'`, `question_id` set; science and the preview student left out). A first try is **wrong** when it scored **under half the marks**, or the student opened any "Stuck? next step" help. No marks recorded → the verdict.
- **The cut (same as science).** 20 first tries or more: under 25 % wrong → **Core**; over 55 % wrong → **Advanced**; in between → **no change**. Applies to school questions too (their levels were guesses at extraction).
- **Challenge is never touched**, and results never make a Challenge — only Adrian (or a twin written as Challenge) does.
- **Where the level lives.** `questions.difficulty` stays the one level everything reads (practice_next, the picker's counts, kiosk_pool) — the job writes it. The maths project's `math_practice_difficulty` keeps where it came from: `starting_level` (his tap, never overwritten), `source` (`start` / `results`), the tally and the reason. Every move is a row in `math_practice_difficulty_changes`. Migration `migrations/math_practice_difficulty.sql`.
- **His tap after results wins.** If Adrian sets a level by hand after results moved it, the question is `pinned` and results leave it alone from then on.
- **He is told.** Mondays 9am SGT, `/api/cron/math-practice-difficulty-weekly` sends one Telegram line (students topic) listing the week's moves, the surprising ones first (a question set Advanced that students found easy → Core); no moves → no message.
- **Where things stand (15 Oct 2026):** tables made; every maths attempt so far is the preview student's, so nothing moves yet. Practice levels stay admin-only (`PRACTICE_PICKER_OPEN_TO_STUDENTS = false`); results only start once students can practise.

Inside Core the student can also pick **Short** (1–4 marks) or **Long** (5+ marks). No source type (school, national) is ever a choice — sources are never shown to students.

**The sample** (`docs/samples/am-twins-levels-sample-v2.html`, 40 A Math twins, 22 topics, one Opus read with the meanings above): Core 32 (8 short, 24 long), Advanced 8, Challenge 0. Twins copy normal school questions, so Challenge must be WRITTEN on purpose (a harder twin of a hard seed, same gates, blind solve still full marks) — a later job.

**Next, in order:** Adrian's ticks on the sample → sort every twin (one overnight run; ~3,600) → every new twin carries its level from the twin writer → the picker's Standard/Advanced toggle becomes Core/Advanced/Challenge (+ Short/Long) → science keeps its results-based sort but shows the same three names (its `exam` folds into Core, its `challenge` into Advanced until real Challenge questions exist). Labels live in `lib/practice-levels.ts`.

## 13. Drawings at their parts — the back-fill (15 Oct 2026)

Every twin had ONE picture above the stem, even when it held a drawing for (a) and another for (b).
**Status: DONE 15 Oct 2026 (Adrian: "yes — move the 137 twin pictures to their parts").** 137 rows
written, all 212 picture links open; checked on the live student practice page (preview student,
`/app/practice?qid=`) and on a printed worksheet (kiosk/Find renderer). The worksheet renderer now
prints a part's after-picture (a blank grid) right under the part text with no blank strip before it,
as the paper PDF already did. Looked at: the 964 twins with a picture and 2+ parts (a text sort of the figure descriptions, a
gutter cutter over every PNG, then Sonnet eyes on all 204 candidates).
- **143 need moving** — EM 75, S2 26, S1 19, AM 15, S3_EM 6, S3_AM 2. **137 are ready** (EM 72, S2 25,
  S1 17, AM 15, S3_EM 6, S3_AM 2): 68 a single drawing that only a later part uses (**move** — the
  same PNG goes to that part) and 69 separate drawings for different parts (**cut** — one crop per
  part, `practice-figures/twins/parts/<id>-<key>.png`; a crop the whole question uses stays as
  `figure_url`). Every cut was checked by eye against the original. **6 left on top** — too tangled
  to cut cleanly (a label or caption between two drawings): EM 10ddf787, c0fa4f0a, e5bf13dc; S1
  4650c31a, 52a52807; S2 86def712 — redraw them by hand or re-twin.
- A blank grid/axes for an "On the grid, draw …" part goes AFTER the part text
  (`image_url_after`); everything else before it.
- The old combined picture's URL is kept in `gen_meta.figure.combined_url`; the rows were backed
  up to `_backups/twins-part-figures-before-2026-10-15.json` before the write.
- Scripts (scratchpad of that session, not committed): `seg2.py` (gutter cutter), `cc.py` (ink
  clusters, a caption joins the drawing below it), `crop.py`, `apply.mjs` (dry by default; `--go`
  backs up, uploads, PATCHes one row at a time).


## 14. Twins on the API — only from free promotional credit, for the gaps (15 Oct 2026)

**The rule (Adrian, 15 Oct 2026): plan first; the API only from free promotional credit, for the gaps.** Twins stay plan-billed (the Fly lanes) by default. The API is used only while the organisation holds a promotional credit, and only on what the plan lanes cannot reach. The first credit: US$200, granted 15 Oct 2026, expires 11 Nov 2026 (US$198.84 left when it started). Adrian: *"don't do jc twins, finish math and science twins"*. **The website and the bot use the same organisation and API key** (practice hints and grading, Learn, humanities/English practice, scan reading, admin chats; the bot's chat and parts of marking), so they draw on the same credit. The twins stop line is therefore **US$120**, not the whole credit, leaving about US$75 for the site and the bot until 11 Nov (Adrian, 16 Oct 2026: "go, set it up, but pause just before we actually do entire batches").

**The runner** — `scripts/twins/api-twins.mjs` (`run` · `all` · `levels` · `spent` · `report`). It runs the SAME pipeline and gates as the lanes. The prompts are `.claude/skills/twin-question/prompts/` (maths) and `scripts/science-twins/prompts/structured/` (science long questions). The deterministic steps are the same scripts (`twin.mjs` / `sci-stwin.mjs` brief · check · publish, which refuse unless every check passed) with the same verdict rules. Only the model calls move:
- every one-shot role (author, repair, blind solve, moderator/checker) goes on the Messages API with Opus 5.5 at high effort. The Batch API is half price; `--now` makes plain calls instead, at full price but in minutes. The batch queue sat 30+ minutes with nothing started on the night of 15 Oct.
- the science author's figure spec is a `figure_doc` tool (what `figure.mjs --doc` prints).
- the maths figure step is the lane's figure-author prompt on `claude -p` with the API key (`--add-dir`), because it draws and looks at the picture.
- it differs from the lanes in two ways: the maths blind solve is Opus, not Sonnet (stronger, not weaker); and every new maths twin is published **Core (Standard)** — a Challenging seed keeps Challenging — and `levels` shortlists possible Advanced for Adrian's tap (§12).
- every response's usage → `~/twins-api/ledger.jsonl`, priced at Opus 5.5 rates. A batch is not sent when the total plus its worst case would cross `--cap` (**HARD STOP**).
- run folders are `~/twins-api/<bank>/<run>/` with `published` / `parked` marks; science queues read them via `--done-dir`. It stamps `job_runs` `twin-batch` / `science-twins` with `api: …` summaries (the lanes' rhythms cover them).

**What it works on.** Maths sub-skills short of 3 (`math_twin_units`, S2 · EM · AM · S1, biggest gap first). The Fly maths lane had parked every seed on 15 Oct because of the two faults below, so it found nothing to write. Science **structured** twins (§11b order): the lane writes none of these until the MCQ list is empty (`SCI_TWINS_MCQ_FIRST`). Science MCQ is left to the Fly lane, which was publishing (86 left on 15 Oct). **Not JC.**

**The gap on 15 Oct 2026 (target 3):** maths 196 writable (S2 67 · EM 61 · AM 39 · S1 29; at 5 it would be 920); science MCQ 86 (the lane's); science structured tier 1 131 · tier 2 246 · tier 3 ~4,140 (40 servable a topic).

**The trial (15–16 Oct 2026, full price):**

| | Tries | Passed every check | Cost | Checker 5/5 | Free lane |
|---|---|---|---|---|---|
| Maths | 20 | 16 (2 read as the source, 2 drawings not saved) | US$8.83: US$0.55 a twin; drawings US$6.21 of it, about US$0.90 each; no drawing ≈ US$0.16 | 4 of 16 | 31% |
| Science structured | 19 | 15, incl. the first test (3 scheme layouts, 1 too narrow) | US$5.24: US$0.35 a twin | 2 of 15 | 26% |

Pass rate: structured 79% against the lane's 67% (218 of 326). Nothing below 4/5 is ever published. Total spent at the end of the trial: **US$14.07**. Samples for Adrian: https://claude.ai/artifact/7DMTMXRxQN2Jg2tWRPPyf9. **The full run waits for Adrian's go** (`node scripts/twins/api-twins.mjs all --cap 120`).

**Two lane faults found on the way (15 Oct 2026):**
1. `twin.mjs check` read `earlier-twins.json` with the loose reader. That reader wants an object, so it threw on `[]`, and every first twin of a seed failed after passing. This had happened since `b275f026` (09:23 that day) and was fixed in `ecd81c43`. The Fly maths lane parked 362 seeds that day with an empty `gates:` reason. Those marks kept the lane idle. **Fixed 17 Oct 2026 (bot `7ccf3d6`):** the lane retries a park whose reason is exactly `gates: ` once, and never writes an empty reason again (no marks deleted by hand). First twins were already publishing again by 17 Oct (5 that day before the fix).
2. Claude Code's write check refuses a folder whose name has a `~` (a "<seed>~2" second-twin run). The author and figure agents in such a folder say "the file tool refused". The runner names folders `<seed>__2`. **Fixed 17 Oct 2026 (bot `7ccf3d6`):** both Fly lanes now name the folder `<seed>__2` too (`--source` keeps `<seed>~2`). Until then every maths `~2` run parked as `gates: ` (345 folders, 0 published) and every science `~2` run as `checker: unreadable verdict` or `brief failed` (187 folders, 0 published). The old `~` folders are left in place and ignored. The science sub-skill skips (3 drops) those parks earned were given back once (bot `f75a744`, 17 Oct 2026, Adrian: "fix it"): 134 drops off 84 sub-skills, **41 skips lifted** (92 → 51); real drops and skips stay. **First lane runs after the fix:** maths 6 of 6 published (all `~2`/`~3`), 0 parked; science checker verdicts save again.

**19 Oct 2026 — the worker boosted for 2 days (Adrian: "yes to #1 and #2 … finish using the allowance for ablnon@hotmail account quickly", then "make the worker 4 CPUs / 16 GB with 5 science lanes for 2 days, about US$7.60 extra, and have it go back by itself on 21 Oct around 21:00 SGT").** Bot `760cb6b`: worker `performance-4x` / 16 GB, `SCI_TWINS_LANES` 2 → 5, `LANE_BUDGET` 6 → 9, `LANE_MAX_LOAD` 8 → 16 (`TWINS_LANES` unchanged — maths has almost nothing left at 3). `SCI_TWINS_MCQ_FIRST` stays `1`: 46 multiple-choice seeds were still open after the marks were cleared at 12:07 (the lane published 4 of 6 in its first two runs). **The way back is automatic:** bot `.github/workflows/worker-boost-revert.yml` runs on 21 Oct 2026 13:00 UTC (21:00 SGT), puts the five lines back from `.github/boost/worker-before-2026-10-19.json`, deletes itself, deploys the worker and tells Adrian on Telegram. Can be run early from GitHub → Actions → "Worker boost — go back".

**19 Oct 2026 — on to 5 as soon as 3 is done (Adrian, typed in the lane session: "once a skill has 3 twins, go on to 5 straight away, for maths, science multiple-choice and science long questions").** Bot `2e87541`: `TWINS_TARGETS` '3 5' (maths: every level to 3, then to 5), `SCI_STWINS_PER_SKILL` '3 5' (long questions, same staging, website `dfac47b0`), `SCI_TWINS_PER_SKILL` 5 (multiple-choice; its list takes the open topics, then the fewest twins first), `SCI_TWINS_MCQ_FIRST` '0' and `SCI_TWINS_STRUCT_PER_RUN` '2' (each science run: 2 long questions + 1 multiple-choice). This replaces the 15 Oct "stop at 3" rule.

**16 Oct 2026 — maths only, US$150 (Adrian: "use the credit run for math, then the free lanes for science long questions, open topics now" … "use $150 for math on the credit run").** The free science lane published 135 twins overnight, most of them long questions on the open topics (tier 1 131 → 91, tier 2 246 → 120), so the credit run leaves science to the free lanes. The first full round, at half price that morning, was maths: 17 of 20 published for US$8.21 (US$22.28 in total). It then restarted as `node scripts/twins/api-twins.mjs all --banks maths --cap 150`, followed by `levels`. Maths gap at that moment: 177 (S2 62 · EM 59 · AM 31 · S1 25). The run ends by itself when no maths seed is left at 3 a sub-skill. Going to 5 stays Adrian's call.

**Maths finished on the credit (16 Oct 2026, 14:00 SGT).** 10 rounds plus the trial: **171 maths twins published, 32 parked** (84%). The maths spend was **US$68.72, US$0.40 a twin**. The whole credit run, science trial and the level read included, spent **US$73.96** (ledger `~/twins-api/ledger.jsonl`). Left short at 3 a sub-skill: S2 11 · EM 8 · S1 6 · AM 1 — 26 twins over 17 sub-skills, whose remaining seeds were all tried and parked by the checks (nothing more to write from the bank). The Mac lost its network mid-run once; the runner now waits and retries (`patient`, `sh`) instead of crashing. **Levels:** all 171 published Core; the reader shortlisted **36 of 171 (3 likely)** for Adrian's tap → `docs/samples/api-twins-advanced-shortlist.html`, phone copy https://claude.ai/artifact/4w7PHMcttuQ8yfXpvSjEq5. Save his taps the way §12 did (batches of 5, back up first). About US$125 of the credit is left for the site and the bot until 11 Nov.

**16 Oct 2026 — science long questions on the credit, from the far end (Adrian: "can we use credit lane for science long questions?" → "yes", half price).** The free science lanes work the §11b order from the top: open pure topics, then open Combined, then the rest. So the credit run takes **tier 3 only, last seed first** (`all --banks sci --from-end --n 50 --cap 150`), and the two never meet on a seed. At half price that is ≈ US$0.18 a long question. The money left under the US$150 line after maths (≈ US$76 by the ledger) buys ≈ 400. The free science lanes published 351 twins in the 24 h before.

**17 Oct 2026 — the open topics were not done; the credit run takes them.** The open topics' long questions sat at 91 (pure) / 120 (Combined) short for a day. Reading the Fly worker's marks showed why. Of the 158 seeds left in tiers 1–2, **104 were parked by the lane, 44 of them as `checker: unreadable verdict ([Errno 2] …)`** — the checker never saved `Q1.verdict.json`, the same save fault as the maths lane (see the `~` folder note above). The other 54 were never tried: their sub-skills were skipped after 3 such drops (212 `skip/S-*` marks). The credit run has no such fault, so it now runs `--tiers 1,2` (Adrian: "if open topics are done for long questions, then move on to mcqs" — they were not done) before going back to `--from-end`. The Fly lane's save fault for science is in the "Fix the free maths twin lane" proposal's scope too.

**Credit run finished (18 Oct 2026, 10:00 SGT) — stopped at the line.** Open topics first, at `--tiers 1,2`, then `--from-end`. The second leg stopped before its first batch: US$138.10 plus that batch's worst case would have crossed US$150. Totals on the credit: **maths 171 published · science long questions 300 published (111 parked)**, science US$69.38 (≈ US$0.23 a published twin), **ledger total US$138.10**. Adrian's console read ~30% below the ledger on both checks (16–17 Oct), so the real spend is about US$95–100. The open topics went from 91 / 120 short (pure / Combined) to **44 / 28**. Their seeds are now used up, so what is left there needs more school papers in the bank. Tier 3: 3,654 short. The free science lanes keep writing.

**18 Oct 2026 — long questions also count 3 per sub-skill (Adrian: "finish math and science up to 3, for long questions too"; on the old 40: "why 40 per topic? is that a lot?").** `SCI_STWINS_PER_SKILL=3` switches `sci-stwin.mjs` from 40 servable a topic to 3 structured twins per (pool, sub-skill), counted on the twin's main sub-skill. Each short sub-skill offers its fresh seeds first, then a seed's next twin (`~n`). The default stays the topic target until the lane is switched. On this measure: 372 sub-skills short, **759 twins needed, ≈627 writable** (open topics 36 needed / 27 writable), against ≈2,110 left at 40 a topic. The credit run uses it with `--from-end`; the Fly science lane switches to it from the top. Adrian's console the same day read US$73.25 left (US$126.75 used against a ledger of US$138.10) — earlier gaps were the console catching up, not the ledger overstating. The credit stop for the rest is US$185 by the ledger (≈US$25 kept for the site and the bot).

**Credit run ended (18 Oct 2026, 03:45 SGT) — at the US$185 line.** Two rounds of 100 on 3 a sub-skill (`SCI_STWINS_PER_SKILL=3 … --from-end`): 106 published. The session restart on 17 Oct cut one round off mid-batch (≈US$5–7 lost; its seeds were re-run). Totals on the credit: **maths 171 · science long questions 406 published (159 parked) · ledger US$171.35** (science US$102.64). Left at 3 a sub-skill: long questions 508 needed / ≈397 writable (open topics 27 / 20), maths 5 (S2), science MCQ 94 (seeds used up). The free Fly lanes carry the rest (≈300 science twins a day on 17 Oct).

**19 Oct 2026 — credit lane OFF; one more free try at 3 (Adrian: "finish 3 first, then report back. then we go to 5" … "switch off the credit lane. just use the normal lanes" … "do it now, don't wait for reset").** The credit run was stopped before its retry spent anything; the ledger stays at **US$175.31**. At 3 a sub-skill the free lanes had tried every seed they could use: maths 11 short, science MCQ 94, science long questions ≈240 writable — all parked, or in sub-skills set aside after 3 drops. On the Fly worker the marks were backed up (`/data/backups/marks-<ts>.tgz` + `.list`, 1,537 files). Then **13 maths and 948 science parked marks plus all 568 science skip marks were cleared**, keeping every "figure" park and every published run, so the lanes retry each short sub-skill once (a fresh attempt passes about half the time). The queue now counts a `__2` folder as tried (website 4e002f8e). **Next:** report to Adrian when 3 is finished, then raise to 5 (`TWINS_TARGETS='3 5'`, `SCI_TWINS_PER_SKILL=5`, `SCI_STWINS_PER_SKILL=5`) on his word.

**19 Oct 2026 — straight on to 5 (Adrian: "actually for twins, once up to 3 is done, go to up to 5 immediately").** A standing rule: a set that reaches 3 a sub-skill goes on to 5 by itself, with no second decision. Maths already stages (`TWINS_TARGETS='3 5'`). Science long questions now stage too: `SCI_STWINS_PER_SKILL='3 5'` (`sci-stwin.mjs stagedUnits`) works to 3 first, and moves to 5 once no sub-skill below 3 has an untried seed. Science MCQ is done at 3 (the 94 left have no seeds), so it goes to `SCI_TWINS_PER_SKILL=5` now, with `SCI_TWINS_MCQ_FIRST='0'` so MCQ and long questions run side by side. At 5 a sub-skill (19 Oct 2026): maths ≈770 writable, science MCQ ≈1,190, science long questions ≈880.

**21 Oct 2026 — twin writers OFF by Adrian, on purpose.** Adrian switched off both worker jobs (`twins` and `science-twins`) on 20 Oct 2026 at 22:30 SGT, and confirmed it: *"i did switch off the twin writers"*. Leave them off, and do not ask him about it again. Only his own word turns them back on. Where they stopped: maths and science MCQ done at 3 a sub-skill; science long questions ≈190 writable at 3 (Phase A ran 20 Oct 14:38–22:30); the staged settings for 5 stay in place (`TWINS_TARGETS='3 5'`, `SCI_STWINS_PER_SKILL='3 5'`).

**21 Oct 2026 — order: Sec 2 and A Math first (Adrian: "yes").** At 5 a sub-skill the work left was Sec 2 337, A Math 202, Sec 1 40, E Math 1, so the worker order became `TWINS_LEVEL=S2`, `TWINS_LEVELS='S2 AM S1 EM S3_AM S3_EM'` (bot `fly.worker.toml`; lane two stays A Math). The writers are still OFF (entry above) — this only sets the order for when he turns them back on.

**25 Oct 2026 (doc sweep) — what the worker did after the entries above.** The writers ran again from 21 Oct 20:56 SGT (`science-twins` and `twins` logs; phase B switched maths `twins` ON by itself at 21:43, `job_runs` `twins-phase`) until 24 Oct ~07:42, when `twins`, `science-twins` and `extract` went off (the worker's `jobs-off` file). Nothing records who switched them on or off — asked in the 25 Oct Sunday check.

**23 Oct 2026 — the last of the credit on science long questions (Adrian: "can we use organization API for the workers?" → "use up all" → "for whatever that is left - twins and extraction").** Started on the MacBook Air: `all --banks sci --from-end` with `SCI_STWINS_PER_SKILL='3 5'` (log `~/twins-api/run-2026-10-23.log`). This Mac had no ledger, so one `carried` line of US$175.31 (the other Mac's total to 19 Oct) was written into `~/twins-api/ledger.jsonl` and the stop line is **US$190 by the ledger** — about US$15 of new spend, keeping ≈US$10 for the site and the bot, which share the key and whose own use since 15 Oct is not in the ledger. The real balance cannot be read from here; raise the line only on a console reading from Adrian. Maths (≈33 short at 5) stays with the free lane. **Extraction has no credit path**: `worker/fly/extract.sh` unsets the API key and runs on the plan only — a credit version would need building and a cost per paper measured first; with ≈US$15 left it was not built.

**23 Oct 2026, later — the console reads US$200 left (Adrian: "there are $200 remaining").** So the stop line rose to **US$345 by the ledger** (≈US$169 of new spend, ≈US$30 kept for the site and the bot). Two runs on the MacBook Air share the ledger: science long questions (`--banks sci --from-end`, `SCI_STWINS_PER_SKILL='3 5'`, log `~/twins-api/run-2026-10-23.log`) and, new, **science MCQs up to 5 a sub-skill** (`--banks sci-mcq --from-end`, `SCI_TWINS_PER_SKILL=5`, log `~/twins-api/run-mcq-2026-10-23.log`; 753 seeds in its queue). Maths at 5 (≈33) stays with the free lane, because the runner's maths queue is fixed at 3 a sub-skill. The twins alone can likely use the whole line, so **extraction gets only what is left after them**; a credit version of extraction is still to be built, with its cost per paper measured first.

**23 Oct 2026, 10pm — a false alarm, run restarted.** Adrian's console showed four bills paid that day (≈US$11 each) at US$59.39 of a US$100 monthly limit. That was the **Trading** workspace (his trading project, key "trading-signals"). The **Adrian's Math Tuition** workspace, which holds the shared "website" key (`sk-ant-api03-iUw…AAA`, used by the site AND the bot), read **US$0.00 of US$1,000** this month, so the twin run was drawing on the free credit and not on his card. The run was stopped for about 20 minutes, losing one cancelled batch, then restarted with the same US$345 ledger stop. To check for real money: look at the **Adrian's Math Tuition** workspace on Spend limits; a figure above US$0 there means the credit has run out, and the runner must stop.

**28 Oct 2026, 20:20 SGT — twins burst on the hotmail login's last week (Adrian: "for the twin workers, let's max out the workers. weekly usage resets at 45 minutes").** ablnon@hotmail.com read 87% of its week, resetting 21:00 SGT; the other two logins were full / switched off and no twin lane was running. Bot `6645b9b` (`fly.worker.toml`): `TWINS_LANES` 1 → 2, `SCI_TWINS_LANES` 3 → 5, new `SCI_TWINS_EVERY_S = '240'` (a science lane restarts 4 min after its last start, lanes 1 min apart), `LANE_BUDGET` 6 → 9, `LANE_MAX_LOAD` 8 → 12; machine unchanged (2 dedicated CPUs / 8 GB). The hotmail login was set to count as full only at 100% until the reset (`claude-pick.sh stretch ablnon-hotmail-com 45`). These lane counts stay after the reset until Adrian says otherwise; to go back, restore the five lines from the commit before `6645b9b`. **Two things found on the way:** (1) a stale `pool-wait` file (written 20:01 when every login read full) held every lane back after the restart; deleted by hand at 20:30, then all 5 science lanes ran. (2) The maths lanes find **no seed at 3 or at 5** for any level (`candidates: 0`) — every writable maths seed has been tried, so maths twins need new school papers in the bank, not more lanes.
