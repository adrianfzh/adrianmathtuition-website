# SPEC — one part out of syllabus (part marks)

Adrian, 9 Oct 2026: *"if only a small part is out of syllabus, then skip that part, flag out of
syllabus for that part and don't show it to students"* … *"build part marks"*.

**State: built, dark.** No part on the live bank is marked. Until one is, every surface behaves
exactly as before (the door hands back the very same row).

## The problem

A question is in or out as a whole (`questions.legacy_syllabus`).
About 84 JC questions have ONE part that needs content no longer taught — a 3-mark de Moivre
part on a good 10-mark complex-numbers question.
Marking the whole question throws away good material. Leaving it shows students a part they
were never taught.

## 1. Spec

**Where the mark lives** — on the part itself, inside `questions.parts`:

```json
{ "label": "ii", "text": "…", "marks": 4, "legacy": true, "legacy_reason": "de Moivre (not in 9758)" }
{ "label": "iv", "text": "Hence …", "marks": 2, "needs": ["b.ii"] }
```

- `legacy: true` — a student never sees this part. `legacy_reason` — a few words, for Adrian.
- `needs` — optional, on any OTHER part: "this part cannot be done without that one".
  Only a person can know this, so it is set by hand when the part is marked.
- Why not a new table: every reader already has `parts` in hand (the serving RPCs return it),
  so the mark travels with the row and one pure function can act on it. A side table would
  mean a second read on every surface.

**The one door** — `src/lib/part-syllabus.ts`, pure, tested (`part-syllabus.test.ts`):

| | |
|---|---|
| `studentRow(row)` | the row a student may see, or `null` when too little is left |
| `studentRows(rows)` | the same for a list; unservable rows drop out |
| `studentView(row)` | the same plus what was hidden and why — for admin views |
| `applyPartMark(row, change)` | a new `parts` with one mark set or cleared, every other key untouched |

What comes out of the door:

1. **The marked part is gone** — its text, figure, answer, working and solution picture.
   So is everything inside it, and any part that `needs` it (chains are followed).
   A parent left with nothing inside goes too.
2. **Labels are never changed.** (a), (b), (c) with (b) hidden shows (a) and (c).
   The label is how the answer key, the worked solution, a marked attempt, the school's own
   paper and Adrian himself name the part. Relabelling would make "(b)" mean two things.
3. **Marks** = the original total minus the hidden parts' marks. A parent that repeats its
   sub-parts' sum is reduced with them.
4. **The answer line** "(a) …; (b)(i) …" is split by label and the hidden share dropped;
   if it cannot be split it is rebuilt from the remaining parts' own answers; if neither is
   safe the line is **withheld** — never shown whole.
