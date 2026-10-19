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

## Twins — every part of our own questions gets its skill too (17 Oct 2026, Adrian: yes)
Why: a twin was filed under ONE main sub-skill only, so a student weak in a skill that lives in part (c) never found that part in our own questions.
- **Copied from the seed when it can be.** A twin keeps its seed's parts, labels and marks (SPEC-TWINS §1). When the seed's parts are already labelled AND the leaf parts line up exactly (same paths, same marks), the seed's rows are copied to the twin, `source 'twin-from-seed'`. Code: `src/lib/twin-part-labels.mjs` (test beside it). Every publish path calls it: `scripts/twins/twin.mjs publish`, `scripts/science-twins/sci-stwin.mjs publish`, the cloud door `src/lib/twin-store.ts submitMath`. Best effort — it never fails a publish. Science MCQ twins have no parts, so nothing to do.
- **Otherwise the filer reads the twin.** The bot filer's re-tag has a twins-only mode (`--twins` / `FILING_TWINS=1`, bot `scripts/file-subgroups.js`). Its own Fly jobs, `file-twin-parts` (maths 02:25, 08:25, 14:25, 20:25) and `file-twin-parts-science` (05:25, 11:25, 17:25, 23:25), on the plan, up to 300 a run. Unlike the school re-tag it does not wait for the twins lanes or the new-filing backlog — it is a few thousand questions, not ~31k. New twins whose seed has no labels are picked up by the next run.
- **Never** touches `question_subgroups`: twin counting does not move.
- **Where it stood, 17 Oct 2026.** Before: maths 3,809 twins (2,774 with parts), 3 with part labels; science 2,319 twins (700 structured), 0. Seeds with part labels were rare: 15 maths twins copied (34 rows) by `scripts/twins/part-labels-backfill.mjs`; 12 more labelled by hand as the first twins-only batch (A Math Logarithms, all saved). After: maths 30 twins labelled, science 0. Waiting for the jobs: ~4,700 maths (twin × topic) and 694 science. The jobs live in the worker's image, so they start at the worker's next restart (the bot change was pushed without one so the running twins lanes and marking were not cut off).
- Check how far it is: `FILING_TWINS=1 node scripts/file-subgroups.js --parts-only --status` (bot; `FILING_BANK=science` for science), or `/admin/ops` → 🧩 Twin part skills.

## Faster: every hour (19 Oct 2026, Adrian: "yes")
Each filer run takes about 5 minutes, so the gaps between runs were the slow part. Since bot 574455c9 the maths filer runs every hour at :55 and the maths twin part-skills every hour at :25 (was every 3 h, and 4 a day). It goes live at the worker's next ordinary restart (pushed without one, as marking was running). Where it stood: science twins all labelled; maths long twins 1,939 of 2,806 (about 850 of them read in-session on 19 Oct, the rest by the worker); maths school questions ~4,700 left to file, then ~29,000 older ones to re-tag. Expected: maths twins within a day, maths school questions in about 5 days. **When the maths re-tag reaches 0**, remind Adrian about "where marks are lost". If marking ever waits on the plan's 5-hour meter because of this, slow it down first.

## Fastest: back to back, alongside the twins writers (19 Oct 2026, Adrian: "do both")
Two changes, bot 7b7d5907 (replaces the hourly timetable above):
1. **Back to back.** The maths filer and the maths twin part-skills run in a "filing lane": the next run starts a minute after the last one ends, as long as that run had work and the worker has room (the same room check as the other lanes; marking keeps first place). A run that finds nothing leaves a note (`<job>.idle`) and the lane then looks only once an hour — so it goes back to normal by itself when the labelling is done. Switch: `FILING_LANE=0` stops the lane (the timed 00:55 / 00:25 runs stay).
2. **The re-tag no longer waits for the twins writers.** Adrian's 15 Oct rule ("never alongside the twins lanes") is replaced: the writers ran nearly all day, so the ~29,000 older maths questions would almost never have been labelled. New filings still come first.
Expected once live (next ordinary worker restart): maths twins in a few hours, maths school questions in about 1–2 days. Watch: the plan's 5-hour meter (marking first). Science runs unchanged (every 2 h), except its re-tag also no longer waits.

## Next step (Adrian said yes, 15 Oct 2026)
When the re-tag has finished (`FILING_PARTS=1` status shows 0 for both banks, `select * from question_main_vs_parts` looked at), adopt the part table in ONE place first: the bleed table / "where marks are lost" (report only, cannot change what a student is served). Then Practice photo, then Find, one at a time, each checked for what students are served. Remind Adrian when the re-tag backlog reaches 0.
