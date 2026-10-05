---
name: cloud-twins
description: Write twins (our own questions, maths or science) from a claude.ai CLOUD session with NO database key — through the AGENT_TOKEN_TWINS doors (/api/agent/twins/*). The session authors (Opus) → the server's automatic gates → blind solve (a fresh agent that sees only the question) → checker (Opus) → submit; the server re-checks everything and files the twin. Use when Adrian says "write 30 science twins", "write 40 Sec 2 twins", "twins for A Math", "cloud twins". On the Mac with the keys, the local twin-question skill / sci-twin.mjs do the same job.
---

# Cloud twins — the playbook

Adrian, 5 Oct 2026: cloud sessions may write twins, maths and science, **without the database
master key ever reaching the cloud**. Everything goes through four doors on the website with
`AGENT_TOKEN_TWINS` (docs/CLOUD.md §Cloud twins). The server re-runs every deterministic gate
itself, so a mistake here is refused, not filed. What a twin IS: `SPEC-TWINS.md` §1–4 (maths)
and §11 (science) — read them once before the first batch.

## 0. Before anything

```bash
test -n "$AGENT_TOKEN_TWINS" && echo token set || echo "AGENT_TOKEN_TWINS missing"
node scripts/twins/cloud-door.mjs figure | head -3     # proves the door answers (needs www.adrianmathtuition.com on the allowlist)
```
No token → stop and tell Adrian: "add AGENT_TOKEN_TWINS to this cloud environment" (never ask
for the value in chat). Never print the token.

Work in a run folder OUTSIDE the repo checkout, e.g. `~/twins/<date>/` — never commit run dirs.

## 1. Read Adrian's ask → a plan

| He says | You run |
|---|---|
| "write 30 science twins" | `queue --bank science --n 10` three times (3 twins per sub-skill, open practice topics first, fewest twins first — the server picks; each item names its pool, sub-skill and level) |
| "write 40 Sec 2 twins" | `queue --bank maths --level S2 --n 10` four times |
| "20 A Math twins" / "E Math" / "JC" | `--level AM` (draws AM + S3_AM) / `EM` / `JC1`·`JC2` |
| "twins for the stuck topics" | `queue --bank maths --level EM --focus-only` (and AM) |
| "only physics" | `queue --bank science --pool PHY` (or `CS_PHY` for Combined) |

Batches of ≤10 per queue call. Take the next batch only when the last one is done, so two
sessions never twin the same seed (the server refuses a seed that already has a live twin, and
a sub-skill that is already full — 409: just take the next seed).

## 2. One seed, end to end

```bash
D=~/twins/2026-10-05
node scripts/twins/cloud-door.mjs queue --bank maths --level S2 --n 10 --out $D
#   → $D/<seed>/author-brief.md + packet.json, one folder per seed
```
For each folder RUN (up to four at once, each role a FRESH agent):

1. **Author — Opus.** Prompt: maths `.claude/skills/twin-question/prompts/author.md`; science
   `scripts/science-twins/prompts/author.md` (RUN = the folder). It writes `RUN/Q1.json` only.
   A figure (when the brief says the source has one, or a science twin truly needs one): the
   author reads `node scripts/twins/cloud-door.mjs figure` (families) and
   `… figure --doc <family>` (the spec language), writes `RUN/Q1.figure.json` as ONE flat
   `{"family": …, …fields}` object, renders it with `… render --run RUN` and LOOKS at
   `RUN/Q1.figure.png`. **Figures only from the library**; no family fits → park the seed AND
   record the picture it needed: the author writes `RUN/Q1.figure-need.json`
   `{"what": "<one plain line>", "shape": "<kebab-case kind, e.g. u-tube-manometer>"}`, then
   `node scripts/twins/cloud-door.mjs figure-need --run RUN` (→ the "Figures we need" list;
   Adrian gets it every Sunday, a shape needed 3 times is ready to build).
2. **Automatic gates** — `node scripts/twins/cloud-door.mjs check --run RUN`. The SERVER runs
   structure, marks, topics, novelty against the bank AND our other twins, number-swap, house
   style, forbidden words, syllabus scope, and draws the figure. A pass writes `Q1.solve.md`
   and `Q1.moderate.md` (maths) / `Q1.check.md` (science).
3. **Blind solve — a fresh agent** (`packet.json` `models.blind`: Sonnet for maths below JC,
   Opus for JC and science). Prompt: `.claude/skills/twin-question/prompts/blind.md` /
   `scripts/science-twins/prompts/blind.md`. It may read ONLY `Q1.solve.md` (and
   `Q1.figure.png`) → `Q1.blind.json`. Never let it see Q1.json, the brief or the packet.
4. **Checker / moderator — a fresh Opus.** Maths: `prompts/moderate.md` → reads `Q1.moderate.md`
   + `Q1.blind.json`; science: `scripts/science-twins/prompts/checker.md` → `Q1.check.md`.
   It writes `Q1.verdict.json`. Strict: any doubt = false.
5. **Submit** — `node scripts/twins/cloud-door.mjs submit --run RUN`. The server re-runs every
   gate, compares the blind answer with the key itself (science: the letter; maths: each part,
   plain numbers to 3 s.f., and the checker must have agreed every part), then files the twin
   (`school='AdrianMath'`, `exam_type='Twin'`, `twin_of`, `verified=true` — passing every check
   IS the verify — the sub-skill filing; science also `practice_checked_at` and the seed's level
   (Core / Exam / Challenge; set by the checker's work score when the seed has none)). `published.json` = filed; `refused.json` = the gate and the problems.

**Retry once.** A refusal at the gates or by the checker → ONE repair round: the author gets
`scripts/science-twins/prompts/repair.md` (science) or `author.md` §Repair (maths) plus the
problems / the verdict's `fixes`; delete the old `Q1.solve.md`, `Q1.check.md`/`Q1.moderate.md`,
`Q1.blind.json`, `Q1.verdict.json`; then steps 2–5 again with FRESH blind and checker agents.
A second failure parks the seed (leave the folder; say why in the report). Never edit a
verdict or a blind answer to get past the door — that is the one thing this playbook forbids.

## 3. The twin rules (the doors check most; the agents must honour all)

- **No number-swap clones.** New situation, new sentences, numbers that are not an offset or a
  multiple of the seed's; not like any question listed in the brief.
- **Syllabus scope.** The level's syllabus only. Physics: no equations of motion, no momentum, no
  circular motion; g = 10. Combined Science: only the Combined syllabus.
- **Maths:** the same sub-skill, method, part labels, marks per part and total as the seed.
- **Science: the seed's sub-skill at the seed's level** (5 Oct 2026, Adrian: "we need twins
  questions of all subskills like math"). A twin easier than its seed is refused (`level_ok`).
  A Combined item (pool `CS_…`) is modelled on a pure seed but written inside the Combined
  syllabus — a sub-skill the Combined syllabus does not cover is a refusal, not a stretch.
- **Honest "why not" lines** — name a mistake only when it reproduces that option exactly.
- **Figures only from the figure library** (typed specs; no hand-drawn SVG, no code engine).
- **Never mention a model, a school, a year or a paper** in anything a student reads.
- Readability: one step a line, a bold **Answer** line (CLAUDE.md §Readability).

## 4. Report (plain words, to Adrian)

"Wrote N twins: X filed, Y refused at <gate> (one line each why), Z parked." Per bank: which
levels / topics, and what the queue says is still short (`queue` prints it). If a door
answered 401 — the token is missing or wrong in this environment; 429 — wait ten minutes.

## Taking one back

`node scripts/twins/cloud-door.mjs retire --bank maths --id <uuid> --reason "…"` — only a twin
a cloud session filed. Adrian's Retire on `/admin/generated` works on any twin.
