# SPEC — a sub-skill for every PART of a long question

Status (15 Oct 2026): **BUILT: new filings AND the re-tag mode (bot 25b132ac).** Table `question_part_subgroups` exists in both projects (`migrations/question_part_subgroups.sql`). Bot commit 64ac777b on main: the reader labels each leaf part (`leaf_parts` → `parts`), `--apply` derives the main sub-skill from them and writes both tables, long questions with answers only in `parts[]` are fileable, maths filer runs every 3 h at :55. Tested on E Math Probability (6 questions, 19 part rows, mains agree). **Re-tag mode** (`--parts-only` / `FILING_PARTS=1`): labels the parts of already-filed long questions (~31k maths topic-pairs on 15 Oct), writes `question_part_subgroups` only, never touches the main filing, reports `mainDiffersFromParts`. The Fly filer runs it LAST: only when that bank's normal backlog is 0 AND no twins lane is running (`worker/fly/jobs.sh`; `FILING_PARTS_RETAG=off` stops it). Tested on E Math Probability (12 questions, 30 part rows, main untouched). **Check built (15 Oct):** the view `question_main_vs_parts` (both projects, `migrations/question_main_vs_parts.sql`) lists a question when its parts put the most marks on a sub-skill it is NOT filed under in that topic; empty on 15 Oct (12 questions). Look at it after each re-tag batch: `select * from question_main_vs_parts`. **Still to do:** surfaces adopting the part table.

## Why
Today the filer files a long question under ONE sub-skill per topic (the one carrying the most marks). A student who is weak on part (c) of a question is not found by a skill that only lives in part (c). Also ~9,200 maths + ~4,000 science long questions have no filing at all: the filer only read the whole-question answer box, and these keep answers inside `parts[]` (fixed in `lib/filing-reader.js eligibleRow`, 15 Oct).

## The rule (maths and science)
1. The filer gives EACH part its own sub-skill (a part with sub-parts (i)(ii): one label per leaf part).
2. The question-level main sub-skill is DERIVED from the part labels: most marks wins; a tie goes to the later "hence" part. Written to `question_subgroups` exactly as today (`is_primary = true`, source `cc_backfill`).
3. Twins counting (`math_twin_units`, `science_twin_units`, `twin_queue`) keeps seeing exactly one main sub-skill per question per topic, so its numbers do not move.

## Design: a SEPARATE table, `question_part_subgroups`
```
question_id   uuid   -> questions.id
part_path     text   -- 'a', 'b.ii' (the part's label path in parts[])
subgroup_id   int    -> subgroups.id
marks         numeric -- marks of that part (for the derivation)
confidence    real, reason text, source text ('cc_part_backfill'), created_at
primary key (question_id, part_path)
```
Why a new table and not new rows in `question_subgroups`: `question_subgroups` already holds secondary rows (`is_primary = false`, ~25k, from older filers). ~15 readers count or join it (serving_policy.sql, practice_next_levels.sql, twin_queue*.sql, science_twin_units.sql, twin-store.ts, portal-find.ts, find-assign.ts, skill-pick*.ts, practice-photo-classify.ts, admin cards/bank-health, clips). Extra part rows there would change what is served and double-count twins. A separate table changes none of them. A surface that wants per-part skills opts in by reading the new table.

## Rollout
1. Migration: create the table (RLS locked like its sibling). Both projects (maths `nempslbewxtlikfzachi`, science `eaxnstsecxmqdobfvmjh`).
2. Bot `lib/filing-reader.js` + `scripts/file-subgroups.js` + `.claude/skills/file-subgroups/SKILL.md`: reader brief asks for one label per part; `--apply` writes the part rows and derives the main row; tests for the derivation (marks, tie → later part) and for old/new output.
3. Ship together with the answer-in-parts eligibility fix, so the unfiled long questions are labelled once, the new way.
4. Re-tag older long questions (~36k maths, ~9k science) on the Fly worker filer lanes, never the API. Maths filer moves from twice a day to every 2–3 h when marking is quiet (`worker/fly/jobs.sh` + `fly.worker.toml`, dated comment).
5. Surfaces adopt the part table one by one (Practice photo, Find). Not part of this rollout.

## Not decided / risks
- Each long question needs a reader per part, so the Opus plan usage is several times today's per-question cost; the re-tag is weeks of lanes, not days.
- `part_path` must match how `parts[]` nests (`subparts` / `parts`); a re-extracted question orphans its rows (key on question_id + path, delete on re-extraction).

## Next step (Adrian said yes, 15 Oct 2026)
When the re-tag has finished (`FILING_PARTS=1` status shows 0 for both banks, `select * from question_main_vs_parts` looked at), adopt the part table in ONE place first: the bleed table / "where marks are lost" (report only, cannot change what a student is served). Then Practice photo, then Find, one at a time, each checked for what students are served. Remind Adrian when the re-tag backlog reaches 0.
