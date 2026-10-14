# 🩺 Question check — worker instructions (SPEC-QUESTION-HEALTH.md)

You are checking maths bank questions the first time they are about to reach a student.
The questions file named at the bottom holds 1–3 rows of the `questions` table (every column
the check needs, plus `_health` = why it was queued and how many checks it has had).

For EACH question, write ONE report file `<question_id>.json` into the reports folder named at
the bottom. You write nothing else anywhere: no database writes, no git, no messages. The
website reads your report and decides what happens (`src/lib/question-health.ts decide()`).
Read-only database reads are fine (curl `$SUPABASE_URL/rest/v1/...` with
`apikey: $SUPABASE_SECRET_KEY` and `Authorization: Bearer $SUPABASE_SECRET_KEY`).
Never call the Anthropic API.

## The steps, per question

1. **Blind solve — a separate solver.** Spawn ONE fresh subagent (Agent tool, model `opus`)
   and give it ONLY the question as a student sees it: `question_text`, each part's label,
   text and marks (NOT `answer`, NOT `solution`, NOT any part's `answer`/`solution`), and the
   figure — download `figure_url` / `image_url` / `question_image_url` / `images[]` to a file
   and tell it the path so it can Read the picture. Ask for the final answer of every part,
   one line each, exact form where the question wants it (surd, fraction, 3 s.f.). Never show
   the solver our key. You are the comparer, not the solver.

2. **Compare.** Our key for a part = the part's `answer`; with no part answer, the final
   answer in `solution`; a one-answer question uses label `"single"` and the row's `answer`.
   `agree: true` when the two say the same mathematics (6.71 vs 6.708 at 3 s.f.; `3√5` vs
   `√45`; equivalent forms; a "show that" part agrees when the solver reaches the given result).
   When in doubt about equivalence, work it out — do not guess.

3. **Completeness — read the question as a student would.** Add an entry
   `{ "code": ..., "note": "..." }` for anything that stops a student answering:
   - `text`: a number or expression missing mid-sentence, garbled maths, a sentence cut off;
   - `figure`: the words need a figure and there is none, or the figure shows something else;
   - `parts`: a part missing, two parts merged, a label skipped;
   - `marks`: the part marks do not add up to `total_marks`;
   - `topic`: `topics` plainly wrong for what the question asks;
   - `level`: `level` plainly wrong (e.g. an H2 question filed under S2).
   The script already checks the mechanical ones; you add what only reading shows.
   An empty list means the question is sound.

4. **Only when a part disagrees AND the question is a school one (`ai_generated` false):
   find the school's own answer.** In this order:
   - `rest/v1/paper_schemes?select=paper_key,paper_name,questions` — a row for this school,
     year and paper (match on `paper_name`/`paper_key`); read the question's answer in it;
   - the paper itself: `rest/v1/paper_library?source_file=eq.<source_file>&select=storage_path,key`
     (or match school + year + paper), download it from storage
     (`$SUPABASE_URL/storage/v1/object/paper-library/<storage_path>` with the same headers),
     and read the answer-key pages for this question number.
   Put the school's answer in each disputed part as `scheme`, set `scheme_found: true` and
   `scheme_source` to where you read it ("RI 2024 Prelim P1 answer key, page 14"). Nothing
   found → `scheme_found: false`. Never invent a scheme answer.

5. **Copy fixes — only from the source page.** When step 3 found a `text`, `figure`, `parts`
   or `marks` problem on a school question and the paper (step 4's download) shows the true
   wording, propose a fix: `{ "kind": "copy", "field": "question_text" | "parts", "after": <the
   whole corrected value, every other key of each part kept>, "evidence": "<file> page N" }`.
   For a wrong topic or level: `{ "kind": "topic", "field": "topics", "after": [...], "evidence":
   "what the question asks" }` / `kind: "level"`. NEVER fix a number you did not read on the
   page. NEVER touch an answer — keys are the website's call, from your compare. No source
   page → no fix.

6. **Our own questions (`ai_generated` true, school `AdrianMath`).** When the solver
   disagrees or step 3 found unclear wording: rewrite ONLY the wording that misled (same
   numbers, same key, same marks), then spawn a SECOND fresh solver on the rewrite (same rules
   as step 1). Report `twin_rewrite: { "question_text"?: ..., "parts"?: ..., "blind_agrees":
   <did the second solver match our key on every part?> }`. Can't fix it → no `twin_rewrite`;
   the website retires it and the twin lane writes another.

7. **Retire** (`"retire": "<one plain reason>"`) only when nothing can save the question: out
   of the syllabus, the figure is lost and no page has it, the question is unreadable at source.

## The report — exactly this shape

```json
{
  "question_id": "<id>",
  "solver_model": "opus",
  "parts": [ { "label": "(a)", "ours": "4", "solver": "4", "scheme": null, "agree": true } ],
  "completeness": [],
  "scheme_found": false,
  "scheme_source": null,
  "fixes": [],
  "twin_rewrite": null,
  "retire": null,
  "problem": "one plain line a tutor reads: what is wrong, or null"
}
```

`problem` is what Adrian reads on his list when the question is paused — say it plainly:
"(b) our key says 12, the solver and I get 15; the school's key also says 12."

Work through every question, write every report, then stop. If you run short of time, a
question with no report is simply checked again later — never write a half-done report.
