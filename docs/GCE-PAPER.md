# GCE-format papers — the blueprint family + the new-question generator

Two things live here (both 8–9 Sep 2026, Adrian: "we should actually generate papers
according to the style of seab o level papers").

## 1. The `GCE-*` blueprint family (`data/paper-blueprints.json`)

Six entries — `GCE-AM-P1/P2` (4049), `GCE-EM-P1/P2` (4052), `GCE-JC-P1/P2` (9758) —
derived from the real GCE papers in the bank the same way the prelim entries are:

```
node scripts/derive-paper-blueprints.mjs --gce                              # live bank
node scripts/derive-paper-blueprints.mjs --gce --from-dump data/gce-rows.json   # the committed dump
```

- Base papers = real GCE + SEAB specimen papers of the current syllabus (`GCE_CUT`:
  AM ≥ 2021, EM ≥ 2023, JC all); specimen rows sit under school `GCE Specimen` so a
  specimen and a real paper of the same year never collapse into one.
- Thin-data rules (2–5 base papers): slot mark ranges are the min..max seen at that
  position, pools list every topic seen there, must_appear = topics in ≥ 80 % of base
  papers, and — since 9 Sep — **trimmed until every must can take a distinct slot**
  (bipartite matching over the slot pools; `GCE-EM-P2` lost Mensuration this way, the
  reason `walkTopics` failed 50/50 seeds). `src/lib/paper-blueprints.test.ts` pins all
  twelve entries: totals, slot counts, reachable musts, weights, five seeds each.
- The prelim entries are byte-identical before/after a `--gce` run.

**Site wiring:** `lib/print-paper.ts` `PaperShape = 'prelim' | 'gce'` — the shape rides
the stored mock title (`… · O-Level format`; `portal_generated_papers` has no request
column, so no migration), `blueprintKeyFor(level, paper, shape)`, `paperDuration`,
`shapeLabel`. `/app/print` has a School prelim / O-Level format pill (`?shape=gce`);
`/admin/prelim-builder` a "Paper shape" select; the `prelim-paper` skill a shape arg.
Candidate sourcing for a GCE-shaped mock still draws the bank's prelim questions — the
shape changes the slot walk, not the pool. `paper_drafts` has no shape column.

## 2. The SEAB-style new-question generator (`scripts/gce-paper/`)

Writes a genuinely NEW paper in the GCE shape. **Every model call is a Claude Code
agent under the plan** — the script never touches the Anthropic API (Adrian, 8 Sep:
"what api? use plan usage"). **The end-to-end method — waves, prompts, model per spawn,
checkpoints, publishing — is the committed `gce-paper` skill**
(`.claude/skills/gce-paper/SKILL.md`), so any session or account can run it. The script
does the deterministic half:

```
node scripts/gce-paper/generate.mjs brief    --key GCE-AM-P1 --seed 1 [--out <dir>]
node scripts/gce-paper/generate.mjs check    --run <run dir> [--slots 1,2]
node scripts/gce-paper/figure.mjs   --run <run dir> [--slots 7,9] [--density 288]
node scripts/gce-paper/generate.mjs assemble --run <run dir> [--pdf-dir <dir>]
node scripts/gce-paper/manifest.mjs <paper.json> --md
python3 scripts/gce-paper/export-docx.py <paper.json> --figures <run dir> --out <dir>
```

`brief` walks the blueprint (the prelim builder's own `walkTopics`/`targetMarks`, seeded)
and writes a run folder: `author-brief.md` (the SEAB register + 4049 scope + JSON
shape), `Q<n>.brief.md` per slot (topic, marks, real GCE questions on the topic as
STYLE anchors only), `paper-so-far.md`, `corpus.json` (every real GCE question of the
level, for the novelty gate), `plan.json`.

The round per slot, orchestrated by the session with the Agent tool. **Since 23 Sep 2026
the author, blind solver, repair author and figure author are Opus (`model: "opus"`) and
the moderator is Fable (`model: "fable"`)** (Adrian: "use the trial split, but change
solves blind to opus 5.5"). The skill names the aliases, not versions (Adrian, 24 Sep
2026: "it will all default to the latest version right?"): Claude Code points each at the
newest model of its family — on 24 Sep 2026 `claude-opus-5-5` and `claude-fable-5-1`. Until then Fable 5.1 wrote, moderated and repaired and
Opus 5 solved blind, which is how both Set 1s were made; A Math Set 2 and E Math Set 2
were written the same day with every agent on Opus 5.5, moderator included. The blind
solver is a fresh agent that never sees the key, so its independence from the author is
context isolation; the moderator is a different model, and it and Adrian's read are the
backstop for a blind spot the author and solver share.

| step | who | reads | writes |
|---|---|---|---|
| author | **Opus** agent (`model: "opus"`) | `author-brief.md`, `Q<n>.brief.md`, `paper-so-far.md` | `Q<n>.json` |
| gates | `check` | `Q<n>.json` | `Q<n>.gates.json`, `Q<n>.solve.md`, `Q<n>.moderate.md` |
| blind solve | a **fresh Opus** agent (no key, no author context) | ONLY `Q<n>.solve.md` (no key) | `Q<n>.blind.json` |
| moderate | **Fable** agent (`model: "fable"`) | `Q<n>.moderate.md` (question + key + exemplars), `Q<n>.blind.json` | `Q<n>.verdict.json` |
| repair | Opus agent with the verdict | | `Q<n>.json` again → re-check → re-solve → re-moderate |

Gates in `check`: marks sum = slot target, topics ⊂ bank names, worked solution present,
word-trigram Jaccard vs every real GCE question of the level ≤ 0.4 (nearest recorded).
`assemble` accepts a slot only when the gates pass, the blind solver and the key agree
on every part, the style score is ≥ 4/5 and no exemplar is named as re-skinned; then it
renders the paper (answer key on) and a solutions booklet through the SAME renderers
`/app/print` uses. `assemble` inserts nothing — the paper is a file for Adrian to read
first; filing it in the bank is the separate, explicit `publish.mjs` step below.

**Off the Mac (23 Sep 2026).** Everything but the bank reads runs on Linux with no path
edits (a cloud session writing A Math Set 2 had to patch each by hand); the Mac defaults
are unchanged and come first unless an env var overrides them:
- `assemble`'s Chrome (`src/lib/generate-pdf.ts` `localChromePath`): `CHROME_PATH` /
  `PUPPETEER_EXECUTABLE_PATH` → the Mac's Google Chrome → the newest
  `$PLAYWRIGHT_BROWSERS_PATH/chromium-*/chrome-linux{,64}/chrome` (default `/opt/pw-browsers`,
  where the cloud containers keep one).
- `lo-pdf.sh`: `SOFFICE` → the Mac app → `soffice` / `libreoffice` on PATH. Ubuntu:
  `libreoffice-writer`, `libreoffice-math` and `libreoffice-script-provider-python` (the macro).
  Ubuntu 24.04's LibreOffice 24.2 aborts on a macro named on the command line, so when the
  macro does not run the script converts plainly with the formula size set in a fresh profile
  (`Office.Math/StandardFormat/BaseSize`) — the same pages; `LOPDF_VIA=convert` forces it.
- `figure.mjs`: `BOT_REPO` → the Mac checkout → the bot cloned beside this repo as
  `adrianmath-telegram-bot` (the GitHub name) or `adrianmath-telegram-math-bot`, with
  `npm install` done there (sharp).
- `.claude/skills/gce-paper/prompts/render.sh` is POSIX `sh` (was zsh-only); run it with `sh`.
- The bank read (`brief` needs `SUPABASE_SECRET_KEY`; `publish.mjs` writes the bank) stays
  Mac-only by design (`docs/CLOUD.md`) — hand a cloud session a `brief` run dir.

### Figures (9 Sep 2026)

A slot with `needs_figure` gets ONE of two files in the run dir, written from the
question's `figure_description` by a **figure-author agent** (Opus; prompt in
`.claude/skills/gce-paper/prompts/figure-author.md`) — seed 1's were hand-written by the
session, which is what made a fresh seed need a human step. The agent works from the
script's own docs: `figure.mjs --families` (every registry family), `--doc <family>`
(that family's SPEC_DOC) and `--doc engine` (the construction contract + the examples
under `.claude/skills/gce-paper/examples/`), renders, views the PNG and iterates. The
maths is re-derived by the drawing code and fails closed, so the agent cannot ship an
inconsistent figure — only report one:

- `Q<n>.figure.json` — a typed spec for the bot's `lib/figures/` registry
  (`{ family, spec }`; e.g. `coordinate-plane` with `points`/`shapes`, `trig-3d`,
  `function-graph`). `verifyFigure` refuses an inconsistent spec, so a wrong figure is
  never drawn.
- `Q<n>.figure.cjs` — a construction for the bot's `ai/figure-engine` (`Construction`
  + `el`) for shapes outside the registry (the P1 circle-geometry figure, the P2 cone
  with an inscribed sphere).

