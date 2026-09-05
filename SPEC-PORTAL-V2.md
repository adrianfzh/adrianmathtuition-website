# SPEC — Student portal v2: subjects, Practice as the to-do list, the Notebook as the record

**Status:** plan agreed in discussion with Adrian on 5–6 Sep 2026. **Nothing built yet
except the data sort in §1 (every marked paper now carries a subject).** Build order in
§9. Owner of the standard: Adrian. This file is the source of truth; `PORTAL.md`,
`SPEC-ASSIGN.md`, `SPEC-REMEDIATION.md` describe what exists today and stay as history.

## 0. Decisions already taken (Adrian, 6 Sep 2026)

- A Math and E Math are kept apart everywhere a student sees results.
- A student sees only the subjects on their account. E Math only → E Math. Both → both.
  JC → H2.
- The student's Practice tab is their **to-do list**: work Adrian assigned, Practice
  Again questions from their own marked papers, questions the finder brought in.
  Nothing else. The open topic picker and the timed set stay **admin-only**.
- The finder ("find me a question like this") replaces the students' Request materials
  button. Generated questions capped at **10 a day**. Found questions go **straight into
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

**To build:**
- The bot sets `paper_subject` when a run is created (same rule, `lib/paper-subject.js`,
  pure + tested), and the hand-in's subject choice (`/app/submit`) is honoured first.
- The desk shows the subject on every row and lets Adrian change it (a select on the
  run's detail; writes the column only).
- **Student Papers page:** a colour-coded pill on every paper card — **AM** and **EM**
  (and **H2**) — and the three tiles (latest, average, trend) shown **per subject** as
  tabs, only when the account has more than one subject. "Other" papers list without a
  pill and count in no tile.
- Health check: `papers-subject` probes that no released run in the last 30 days has a
  null subject.

## 2. The subject gate

`portal_accounts.subjects` already holds the Airtable list ("E Math, A Math"). One
helper, `lib/portal-subjects.ts` (pure, tested): `allowedSubjects(account)` →
`['E Math','A Math']`, `['H2 Math']`, … with `IP Math` mapped to both O-Level lists and
JC accounts to H2. Every student read of topics, assignments, finder results, Papers
tabs and hand-in choices filters through it. Admin sees all. A stranger account (no
Airtable record) keeps today's behaviour (level-only).

## 3. Practice is the to-do list

**What exists:** `portal_assignments` (SPEC-ASSIGN) — bank question → instant grader;
worksheet PDF → hand-in flow; the Send-work card on the student's profile. Students are
in marking-only beta and see no Practice tab at all today.

**To build:** the student Practice tab lists, newest first, with a state (to do / done /
marked):
1. **From Adrian** — assignments as today.
2. **Practice Again** — one item per question handed back by the sheet worker (§7),
   labelled with the paper and the skill it fixes.
3. **Found by you** — finder results (§4), labelled with the tier.

The topic picker, timed set and exam card remain behind the admin cookie. Marking-only
beta lifts for Practice only when §1, §2 and §7 are live.

## 4. The finder

**What exists:** photo or typed question → bot vision + embedding match against the bank
→ else a generated twin through the four-gate worker; 5 generations a day;
`portal_generation_log` ledger; `lib/portal-find.ts` pure gates.

**To build:**
- **Three tiers, named on the card:** *same skill* (same topic and sub-skill, marks
  within one — the default), *same chapter* (same topic, another sub-skill — offered
  when tier 1 is empty, labelled), *made for you* (generated). The sub-skill comes from
  the bank row's subgroup / question type; the embedding match becomes the candidate
  pool the tiers filter.
- Cap: generations **10 a day**; bank finds stay generous (today's finder ledger cap).
- A found question is inserted into Practice at once (`portal_assignments`, source
  `finder`, tier stamped).
- **Nightly similarity review** (`scripts/finder-review/`, plan-billed like
  `day-review`): read yesterday's ledger rows, judge each match "same skill / same
  chapter / off", write misses as eval cases, one-line digest to Adrian, `job_runs`
  slug `finder-review`, `JOB_RHYTHMS` line.

## 5. Requests become one pipeline

Student button → the finder. Adrian's own requests, the Telegram `/ws` menu (kinds 1/2/4/5
already queue through `worksheet_jobs` to the Mac worker) and the skills sheet share one
queue with kinds. When that queue has run clean for a fortnight, students get "ask Adrian
for a worksheet" back: a `worksheet_jobs` row in state `awaiting-approval`, Adrian's
tick on the desk releases it.

## 6. The Notebook: mistakes that fade

**Sources that already exist:** every lost part's `error_kind` + `study_note` +
`verdict_line`; the sheet diagnosis `skills[]` (titled, with marks and questions);
practice `weakness_tags`; `notebook_entries` (questions to retry); `student_attempts`.

**Entry model** (`notebook_mistakes`, one row per student × skill):
`title` (the diagnosis skill title, e.g. "Solving a trigonometric equation in a double
angle"), `error_kind`, `subject`, `evidence[]` (run/attempt links with dates),
`seen_count`, `clean_count`, `state ∈ dark | light | fixed | student_fixed`,
`practice_ids[]` (the Practice items that fix it).

**Rules:**
- New evidence from a released paper or a graded attempt creates or darkens the entry
  (papers count double).
- Two clean attempts on the skill, or one later paper with no loss on it → `light`.
  A third → `fixed`, shown in a "fixed" line at the bottom so progress is visible.
- **Student taps "corrected"** → `student_fixed` (light, labelled "you marked this
  fixed"). Any later evidence of the same mistake → `dark` again, labelled "came back".
- Each dark entry links to its Practice items (§3); a Practice item done right counts as
  a clean attempt.
- "This week's focus" (Home card, Notebook band, `lib/plan.ts`) is removed when the
  list ships.

## 7. Practice Again hands back its questions

**Today:** the Mac sheet worker writes a DOCX + PDF into Dropbox and posts `done` with
the file paths; Adrian vets the PDF; the student receives it with the paper. The portal
knows a file exists and nothing about its questions.

**To build:** the worker's `done` result also carries `questions[]`: for each practice
question, either a bank `question_id` or the generated text (+ answer + marks + skill
title). The server creates one `portal_assignments` row per question (kind
`practice-again`, linked to the run and the skill) in state `held` until Adrian's
**Approve & release** on the desk, which releases the paper, the sheet AND the items
together. Bank items grade instantly; generated items go through the same grader once
their answer is stored. The DOCX/PDF stays exactly as it is.

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
- §6: the exact wording of the three states on the student's screen.
- §7: whether a generated Practice Again question needs Adrian's tick per question or
  only the sheet's release. Proposed: the sheet's release covers them.
