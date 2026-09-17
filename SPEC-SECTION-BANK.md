# SPEC-SECTION-BANK — let the bank accumulate

**Status: BUILT 17 Sep 2026** (phase 0 + phase 1). Adrian, 17 Sep 2026, on
whether Practice Again sheets should keep being written from scratch: *"yes, we
can just let the bank accumulate, instead of writing everything from scratch …
go, build the bank."*

## 1. The idea in one paragraph

A Practice Again sheet is a set of sections, each teaching one missed step with a
worked Example and a practice pair. Until now every section was authored fresh:
361 sections for 19 students in the last 40 days, and by exact title alone about
one in four was a lesson already written for someone else. Adrian's Word edits on
one sheet never reached the next student. The bank fixes that without any
curation up front: **every taught section of every filed sheet becomes a row, keyed
by the missed step; the worker searches those rows before it writes; a hit is
reused (Adrian's edited copy, numbers re-verified); a miss is authored and becomes
the next row.** The bank grows only where students actually fail.

## 2. What a row is (`sheet_sections`)

One row per **taught** section (diagnosis tier `teach`; the ② "show" lines and the
optional tail have no worked example to reuse). Fields: the job and run it came
from, student and paper name (so a reuse can be named — "Practice 1 from Alessi's
16 Sep sheet"), subject, level (AM / EM / H2 / H1, read off the paper name),
`section_index` (the sheet's Practice number, so the completion's
`questions[].section` lines up), `title` (the section heading, verbatim), `gap`
(the missed step in words — the marker's part-level gap or the worker's own),
`questions` (where it showed), `marks`, `why`, `docx_path` / `pdf_path` (the sheet
the section lives in; **Adrian's edited docx is the row's content**, there is no
copy of the text in the table), `practice_question_ids` (bank questions used) and
`authored_practice` (how many practice items were written), `last_vetted_at`,
`retired_at` + `retired_reason`, and a generated full-text column over title + gap
+ why.

Unique on (job, section_index): a `revise` round that re-completes the job
overwrites its own rows.

## 3. The three doors

- **Filing** — `POST /api/admin/sheet-jobs {action:'done'}` files the sheet's
  sections after it stores the diagnosis (`lib/sheet-sections.ts
  sectionsFromCompletion`, pure/tested; `lib/sheet-sections-store.ts
  fileSheetSections`). Fail-soft: the bank never blocks a completion. A batch
  sheet files the whole diagnosis under the primary run.
- **Search** — `GET /api/admin/sheet-sections?q=<missed step words>&subject=&level=`
  → vetted rows first, then newest; full-text (websearch over title + gap + why),
  falling back to a loose title/gap match on the first content words; retired rows
  never surface. No `q` lists the newest rows.
- **Vet / retire** — `PATCH {id, vetted, retired, reason}`. Vetting stamps
  `last_vetted_at`; retiring hides the row from the worker and keeps it for the
  record. No admin page yet: the desk's sheet view is the natural home for the two
  buttons (next step).

## 4. The rule the worker follows (`WORKER_PROMPT.md` §2, the skill's "Reuse before you write")

Before drafting any ① section: search the bank by the **missed step**, never the
topic. Same missed step → reuse that section from its `docx_path` (Adrian's copy
when `client_modified` is later than the row), re-run every check, name it in
`result.reused`. Same skill but a different missed step → not a reuse (Alessi
lacked the angle; the next student may lack R itself). Nothing to file by hand.

## 5. What is deliberately not in v1

- No copy of the section's text in the table — the docx is the truth, and Adrian
  edits there. A `body_md` column can be filled later by a Mac sweep (pandoc) if
  search needs the example's wording.
- No embeddings — full text over title + gap + why, with the fallback, is enough
  for a bank of hundreds. Revisit at thousands.
- No admin page — vet / retire are API verbs today.
- No automatic "Adrian edited this" flag — the worker checks the docx's
  `client_modified` when it reuses, as it already did for same-paper reuse.

## 6. Doctrine steps 4–5

Trigger: the `done` action itself (no cron). Log + alarm: the health-check probes
the route's 401 (`sheet-sections`); a filing failure logs `[sheet-sections] not
filed` and the completion still succeeds. Numbers to watch on the Monday review:
rows filed per week, `reused` entries per sheet.

## 7. Closure tracking (BUILT 17 Sep 2026)

Exactly how it is done, step by step:

1. A student hands a Practice Again sheet back through the app. The marker marks
   it against the sheet (the bot attaches the sheet as the question paper and
   stamps which sheet it was).
2. When that marking is released, the site looks up the sheet: the assignment's
   `sheet_job_id`, else the newest finished sheet job on the paper the sheet came
   from. That job's rows in `sheet_sections` are the sections the sheet taught,
   each with the wording of its practice questions (`practice_texts` — the worker
   now sends `text` for every item; bank items are filled from the bank).
3. Every question the marker found on the returned sheet is matched to ONE section
   by the words of its stem against the section's practice questions (content
   words, numbers included; the best overlap of at least 0.45 wins; nothing close
   → no match). `lib/sheet-closure.ts`, pure, tested.
4. Each section gets one outcome in `sheet_section_outcomes`: **closed** (every
   matched question full marks), **slip** (marks lost only to careless kinds),
   **still_failing** (marks lost to method or anything else), **unknown** (no
   question matched). One line goes to the marking topic naming the sections still
   failing.
5. Over time the bank ranks sections by closure (`closureSummary`), and the Monday
   report carries the week's closure numbers — the measure of whether the sheets
   work, section by section.
