# School papers — a new paper in one school's style

Adrian, 18 Sep 2026: "i need to make a similar exam paper for st nicholas girls … must be
similar in topics tested, duration, number of marks. do not just change numbers, must be
genuinely different, though similar in idea. same difficulty or slightly harder".

The METHOD is generic for lower secondary. Everything that makes a paper a particular
school's paper is data in that school's folder, written from the school's own papers in
the bank. Scope comes from the school's papers, never from the national syllabus for the
level: St Nicholas tests compound interest, cones, spheres and simultaneous equations in
Sec 1.

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
- **`page_per_question: true` + `front_page: false` in `plan.json`** (Adrian, 20 Sep 2026, on the
  TJC papers: "don't put [Answers for…], remove formula sheet, remove first page instructions,
  just have title, then questions right away, and give space for individual parts"): the
  title and one subtitle line, then Q1 on the same page; every later question on a fresh page;
  the blank space under each part is AT LEAST `--space` lines per mark (3), the question takes
  as many whole pages as that needs ("you can go to two pages if question is long"), and the
  space is stretched to FILL those pages in proportion to marks (`estimate_used_cm` in
  `export-docx.py`), so no page is left nearly empty. A part's own figure prints right under
  its text, then the part's space. Picture paragraphs keep SINGLE line spacing (worksheet_lib
  `_enforce_line_spacing`) — at 1.5 Word scaled a 23 cm grid's line to 35 cm and left a blank page. Without the flags the GCE front page and the fixed per-mark lines print
  (St Nicholas).
- **A part may carry its own figure**: `"figure": "a"` on a part prints `Q<n>a.figure.png`
  under that part (the renderer accepts `Q<n><letter>.figure.json|cjs`); with
  `"figure_position": "answer_space"` on the part it prints raw with no writing lines (TJC EM
  Q5: the given sketch under (a), the blank axes under (b)). A slot whose parts carry figures
  prints no slot-level figure. `figure-sizes.json` is keyed by the same `5a` / `5b`.
- **A plotting grid must fit A4**: the printed image includes the axis numbering, so a
  15 cm × 20 cm grid needs a 19 cm image — too wide. 1 cm per 0.1 on both axes (10 × 20 cm,
  image 14.2 cm) fits on its own page; compute the width from the SVG's grid extent.

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

## Lessons from the TJC round (20 Sep 2026)

- **A second set needs its own slot briefs, or the moderator will do the redirecting.** With
  `avoid_runs` the gate and the moderator catch Set 1 twins, but 12 of 30 Set 2 first drafts
  were caught that way — cheaper to write the slot's `content` for Set 2 ("NOT the Set 1
  direction, which was …") before authoring.

- **The blind solve earns its keep on rounding.** The only key error in 30 questions was a
  3rd-significant-figure tightrope (9.3849… written as 9.39). Authors must compute to 6 s.f.
  and the moderator recomputes; when an answer sits within 0.001 of a rounding boundary,
  change a given rather than print "accept 9.38–9.39".
- **"Easier" is the commonest rejection, not "wrong".** Five of the eight first-round
  rejections were the textbook exercise in the school's clothes (open square box, nested
  similar triangles, a 2×2 matrix with the GC allowed, elevation with every quantity given).
  The slot brief should name the rehearsed version it must NOT be.
- **A plan slot's part marks must be the LEAF marks.** (b)(i)/(ii)/(iii) are three leaves —
  write `[3,2,4,1]`, not `[3,7]`; the gate compares leaves and the author cannot bend it.
- **One figure per question.** The exporter prints one image per slot; a question that needs
  two drawings (a given sketch + blank answer axes; a chart + a box plot) gets ONE composed
  engine construction, side by side when the 100 mm height cap would otherwise shrink it.
  The plotting grid for a linear-law question IS the slot's figure (`figure: true` +
  `figure_position: "answer_space"`).
- **`solver_scope` + `formulae`** are per-school plan fields since this round (see the table
  above); TJC prints the four sum-to-product identities on its AM formulae page.
- **A stem that says "(not drawn to scale)" gets no caption** repeating it under the figure.
- Figure-engine tricks the agents learned are in the figure authors' reports of this run and
  belong in `.claude/skills/gce-paper/prompts/figure-author.md` KNOWN TRICKS: `el.region` /
  `el.pline` take coordinate objects not names; a vertical `el.dim` label needs its own
  `el.label` on a free anchor; nested angle arcs → unlabelled arcs + hand-placed labels;
  `assertAngle` takes the three points as an array; a label anchored outside the geometry is
  relocated by the declutter pass, so anchor captions at world points.

## Content policy

A school's questions are grounding for the author and the moderator and are never
reproduced (`docs/CONTENT-POLICY.md`). The printed paper says it is newly written in the
school's style and is not a past-year paper.

## Schools so far

| Key | Paper | State |
|---|---|---|
| `sngs-s1-eoy` | CHIJ St Nicholas Girls, Sec 1 End-of-Year, 2 h 15 min, 90 marks, 20 questions | first paper written 18 Sep 2026 (20 questions, 90 marks, 7 figures, all slots through blind solve and moderation), with Adrian for his read; files in `~/Desktop/AdrianMath/School Papers/St Nicholas S1 EOY/` |
| `tjc-ip4-am-eoy` | Temasek Junior College (IP), IP4 Additional Mathematics End-of-Year, 2 h 30 min, 100 marks, 14 questions | WRITTEN 20 Sep 2026 — the first upper-secondary paper by the method: 14/14 accepted (3 slots needed a second round: Q3 too close to 2025 Q3, Q6 degenerate endpoint answers, Q9 easier), 6 figures, blind solve 123 min; with Adrian for his read; files in `~/Desktop/AdrianMath/School Papers/TJC IP4 AM EOY/` |
| `tjc-ip4-am-eoy-set2` / `tjc-ip4-em-eoy-set2` | the same two papers, SET 2, one notch harder (Adrian, 20 Sep 2026: "make it more difficult") | WRITTEN 20 Sep 2026 — 14/14 and 16/16 accepted; `avoid_runs` put Set 1 in the corpus and every brief, `difficulty_target: slightly harder`. Twelve of thirty first drafts were rejected as number-changed twins of Set 1 (the slot briefs are Set 1's, so an author following them literally reproduces Set 1) and redirected; one third-round change of solid (AM Q9 box → cylinder). Files in `…/TJC IP4 AM EOY/set2/` and `…/TJC IP4 EM EOY/set2/` |
| `tjc-ip4-em-eoy` | Temasek Junior College (IP), IP4 Intermediate Mathematics (= E Math) End-of-Year, 2 h 30 min, 100 marks, 16 questions | WRITTEN 20 Sep 2026 — 16/16 accepted after repairs (Q5 sketch did not pin n; Q6 + Q8 easier; Q7 re-skin of 2024 Q5; Q14 easier; Q8 needed a THIRD round for a wrong key at a rounding boundary, 9.385 → the given changed to 65 m), 9 figures, blind solve 117 min; with Adrian; files in `~/Desktop/AdrianMath/School Papers/TJC IP4 EM EOY/` |