`figure.mjs` renders both to `Q<n>.figure.svg` + `Q<n>.figure.png` (sharp from the bot's
node_modules; `BOT_REPO` overrides the repo path). Engine SVGs carry only a `viewBox`, so
it gives them `width`/`height` (600 px wide) — without that Chromium printed them as
thumbnails in the PDF. `assemble` embeds the SVG as a data URI in `figure` and the
renderer's `.pp-figure` caps it at 300 pt tall.

### Word export

`export-docx.py` turns the assembled JSON into `<name>.docx` (front page, formulae,
questions with writing space) and `<name>-solutions.docx` (each question with its boxed
working, then an answer key) through the create-worksheet skill's `worksheet_lib.py`
(pandoc → native Word equations). A part that carries subparts prints no bracket of its
own, matching the GCE layout; figures come from `Q<n>.figure.png` in `--figures`.
`solution_box` sets `w:tblGrid` widths as well as `w:tcW` since 9 Sep 2026 — LibreOffice
(and the soffice PDF preview) split the columns 50/50 otherwise and clipped display math.

**PDF of the Word file (21 Sep 2026).** Use `scripts/gce-paper/lo-pdf.sh <file.docx> [pt]`,
never a plain `soffice --convert-to pdf`. Two faults made the maths bigger than the text:
the exporter wrote no size on maths runs (fixed by `size_math()` in `export-docx.py`), and
LibreOffice ignores that size and draws imported formulas at 12 pt (fixed by the macro
`lopdf.py`, which sets `BaseFontHeight` on every embedded formula before exporting).
LibreOffice's bundled python is killed by macOS (exit 137), so the macro runs in-process
through a `vnd.sun.star.script` URL. Set PDFs made before this date carry the fault until
remade. The app's own PDFs (Puppeteer + KaTeX) are not affected.

