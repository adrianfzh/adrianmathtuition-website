# RUBRIC-SPEC.md — Admin-managed grading rubrics (the SG-syllabus foundation)

> **Why this exists:** you don't teach English, so the *syllabus standard* must live
> in the product, not in your head. This spec stores the marking rubric per
> level/paper/essay-type, pre-filled with the Singapore standard, **editable in
> admin**, and feeds it into the grader + the eval. Encode the standard once →
> every student is graded to it. (This is the student-product version of ren's
> "Custom Grading Prompts" + "answer-scheme extraction".)

## 1. The idea
- Today the rubric is hardcoded in `src/lib/learn/prompts.ts` (my general
  knowledge of O-Level English). That's a placeholder.
- We move it to **data**: a `rubrics` row per (level, subject, paper, essay_type),
  holding the band descriptors + any custom grading notes. The grader loads the
  right rubric and injects it into the prompt. You edit rubrics in admin and
  calibrate with the eval — **no code changes to tune grading.**

## 2. Data model (Supabase)
```
rubrics (
  id            uuid pk,
  level         text,         -- 'O-Level'
  subject       text,         -- 'English' | 'Math'
  paper         text,         -- 'Continuous Writing' | 'A-Math P1' ...
  essay_type    text null,    -- 'argumentative' | 'expository' | 'situational' | null
  criteria      jsonb,        -- [{ name:'Content', maxBand:.., descriptors:[{band, range, text}] }, ...]
  grading_notes text null,    -- extra examiner instructions you add over time
  out_of        int null,     -- 30 for full essay; null = scope feedback only
  version       int,
  updated_at    timestamptz
)
```
- `criteria` holds the **official band descriptors** (Content + Language, with
  mark ranges and the verbatim descriptor text).
- `grading_notes` is your free-text "also watch for X / mark Y strictly" — this is
  the "teachers can add to it" lever (here, *you* are the teacher).

## 3. How it plugs into the grader
- `/api/learn/grade` accepts `{ level, paper, essayType }` (or infers a default).
- It loads the matching `rubrics` row and builds the system prompt from
  `criteria` + `grading_notes` + the shared JSON contract — replacing the
  hardcoded block in `prompts.ts`. If no row matches, fall back to the built-in
  default (today's behaviour), so nothing breaks.
- The granularity rule (sentence / paragraph / full essay) stays in the base
  prompt; the rubric supplies the *standard* for the full-essay grade.

## 4. Pre-fill + sourcing the SG standard (the content work)
1. **Official rubric:** download the SEAB **1128 English** syllabus PDF from
   seab.gov.sg (assessment objectives + the writing band descriptors). The exact
   Content/Language band descriptors + mark ranges go into `criteria` verbatim.
   *(I could not fetch the PDF programmatically — SEAB blocks it — so this is a
   manual download + paste, once.)*
2. **Marked exemplars** (ground truth for calibration): O-Level "Ten-Year Series"
   model compositions with marker comments; assessment-book sample essays with
   bands; SEAB examiner reports (show high/low scripts); publisher marking guides;
   or a batch marked by an English teacher. 5–10 per essay type is enough to start.
3. Paste descriptors → `rubrics`; load exemplars → `scripts/eval/grading/essays.json`
   with their real marks; run `npm run eval:grading` until the model lands within
   ±3 marks. Now it grades to the SG standard.

## 5. Admin UI
- `/admin/rubrics` — list rubrics; edit `criteria` (band descriptors), `grading_notes`,
  `out_of`. View-only diff of versions. (Mirrors ren's grading-criteria editor.)
- Changing a rubric is instant — next grade uses the new version.

## 6. Build order
1. `rubrics` table + seed one row (O-Level English, Continuous Writing) from the
   official descriptors.
2. Refactor `/api/learn/grade` to load + inject the rubric (fallback to default).
3. `/admin/rubrics` editor.
4. Calibrate via `eval:grading` against real marked exemplars.
5. Repeat per essay type / add Math rubrics.

This is the highest-leverage non-negotiable: it's both **"cater to the SG
syllabus"** and **"make grading accurate and tunable without code."**
