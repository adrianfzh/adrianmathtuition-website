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

The round per slot, orchestrated by the session with the Agent tool:

| step | who | reads | writes |
|---|---|---|---|
| author | **Fable** agent | `author-brief.md`, `Q<n>.brief.md`, `paper-so-far.md` | `Q<n>.json` |
| gates | `check` | `Q<n>.json` | `Q<n>.gates.json`, `Q<n>.solve.md`, `Q<n>.moderate.md` |
| blind solve | **Opus** agent (a different model from the author, on purpose) | ONLY `Q<n>.solve.md` (no key) | `Q<n>.blind.json` |
| moderate | **Fable** agent | `Q<n>.moderate.md` (question + key + exemplars), `Q<n>.blind.json` | `Q<n>.verdict.json` |
| repair | Fable agent with the verdict | | `Q<n>.json` again → re-check → re-solve → re-moderate |

Gates in `check`: marks sum = slot target, topics ⊂ bank names, worked solution present,
word-trigram Jaccard vs every real GCE question of the level ≤ 0.4 (nearest recorded).
`assemble` accepts a slot only when the gates pass, the blind solver and the key agree
on every part, the style score is ≥ 4/5 and no exemplar is named as re-skinned; then it
renders the paper (answer key on) and a solutions booklet through the SAME renderers
`/app/print` uses. `assemble` inserts nothing — the paper is a file for Adrian to read
first; filing it in the bank is the separate, explicit `publish.mjs` step below.

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

### Publishing a Set (9 Sep 2026)

```
node scripts/gce-paper/publish.mjs --paper <assembled json> --figures <run dir> --set <n> [--dry] [--retract]
```

Files the paper in the bank as the Print-a-paper **Set** preset
(SPEC-PRINT-PAPER.md §Set papers, `lib/print-sets.ts`): one `questions` row per slot —
`school='AdrianMath'`, `exam_type='Set <n>'`, `paper='1'|'2'`, `question_number` = slot,
`level` = the blueprint family (AM/EM/JC), `year` = generation year, `difficulty
'Standard'`, `verified=false` (Adrian flips it), `ai_generated=true`,
`solution_source='fable_session'`, parts with bank-style bare labels (`a`, `i`), and
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
(10 Q, figures on Q6/Q10), written 8 Sep 2026, JSON in `data/gce-generated/` (untracked),
**published as A Math Set 1 on 9 Sep 2026** (23 rows).

Second set: `GCE-EM-P1-seed1` (27 Q, figures on Q2/Q7/Q9/Q15/Q23/Q25/Q26) +
`GCE-EM-P2-seed1` (9 Q, figures on Q3/Q4/Q5/Q6/Q8), the first E Math (4052) set, written
11 Sep 2026 with the grouped P1 spawns (three slots per author/solver/moderator agent);
14 of 36 slots took a repair round, three took two (P1 Q7 constructions, P1 Q21 named
a re-skin of 2017 P1 Q19, P2 Q7 named a re-skin of 2024 P2 Q7). JSON in
`data/gce-generated/` (untracked); **awaiting Adrian's read-through before `publish.mjs`**.
`check` now appends the `figure_description` to `Q<n>.solve.md` / `.moderate.md` for a
figure slot — the P1 Q25 box plot was unsolvable blind without it.

The agent step was validated blind on 9 Sep 2026: an Opus agent given only P1 Q13's
`figure_description` and the `--families`/`--doc` output chose `function-graph`, wrote a
spec whose region area verify() re-derived to the answer, and matched the hand-written
figure in two render iterations; the tricks it had to discover (tick suppression, solid
tangent, unlabelled answer-curve) are now in the prompt, and the author brief asks for
the axis window and the labelling in every `figure_description`.

Known gaps: no JC shape yet (`SHAPE` has AM + EM — the EM entry, its 4052 register and the 4052 formula sheet in `export-docx.py` landed with E Math Set 1, 11 Sep 2026); the run folder lives wherever `--out` points (scratchpad
for trials); `function-graph` has no `ticks:false` (the step trick stands in for it).
