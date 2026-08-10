# TASK — Prelim-paper blueprint mining (handoff-able)

> **Status (2026-08-10 ~09:40):** an agent is running this on Adrian's main Mac.
> If it died (usage limit / machine off), any Claude Code session on any machine
> can pick this up by running the brief below verbatim as an agent task.
> Prereq: the Supabase MCP for the math project (`nempslbewxtlikfzachi`) must be
> connected (read-only `execute_sql` is all it uses). Delete this file once
> `data/paper-blueprints.json` + `scripts/derive-paper-blueprints.mjs` are
> committed and the findings report has been delivered to Adrian.

## Goal

Adrian's `questions` table holds thousands of questions captured from real S4
prelim papers (AM 4049, EM 4052) with school/year/paper/question_number/marks/
topics metadata. Reconstruct the real papers — they ARE the blueprints — analyze
them in fine detail, and emit a living, re-derivable blueprint with presets.

## Brief (run verbatim as an agent prompt)

1. **Understand the raw shape.** Inspect `questions` columns before assuming
   semantics: DISTINCT `paper` values (does it split P1/P2? nulls?),
   `question_number` format, `parts` shape, `difficulty` population, `topics`
   (text[]), `exam_type` values, `year` range. Levels 'AM','EM' only,
   `deleted_at IS NULL`. NOTE: `images` is jsonb, `solution_images` is text —
   guard casts.
2. **Reconstruct papers.** Group prelim rows by (school, year, level, paper).
   COMPLETE = contiguous numbering from 1 + plausible marks total (derive the
   total distribution from data — don't force 90; older 80/100 formats exist).
   PARTIAL = topic stats only, never slot structure. Report recovered counts.
3. **Fine-detail analysis** per (level, paper): question-count and total-marks
   distributions; mark-by-position curve (opener/middle/closer ranges); topic
   presence rate → must-appear (≥80%) / common / occasional; topic position
   affinity + closers (final 2 questions); co-occurrence rules (support ≥8
   papers only); multi-part depth by position; diagram rate by topic; 2-3
   outlier school styles with one-line characterizations; pre/post-2023
   syllabus drift (prefer post-2023 as canonical base when counts allow).
4. **Emit:**
   - `data/paper-blueprints.json` — per paper (AM-P1/P2, EM-P1/P2): canonical
     total, question_count [min,typ,max], ordered slots ({pos, marks [lo,hi],
     topic_pool with weights, parts, diagram_rate}; position ranges allowed),
     must_appear, rules {never_together, min_distinct_topics}; plus `presets`
     as small data-supported overlays (standard + 2-4 variants e.g.
     top-school-hard, calculus-forward). Must be the script's actual output.
   - `scripts/derive-paper-blueprints.mjs` — re-derivation script (house style
     per scripts/og-tools.mjs): `--from-dump <path>` offline mode over a raw
     rows dump, or live mode via SUPABASE_URL + SUPABASE_SECRET_KEY (dotenv
     parse, never grep — CLAUDE.md; local .env.local currently lacks these).
     Sanity checks: slot weights sum ≈1; typical slot marks sum within ±4 of
     total; must_appear ⊆ pools. `node --check` + full end-to-end run.
   - A ≤700-word findings report (surprising rules, closers, outliers, presets
     rationale) delivered to Adrian.
5. **Fetch efficiently:** dump raw rows once to a scratch JSON via
   `json_agg(json_build_array(...))` positional tuples over 1500-2000-row
   LIMIT/OFFSET windows (document column order in the script). Don't stream
   verbose per-row JSON objects — that was the first attempt's mistake.
6. Read-only on the DB. Don't touch `src/app/tools/page.tsx`. Commit
   `data/paper-blueprints.json` + `scripts/derive-paper-blueprints.mjs` to dev
   (fetch + rebase first — parallel sessions push to dev), then delete this file
   in the same commit.

## Downstream (context, not part of this task)

The blueprint feeds the prelim-paper generator: deterministic assembler
(blueprint slots → QB queries with school-exclusion + embedding near-dup
checks) + an AI "setter pass", run as a Claude Code skill on plan usage first;
/admin/prelim-builder page and API integration come later. Design discussion
lives in the 2026-08-10 session.
