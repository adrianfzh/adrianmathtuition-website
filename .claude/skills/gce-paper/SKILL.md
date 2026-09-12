---
name: gce-paper
description: Write a genuinely NEW exam paper in the SEAB GCE shape (O-Level A Math 4049 and E Math 4052, P1/P2; the GCE-JC blueprint keys exist but the generator's SHAPE table has no JC entry yet) with plan-billed Claude Code agents — author → gates → blind solve → moderate → repair per slot, agent-authored figures, DOCX for Adrian to read, then publish.mjs files it in the question bank as a Print-a-paper "Set N" students can print in the app. Trigger on "gce paper", "new set", "set 2", "seab-style paper", "write a new O-level paper", "generate set 3 paper 2". NOT prelim-paper — prelim-paper ASSEMBLES real past-prelim questions from the bank; this skill WRITES new questions and needs no bank questions at all. Args: key (GCE-AM-P1|GCE-AM-P2|GCE-EM-P1|GCE-EM-P2), seed (integer, default next unused), set (the Set number to publish under, default = seed).
---

# GCE paper — write a new SEAB-style paper and file it as a Set

The whole method Adrian asked for on 8 Sep 2026 ("put your method to generate such
papers so that I can ask other sessions or another claude account to generate them
like what you did"). Everything here is committed in the repo, so any account or
machine can run it; the only per-machine needs are listed under Preconditions.

Deep reference: [`docs/GCE-PAPER.md`](../../../docs/GCE-PAPER.md) (blueprint family,
the gates, the figure files, publishing). Student-facing side:
[`SPEC-PRINT-PAPER.md`](../../../SPEC-PRINT-PAPER.md) §Set papers, `src/lib/print-sets.ts`.

## Red lines

- **Sec syllabus methods** — a worked example, hint or practice solution in an O-Level Set paper never uses sum and product of roots (α + β, αβ), factorials, the dot product, integration by parts or the other routes in `docs/SEC-SYLLABUS-METHODS.md`; a quadratic with a known root is done by SUBSTITUTING the root, then solving. (Adrian, 11 Sep 2026 — a Practice Again example taught α + β = −b/a.)

- **Never call the Anthropic API.** Every model step is an `Agent` tool spawn under the
  plan (Adrian, 8 Sep 2026: "what api? use plan usage"). The scripts are deterministic.
- **Never re-skin a real GCE question.** The novelty gate (word-trigram Jaccard ≤ 0.4
  against every real GCE question of the level) is a floor, not the standard; the
  moderator also rejects a slot that names an exemplar as its template.
- **The blind solver is a different model from the author** (Opus solves what Fable
  wrote) and sees ONLY `Q<n>.solve.md` — never the key.
- **Nothing goes into the bank until Adrian has read the paper** (checkpoint 2 below).
  `assemble` writes files only; `publish.mjs` is a separate, explicit step.
- **Never set `image_watermark_status='clean'`** on a Set row — `figure_url` alone makes
  a figure servable; 'clean' is reserved for the five fitness checks (docs/FIGURES.md).
- Student-facing copy says "app", never "portal"; the printed title is fixed by
  `setPaperTitle` ("A Math · Set 1 · Paper 1 · O-Level format") — do not invent names.

## Preconditions (per machine)

- Website repo checked out (`~/dev/adrianmathtuition-website`), `npm install` done.
- Bot repo checked out beside it (`~/dev/adrianmath-telegram-math-bot`) — the figure
  registry (`lib/figures/`), the drawing engine (`ai/figure-engine.js`) and `sharp`
  live there. `BOT_REPO=<path>` overrides the location for `figure.mjs`.
- Bank reads/writes: `SUPABASE_URL` + `SUPABASE_SECRET_KEY` in `.env.local`, or the bot
  repo's `.env` (`SUPABASE_SERVICE_KEY_MAIN`) — both scripts fall back to it. Never
  print either value.
- DOCX export: `python3` + `pandoc` (the `create-worksheet` skill's `worksheet_lib.py`
  is imported by `export-docx.py`).
- A scratch run directory: `$SCRATCH/gce/runs/<key>-seed<n>` (the session scratchpad).

## Models per spawn (deliberate — never session-inherit)

| step | model | why |
|---|---|---|
| author | **Fable** | register + originality are judgment; this is the moat step |
| blind solve | **Opus** | must differ from the author; solving is mechanical |
| moderate | **Fable** | compares key vs blind solve, scores style 1–5, names re-skins |
| repair | **Fable** | same author with the verdict in hand |
| figure author | **Opus** | mechanical against a written spec doc; verify() catches errors |

Run slots in **waves of agents in parallel** (independent slots; one message, several
`Agent` calls; the harness caps a session at 20 live subagents — count what is still
running before a wave). Paper-level coherence comes from `paper-so-far.md`, which
`check` rewrites after every accepted slot — later waves read the earlier slots.
**E Math Paper 1 has 27 short slots (1–7 marks):** there one author agent writes THREE
consecutive slots (Q1–3, Q4–6, …), one moderator judges the three — the files stay per
slot, the gates run per slot, only those spawns are grouped (first done 11 Sep 2026).
Blind solves and repairs are ONE slot per spawn (the solver must not see a sibling's
key-shaped context; a repair is one question's conversation). E Math P2 (9 long slots)
and both A Math papers stay one agent per slot.

**If the session's usage limit kills agents mid-wave** (it did on 12 Sep 2026): when it
resets, list which `Q<n>.json` / `.blind.json` / `.verdict.json` files are missing or
older than their input and re-spawn ONLY that work — never the whole wave.

## The round

### 0. Pick the key, seed and set

```bash
ls data/gce-generated/                                    # seeds already written
```
Seed = the next unused integer for that key; the Set number defaults to the seed
(Set 1 = seed 1). A Set is TWO papers (P1 + P2) — plan both; each paper publishes
on its own and appears in the app on its own.

### 1. Brief (deterministic)

```bash
node scripts/gce-paper/generate.mjs brief --key GCE-AM-P1 --seed 2 --out "$RUN"
```
Writes `author-brief.md` (SEAB register, 4049 scope, the JSON shape every author must
return), `Q<n>.brief.md` per slot (topic, marks, real GCE questions on that topic as
STYLE anchors only), `paper-so-far.md`, `corpus.json`, `plan.json`. Read `plan.json`'s
slot list once; that is the wave plan.

### 1b. The standard (deterministic) — the 2024/2025 papers in front of every agent

```bash
node scripts/gce-paper/standard.mjs --run "$RUN"          # --years 2024,2025 is the default
```
Writes `standard-questions-P<n>.md` (every real GCE 2024 + 2025 question of that paper
number, from the run's corpus, in Q order) and `standard.md` (the written standard for
the level — E Math: [`reference/em-standard-2024-2025.md`](reference/em-standard-2024-2025.md);
A Math gets a placeholder until one is written). **Why this step exists** — Adrian,
12 Sep 2026, on the 11 Sep E Math paper: "sep 11 set was too easy, must know that the
standard for o levels got higher the recent years, like 2024/2025 are harder compared to
previous years." The exemplars in `Q<n>.brief.md` are weighted by syllabus cut and mark
closeness, not by year, so without this file an author calibrates to the 2019–2022
register. That paper became "Set 0" (unpublished); Set 1 was rewritten from seed 2.
The rule every prompt below carries: **every slot AT the 2024/25 standard for its marks —
not below (the moderator scores it ≤ 3 and `assemble` rejects it), not above (the paper
must stay finishable)** — and any re-skin of a 2024/25 question is `too_close_to`.

### 2. Per slot — author → check → blind solve → moderate → repair

The prompts are TEMPLATES in [`prompts/`](prompts/) (`author.md`, `blind.md`,
`moderate.md`, `repair.md` — E Math 4052 wording; edit the syllabus code and the
brief's name for A Math). Render one with the placeholders filled and paste the file's
contents as the agent prompt:

```bash
zsh .claude/skills/gce-paper/prompts/render.sh author   "$RUN" 1 1,2,3   # → $RUN/prompt-author-Q1-2-3.md
zsh .claude/skills/gce-paper/prompts/render.sh blind    "$RUN" 1 4       # one slot per blind/repair spawn
zsh .claude/skills/gce-paper/prompts/render.sh moderate "$RUN" 1 1,2,3
zsh .claude/skills/gce-paper/prompts/render.sh repair   "$RUN" 1 4
```

**Author** (Fable agent) — `prompts/author.md`: reads `author-brief.md`, `standard.md`,
`standard-questions-P<n>.md`, `paper-so-far.md`, then its `Q<n>.brief.md`s; writes
`Q<n>.json` in the brief's JSON shape. The discipline block (work every part yourself,
difficulty by what the candidate must DECIDE, prefer no figure, "app" never "portal") is
in the template. Reply expected: the file path(s) + one line per slot naming the step
that makes it 2024/25 standard.

**Gates** (deterministic):
```bash
node scripts/gce-paper/generate.mjs check --run "$RUN" --slots <n>
```
→ `Q<n>.gates.json` (marks sum, topics ⊂ bank names, solution present, novelty
nearest-neighbour), plus `Q<n>.solve.md` (question only) and `Q<n>.moderate.md`
(question + key + exemplars). A failed gate → straight to repair.

**Blind solve** (Opus agent) — `prompts/blind.md`: opens ONLY `Q<n>.solve.md` (which
carries its own instructions and the `{"answers": {...}, "solvable": bool, "issues": [...]}`
shape) and writes `Q<n>.blind.json`. It is never told a key exists.

**Moderate** (Fable agent) — `prompts/moderate.md`: reads `Q<n>.moderate.md` (its full
brief: check the key against the blind solve, judge the question), `standard.md`,
`standard-questions-P<n>.md` and `Q<n>.gates.json`; writes `Q<n>.verdict.json` as
`{parts:[{label, agree, note}], all_agree, key_verdict, score:1-5, standard:"at"|"below"|"above",
fixes:[…], too_close_to:null|"<ref>", why}`. `assemble` accepts only
`gates.pass && all_agree && !too_close_to && score >= 4`. Below or above the 2024/25
standard → score ≤ 3 with concrete fixes.

**Repair** (Fable agent, only when needed) — `prompts/repair.md`: the author again with
the gates, blind and verdict files, fixing EVERY named problem or writing a new question
for the slot; then re-run check → blind solve → moderate. Three rounds max — after that,
replace the question rather than patch it (P2 Q6 of E Math Set 1 took all three).
**Score-4 slots with concrete `fixes`:** apply the cheap polish and re-run `check`; a
wording-only polish is not re-blinded or re-moderated. Score 5 → leave it alone. Mark
totals are plan-locked — a moderator's "reweight this part" is a note, not a change.

### 3. Figures — the FIGURE-AUTHOR agent (Opus), one per `needs_figure` slot

This step was hand-done in seed 1 and is the reason the skill exists in this form: the
authoring agent only writes prose (`figure_description`); the DRAWING spec must be
written from it. The docs an agent needs are printed by the script itself:

```bash
node scripts/gce-paper/figure.mjs --families          # every registry family, one line each
node scripts/gce-paper/figure.mjs --doc <family>      # that family's full spec doc
node scripts/gce-paper/figure.mjs --doc engine        # the hand-construction (.cjs) contract
node scripts/gce-paper/figure.mjs --run "$RUN" --slots <n>   # verify + render svg/png
```

Spawn one Opus agent per figure slot with the prompt in
[`prompts/figure-author.md`](prompts/figure-author.md) (paths filled in). It reads the
question JSON, runs `--families`/`--doc`, writes `Q<n>.figure.json` (registry family: one flat
object, `{"family": …, …its fields…}`) or `Q<n>.figure.cjs` (engine construction; examples in
[`examples/`](examples/)), renders, VIEWS the PNG with the Read tool, and iterates up to
six times. `verifyFigure` fails closed — an inconsistent spec draws nothing, so an agent
cannot ship a wrong figure, only report that the description is inconsistent (then
repair the question, never fudge the numbers).

**Checkpoint 1 (session):** open every `Q<n>.figure.png` yourself once. The one thing
verify() cannot catch: a value the candidate is asked to find printed on the figure.

Two print facts the figure step must respect (12 Sep 2026):
- **A construction figure cannot print at true size** (the renderer scales every figure
  to a 300pt-tall / column-wide box), so a construction slot must be self-contained —
  the candidate constructs the whole thing from stated lengths; never "on the diagram
  below, construct …" over a pre-drawn base.
- **A `graph-paper` grid the candidate draws on** prints as large as the renderer's cap
  allows by itself (`generate.mjs figureDataUri` scales its nominal size; `export-docx.py`
  gives it 15 cm) — but keep `minorPerMajor` at 5 for 0.5-unit majors (10 gives
  sub-millimetre minors that vanish in print).

### 4. Assemble + read-through

```bash
node scripts/gce-paper/generate.mjs assemble --run "$RUN" --pdf-dir "$OUT"
node scripts/gce-paper/manifest.mjs "$RUN/<key>-seed<n>.json" --md
python3 scripts/gce-paper/export-docx.py "$RUN/<key>-seed<n>.json" --figures "$RUN" --out "$OUT"
```
`assemble` accepts a slot only when gates pass, blind solve and key agree on every part,
style ≥ 4/5 and no re-skin is named; it renders the paper PDF (answer key on) and the
solutions booklet through the SAME renderers `/app/print` uses. `export-docx.py` writes
`<name>.docx` + `<name>-solutions.docx`.

Before handing over, page through every figure and construction page of the paper PDF
yourself (`pdftotext -layout` per page to build the Q → page map, `pdftoppm -r 110 -f N -l N`
to view one) — the assemble PDF is what the app prints.

**Checkpoint 2 (Adrian):** hand him the DOCX/PDF (in-app file card; Telegram when the
session is headless — CLAUDE.md §File deliverables). He reads the paper. Amend slots he
flags (repair round) and re-assemble. Copy the final JSON to
`data/gce-generated/<key>-seed<n>-<date>.json` (kept untracked unless he says commit).

### 5. Publish as a Set

```bash
node scripts/gce-paper/publish.mjs --paper data/gce-generated/<key>-seed<n>-<date>.json \
     --figures "$RUN" --set <N> --dry      # prints the plan, validates, writes nothing
node scripts/gce-paper/publish.mjs --paper … --figures "$RUN" --set <N>   # for real
```
One bank row per slot (`school='AdrianMath'`, `exam_type='Set <N>'`, `paper='1'|'2'`,
`question_number` = slot, `verified=false`, `ai_generated=true`, figures uploaded to the
public `practice-figures` bucket → `figure_url`). Idempotent on `gen_meta.set_item`: a
re-run updates in place. `--retract` soft-deletes the paper's rows. Do both papers of the
set. The paper appears on `/app/print` → 📚 Set papers for students of that level as soon
as every question of it is in (`lib/print-sets.ts` `groupSetPapers` refuses a gap).

Verify: the health-check's `print-sets` probe must say `N set papers` with none
incomplete:
```bash
curl -s -H "Authorization: Bearer $ADMIN_PASSWORD" https://www.adrianmathtuition.com/api/health-check | grep -o '"print-sets"[^}]*}'
```

## What to tell Adrian at the end

The paper's totals and figure count, where the DOCX is, what the moderator flagged and
how it was repaired, which slots needed more than one round, and — after publishing —
that Set N is live in the app for <level> students. Trade-offs of a Set row (say them
once, when a new set is published): Set rows sit in the same `questions` table, so they
also join topic sheets, mock draws and practice pools for that level; they carry no
embedding, so Find a question does not see them; they stay `verified=false` until he flips
them.