5. **The worked solution**: per-part working is used (the hidden part's is gone). A single
   top-level solution is split on per-part headings; if it has none it is withheld.
6. **Whole-question pictures** (`question_image_url`, `question_with_answer_image_url`,
   `solution_image_url`, top-level `solution_images`) and the stored `hint` are withheld —
   they may show the hidden part.
7. **Too little left → not served at all**: fewer than **3 marks** left, or less than **half**
   the original. Same effect as `legacy_syllabus`. A question the tutor put on a student's own
   list is still shown (parts removed) unless nothing is left.

**Red lines**

- No student-facing text explains any of this. The part is simply not there.
- Admin views never hide a marked part: it is greyed, with its reason.
- Marking of a REAL paper a student hands in (the bot's bank grounding) keeps every part —
  the student sat the whole paper. The door is for material WE hand out.
- Rows with no `parts` list (the parts live only inside `question_text`) cannot be marked.
  `applyPartMark` refuses with a plain message; mark the whole question instead.

**Worked examples**

1. *HCI 2020 MY Q4, 12 marks.* (a) [3], (b)(i) [2], (b)(ii) [4] powers in exponential form,
   (b)(iii) [1], (b)(iv) [2]. Mark (b)(ii). A student sees (a), (b)(i), (b)(iii), (b)(iv) —
   **8 marks**. Answer line: "(a) …; (b)(i) …; (b)(iii) …; (b)(iv) …".
2. *Same question, and (b)(iv) says "Hence".* Adrian decides (iv) needs (ii): set
   `needs: ["b.ii"]` on (b)(iv). Now (ii) and (iv) are both gone — **6 marks** of 12, exactly
   half, still served.
3. *RI 2021 Q6, 9 marks, hide a 5-mark part.* 4 of 9 left — under half. Not served to anyone
   (unless assigned). The script's dry run says so before anything is written.

## 2. Tools

- **Admin control** — `/admin/questions`, open a question: every part has a small
  "Out of syllabus" button (asks for the reason); a marked part is greyed with
  "Hidden from students — <reason>" and an "Undo" button; a line under the question says what
  students get ("Students see 8 of 12 marks"). API: `POST /api/admin/questions`
  `{ action: 'part-syllabus', id, part, legacy, reason?, needs? }`.
- **Script** — `npx tsx scripts/part-syllabus/apply.ts marks.json` — dry run by default,
  `--apply` to write. Input: `[{ "question_id", "part_label", "reason", "needs"?: [{ "part_label", "on": ["b.ii"] }] }]`.
  Prints, per question: what is hidden, marks before → after, whether it is still served,
  anything withheld, and later parts that say "Hence" (to check by eye). Writes an undo file.
- **Tripwire** — `src/lib/part-syllabus-surfaces.test.ts` lists every file that reads the
  bank. A new one must go through the door or be listed there with a reason; the test fails
  otherwise.

## 3. Checkpoints

Adrian (or a session he asks) decides which part is out and whether a later part needs it.
The script never guesses a dependency. Nothing is written without `--apply`.

## 4. Trigger

None — a mark is a decision, not a job. The door runs on every read.

## 5. Log + alarm

`/api/health-check` → `part-marks`: runs the door over a built-in fixture (hidden part gone,
total reduced) and counts live rows with a mark that have fallen below the serving threshold.

## Surviving a re-write of `parts`

Checked 9 Oct 2026:

| writer | what it does to `parts` | mark survives? |
|---|---|---|
| website figure tools, render fixes, solution-image tools | copy each part, change one field | yes |
| solutions import (bot `solutions-import.md`) | merges a field into each element | yes |
| extraction `bank_insert.py --update`, the MCP fallback upsert | **replaces the whole array** | **no** |
| twins / Set papers / generated | insert NEW rows | n/a |

For the third row there is a safety net, **written but NOT applied**:
`migrations/part_syllabus_keep_marks.sql` — a trigger that, when `parts` is replaced, copies
`legacy` / `legacy_reason` / `needs` from the old part with the same label onto the new one
unless the new one says otherwise. Apply it before the first part is marked.

## Still to do in the bot repo (not touched here)

The bot has its own copies of the readers. Until these go through the same rule, do not mark
parts on questions the bot hands out:

- `lib/solution-rollup.js` — the bot's answer/solution rollup (returns the top-level line whole).
- `/revise`: `handlers/revise.js` `pickPoolQuestion` (also has no `legacy_syllabus` check at all).
- Portal "similar question": `lib/portal-practice.js` (`questionPreview`, `eligibleForPractice`, `matchSummary`).
- Practice Again picker: `ai/practice-questions.js` (`filterCandidates`, `candidatePayload`).
- Marking a paper WE printed: `lib/mock-grounding.js` (`questionSection`, `renderParts`) and
  `handlers/webchat.js` `handinPartList` kind `printed-paper` — must expect the reduced paper.
- Generators that copy a bank question into a prompt: `handlers/similar.js`
  `generateVariantFromExemplars`, `ai/generation-worker.js` `buildSourceText`,
  `handlers/revise.js` `buildSeedText`.
- Extraction: `bank_insert.py --update` and the law (`extraction_worker_prompt`) must carry
  the three keys through.
- Keep ALL parts (no change): `lib/bank-grounding.js`, `lib/bank-allocation.js`,
  `lib/solver-grounding.js`, `lib/reference-read.js`, `lib/handin-completeness.js` — these read
  a real paper the student already holds.
