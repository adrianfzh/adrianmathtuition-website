# Writer brief — borderline student answers for structured science (O-Level, Singapore)

You write pretend student answers to real bank questions, and you FIX THE CORRECT MARK IN ADVANCE.
A different program (the grader) will later mark your answers; you never see it and must not look
for it — do not read any file except the questions file and figure PNGs named below.

Questions file: hard2/questions.json (path given below). Do ONLY the items whose `subject` is yours.
Each item: qid, bankId, subject, total_marks, question_text, parts (label, text, marks,
scheme_answer, scheme_solution, subparts), answer/solution (whole-question scheme), figure_files
(open every PNG with Read).

For EACH question write THREE answers, each a DIFFERENT kind from this list (pick the three that
fit the question best; spread kinds across your 10 questions so every kind is used at least 5 times):
- `vague`   — wording a strict SEAB examiner refuses: "it gets bigger", "the particles move more",
              "energy is lost", "the enzyme dies", "reacts faster", missing the key term the scheme
              needs (e.g. "denatured", "frequency of effective collisions", "per unit area").
- `units`   — calculation right but a unit missing or wrong on a final answer, or a wrong number of
              significant figures / rounding where the scheme demands it; or a definition with the
              quantity right but the unit wrong.
- `ecf`     — an early slip (wrong substitution, wrong reading, wrong Mr) carried correctly through
              later steps/parts: decide which later marks are still earned under error carried forward.
- `partial` — an explanation that is partly correct: right idea for one scheme point, missing the
              link/second point, or one correct point mixed with one wrong statement.
Every answer must be BORDERLINE: not all-right, not all-wrong. Answer EVERY part (a student's real
attempt); keep it in a student's voice, short lines.

Fix the mark the way a strict but fair SEAB O-Level examiner would, from the scheme and published
examiner convention: scheme points are needed in substance (not exact words) but vague wording that
does not show the idea earns nothing; a final numerical answer without its unit (or with a wrong
unit) loses the answer mark (A1) but keeps method marks; ECF is allowed for later steps/parts that
correctly use a wrong earlier value unless the error makes the later work trivially simpler; a
contradiction (one right and one wrong statement about the same point) earns no mark for that point;
"any two of" lists cap at the stated number. Give marks PER PART, then the total.

Output: write ONE JSON file (path given below), an array of 30 objects, exactly this shape:
{ "qid": "H01", "bankId": "<bankId>", "subject": "physics", "type": "calculation|explain|define/state|mixed|other",
  "marks": <total_marks>, "variant": "vague|units|ecf|partial", "expected": <int total>,
  "expectedParts": { "a": 1, "b": 2 }, "why": "<one or two lines: which marks are earned/lost and why>",
  "lines": ["(a) ...", "...", "(b) ..."] }
`type` describes the question (calculation if any part needs a number worked out; mixed if it has
both calculation and explanation parts). Use part labels as they appear ("b(i)" etc. for subparts).
`expected` must equal the sum of expectedParts and be strictly between 0 and marks (borderline).
Do not name any school, year or paper anywhere. No database, no git, no network.
Reply with one line: "<subject>: 30 answers written, kinds: vague N, units N, ecf N, partial N".