**The maths looks odd outside Word (24 Sep 2026, Adrian: "the mathematical notation font
seems weird?").** Word draws the maths in Cambria Math. LibreOffice, and file previews built
on it (the Claude app's Word preview looks like one), redraws every formula with its own
engine. Without Cambria Math (Linux, a cloud container) it falls back to FreeSerif, and it
pads brackets and splits a number from a letter ("p ( x )", "6 k") whatever the file says.
One part of that WAS the file's: pandoc writes every letter as its own maths run, and
LibreOffice gaps between runs ("F B = 2", "angle F E B"). `join_math_runs()` in
`export-docx.py` joins neighbouring runs with identical formatting (Word draws the file the
same). The rest is LibreOffice's. Read a paper in Word or in the app-style PDF from
`assemble`, and make `lo-pdf.sh` PDFs on the Mac, where LibreOffice finds Cambria Math.

**Grids print to scale (24 Sep 2026, Adrian: "is the graph to scale?").** A graph-paper
grid the candidate draws on prints with one major square = 1 cm (small squares 2 mm) in
all three outputs. Before this, the assemble PDF squeezed a 16-square grid into the
question's text column (0.84 cm squares), the app printed every figure at 72% of the text
width (about 0.7 cm), and Word capped it at the 16 cm text width. Now:
- `figure.mjs` trims a blank grid (`axes: false`) to the grid plus a hairline border;
  a numbered grid keeps its label margins.
- `render-paper-pdf.ts` works out a grid's column for the PRINTED page (166 mm); its
  sizing pass runs on the 800 px screen layout. A grid wider than its column moves left
  into the number gutter.
- `export-docx.py` measures the grid on the PNG and centres it over the margins when it is
  a hair wider than 16 cm.
- `publish.mjs` stores `gen_meta.figure.print_width_mm`, measured the same way on the PNG it
  uploads (`figure-size.mjs`: the grid's outer lines, over the spec's column count). The
  app's print route reads it and prints the figure at that width
  (`lib/print-paper.ts figureWidthMm`, `lib/render-prelim.ts`).

A Set published before this has no stored width and prints its grid as before until it is
re-published from the Mac. Any Set with a grid needs that: E Math Set 1 P2 Q3, if it is live.

### Publishing a Set (9 Sep 2026)

```
node scripts/gce-paper/publish.mjs --paper <assembled json> --figures <run dir> --set <n> [--dry] [--retract]
```

Files the paper in the bank as the Print-a-paper **Set** preset
(SPEC-PRINT-PAPER.md §Set papers, `lib/print-sets.ts`): one `questions` row per slot —
`school='AdrianMath'`, `exam_type='Set <n>'`, `paper='1'|'2'`, `question_number` = slot,
`level` = the blueprint family (AM/EM/JC), `year` = generation year, `difficulty
'Standard'`, `verified=false` (Adrian flips it), `ai_generated=true`,
`solution_source` = `'opus_session'` or `'fable_session'` by the author the paper JSON
records (`models.author`, written into `plan.json` by `brief` since 23 Sep 2026; both Set
1s say Fable), parts with bank-style bare labels (`a`, `i`), and
`gen_meta {kind:'gce-set', set_key, set_item, seed, gates, blind_agree, figure, …}`.
Figures: `Q<n>.figure.png` → the public `practice-figures` bucket at
`gce-sets/<key>-set<n>/Q<n>.png` → `figure_url` + `has_image` (`image_watermark_status`
stays NULL — `figureServable` accepts `figure_url` on its own). Idempotent on
`gen_meta.set_item`: a re-run updates in place and revives a retracted row; `--retract`
soft-deletes the paper's rows. Before any write it checks slots 1..n are contiguous, marks
sum to the paper total and a PNG exists for every `needs_figure` slot; `--dry` prints the
plan and stops (no env needed). Students of the level see "Set n · Paper 1/2" on
`/app/print` the moment every question of that paper is in; the health-check `print-sets`
probe alarms on an incomplete set.

First set: `GCE-AM-P1-seed1` (13 Q, figures on Q7/Q9/Q10/Q13) + `GCE-AM-P2-seed1`
(10 Q, figures on Q6/Q10), written 8 Sep 2026, JSON in `data/gce-generated/` (committed),
**published as A Math Set 1 on 9 Sep 2026** (23 rows).

E Math (4052), seed 1 — **"Set 0", rejected, never published.** `GCE-EM-P1-seed1` (27 Q)
+ `GCE-EM-P2-seed1` (9 Q), written 11 Sep 2026 with the grouped P1 spawns; on 12 Sep
Adrian read it and said "sep 11 set was too easy, must know that the standard for o levels
got higher the recent years, like 2024/2025 are harder compared to previous years." Its
files stay on the MacBook Pro. `check` appends the `figure_description` to
`Q<n>.solve.md` / `.moderate.md` for a figure slot since that round (the P1 Q25 box plot
was unsolvable blind without it).

E Math Set 1 = **seed 2**, written 12 Sep 2026 at the 2024/25 standard: `GCE-EM-P1-seed2`
(27 Q, 90 marks, figures on Q9/Q18/Q20/Q22/Q26, a self-contained construction at Q7) +
`GCE-EM-P2-seed2` (9 Q, 90 marks, figures on Q3 graph paper/Q5/Q8). What changed in the
method: `standard.mjs` writes `standard.md` (the written 2024/25 standard, now
`.claude/skills/gce-paper/reference/em-standard-2024-2025.md`) and
`standard-questions-P<n>.md` (all 54 P1 / 18 P2 real 2024+2025 questions) into the run,
the four per-slot prompts became templates under the skill's `prompts/` and every one of
them carries the standard; the moderator's verdict gained `standard: at|below|above` (plus `routine` for A Math since 17 Sep 2026)
and scores a below- or above-standard slot ≤ 3 so `assemble` rejects it. 24 of 36 slots
took at least one repair round (P1 Q3 Q4 Q7 Q8 Q10–13 Q15 Q16 Q18 Q20–22 Q25; every P2
slot, P2 Q6 three rounds); 30 accepted at 5/5, six at 4/5 after a polish. JSON in
`data/gce-generated/GCE-EM-P{1,2}-seed2-2026-09-12.json` (committed); handed to Adrian
12 Sep 2026, **published as E Math Set 1 on 16 Sep 2026** (27 + 9 rows) after his
read-through. What his read-through changed in the method (16 Sep 2026): figures print
at 100 mm wide (120 mm when wide, height ≤ 100 mm) instead of the old ~60 mm; a
`graph-paper` figure prints at exactly 1 cm per major square, uncapped in height, and is
placed AFTER the part that says "On the grid …" with no blank working space under it
(the grid is the space); `<run>/figure-sizes.json = {"26": 105}` sets one figure's
printed width in mm when he asks for bigger/smaller; `assemble --set N` prints the same
title the app shows (`setPaperTitle`: "E Math · Set 1 · Paper 1 · O-Level format") on
the draft PDF/DOCX and the answer key at the end is black. The durable copy of every
output + figure spec is `~/Desktop/AdrianMath/GCE Sets/E Math Set 1/` (the scratchpad
is wiped on reboot).

**Sets must differ from each other — the variety rule (17 Sep 2026).** Adrian: "the
papers generated say set 1, set 2, set 3, .. should not be (too) similar to each other.
should aim to test a wide variety of skills". Until then a new Set was only compared
with the REAL GCE papers, so Set 2 could quietly re-ask Set 1. What the method does now:

- `generate.mjs brief` reads every question our own Sets of the level have asked — the
  bank's `school='AdrianMath'`, `exam_type='Set n'` rows (both papers), plus any assembled
  paper JSON in `data/gce-generated/` not in the bank yet, plus the `--companion` paper;
  the paper being rewritten is left out (`--set N`), its sister paper is kept. It writes
  `earlier-sets.md` (the rule, "already tested by topic", every question in full) and
  `earlier-sets.json`, and each `Q<n>.brief.md` gains "OUR OWN EARLIER SETS ON THIS
  TOPIC — test a different skill". `plan.json` carries `variety: true` and
  `earlier_sets`; the prompt version is `gce-author-v2`.
- The author's JSON gains `skills` — 1–3 specific phrases naming what the question
  tests. `paper-so-far.md` lists them per accepted slot, `publish.mjs` stores them as
  `gen_meta.skills`, and the next Set's `earlier-sets.md` shows them per topic. Rows
  published before 17 Sep 2026 (A Math Set 1, E Math Set 1) carry none; their opening
  words and full text are shown instead.
- `check` fails a slot with no `skills`, and runs the trigram-Jaccard comparison a second
  time against the earlier-Set questions at the same 0.4 ceiling
  (`gates.novelty.nearest_set` / `jaccard_set`). `Q<n>.moderate.md` gains the earlier-Set
  questions on the slot's topic(s) and the three nearest in wording.
- The moderator has a third job, VARIETY: the same topic is expected, the same skill
  asked the same way is not. A repeat is named in `repeats_set` and `assemble` rejects
  the slot (`gates.pass && all_agree && !too_close_to && !repeats_set && as_good_as_set1 !== false && score >= 4`).
- `manifest.mjs` prints each slot's skills and its nearest earlier-Set question — read
  the skills column once for clustering before handing the paper over.
- A run dir briefed before 17 Sep 2026 has no `variety` flag and is checked as it was
  written. Variety never buys a lower standard or a step outside the syllabus.

**Set 1 is the quality benchmark (17 Sep 2026).** Adrian, the same day: "just make sure
the standard is as good as set 1 for am and em". Set 1 of each level is the paper he read
and approved, so it is shown to every author and moderator for two reasons: what not to
repeat, and the quality to reach.
- `earlier-sets.md` carries a QUALITY BENCHMARK section and ALWAYS prints Set 1 in full
  (the full-text list is otherwise the newest three Sets) — `BENCHMARK_SET` in
  `generate.mjs`.
- The author puts the new question beside the Set 1 question(s) of similar marks before
  saving: as demanding for the marks, numbers as clean, a context that carries real
  information, parts that build, SEAB's wording.
- The moderator's fourth job is AS GOOD AS SET 1: thinner, more scaffolded, more contrived
  (a strained context chosen only to be different) or less clean → score ≤ 3,
  `as_good_as_set1: false`, and `assemble` rejects the slot.
- Both written standards were checked against the approved Set 1 papers on 17 Sep 2026
  (a moderator-style read of every Set 1 question under each document's own test); the
  result is recorded at the foot of each reference file (§7). The level was right and
  the wording was too literal: read word for word, the E Math document called 3 of 36
  Set 1 questions above standard and the A Math one called 5 of 23 below and 1 above. Both were reworded until every Set 1
  question is at standard (A Math: at standard, or a ROUTINE slot inside an allowance of
  three questions and 26 marks a paper — Set 1's own level, inside the real papers'
  14–27).

**The whole paper is the session's check (17 Sep 2026).** The same read found that Set 1
is good question by question but is not the 2024/25 paper SHAPE. E Math Set 1 P1 is a
little harder than the real P1, has almost no explain / show-that marks and the Set has
no geometric proof. A Math Set 1 is more guided than the real papers: 68 answer spaces
against 51 and 46, no part above 5 marks, one unparted question against eight and
seven, 22 printed show/prove targets against 9–12, no linear law, no exponential model.
No slot's author or moderator can see any of that, so:
- each standard separates the per-question items from the whole-paper items (E Math §4
  item 13, A Math §4 List B). A slot is never rejected for a whole-paper item.
- before wave 1 the session writes `$RUN/paper-shape.md` — which slots stay unparted,
  which carries the 6–7-mark answer, which may be routine, which closes the paper. The
  author and repair prompts read it; it overrides the advisory part count of a slot
  brief (no gate counts parts).
- the moderator's verdict gained `standard: "routine"` (A Math only, scored 4) and
  "re-mark" fixes when the marks do not match the work. `assemble` does not read
  `standard`, so neither changes acceptance.
- `assemble` prints a `paper shape` line and writes `paper-shape-report.json` (answer
  spaces, unparted questions, answers of 6+ and of ≤2 marks, show/prove targets, explain
  answers, routine slots and their marks). On Set 1 it reproduces the numbers above
  (A Math 36 + 32 answer spaces, 12 + 10 targets). A miss is repaired at assembly or by
  re-briefing one slot.
- **Open with Adrian:** whether later A Math Sets should move toward the real paper's
  shape (written in, at the near edge of the real range) or keep Set 1's more guided
  shape. To keep Set 1's shape, relax A Math items 3b, 6 and 13 and nothing else.

**A Math has a written standard too (17 Sep 2026).**
`.claude/skills/gce-paper/reference/am-standard-2024-2025.md` — all 48 questions of the
2024 + 2025 4049 papers read against the 137 of 2019–2023 (2019–2020 are the older 4047
syllabus). `standard.mjs` copies it into an A Math run as `standard.md`, as it does the
E Math one. The four prompt templates serve both levels: `render.sh` reads the run's
`plan.json` key and fills in the subject and syllabus code.

**A Math Set 2 = seed 2 (23 Sep 2026)** — the first Set written with every agent on Opus 5.5,
and the first written in a cloud session. Adrian's brief: "Create a set of papers that tests
different aspects of the concepts from set 1. Still benchmark difficulty against how 2024
and 2025 is set. Similar but test different aspects. Do not produce a 'similar' paper, where
questions in essence did not change." `GCE-AM-P1-seed2` (13 Q, 90 marks, figure Q11) +
`GCE-AM-P2-seed2` (10 Q, 90 marks, figures Q2 graph paper / Q7 / Q10). The random topic draw
gave P2 four of P1's topics and none of linear law, an exponential model, binomial or
kinematics, which every real 4049 year carries; the session re-pointed P2 Q1/Q2/Q6/Q8 to
those four in `plan.json` and each brief says so. Repairs: P1 Q6 Q7 Q8 Q12 Q13 and P2 Q3 Q7
Q9 Q10; P1 Q5, P1 Q6 and P2 Q8 accepted at 5/5, the rest at 4/5 after a polish; where a
polish changed a question's wording (P2 Q2 Q3 Q6), a fresh blind solve re-agreed. Shape by
`assemble`: P1 26 answer spaces, 3 unparted, 3 answers of 6–7 marks, 6 show/prove; P2 26
spaces, 2 unparted, 3 of 6–7 marks, 8 show/prove (two of them wording, not a printed result).
**Second read by Fable 5.1, the same evening** (`data/gce-generated/fable-review-2026-09-23/REVIEW.md`):
"on a par with Set 1", every answer right; its one change is P2 Q5 — the log-differentiation
tangent question became y = sin x/(2 + cos x), greatest and least gradient [3, 4] (Opus 5.5
author, Fable blind + moderator, 4/5), so log differentiation is left in P1 Q2 only — and the
P1 Q12(c) note was re-moderated (5/5). P2 is now 27 spaces, 1 unparted, 2 answers of 6–7 marks.
Left open for Adrian: the new Q5's second route (the gradient rises with cos x) is the same
"extremes over the range of a trig quantity" move as P2 Q4; the moderator's alternative
(the set of x on which the gradient increases) would repeat P1 Q12(c)'s skill instead.
**24 Sep 2026, Adrian: "restore Q5".** P2 Q5 is the original tangent question again (the
swap left P2 with one unparted question against the standard's two, and overlapped Q4);
the replacement stays in `fable-review-2026-09-23/P2-Q5/`. The same day P1 Q8 (garden and
lawn) and Q9 (screen on a wall) gained diagrams at his request ("there are no diagrams for
Q9 and Q8?") — they had been word-only while Set 1 P1 carried four figures. Both are drawn
in neither answer's proportions, so the Q8 drawing does not show which lawn fits and the
Q9 drawing is not at x = 4. P1 now has three figures (Q8, Q9, Q11). `export-docx.py` also
learnt to print an unparted question's figure BEFORE its writing space (Q8's had landed
under the space, chained to Q9's stem) and to keep a stem with its first part.
**Also 24 Sep, Adrian: "is max/min gradient tested twice?"** Set 2 carried calculus
optimisation three times (P1 Q9, P2 Q8(b), P2 Q10(b)(c)) against about one a year in the
real papers, so P2 Q10(b)(c) were rewritten without it: (b) [3] the k for which the two
shaded regions have equal areas, k = (eᵇ − 1)/b; (c) [4] whether that k exists for every
b > 0 (yes: b < eᵇ − 1 < b·eᵇ puts it strictly between 1 and eᵇ). Opus author, fresh Opus
blind solve (agrees), Fable moderator 4/5 at standard; its one wording fix applied. The
old ending is in the run's `replaced/Q10-least-S.*`.
The paper JSONs are in `data/gce-generated/`, and the figure specs and PNGs are in
`data/gce-generated/figures/<key>-seed2/`, which is the `--figures` directory for
`publish.mjs`. **Not published yet:** it waits for Adrian's read, and then needs the service
key (the Mac).

**E Math Set 2 = seed 3, `--set 2` (23 Sep 2026)** — the same brief, the same Opus 5.5
agents, written straight after A Math Set 2. `GCE-EM-P1-seed3` (27 Q, 90 marks, figures
Q13 / Q23 / Q27) + `GCE-EM-P2-seed3` (9 Q, 90 marks, figures Q4 graph paper / Q5 / Q8).
The draw gave P1 two Angles slots, HCF/LCM beside prime factorisation and six marks of Sets,
so the session re-pointed P1 Q15 (inequality), Q17 (Sets, 2 marks), Q19 (speed-time graph)
and Q23 (the Set's congruence/similarity PROOF); P2's draw came out almost slot for slot
Set 1 P2's, so every P2 line in `paper-shape.md` names what Set 1 and this Set's P1 already
did, and Q3 (trigonometry, bearings) and Q7 (statistics with one probability part) were
re-pointed. P1 repairs: Q8 Q9 Q10 Q22 Q27; P1 Q3 Q18 Q19 Q20 and P2 Q4 Q8 at 5/5, the rest
at 4/5 after a polish; every polish that changed an answer or a decision was re-solved blind
and agreed (P1 Q10 Q12 Q17 Q21 Q24, P2 Q1 Q6 Q7). Shape by `assemble`: P1 39 answer spaces,
16 unparted, largest part 4; P2 32 answer spaces, exactly three parts of 5+ (Q2(a) 5, Q8(b) 5,
Q9(b) 7). P1 Q13's figure leaves the radius OC undrawn so the 35° mark can only be read as
angle ACB; P1 Q23 says "not drawn to scale" and is drawn off its answer proportions.
Figures in `data/gce-generated/figures/GCE-EM-P{1,2}-seed3/`. **Not published yet** (as
A Math Set 2).

**The Word export, fixed the same day.** `export-docx.py` turned a markdown pipe table into a
Word table but left a LaTeX `\begin{array}` line as maths — a matrix with no rules, whose
empty cells and `\hline` LibreOffice drew as red ¿ (E Math Set 1 and Set 2 both store tables
that way). A line that is one array now becomes a real table (`array_rows`, the revision
builders' 18 Sep fix), every line of a part or stem is kept with the next so a part and its
table never break across a page, and `worksheet_lib.data_table` keeps its rows together.
`lopdf.py` (the preview PDF) gives LibreOffice an empty operand for a formula that opens or
closes on a relation ("Total amount = P(…)", "… 2 h 1 min = 9.59 a.m.") — Word never needed
it; the previews of both A Math and E Math Set 2 papers now carry no ¿ (a few |x| bars remain
in the solutions previews, a LibreOffice drawing quirk only).

How a cloud session ran it: the bank has no read path without the secret key, so the AM GCE
+ Set rows were pulled once through a temporary SECURITY DEFINER function gated by a one-time
code, which was dropped straight after, and served to `generate.mjs` from a local shim.
`render.sh` needs zsh (a bash copy was used), and the DOCX/PDF steps needed `pandoc`,
`poppler-utils` and LibreOffice writer + math + the python script provider installed.

The agent step was validated blind on 9 Sep 2026: an Opus agent given only P1 Q13's
`figure_description` and the `--families`/`--doc` output chose `function-graph`, wrote a
spec whose region area verify() re-derived to the answer, and matched the hand-written
figure in two render iterations; the tricks it had to discover (tick suppression, solid
tangent, unlabelled answer-curve) are now in the prompt, and the author brief asks for
the axis window and the labelling in every `figure_description`.

Print sizing (12 Sep 2026): `render-paper-pdf` sizes every `<img>` at naturalWidth × 96/200
CSS px, column-wide at most and 300pt tall at most, so an SVG data-URI figure of nominal
width 640 prints ≈ 8 cm wide; `figureDataUri` scales a `graph-paper` figure's nominal
size to the cap (the candidate draws on it) and `export-docx.py` gives it 15 cm. A
construction figure therefore cannot print at true size — construction slots are
self-contained. Unverified: whether `max-height` + the explicit width distorts a
near-square PNG on `/app/print` (the published path) — check a printed Set paper.

Known gaps: no JC shape yet (`SHAPE` has AM + EM — the EM entry, its 4052 register and the 4052 formula sheet in `export-docx.py` landed with E Math Set 1, 11 Sep 2026); the run folder lives wherever `--out` points (scratchpad
for trials); `function-graph` has no `ticks:false` (the step trick stands in for it).
