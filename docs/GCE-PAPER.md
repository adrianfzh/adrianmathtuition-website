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
"what api? use plan usage"). The script does the deterministic half:

```
node scripts/gce-paper/generate.mjs brief    --key GCE-AM-P1 --seed 1 [--out <dir>]
node scripts/gce-paper/generate.mjs check    --run <run dir> [--slots 1,2]
node scripts/gce-paper/generate.mjs assemble --run <run dir> [--pdf-dir <dir>]
node scripts/gce-paper/manifest.mjs <paper.json> --md
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
`/app/print` uses. Nothing is inserted into the bank — the paper is a file for Adrian
to read first.

Known v1 gaps: no drawn figures (a Plane Geometry question carries a "[Figure to be
drawn: …]" description — the bot's `lib/figures/` registry is the next step); AM only
(`SHAPE.AM`); the run folder lives wherever `--out` points (scratchpad for trials).
