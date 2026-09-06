# SPEC — Student portal v2: subjects, Practice as the to-do list, the Notebook as the record

**Status:** plan agreed with Adrian on 5–6 Sep 2026; **§1–§4, §6 and §7 built on `dev`
6 Sep 2026** ("build all on dev now" — four parallel builds merged 08:40 SGT, preview at
adrianmath-dev.vercel.app, three migrations applied live, the Notebook backfilled: 103
entries across 9 students). **Not promoted to prod**; §5 not built; students are still
in marking-only beta (`MARKING_ONLY_BETA`), so the Practice, Find and Notebook surfaces
are admin-visible until Adrian lifts it. Build order in §9. Owner of the standard: Adrian. This file is the source of truth; `PORTAL.md`,
`SPEC-ASSIGN.md`, `SPEC-REMEDIATION.md` describe what exists today and stay as history.

## 0. Decisions already taken (Adrian, 6 Sep 2026)

- A Math and E Math are kept apart everywhere a student sees results.
- A student sees only the subjects on their account. E Math only → E Math. Both → both.
  JC → H2.
- The student's Practice tab is their **to-do list**: work Adrian assigned, Practice
  Again questions from their own marked papers, questions they found with Find a question.
  Nothing else. The open topic picker and the timed set stay **admin-only**.
- **Find a question** (photograph or type a question, get one like it) replaces the
  students' Request materials button on Home. Generated questions capped at **10 a day**. Found questions go **straight into
  Practice**. A **nightly review on plan usage** checks how similar yesterday's matches
  really were.
- The request pipeline stays for Adrian and merges with the Telegram `/ws` worksheet
  menu and the skills sheet into one queue; reopened to students later, with approval.
- The Notebook shows a **living list of the student's mistakes**, fading as they are
  corrected, **linked to the Practice items that fix them**. Students may mark one
  "corrected" themselves; evidence can bring it back.
- "This week's focus" goes, from Home and from the Notebook.

## 1. Every marked paper has a subject

**Done (6 Sep):** `paper_marking_runs.paper_subject` ∈ `A Math | E Math | H2 Math |
Other`, backfilled: 77 / 49 / 8 / 6 (two smoke tests, Kevin's two polytechnic papers,
Zane's Sec 2 sheet went to E Math). Rule: the paper name first (`am`, `a math`,
`additional`; `em`, `e math`, `elementary`; `h2`, `jc`), then the marker's level text by
majority over the paper's questions ("Additional" beats "A-Level"; "Elementary" /
"E-Math" / plain "O-Level Mathematics" is EM; "H2"/"JC"/"9758" is H2).

**Built 6 Sep 2026** (bot `9f67fe3`+, site branch `build/subjects`):
- The bot sets `paper_subject` when a run is created (same rule, `lib/paper-subject.js`,
  pure + tested), and the hand-in's subject choice (`/app/submit`) is honoured first
  (science hand-ins → 'Other').
