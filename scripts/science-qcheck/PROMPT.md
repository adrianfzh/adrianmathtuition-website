# Structured science question check (14 Oct 2026, Adrian: "yes" — check a starter set, then a batch a night)

Used by `scripts/science-qcheck/run.sh` (the Fly worker's nightly `science-qcheck` job) and by
the starter run. A pass is stamped `questions.practice_checked_at` (what structured practice
serves to students); a fail gets a one-line `practice_check_note` and is never served.

You check Secondary 4 structured science questions (Physics / Chemistry / Biology, O-Level
style) from the question bank BEFORE they are served in "Structured practice": a student
reads the question (stem + every part, with any figure), writes an answer to each part, a
grader marks it against OUR SCHEME (the `scheme_answer` / `scheme_solution` of each part, or
the row's `solution`), then the student sees the scheme.

Your batch file is named below. Each item: `id`, `question_text` (the stem), `parts` (label,
text, marks, scheme_answer, scheme_solution, subparts), `answer`/`solution` (whole-question
scheme), `total_marks`, `figure_files` (local PNGs — open EVERY one with the Read tool).

For EACH item decide PASS or FAIL against this standard (the same as the bank's question check):
1. **Text complete and readable** — no number, unit, formula or word missing mid-sentence, no
   garbled symbols that change meaning, no sentence cut off, no leftover extraction junk that
   would confuse a student (page headers, "[Turn over", answer lines are harmless only if tiny).
2. **Every part present** — labels in order, none skipped or merged; a part the stem refers to
   ("in (b)…") exists. Part marks roughly match `total_marks` (a small mismatch alone is not a fail).
3. **The scheme matches the question** — every part has a scheme answer that answers THAT part
   (not a neighbour's, not a different question's); scheme numbers are right for the data given
   (do a quick check of any calculation — if the scheme's number is wrong, FAIL); the scheme is
   enough for a grader to mark a written answer.
4. **Answerable from what is shown** — if the text refers to a figure/table/graph ("Fig. 6.1",
   "the diagram", "the table below", "the graph") then a figure file must exist AND show what the
   words need (the right apparatus, readable values/labels needed to answer). No figure file when
   one is needed → FAIL. A figure you cannot read well enough to check the scheme → FAIL.
   Data needed for a calculation must be in the text or the figure.
   **A part that must be answered ON a grid, chart or figure that is not shown** (plot a graph,
   draw a bar/pie chart, complete a table that is not shown, circle a value in a table not
   shown) → FAIL: the student types the answer. A sketch, a dot-and-cross diagram or a drawing
   a student can describe in words is fine.
5. **Self-contained** — not a practical "carry out the experiment / record your observations"
   task that needs real apparatus or results the student does not have (planning questions are
   fine; "record your observations of solution X" where X is unknown to the student is FAIL),
   and not dependent on an earlier question ("using your answer to Question 3").
6. **Fit for the topic** listed in `pools` — at least one part is on that topic (if NONE is,
   FAIL with reason "off topic").

Be strict but fair: minor typos, a stray "[1]" in the scheme, or LaTeX that will render are fine.
When in doubt whether a student could answer it properly, FAIL — a failed question is simply
not served.

Write ONE file per item: `<reports dir>/<id>.json` (reports dir named below), exactly:
```json
{ "id": "<id>", "verdict": "pass", "reason": null, "figure_checked": true }
```
or `"verdict": "fail", "reason": "<one plain line: what is wrong, which part>"`.
`figure_checked` = true when you opened figures and they fit, false when there were none.
NEVER name the school, year or paper in a reason. No database writes, no git, no network.
When done, reply with one line: "<batch>: N pass, M fail".
