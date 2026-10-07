# Humanities — instant feedback on written answers

**Status: agreed 2 Oct 2026, nothing built. H0 draft written the same day — the seven
level schemes are in [`docs/humanities/social-studies-level-schemes.md`](docs/humanities/social-studies-level-schemes.md), waiting for Adrian's read.** Adrian's decisions that day:

- Our own questions are fine — the exam tests skills on unseen sources, so a student
  hones the skill on any good source.
- We own the standard ourselves first, built like the science bench.
- A closed switch (`HUMANITIES_OPEN_TO_STUDENTS`, admin + the demo student only).
- Launch as **feedback with a level range, never a mark**.

> **H1 BUILT 2 Oct 2026 (preview only, switch closed).** 10 own Social Studies source sets, 30 questions
> (`data/humanities/social-studies/`), built on the scheme draft's defaults — the four decisions
> in the schemes doc are still Adrian's to answer.
> - App: `/app/humanities` (Home · a question page · the report · My answers), behind
>   `HUMANITIES_OPEN_TO_STUDENTS` (`false`; Adrian's cookie + the demo student see it).
> - Marker: bot `ai/humanities-marker.js` + `lib/humanities-report.js`, `POST /api/humanities-mark` —
>   two blind reads, a third when they differ, held when all differ. A level range, never a mark.
> - Routes: `/api/portal/humanities` (student), `/api/admin/humanities` (list + the bench's hand-in);
>   table `humanities_runs`; one door `lib/humanities-submit.ts`.
> - Bench: `npx tsx scripts/humanities-bench/run.ts --base <url>` (rules in `lib/humanities-bench.ts`).
>   First run 2 Oct 2026, 82 answers, US$3.53: seeded 45/46 at the written level (the other a 1–2
>   range on a Level 2), none two off · the same answer twice 12/12 · truth-free 24/24. **PASS** —
>   with two limits: the seeded answers and the marker come from the same model family, and the
>   repeat reads were minutes apart, not days. Only sets 1–4 carry seeded answers.

## 1. What the exams are (SEAB 2026 syllabuses, read 2 Oct 2026)

| Subject | Code | Papers | How it is marked |
|---|---|---|---|
| Social Studies (half of Combined Humanities) | 2260 / 2261 / 2262 P1 | 1 h 45, 50 marks: source-based case study 35 (Q1–4 on given sources 25, Q5 across sources 10) + structured response 15 (7 + 8) | Levels of response throughout |
| Geography elective | 2260 P2 | 1 h 45, 50 marks: Everyday Life 14, Tourism 18, Climate or Tectonics 18 | Point-marked, except one 9-mark question on levels |
| History elective | 2261 P2 | 1 h 50, 50 marks: source-based case study 30 + two essays of 10 | Levels of response throughout |
| Pure Geography | 2279 | Two papers, 1 h 45, 50 marks each; fieldwork question in P1 | Point-marked, except one 9-mark question per paper |
| Pure History | 2174 | Two papers, 1 h 50, 50 marks each; same shape as the elective; **typed in a digital answer booklet** | Levels of response throughout |
| Literature | 2065 | P1 prose + unseen poetry, P2 drama | Band descriptors, published in the syllabus |

- Sources are unseen. The case-study issue "may or may not be covered in the syllabus
  content" (Social Studies); History sources sit on the starred topics but are not
  taken from the textbook.
- SEAB publishes the skills (comprehend, infer, compare, evaluate evidence, detect
  bias, draw conclusions) and, for Geography, the generic 9-mark level table. It does
  **not** publish the per-question level descriptors for Social Studies or History.
  Those exist only in school prelim schemes.

## 2. The product

One question, one typed answer, feedback within a minute.

1. The student picks a skill (inference · comparison · reliability · usefulness ·
   purpose · the "how far do you agree" question · structured response).
2. The app shows one source set and one question — ours, never a school's paper.
3. The student types the answer.
4. The report, in this order:
   - the level range ("Level 2–3 of 4") and the one thing that would lift it;
   - their own answer with each claim tagged: supported from the source / not
     supported / uses context / evaluates;
   - what a top-level answer does that theirs does not, in two lines;
   - a model answer, folded.

No mark, ever. The level table shown beside the range is ours, written from the
SEAB skill list and the pattern common to school schemes.

## 3. Build order

| Phase | What | Gate before the next |
|---|---|---|
| H0 | Level schemes per skill for Social Studies source questions; collect prelim schemes as grounding (kept internal, content policy applies) | Adrian reads the seven schemes |
| H1 | 30 own source sets + questions for Social Studies; the marker (two blind reads, a third on disagreement, held when all differ — the essay marker's rule); the report page behind the closed switch | the bench (§4) |
| H2 | Social Studies structured response; History source questions (same skills, History content) — **built 3 Oct 2026** | bench per subject — passed |
| H3 | Geography: point-marked parts need a points scheme per question — closer to science marking than to this; the 9-mark question uses SEAB's published level table | bench |
| H4 | History essays, Literature — on the essay marker | bench |

Social Studies first: every O-Level student takes it, and it is the most skill-driven.

> **H2 BUILT 3 Oct 2026 (preview only, switch closed).**
> - **History** — 5 own source sets, 15 questions (`data/humanities/history/sets.json`), the six
>   source schemes unchanged. The sources are written for practice and the page says so; no
>   invented quotation is put in a real named person's mouth.
> - **Social Studies structured response** — 5 sets, 10 questions
>   (`data/humanities/social-studies/structured.json`): "Explain two ways" (`sr_explain`, 3 levels)
>   and "Do you agree?" (`sr_weigh`, 4 levels), answered from own knowledge, with their own rules
>   and tags (point · example · link · not explained · weighs).
> - Humanities Home has a tab per subject (`?s=history`).
> - Bench per subject: `--subject history` and `--kind structured`. Both passed (§4).

> **A1 + A2 STARTED 7 Oct 2026 (preview only, switch closed)** — Adrian: "do #1 to #5 / and let's do
> geography next / then history essays / and then practice by skill" (`docs/HANDOFF-HUMANITIES-BUILD.md`).
> - **Case studies (A1).** A set with a `background` in `data/humanities/social-studies/case-studies.json`
>   is a full case study: Background Information, Sources A–E/F, five questions marked 5 · 6 · 7 · 7 · 10,
>   the last the "how far" question. The marks show beside the question; the report is still a level.
>   A case-study question is answered — and read by the marker — with EVERY source of the set in view
>   (`QuestionInContext.inView`); the background rides in the marker's issue line. Shape rules +
>   word-for-word quotation check: `lib/humanities-case-study.ts` (`scripts/humanities-bench/check-set.ts`
>   for a draft). The brief and the 30-set plan (s11–s40, ten per issue): `docs/humanities/case-study-brief.md`.
>   s11 is written as the worked example. The bench takes `--sets s11,…`.
> - **29 case studies listed on the preview (7 Oct 2026, evening):** s11 + 28 written by six writers on the
>   plan (citizenship 10 · diversity 9 · globalised 10). Adrian: "Do plan only checks" — so s12–s40 have had
>   the shape-and-quote checker, a read of the sensitive sets, and a **blind placement on the plan**: five
>   fresh readers saw only the question, sources and level table and placed all 559 seeded answers at the
>   written level (559/559). Its limit: within a question each higher answer contains the one below, so a
>   reader can partly rank by length. **The real bench (the live reader, about US$30–43) has NOT been run
>   on s12–s40 — it is owed before the switch opens.** Only s11 has been through it.
> - **Held: s23** (mixing races in each block) — `data/humanities/social-studies/held/s23.json`, not loaded.
>   It sits on the real housing rule and its start year with "the housing authority" speaking made-up
>   figures. Adrian decides. Also his call: "a ministry spokesperson" with made-up figures on a real kind
>   of policy (s12 water price, s15 e-scooters, s17 retirement age, s20 fines, s36 scam calls).
> - **The skill picture (A2).** `lib/humanities-skills.ts skillPicture` — per skill: answers read, the
>   usual level over the newest five (lower middle, so it never flatters), weakest first; "practise this"
>   at two or more levels below the top. The **Your skills** card on Humanities Home, per subject tab;
>   a line opens the next unanswered question of that skill.
> - **Noticed in the bank, for Adrian:** "Are you surprised by Source X?" is the commonest Q3/Q4 type in
>   the banked Social Studies papers (47 rows) and "Does Source X prove Source Y wrong?" is next (19).
>   We have no scheme named for "surprised"; our case studies use the six schemes we have (a "prove
>   wrong" question sits under reliability). A seventh scheme is his call.

> **7 Oct 2026, later — the "surprised" scheme, A3 and A4 (preview only, switch closed).**
> - **"Are you surprised?" (`surprise`)** — Adrian: "do it". Four levels in `schemes.json`: L1 a stand from the
>   type of source or no reason · L2 one source only · L3 the two sources compared on the same point, with a
>   stand · L4 that, plus WHY the source says it (maker, audience, aim) or a third-source check. Written from
>   the pattern common to the banked school schemes, in our own words. Nine case studies had their
>   reliability question replaced by a "surprised" one (s15 s16 s18 s22 s27 s28 s31 s34 s36); the 36 seeded
>   answers were placed blind on the plan (36/36). Not through the live reader yet.
> - **A3 — Examples to use** (`/app/humanities/examples`): 24 real Singapore examples, eight per issue, each
>   with its facts one per line and "what it shows". Fact-checked against public sources on 7 Oct 2026
>   (five lines corrected). `data/humanities/social-studies/examples.json`.
> - **A4 — Timed paper** (`/app/humanities/paper`): 1 h 45 min, one case study [35] + one structured set
>   [15]; the paper offered is the one the student has done least of. A clock, the sources one tap away,
>   drafts kept on the device; time up does not lock the paper. Hand-in = one `humanities_runs` row per
>   answered part, sharing `paper_id`. The result page gives a level per part — **no mark out of 50**
>   (§5); Adrian is asked once whether that stays.
> - Case-study pages now carry the line History already had: "These sources are written for practice.
>   They are not real documents."

> **B — GEOGRAPHY STARTED 7 Oct 2026 (preview only, switch closed).** Adrian: "let's go do geography".
> - **Point-marked.** A Geography question carries its own creditable points (`points[]`), its marks, a
>   command word, and whether developing a point earns a second mark (`develop`) — the convention in the
>   banked school schemes ("1 mark for each …, a maximum of 1 additional mark for further development").
>   No level scheme. A data table rides on the question (`table`) and reaches the reader as text.
> - **The reader** (bot `ai/humanities-marker.js`, `kind: 'points'`, deployed 7 Oct 2026): a credit per point
>   (0 · 1 · 2), each credited point shown in the student's own words; a valid point not on the list may be
>   credited as "other" (two at most); the total is counted in code and capped. Two blind reads, a third
>   when they differ. The row's level fields hold MARKS (0 … max); `report.marking = 'points'`.
> - **The page.** Home's Geography tab → a question → feedback: the lift, the answer with each point
>   marked, "Points you made" (and "Develop it: …"), "Points you could add", a full answer. **The mark
>   itself shows only when `GEOGRAPHY_MARKS_OPEN_TO_STUDENTS` is true (closed — Adrian decides) or to Adrian.**
> - **First set: 8 own questions** (two per cluster: everyday life, tourism, climate, tectonics), text and
>   one data table — no maps, graphs or photographs yet. 38 seeded answers, each written to earn an exact mark.
> - **The batch (7 Oct 2026, night): 16 sets, 68 questions** — g05–g16 written by four writers on the plan to
>   `docs/humanities/geography-brief.md` (three sets a cluster). Plan-only checks, as Adrian asked: the shape
>   checker; a blind marking of all 274 seeded answers by fresh readers (274/274 at the written mark); and a
>   subject check that found about fifteen loose or wrong lines, all fixed (a mis-ranked table figure, the
>   tsunami sensors, subduction melting, storm surge, "fastest" for "largest" …). "Explain two ways" questions
>   carry the rule "credit the best two only". **Not through the live reader yet** (only the 8 pilot questions are).
>   Known soft spots, left as they are: a two-column table question can reach full marks from one column
>   (g10-q2); g12-q1 and g11-q3 can reach full marks without the step that names the key word.
> - **Figures from the question's own numbers (7 Oct 2026):** `table.figure = 'bar' | 'line' | 'climate'` draws
>   the table as "Fig. 1" (`app/humanities/charts.tsx`, geometry `lib/humanities-chart.ts`), every value printed
>   on it; the reader gets the same numbers. g01-q2 is the first (a line graph). The bot's figure library has no
>   bar, line or climate graph, so these are drawn on the page. A climate graph is two panels on one month
>   axis (the temperature line above the rainfall bars); a line graph's axis may start near its lowest value;
>   two lines are numbered above and below by which is higher at each point.
> - **Graph sets g17–g20 (20 questions, one "Reading graphs" set a cluster; three climate graphs):** written on
>   the plan, blind-marked 91/91, the checker's notes applied ("the same figures earn development once only",
>   accepted wordings, g20-q2 drawn as bars). Geography now stands at **20 sets, 88 questions**. Not through
>   the live reader yet.
> - **Marks shown (7 Oct 2026, Adrian: "show marks").** `GEOGRAPHY_MARKS_OPEN_TO_STUDENTS = true`: a point-marked
>   answer shows "3 of 4 marks". Social Studies and History still show a level and never a mark (§5).
> - **The 9-mark question (7 Oct 2026, Adrian: "do the 9-mark question").** `data/humanities/geography/evaluate.json`,
>   sets `eNN` (`kind: 'structured'`, an extract, questions of skill `geo_evaluate`): "'Statement.' To what
>   extent do you agree?" Read on three levels in our own words after SEAB's published generic table
>   (`schemes.geo_evaluate`: describes · explains mostly one side · both sides in depth and an argued
>   judgement), by the own-knowledge rules and tags. The page shows the level and that level's marks band
>   ("Level 2 of 3 · 4 to 6 marks of 9") — a band, because the reader settles a level, not a mark within it.
>   **Eight questions, two a cluster (e01–e04).** Plan-only checks: all 24 seeded answers placed blind at their
>   level, every top answer's judgement argued; every real example fact-checked against public sources on
>   7 Oct 2026 (no wrong fact; eleven lines made more exact — the Marina Barrage, the Paris Agreement, the
>   carbon tax, Haiti's buildings …).
> - **Diagrams (7 Oct 2026, Adrian: "let's do what we can for the diagrams").** Twelve of our own line drawings,
>   written as SVG to one set of drawing rules (`docs/humanities/geography-brief.md` §Diagrams) and kept in
>   `public/humanities/diagrams/`: the Earth's layers · convection currents · a spreading ridge · a transform
>   fault · a subduction zone · fold mountains · a stratovolcano · the stages of a tsunami · relief rain ·
>   convectional rain · a sea breeze · the greenhouse effect. Each was rendered to a picture and looked at by its
>   writer and again by the orchestrating session; one was checked on a phone-width page. A question carries
>   `diagram: {key, caption}`; the reader, which cannot see a picture, is given the diagram in words
>   (`data/humanities/geography/diagrams.json`: `shows` + what each letter marks). Sets g21–g23, 15 questions,
>   blind-marked on the plan 70/70 with the checker's notes applied. **Geography: 23 sets, 103 point-marked
>   questions.**
> - **What the syllabus asks for (read from SEAB's 2279 syllabus for 2026, 7 Oct 2026).** There is **no
>   topographical map reading** — no contours, grid references or bearings anywhere in the document. The
>   resources a candidate must interpret are: tabular data · text extracts · landscape photographs · aerial
>   photographs and satellite images · scatter graphs and best-fit lines · simple and comparative line graphs ·
>   simple and comparative bar graphs · pie charts · sketch maps · dot maps · choropleth maps · flow line maps ·
>   proportional symbol maps · isoline maps · cartoons · wind roses · diagrams (schematic, block). Map skills:
>   compass direction, longitude and latitude, scales and symbols. Its Appendix A level table for the 9-mark
>   question is the one `geo_evaluate` follows.
>   Built so far from that list: tables, line and bar graphs, climate graphs, diagrams, and two world maps.
>   **Drawable from a question's own numbers and not built yet:** pie charts, scatter graphs with a best-fit
>   line, wind roses, and the six kinds of thematic map (for a made-up "Country X").
> - **World maps (7 Oct 2026).** `scripts/humanities-maps/world-maps.mjs` draws them from Natural Earth's
>   public-domain land outlines (the `world-atlas` package, needed only when the script runs — the site ships
>   plain SVG): where tropical cyclones form and travel, and the three latitude zones. Set g24, three
>   questions; checked by the shape checker and by eye, not blind-marked and not through the live reader.
> - **Still to build:** photographs, satellite images and cartoons
>   on SEAB's level table, the full question set (the 367 banked rows are the guide), fieldwork questions.

> **C — HISTORY ESSAYS STARTED 7 Oct 2026 (preview only, switch closed).** Adrian: "go ahead with history essays".
> - **On the humanities reader, not the Languages essay marker** (a change from the hand-over note, made in the
>   open): the 10-mark essay is a levels-of-response answer from own knowledge — the same shape as Social
>   Studies' "Do you agree?" and Geography's 9-mark question, which this reader already marks and benches. It
>   keeps History on one tab, one report page and one bench. The Languages marker scores language bands, which
>   this essay is not marked on.
> - **`hist_evaluate`** (`schemes.json`): four levels in our own words after the pattern common to the banked
>   school schemes — L1 identifies or describes · L2 explains one side · L3 explains the given factor and
>   another · L4 that, plus a conclusion that weighs them. History shows the level, never a mark (§5).
> - `data/humanities/history/essays.json`, sets `yNN` (an extract + two questions, four seeded essays each);
>   brief and topic plan `docs/humanities/history-essay-brief.md` (y01–y09: Hitler's rise · Versailles · the
>   League · Japan · war in Europe · the defeats of Germany and Japan · the Cold War's origins · Korea · the
>   Cold War's end). Home's History tab lists them under **Essays**.
> - **18 essay questions listed (y01–y09, two a set).** Plan-only checks: all 72 seeded essays placed blind at
>   their level; a historian's read and a web fact check of every date, name and figure — no wrong fact, and
>   about twenty statements that were too strong or left something out, all revised (hyperinflation and the
>   Ruhr, Article 231, the Suez claim, Japan's notice to the League, the Soviet entry against Japan in August
>   1945, which Soviet moves came before the Truman Doctrine, y05-b's second factor now Hitler's aims over
>   Poland …). The revised essays were not blind-placed again as a whole; y05 and y07, the most changed, went
>   through the live reader.

> **D — PRACTICE BY SKILL BUILT 7 Oct 2026 (preview only, switch closed).** Adrian: "then do practice by skill".
> - Home's **Practise a skill** card (it replaces "Your skills"): every skill of the subject on the tab, the
>   weakest first, then the ones not tried — a levelled skill shows its usual level, a point-marked one
>   (Geography) its share of the marks ("about 6 marks in 10"), each with how many are left to do.
> - `/app/humanities/practice?s=<subject>&skill=<skill>`: the next five questions of that skill, taken one set
>   at a time so a run moves across topics, the unanswered first; the level ladder folded at the top.
> - A feedback page offers **More practice** — the next unanswered question of the same skill.
> - `lib/humanities-practice.ts` (pure, tested): `skillStandings` · `practiceRun` · `nextOfSkill`. No new
>   marking, no new route; it reads the levels and marks already on `humanities_runs`.

## 4. The bench — built like the science bench

No marked scripts are needed.

- **Seeded answers.** For each question we write answers at each level on purpose
  (a Level 1 that only copies the source, a Level 2 that infers without support, …).
  The level is true by construction. The marker must land on it.
- **Consistency.** The same answer read twice, days apart: same level ≥ 90 % of the
  time, never two levels apart.
- **Truth-free checks.** Adding a supported inference never lowers the level;
  removing the evidence never raises it; padding with length changes nothing.
- **Adrian adjudicates only the disagreements** — never whole sets.
- Later, when a school's marked scripts arrive: ranking against that teacher, as in
  SPEC-ESSAY-MARKING.

Gate to open the switch: seeded answers ≥ 90 % in the right level and none two
levels off; consistency passes; the truth-free checks pass.

**Runs so far (2 Oct 2026, preview, switch closed):**

| Run | Seeded | Consistency | Truth-free | Cost |
|---|---|---|---|---|
| `h1-2026-10-02` — the clean seeded answers | 45/46 | 12/12 | 24/24 | US$3.53 |
| `h1-hard-2026-10-02` — 90 student-like answers for sets 5–10 (`--hard`) | 89/90, the miss one level off | 23/23 | 31/31 | US$6.56 |
| `h2-history-2026-10-03` — History source questions (`--subject history`) | 35/35 | 9/9 | 22/22 | US$3.06 |
| `h2-structured-2026-10-03` — structured response (`--kind structured`) | 21/21 | 6/6 | 10/10 | US$1.47 |
| `a1-pilot-2026-10-07` — the first case study, s11 (`--sets s11`, every source in view) | 19/19 | 5/5 | 16/16 | US$2.14 |
| `b-geo-pilot-2026-10-07` — Geography, 8 point-marked questions (`--subject geography`; truth = the marks) | 37/38, the miss one mark off | 10/10 | 15/15 | US$2.05 |
| `b-geo-9mark-2026-10-07` — Geography, the eight 9-mark questions (`--subject geography --kind structured`) | 24/24 | 6/6 | 12/12 | US$2.18 |
| `c-hist-essay-2026-10-07` — History essays, sets y05 and y07 (`--sets y05,y07`) | 16/16 | 4/4 | 7/7 | US$1.50 |
| `b-geo-diagrams-2026-10-07` — Geography, the climate diagram set g23 (the diagram reaches the reader as words) | 23/23 | 6/6 | 9/9 | US$1.34 |

- The Geography miss was ours, not the reader's: a "zero" answer (people stay near volcanoes because they were born there) is a valid reason, and the reader credited it as an unlisted point. The seeded answer was replaced.
- The one miss: a reliability answer that trusts the source from its content alone,
  written as Level 2, read as 1–2.
- Still owed: the repeat reads were the same day. A days-apart repeat is a later run.
- A caution: the same model family wrote the answers and reads them, so a pass here
  shows the reader is steady and follows the scheme, not that the scheme matches a
  school's marking. Real student answers are the next test.

## 4b. The humanities bank — the Ten-Year-Series papers as background (5 Oct 2026)

Adrian: *"why don't bank the questions? we can bank them and still use it for background
material for the marker … build this"*.

**What is built.** The O-Level History, Geography and Social Studies TYS papers (2016–2025,
70 papers + their publisher answers, split in `Dropbox/ScanSnap/Humanities TYS by year/`) go
through the same extraction inbox and Fly lane as maths and science, into two tables in the
MAIN project:

- `humanities_source_sets` — material several questions share: a case study's Background
  Information + Sources A–F (`set_key` "Section A"), or Section B's extracts.
- `humanities_questions` — one row per question: `subject` (`history` · `geography` ·
  `social_studies`), `level` (`HIST`, `HIST_E`, `GEOG`, `GEOG_E`, `SS`), `school`/`exam_type`
  `GCE`, `year`, `paper`, `question_number`, `section`, `choice_group` (either/or), `skill`,
  `topics` (closed list, `humanities_topics`), `question_text`, its own `sources`, `parts`,
  `total_marks`, and the scheme on every leaf.
- A source is `{label, kind, text, image, provenance}` — text transcribed; a cartoon, map,
  photograph or graph cropped into the PRIVATE bucket `humanities_images` with every word in
  it transcribed into `text`.
- A scheme is `{marking: levels|points, model_answer, indicative[], skill_note, remark,
  levels[]?, points[]?}` — the publisher's answer verbatim (`solution_source =
  'publisher_tys'`, NOT SEAB's), the points it makes one per line, the publisher's
  Skill/Remark lines. Level descriptors only where the solutions print them; never invented.
- `national = true` on every row. **Grounding only — nothing here is served to a student**
  (`docs/CONTENT-POLICY.md`). RLS on, no policies, service key only.
- Written only through `bank_insert_humanities_paper(payload)` (checks topics, skills, marks
  adding up, a scheme on every leaf, sources with text or an image — and writes nothing when
  any check fails) and checked with `verify_humanities_paper(...)`. Migration
  `migrations/humanities_bank.sql`; the rules are the law's §Humanities papers
  (`extraction_worker_prompt` `exam-extraction`, v2026-10-05-humanities); the queue side is
  `docs/EXTRACTION-QUEUE.md` §4b.
- First paper banked 5 Oct 2026: Social Studies 2025 P1 — 7 questions, 50 marks, 2 source
  sets (Sources A–F; Extracts 1–3), 2 images.

**How the marker will read it — NOT wired yet (needs Adrian's bench first).** The marker today
reads only the scheme the website sends with the question (`data/humanities/…`). The plan:

1. For a question of skill S in subject X, the website picks 2–3 banked questions of the same
   `skill` (same `subject`, newest `year` first) with their source set.
2. They ride in the payload as `background.examples`: the question, the sources it uses (text
   only), the publisher's `model_answer` and `remark`, labelled "a published model answer at
   the top level — how this skill is answered, not this question's answer".
3. The marker's prompt says what they are for: what a top-level answer to this skill looks
   like, never a mark scheme for the student's question, never quoted to the student.
4. Gate: the humanities bench (§4) run twice — without and with `background` — on the same
   seeded answers. It switches on only if seeded accuracy and consistency do not fall, and
   Adrian reads the disagreements.

Nothing in `ai/humanities-marker.js` or `lib/humanities-*.ts` changed on 5 Oct 2026.

**School papers join (6 Oct 2026, Adrian: "copy the secondary humanities and languages and yes
queue humanities and languages — priority social studies and english").** The Grail copy's school
prelims / EOY / MYE / WA papers go into the same two tables under the school's name:
`national = false` (the function sets it — true only for school `GCE`), `solution_source =
'mark_scheme'` (the school's own scheme, inside the file or its `… MS.pdf` beside it; no scheme →
not banked; `publisher_tys` refused for a school), a new level **`SS_NA`** (N(A) Social Studies),
Sec 3 papers under the same upper-sec level. Migration `migrations/humanities_school_papers.sql`;
the law's §Humanities papers → *School papers* (v2026-10-06, archive `exam-extraction-2026-10-06`).
Still grounding-only — nothing reads them but the marker's future background step. The queue side
and the counts are in `docs/EXTRACTION-QUEUE.md` §4e.

## 5. What stays out

- No school paper served to a student (docs/CONTENT-POLICY.md).
- No mark out of 35 or 50.
- No handwriting in H1 — typed only. Pure History is typed in the exam itself.

## Open before Humanities opens — the hedge lines (5 Oct 2026)

Adrian, 5 Oct 2026 (the student-copy audit): leave these lines as they are for now — **he wants
to read them on the page before the Humanities switch opens**, then decide. Do not change them
without his word; do not open `HUMANITIES_OPEN_TO_STUDENTS` until he has.

- `src/app/app/humanities/page.tsx` — "This is feedback, not a mark. Ask your teacher about any doubt."
- The essay lines below (SPEC-ESSAY-MARKING.md, same date) — the Languages family shares the shape.
