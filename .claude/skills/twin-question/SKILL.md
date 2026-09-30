---
name: twin-question
description: Write OUR OWN twin of one school question in the bank (same sub-skill, structure, marks, method; new numbers, context, sentences) through the gates in SPEC-TWINS.md — author → novelty/structure gates → blind solve → moderate → figure → insert with verified=true (passing every check is the verify, Adrian 30 Sep 2026). Plan-billed Claude Code agents only, never the API. Use when Adrian asks for twins, "our own questions", or a paper's questions replaced by ours.
---

# Twin a question

Read `SPEC-TWINS.md` first (what a twin is, the red lines). The deterministic half is
`scripts/twins/twin.mjs`; the writing is agents you spawn. One run dir per source.

## Steps

1. **Pick sources** — `node scripts/twins/twin.mjs queue --level EM --limit 20`
   (drawn-in-90-days first, then the pool one row per sub-skill). Skip a row whose
   question is only an image (the queue already drops `text_len ≤ 40`).
2. **Brief** — `node scripts/twins/twin.mjs brief --source <uuid> --run <dir>` writes
   `source.json`, `corpus.json`, `plan.json`, `author-brief.md`. Keep run dirs under
   `~/Dropbox/AdrianMath Work/Twins/<date>/<source-id>/` (the scratchpad wipes).
3. **Author** — spawn an **Opus** agent with `prompts/author.md` (fill RUN). It writes
   `Q1.json` only. Up to four authors at once, staggered.
4. **Gates** — `node scripts/twins/twin.mjs check --run <dir>` → `Q1.gates.json`
   (structure/marks/answers, topics, novelty ≤ 0.4 vs source AND the whole level,
   number-swap, lifted text, figure consistency). On failure send the agent the
   problems for ONE repair round (`prompts/author.md` §Repair); two failures → park.
   A pass also writes `Q1.solve.md` and `Q1.moderate.md`.
5. **Blind solve** — a FRESH **Sonnet** agent (**Opus for JC1/JC2** — `plan.json` `models.blind` says which; Adrian, 30 Sep 2026) with `prompts/blind.md`: it may read
   `Q1.solve.md` only (never `Q1.json`, `source.*` or the brief) → `Q1.blind.json`.
6. **Moderate** — a FRESH **Opus** agent with `prompts/moderate.md` → `Q1.verdict.json`.
   Publish needs `all_agree && !reads_as_source && same_skill && same_method && score ≥ 4`.
   A key disagreement the moderator says the setter lost, or `reads_as_source`,
   goes back to the author once (with the verdict), then park.
7. **Figure** (only `needs_figure`) — an **Opus** agent with gce-paper's
   `.claude/skills/gce-paper/prompts/figure-author.md` (RUN = the run dir, N = 1,
   ROOT/BOT filled) writes `Q1.figure.json|.cjs`; render with
   `node scripts/gce-paper/figure.mjs --run <dir> --slots 1` (verify fails closed).
8. **Publish** — `node scripts/twins/twin.mjs publish --run <dir>` (`--dry` first).
   Row: `school='AdrianMath'`, `exam_type='Twin'`, `ai_generated=true`, `twin_of`,
   **`verified=true`** — publish only runs once every gate and the moderator passed,
   and that IS the verify (Adrian, 30 Sep 2026: "if they pass the checks consider
   them verified"); Retire on /admin/generated takes one out. Idempotent on
   `gen_meta.twin_item`. The source's `question_subgroups` filing is copied.
9. **Review** — `node scripts/twins/twin.mjs review --runs <dirs…> --out twins-review.html`
   and hand Adrian the file (source beside twin, KaTeX). Report the tally:
   accepted / rejected at which gate / parked. Phase 0 bar: 16 of 20.

## Red lines (SPEC-TWINS §9)
Never the API. Never `verified=true` except through `publish` after every check passed; never `image_watermark_status='clean'` from here.
Never touch the source row. Never flip serving without Adrian. A twin that reads
as the source re-numbered is a reject, not a light edit.
