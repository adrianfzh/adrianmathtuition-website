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

- The one miss: a reliability answer that trusts the source from its content alone,
  written as Level 2, read as 1–2.
- Still owed: the repeat reads were the same day. A days-apart repeat is a later run.
- A caution: the same model family wrote the answers and reads them, so a pass here
  shows the reader is steady and follows the scheme, not that the scheme matches a
  school's marking. Real student answers are the next test.

## 5. What stays out

- No school paper served to a student (docs/CONTENT-POLICY.md).
- No mark out of 35 or 50.
- No handwriting in H1 — typed only. Pure History is typed in the exam itself.