- The desk shows the subject on every row and lets Adrian change it (a select on the
  run's detail → `mark-triage {action:'subject'}`; writes the column only).
- **Student Papers page:** a colour-coded pill on every paper card — **AM** and **EM**
  (and **H2**; `components/PaperSubjectPill.tsx`) — and the three tiles (latest, average,
  trend) shown **per subject** (`app/marking/SubjectTiles.tsx`, `lib/portal-papers-stats.ts`),
  only when the account has more than one subject. "Other" papers list without a
  pill and count in no tile.
- Health check: `papers-subject` probes that no released run in the last 30 days has a
  null subject.

## 2. The subject gate

`portal_accounts.subjects` already holds the Airtable list ("E Math, A Math"). One
helper, `lib/portal-subjects.ts` (pure, tested): `allowedSubjects(account)` →
`['E Math','A Math']`, `['H2 Math']`, … with `IP Math` mapped to both O-Level lists and
JC accounts to H2. Every student read of topics, assignments, Find a question results, Papers
tabs and hand-in choices filters through it. Admin sees all. A stranger account (no
Airtable record) keeps today's behaviour (level-only).

## 3. Practice is the to-do list

**What exists:** `portal_assignments` (SPEC-ASSIGN) — bank question → instant grader;
worksheet PDF → hand-in flow; the Send-work card on the student's profile. Students are
in marking-only beta and see no Practice tab at all today.

**Built 6 Sep 2026** (branch `build/practice`; `lib/practice-todo.ts` pure + tested,
`app/practice/todo-list.tsx`; `/api/portal/assignments` returns the three sections): the
student Practice tab lists, newest first, with a state (to do / done / marked):
1. **From Adrian** — assignments as today.
2. **Practice Again** — one item per question handed back by the sheet worker (§7),
   labelled with the paper and the skill it fixes.
3. **Found by you** — questions from Find a question (§4), labelled with the tier.

The topic picker, timed set and exam card remain behind the admin cookie
(`PRACTICE_PICKER_OPEN_TO_STUDENTS = false`, `practiceAccess()` in `lib/portal-beta.ts`).
§1, §2 and §7 are live on dev, so marking-only beta may lift for Practice when Adrian
has looked at the preview — his call, not made yet.

## 4. Find a question

**What exists** (built as the practice-tab photo/search tool, `lib/portal-find.ts`): photo or typed question → bot vision + embedding match against the bank
→ else a generated twin through the four-gate worker; 5 generations a day;
`portal_generation_log` ledger; `lib/portal-find.ts` pure gates.

**Built 6 Sep 2026** (branch `build/find`; Adrian's ruling the same day: *a returned
match must be a genuinely SIMILAR question — same topic AND same sub-skill, testing the
same concept, marks within one; "same chapter" is NOT enough and is never offered*):
- **Two tiers, named on the card:** *Similar question* (bank) and *Made for you*
  (generated). There is no "same chapter" tier. The rule (`lib/portal-find.ts`
  `classifyFindCandidates`, pure + tested): the bot's embedding matches are enriched
  from the bank's `question_subgroups → subgroups` filing; the sub-skill the most
  matches share is the reference and must be corroborated by **at least two** of them
  (measured 6 Sep: the single nearest neighbour shares the source's primary sub-group
  only ~45% of the time); a match is similar when it is filed under that sub-skill as
  what it is ABOUT (primary filing, or the topic among its tags) and sits within one
  mark of the student's printed marks (else of the top-ranked member). Nothing similar
  → `/api/portal/generate` writes one. Subject gate (§2) applies to the pool first.
- Caps: generations **10 a day** (`DAILY_GENERATE_CAP`); bank finds stay generous
  (`DAILY_FIND_CAP` 25 over every ledger row).
- A found or generated question is inserted into Practice at once
  (`portal_assignments` source `find`, `find_tier` stamped, kind `question` → the
  instant grader); `/app/find` shows the card and deep-links to it. The student sees
  nothing of caps or reviews except the cap message.
- **Nightly similarity review** (`scripts/find-review/`, plan-billed like `day-review`,
  05:30 SGT): `GET /api/admin/find-review?date=` → judge every question that reached a
  student *Similar / Same-chapter-only / Off* with one line why → `POST` stores the
  verdicts in `portal_generation_log.review` and the route Telegrams one digest (Ops
  topic); `job_runs` slug `find-review`, `JOB_RHYTHMS` line, health-check probes
  `portal-find` + `find-review`. Misses live in `review` (the eval-case export is
  still to write).
- Home's "Request materials" door became "Find a question"; the request lane was retired on 6 Sep 2026 (routes + pages deleted, table kept for export/retention)
  reachable for Adrian (full-portal nav) and is no longer linked for students.

## 5. Requests become one pipeline

The Home button becomes Find a question. Adrian's own requests, the Telegram `/ws` menu (kinds 1/2/4/5
already queue through `worksheet_jobs` to the Mac worker) and the skills sheet share one
queue with kinds. When that queue has run clean for a fortnight, students get "ask Adrian
for a worksheet" back: a `worksheet_jobs` row in state `awaiting-approval`, Adrian's
tick on the desk releases it.

## 6. The Notebook: mistakes that fade

**Built 6 Sep 2026 (branch `build/notebook`):** `notebook_mistakes` (migration
`migrations/notebook_mistakes.sql`, RLS on / no policies), `lib/notebook-mistakes.ts`
(pure state machine + extraction, 43 tests), `lib/notebook-mistakes-store.ts`
(identity predicate in every query; exports `addPracticeLinks(identity, skillTitle,
assignmentIds)` for §7), hooks in mark-triage's release action and the practice
grader, `GET/POST /api/portal/notebook/mistakes`, the "Your mistakes" band on
`/app/my-notes`, health-check `notebook-mistakes`, backfill
`scripts/notebook-mistakes-backfill.ts`. The focus card and band are gone.
The thresholds shipped are the 6 Sep rules (ONE clean result → light, TWO → fixed, a
clean paper = two). Backfill run 6 Sep 08:35 SGT over 16 released runs: 103 entries /
9 students. A lost part the marker did not classify (every run before 3 Sep 2026 — the
marker only stamps `parts[].error_kind` since then) still seeds an entry, filed under
the topic alone as "Marks lost in <topic>"; it never merges with a classified entry.
§7's held items link into the matching entry per skill title (`addPracticeLinks`).

