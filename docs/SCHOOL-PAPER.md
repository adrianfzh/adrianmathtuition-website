# School papers — a new paper in one school's style

Adrian, 18 Sep 2026: "i need to make a similar exam paper for st nicholas girls … must be
similar in topics tested, duration, number of marks. do not just change numbers, must be
genuinely different, though similar in idea. same difficulty or slightly harder".

The METHOD is generic for lower secondary. Everything that makes a paper a particular
school's paper is data in that school's folder, written from the school's own papers in
the bank. Scope comes from the school's papers, never from the national syllabus for the
level: St Nicholas tests compound interest, cones, spheres and simultaneous equations in
Sec 1.

## Schools so far
| key | paper | state |
|---|---|---|
| `sngs-s1-eoy` | CHIJ St Nicholas Girls · Sec 1 EOY · 90 marks, 20 Qs | plan approved, paper built 18 Sep 2026 |
| `tjc-ip4-am-eoy` | Temasek Junior College (IP) · IP4 Additional Mathematics EOY · 100 marks, 14 Qs, 2 h 30 | plan + standard DRAFTED 20 Sep 2026 — the first upper-sec paper by this method; awaiting Adrian's checkpoint 2 |
| `tjc-ip4-em-eoy` | Temasek Junior College (IP) · IP4 Intermediate Mathematics (= E Math) EOY · 100 marks, 16 Qs, 2 h 30 | plan + standard DRAFTED 20 Sep 2026; follows the 2025 shape (the question count moved 12 → 13 → 16 over the years) |

## The pieces

| Piece | Where | Generic or per school |
|---|---|---|
| Profile: marks, questions, part sizes, figures, explain parts, marks per area | `scripts/school-paper/profile.mjs` | generic script, per-school output |
| The slots (marks, part marks, figure, topics, what each asks) | `scripts/school-paper/schools/<key>/plan.json` | per school, **Adrian approves it** |
| The standard (scope, where the difficulty sits, wording, what "different" means) | `scripts/school-paper/schools/<key>/standard.md` | per school |
| Briefs, gates, assemble | `scripts/school-paper/run.mjs` | generic |
| Figures | `scripts/gce-paper/figure.mjs` | shared with GCE papers |
| `solver_scope` in `plan.json` — the methods the blind solver may use (e.g. "lower-secondary methods", "O-Level Additional Mathematics (4049) methods …"); the brief used to hard-code lower-sec (fixed 20 Sep 2026) | `plan.json` | per school |
| `formulae` in `plan.json` — the formulae page as `[[head, body\|null], …]` in the shape `export-docx.py` prints (TJC prints one; St Nicholas does not, so it omits the field) | `plan.json` | per school |
| Word files | `scripts/gce-paper/export-docx.py` (reads the paper's `front` block) | shared |

## The round

1. `profile.mjs --school … --level … --exam … --out <dir>`. Read `profile.md` and the real
   questions. Write the profile and difficulty note for Adrian. **Checkpoint 1: he reads it.**
2. Write `plan.json` and `standard.md`. **Checkpoint 2: he approves the slot plan.**
3. `run.mjs brief --key <key> --run <dir>`: one brief per slot, showing the school's own
   questions on that topic as the skill and the level, never as templates.
4. Per slot: author → `run.mjs check` → blind solve → moderate → repair (three rounds at
   most, then replace the question). Tell Adrian the agents, models and rough reading
   first, and wait for his yes. Never the API.
5. Figures for the slots that carry one, then `run.mjs assemble`, then `export-docx.py
   <key>.json --figures <dir> --out <dir>`. **Checkpoint 3: Adrian reads the paper.**

### What the Word exporter reads from a question (18 Sep 2026)

- A markdown pipe table in a stem or part prints as a real ruled table. A part that ENDS in
  a table (a table to complete) gets no writing lines; the table is the answer space.
- A line that is one maths run with `\qquad` between items prints as a centred, spaced list.
- A question with no stem puts its first part on the number's own line. A part with no text
  and sub-parts prints as "(a) (i) …" on one line. A part with no label reads as more stem.
- Money is `\$` in prose. Unit powers are written `m$^{3}$`; the exporter moves the unit
  into the maths. `^\circ` prints as a real degree sign.
- `"figure_position": "answer_space"` on a question: the figure is the space the candidate
  draws in (a construction's given line). It prints under the last part, untrimmed, and the
  parts above it leave no writing lines. Draw it as `Q<n>.png` and set its printed width in
  `figure-sizes.json` (`{"14": 140}` = 14 cm) so a given length prints true. Print at actual size.
- Every stem paragraph stays on the page with the figure under it.
- Answer lines are printed only where the author wrote one. The school's own answer-line
  format is not in the bank's text, so none are added automatically.

## The gates (`run.mjs check`)

- the leaf part marks, in order, equal the slot's part marks;
- topics are bank names; skills, solution and an answer for every part are present;
- a figure slot has a figure description, a plain slot has none;
- wording: word-trigram Jaccard at most 0.4 against every S1 and S2 bank question, and at
  most 0.3 against the school's own papers. This is a floor. The moderator's "too_close_to"
  is the real test of "not just changed numbers".

`assemble` takes a slot only when the gates pass, the blind solve agrees with the key on
every part, the moderator finds it in scope with fair marks, names no real question it is
too close to, rates the difficulty "same" or "slightly harder", and scores the wording at
least 4 of 5. `paper-shape-report.json` gives the counts to set beside the profile.

## Content policy

A school's questions are grounding for the author and the moderator and are never
reproduced (`docs/CONTENT-POLICY.md`). The printed paper says it is newly written in the
school's style and is not a past-year paper.

## Schools so far

| Key | Paper | State |
|---|---|---|
| `sngs-s1-eoy` | CHIJ St Nicholas Girls, Sec 1 End-of-Year, 2 h 15 min, 90 marks, 20 questions | first paper written 18 Sep 2026 (20 questions, 90 marks, 7 figures, all slots through blind solve and moderation), with Adrian for his read; files in `~/Desktop/AdrianMath/School Papers/St Nicholas S1 EOY/` |
