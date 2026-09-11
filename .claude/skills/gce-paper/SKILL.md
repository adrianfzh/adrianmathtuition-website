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

Run slots in **waves of 2–4 agents in parallel** (independent slots; one message,
several `Agent` calls). Paper-level coherence comes from `paper-so-far.md`, which
`check` rewrites after every accepted slot — later waves read the earlier slots.
**E Math Paper 1 has 27 short slots (1–7 marks):** there one author agent writes THREE
consecutive slots (Q1–3, Q4–6, …), one Opus agent blind-solves the same three
`Q<n>.solve.md` files, one moderator judges the three — the files stay per slot, the
gates run per slot, only the spawns are grouped (first done for E Math Set 1, 11 Sep 2026).
E Math P2 (9 long slots) and both A Math papers stay one agent per slot.

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

### 2. Per slot — author → check → blind solve → moderate → repair

**Author** (Fable agent). Prompt: "You are writing slot Q<n> of a new GCE O-Level A Math
paper. Read `$RUN/author-brief.md`, `$RUN/Q<n>.brief.md` and `$RUN/paper-so-far.md`.
Write ONE new question to the brief and save it as `$RUN/Q<n>.json` in exactly the JSON
shape the author brief specifies (stem, parts with `(a)`-style labels, marks, answers,
a full worked `solution`, `needs_figure` + a precise `figure_description` if a figure is
needed, `syllabus_check`, `originality_note`). The exemplars are for register only —
never their numbers, context or structure." Reply expected: the file path + one line.

**Gates** (deterministic):
```bash
node scripts/gce-paper/generate.mjs check --run "$RUN" --slots <n>
```
→ `Q<n>.gates.json` (marks sum, topics ⊂ bank names, solution present, novelty
nearest-neighbour), plus `Q<n>.solve.md` (question only) and `Q<n>.moderate.md`
(question + key + exemplars). A failed gate → straight to repair.

**Blind solve** (Opus agent). Prompt: "Solve every part of the question in
`$RUN/Q<n>.solve.md` as a strong O-Level candidate. Do not look for any other file.
Write `$RUN/Q<n>.blind.json` as `{parts:[{label, answer, working}]}`." It must not
be told the key exists.

**Moderate** (Fable agent). Prompt: "You are the SEAB moderator for `$RUN/Q<n>.moderate.md`
(question, key, style exemplars). Compare the key against the independent solve in
`$RUN/Q<n>.blind.json` part by part; check the mark allocation, the register, the
syllabus scope, and whether any exemplar has been re-skinned. Write
`$RUN/Q<n>.verdict.json`: `{parts:[{label, agree:boolean, note}], style_score:1-5,
reskin_of:null|'<exemplar id>', problems:[…], accept:boolean}`."

**Repair** (Fable agent, only when needed): the author again, with the verdict and the
gates file, rewriting `Q<n>.json`; then re-run check → blind solve → moderate. Three
rounds max — after that, replace the question rather than patch it.

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