**Sources that already exist:** every lost part's `error_kind` + `study_note` +
`verdict_line`; the sheet diagnosis `skills[]` (titled, with marks and questions);
practice `weakness_tags`; `notebook_entries` (questions to retry); `student_attempts`.

**Entry model** (`notebook_mistakes`, one row per student × skill):
`title` (the diagnosis skill title, e.g. "Solving a trigonometric equation in a double
angle"), `error_kind`, `subject`, `evidence[]` (run/attempt links with dates),
`seen_count`, `clean_count`, `state ∈ dark | light | fixed | student_fixed` — shown to the student as **Still happening / Getting better / Fixed** (a `student_fixed` entry reads "Getting better · you marked this fixed"),
`practice_ids[]` (the Practice items that fix it).

**Rules:**
- New evidence from a released paper or a graded attempt creates or darkens the entry
  (papers count double).
- **One** clean result on the skill → `light`; **two** → `fixed`, shown in a "fixed" line
  at the bottom so progress is visible (Adrian, 6 Sep). A clean result is a graded
  attempt right on that skill, or a later released paper with no loss on it (a paper
  counts as two).
- **Student taps "corrected"** → `student_fixed` (light, labelled "you marked this
  fixed"); it becomes `fixed` after one clean result on any surface, or after 14 days
  with no recurrence. Any later evidence of the same mistake, in any state → `dark`
  again, labelled "came back".
- Each dark entry links to its Practice items (§3); a Practice item done right counts as
  a clean attempt.
- "This week's focus" (Home card, Notebook band, `lib/plan.ts`) is removed when the
  list ships.

## 7. Practice Again hands back its questions

**Today:** the Mac sheet worker writes a DOCX + PDF into Dropbox and posts `done` with
the file paths; Adrian vets the PDF; the student receives it with the paper. The portal
knows a file exists and nothing about its questions.

**Built 6 Sep 2026** (branch `build/practice`; migration
`portal_assignments_practice_again`): the worker's `done` result also carries
`questions[]` (`{section, index, skill_title, question_id|null, text_latex, answer_latex,
marks, topic}` — `scripts/sheet-worker/WORKER_PROMPT.md`). `/api/admin/sheet-jobs` `done`
→ `lib/practice-again-store.ts createHeldPracticeItems`: one `portal_assignments` row per
question, **source `practice-again`**, kind `question` (a live bank id) or **`generated`**
(text + answer + marks on the row), **status `held`** — invisible to the student — unique
on (sheet_job_id, sheet_index) so a re-posted `done` adds nothing. Adrian's **Approve &
release** (mark-triage `release` / `release-with-sheet`) flips every held row from that
run to `assigned` in the same step as `released_at`; `cancel` deletes held rows. Bank
items grade instantly; generated items go through the practice grader against
`answer_latex`. The DOCX/PDF stays exactly as it is.

## 8. What each piece needs to be "done"

Pure logic in `lib/` with a sibling test; a health-check entry for every new
student-facing surface; `job_runs` + `JOB_RHYTHMS` for every scheduled job; nothing
reaches a student that Adrian has not seen once on the desk.

## 9. Order

1. **§1 + §2** — subject on new runs, pills and per-subject tiles, the gate. One to two
   days. Everything else sits on it.
2. **§6 + §0's removal of the focus card** — the mistakes list, fed by papers first.
   Two days.
3. **§7** — the hand-back, then §3 the Practice tab as the to-do list. Two to three
   days.
4. **§4** — tiers, cap 10, straight-in, nightly review. One to two days.
5. **§5** — the merged queue, then requests reopened. When the rest has settled.

## 10. Still open

- §1: a paper the rule cannot sort shows as "Other" until Adrian tags it — confirmed.
- §6: wording **agreed 6 Sep** — Still happening / Getting better / Fixed.
- §7: **decided 6 Sep** — the sheet's Approve & release covers every question on it,
  including the ones the worker wrote (Adrian reads them all in the PDF). Models today:
  the sheet worker runs Claude Opus on plan usage (`claude -p --model opus`); the bank's
  generated twins use Claude Opus 4.8 with a Claude Sonnet 4.6 blind gate
  (`lib/models.js` in the bot).
