# SPEC — one part out of syllabus (part marks)

Adrian, 9 Oct 2026: *"if only a small part is out of syllabus, then skip that part, flag out of
syllabus for that part and don't show it to students"* … *"build part marks"*.

**State: built, dark.** No part on the live bank is marked. Until one is, every surface behaves
exactly as before (the door hands back the very same row).

## Where things stand / roll-out order — agreed with Adrian 9 Oct 2026

**Built (9 Oct 2026):** the part marks themselves; then, the same day, **re-lettering for
students** and two fixes (the "Hence" warning, the vanishing answer line) — §Re-lettering below.
Six sample pictures for him: `.scratch_shot/part-marks/relabel-1.png … relabel-6.png`.

**The test for a part** (his rulings, 9 Oct 2026): a part is OUT only if it **cannot be done
without removed content**.

- For H2 complex numbers, the argument rules `arg(z₁z₂) = arg z₁ + arg z₂` and
  `arg(z₁/z₂) = arg z₁ − arg z₂` are **not taught**.
- Polar / exponential form, de Moivre and nth roots are **out**.
- Plain `|z|` and `arg z` of a cartesian number are **in**.
- A part with a **cartesian route** (find `x + iy` first, then the argument) is **in**.
  RI 2024 Prelim P1 Q8 (b)(i) is in for that reason, and that question needs nothing hidden.
- **Owed:** 24 questions marked old syllabus on 9 Oct were judged partly on "needs
  adding/subtracting arguments". Each is owed a re-read with the single question *"is there a
  route that avoids the argument rules?"* — ids recoverable from
  `~/dev/adrianmathtuition-website/.scratch_shot/bank-cleanup-2026-10-09/plan-step7.json` and
  `held81/verdicts.json`.

**The order he said yes to:**

1. Re-lettering + the two fixes, six pictures for him. *(done — waiting for his look)*
2. Mark the real parts on the ~80 known JC maths questions — **after** the two migrations below
   and the bot-side work.
3. A **background reader on the Fly worker** (not an interactive session) that goes through the
   whole bank for out-of-syllabus parts, starting with A Math and E Math, from a per-subject,
   per-level syllabus list read off the official SEAB documents. It brings him only the unclear
   points; he approves, per subject, a short list of "these topics are out" before anything is
   hidden.
4. The science bank (a separate project — the tool must be built for it) and the other subjects.

Steps 3 and 4 are not started until he has seen step 1.

**Before the first real part is marked** (all still open):

- apply `migrations/part_syllabus_keep_marks.sql` (marks survive a re-write of `parts`);
- apply `migrations/part_label_prints.sql` (the print record — without it a re-lettered question
  is left off every printed sheet, and the health check goes red);
- the bot-side list at the foot of this file;
- the re-read of the 24 above.

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
{ "label": "iii", "text": "Hence …", "marks": 2, "needs_cleared": ["b.i"] }
{ "label": "ii", …, "legacy": true, "legacy_reason": "…", "checked": "9f3c…" }
```

- `legacy: true` — a student never sees this part. `legacy_reason` — a few words, for Adrian.
- `needs` — optional, on any OTHER part: "this part cannot be done without that one".
  Only a person can know this, so it is set by hand when the part is marked.
- `needs_cleared` — on a later part that LOOKS dependent ("Hence…"): a person said it stands
  alone. Without one of `needs` / `needs_cleared` the question is not served (§B below).
- `checked` — on a marked part: the fingerprint of the row a person read and confirmed
  (§needs_check below). Any later edit changes the fingerprint and the confirmation lapses.
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
| `view.labels` · `partLabelsOf(row)` | the map original label ⇄ shown label (rides on the row, never in JSON) |
| `shownPartLabel` · `originalPartKey` · `storedOriginalKey` | going out · coming in · coming in for an attempt or print that stored its map |
| `confirmPartChecks(row)` | "I have read what students get" — stamps `checked` |
| `likelyDependents(parts, part)` | later parts that look as if they lean on a part — a prompt, never a decision |

What comes out of the door:

1. **The marked part is gone** — its text, figure, answer, working and solution picture.
   So is everything inside it, and any part that `needs` it (chains are followed).
   A parent left with nothing inside goes too.
2. **For students the remaining parts are re-lettered** — §Re-lettering below.
   *(Reversed 9 Oct 2026. The first build kept the original labels — "(a), (c)" — on the
   ground that the label is how the key, the working, a marked attempt and the school's paper
   name the part. Adrian: "when shown to students, say the missing part is (b)(ii), out of
   (b)(i),(ii),(iii), shall we rename (iii) to (ii)? so it does not look as weird? only for
   student facing". The stored row and every admin view still use the original labels; the
   map between the two travels with the view.)*
3. **Marks** = the original total minus the hidden parts' marks. A parent that repeats its
   sub-parts' sum is reduced with them.
4. **The answer line** "(a) …; (b)(i) …" is split by label, the hidden share dropped and each
   remaining share written under its shown label; if it cannot be split it is rebuilt from the
   remaining parts' own answers; if neither is safe the line is **withheld** — never shown
   whole. The splitter reads the spellings found in the live `answer` column (surveyed 9 Oct
   2026 over 24,006 rows): `(b)(i)` · `(bi)` (the commonest after the plain form) · `b(i)` ·
   `bi)` · `(b) (i)` · `a)` · `Part (b)(i):` · `**(a)**` · one per line · numbered `(1)`.
   A "show that" / "prove" part with no answer contributes nothing instead of failing the line
   (fix C — ASRJC 2023 Prelim P1 Q9, whose line reads "(a) … (bi) … (bii) shown (biii) …").
5. **The worked solution**: per-part working is used (the hidden part's is gone). A single
   top-level solution is split on per-part headings; if it has none it is withheld.
6. **Whole-question pictures** (`question_image_url`, `question_with_answer_image_url`,
   `solution_image_url`, top-level `solution_images`) and the stored `hint` are withheld —
   they may show the hidden part.
7. **Too little left → not served at all**: fewer than **3 marks** left, or less than **half**
   the original. Same effect as `legacy_syllabus`. A question the tutor put on a student's own
   list is still shown (parts removed) unless nothing is left. *(Unchanged by re-lettering.)*
8. **Waiting for a person → not served at all**, not even on a student's own list:
   an undecided "does it need the hidden part?", or a sentence the door would not guess at.

## Re-lettering — students only (Adrian, 9 Oct 2026)

His words: *"when shown to students, say the missing part is (b)(ii), out of (b)(i),(ii),(iii),
shall we rename (iii) to (ii)? so it does not look as weird? only for student facing"* and
*"if there is an (a) and (b) part, but (b) is out of syllabus and hidden, then (a) should not be
shown, just a question with no parts, and their answers should reflect so, only for student
facing"*.

**Rule 1 — re-letter.** At every level that lost a part, the parts left are lettered again in
order, in that level's own style — read off the siblings, never assumed: `(a),(b),…` /
`(i),(ii),…` / `1,2,…`, capitals and brackets kept as stored.
*(i), (ii), (iii), (iv) with (iii) hidden → (i), (ii), (iii).* A level that lost nothing is not
touched; a part hidden at the END changes no letter.

**Rule 2 — one part left, no letter.** A level left with ONE part shows no label for it.
*(a)+(b) with (a) hidden → one plain question:* the part's text flows after the stem, its marks
are the question's marks, `parts` is empty, the answer and the working carry no "(b)".
*One level down: (b)(i), (b)(ii) with (ii) hidden → just "(b)"* — (i)'s text joins (b)'s.
*One top-level part left that has sub-parts: its letter goes and (i), (ii) move up.*
A lone part that carries its own figure is not folded (the figure would lose its place): it
keeps a letter and a person is asked to look.

**The stored row never changes.** Admin views show the ORIGINAL labels, the hidden part greyed,
and beside a re-lettered part a small grey "students see this as (ii)".

**The map.** `studentView(row).labels` = `{ shown: {original → shown}, original: {shown →
original}, renames: […] }`, keys as path keys (`b.iii`; `''` = no letter). It also rides on the
row itself under a symbol (`partLabelsOf(row)`) — copied by `{ ...row }`, never written to JSON,
so a server-side caller has it and a student's browser never does.

**Going out** — every consumer renders the row's own `parts[].label`, so the shown labels reach
the question, the answer line, the worked solution, the hint (written from the student row),
the "Stuck? Next step" ladder and the marks breakdown with no per-surface code.

**Coming in — an attempt on screen.** The marker is given the student row, so its scheme and
its `partBreakdown` use the labels the student saw. `/api/portal/practice/grade` stores the map
with the attempt (`student_attempts.marking_json.partLabels` = `{shown: original}`).
`storedOriginalKey(marking_json.partLabels, '(ii)')` → `b.iii`. An attempt with no stored map
was marked against the bank's own labels — which is every attempt made before this.

**Coming in — a printed sheet.** A sheet is handed in days later, and a mark may be set or
cleared in between. So the letters are **recorded at print time**, not worked out again:
every surface that prints (`/api/portal/print-paper/pdf`, `/api/admin/student-materials/pdf`,
`/api/kiosk/worksheet`, `/api/bot/worksheet`, the worksheet picker, the prelim builder) calls
`recordPrintedLabels` (`lib/part-label-prints-store.ts`), which writes one row per re-lettered
question to **`part_label_prints`** — surface, sheet ref, student, question, `{shown: original}`,
fingerprint. **A re-lettered question whose row cannot be written is left off the sheet**: no
record, no print. `printedOriginalKey` reads it back. Questions whose letters are the bank's own
write nothing. Table: `migrations/part_label_prints.sql` (**not applied**).

**A sentence that names a part** — in the stem, a remaining part, an answer, the working:

| what it says | what happens |
|---|---|
| names a remaining part whose letter moved — "using your answer to part (iii)", "from (iii)", "parts (i) and (iii)", "part iii", "in (b)(iii)" | rewritten to the shown label |
| names a part folded into its parent — "(b)(ii)" now shown as "(b)" | rewritten to the parent's letter |
| names a HIDDEN part | **not rewritten.** The referring part depends on it: listed with the "Hence" warning (§B), not served until decided |
| the STEM names a hidden part | `needs_check` |
| a bare "(iii)" with no cue word, which may or may not be a part name, and that part moved or is hidden | **not guessed**: `needs_check` |
| only looks like a label — inside `$…$` / `\(…\)`, `f(iii)`, a list of its own "(i) x>0, (ii) x<0", MCQ options "(A) (B)", "(here …)" | left alone |
| names a part whose letter did not move | left alone |

**`needs_check`.** `view.checks` lists what a person must read (`reference_unclear`,
`names_hidden`, `label_style` — the siblings are not a plain run, e.g. "a-i, a-ii", so they were
not re-lettered — and `lone_part_kept`). While it is not empty and not confirmed, the question
is **not served to anyone**. Cleared by "I have read it — it is right" on `/admin/questions`
(`action: 'part-syllabus-confirm'`), which stamps `checked` = the row's fingerprint on the
marked parts. Any later change to the stem, a part, the answer or the working changes the
fingerprint: the question waits again.

## B. The "Hence" warning (fixed 9 Oct 2026)

`likelyDependents` used to catch only a "Hence" directly after the hidden part, or a part naming
its label. Real miss: RI 2024 Prelim P1 Q8 — (b)(iii) "Hence find tan π/12" leans on (b)(i) but
follows (b)(ii). Now listed, for a person to decide:

- any later part whose text, answer or stored working **names** the part;
- any later part **at the same or a deeper level** that says "hence", "deduce", "using your
  answer/result", "from part …" — wherever it sits, not only straight after;
- a shallower part that says so straight after;
- any later part whose stored working **carries the hidden part's own answer**.

It still never decides. But a mark can no longer be saved, or served, with one undecided:

- the door: an undecided dependent → `view.dependents` → not served;
- `/admin/questions`: the save is refused (409, nothing written) until each is answered —
  "can it still be done without it?" → **yes** = `needs_cleared`, **no** = `needs` (hidden too);
- the script: a question with a DECIDE line left is not written.

**Red lines**

- No student-facing text explains any of this. The part is simply not there.
- Admin views never hide a marked part: it is greyed, with its reason.
- Marking of a REAL paper a student hands in (the bot's bank grounding) keeps every part —
  the student sat the whole paper. The door is for material WE hand out.
- Rows with no `parts` list (the parts live only inside `question_text`) cannot be marked.
  `applyPartMark` refuses with a plain message; mark the whole question instead.

**Worked examples**

1. *HCI 2020 MY Q4, 12 marks.* (a) [3], (b)(i) [2], (b)(ii) [4] powers in exponential form,
   (b)(iii) [1], (b)(iv) [2]. Mark (b)(ii). The site asks: "(b)(iv) says Hence — can it still
   be done without (b)(ii)?" Adrian: yes. A student sees (a), (b)(i), **(b)(ii), (b)(iii)** —
   the old (iii) and (iv) — **8 marks**. Answer line: "(a) …; (b)(i) …; (b)(ii) …; (b)(iii) …".
   A student who answers "(b)(ii)" is marked against the bank's (b)(iii).
2. *Same question, Adrian says no — (iv) needs (ii).* `needs: ["b.ii"]` on (b)(iv). Now (ii)
   and (iv) are both gone — **6 marks** of 12, exactly half, still served: (a), (b)(i), (b)(ii).
3. *RI 2021 Q6, 9 marks, hide a 5-mark part.* 4 of 9 left — under half. Not served to anyone
   (unless assigned). The script's dry run says so before anything is written.
4. *HCI 2021 Prelim P1 Q5, 9 marks.* (a) [3] exponential form, (b) [6] a cubic. Mark (a).
   A student sees ONE plain question, 6 marks, no "(b)" anywhere; the answer reads
   "a = −1; other roots …".
5. *EJC 2022 Prelim P2 Q4.* (a) [5], (b)(i) [4], (b)(ii) [3]. Mark (b)(ii). A student sees
   (a) and **(b)** — (b)(i)'s text sits under (b), 9 marks.
6. *ASRJC 2023 Prelim P1 Q9.* Mark (a). (b) is the only part left at the top, so its letter
   goes: the student sees the stem, then (i), (ii), (iii) — 8 marks, with the answer line
   "(i) … (ii) shown (iii) …" (it used to be withheld).

## 2. Tools

- **Admin control** — `/admin/questions`, open a question: every part has a small
  "Out of syllabus" button (asks for the reason, then asks about each later part that looks
  dependent); a marked part is greyed with "Hidden from students — <reason>" and an "Undo"
  button; a re-lettered part carries a grey "students see this as (ii)"; a line under the
  question says what students get ("Students see 8 of 12 marks"), any decision still owed
  (two buttons), and anything to read with its "I have read it — it is right" button.
  API: `POST /api/admin/questions`
  `{ action: 'part-syllabus', id, part, legacy, reason?, needs?, cleared?, decisions?: { '<part>': 'needs' | 'alone' } }`
  and `{ action: 'part-syllabus-confirm', id }`.
- **Script** — `npx tsx scripts/part-syllabus/apply.ts marks.json` — dry run by default,
  `--apply` to write. Input: `[{ "question_id", "part_label", "reason", "needs"?: [{ "part_label", "on": ["b.ii"] }] }]`.
  Also `{ "part_label", "stands_alone": ["(b)(i)"] }` and `{ "question_id", "confirm": true }`.
  Prints, per question: what is hidden, each rename ("(iii) shown as (ii)"), marks before →
  after, whether it is still served, anything withheld, a DECIDE line per undecided dependent
  (such a question is NOT written) and a READ line per check. Writes an undo file.
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
total reduced, the next part re-lettered and mapped back), counts live rows with a mark that
have fallen below the serving threshold or wait for a person, and — once any part is marked —
goes **red if the print record table cannot be read**.

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
`legacy` / `legacy_reason` / `needs` / `needs_cleared` / `checked` from the old part with the
same label onto the new one unless the new one says otherwise. Apply it before the first part
is marked. (A carried-over `checked` only counts if the content is still exactly what was read.)

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
- **Shown labels (re-lettering, 9 Oct 2026)** — the bot must speak the letters the student saw:
  - port the label plan (`studentView` → `labels`) with the reader: every bot surface that
    shows a part's label, answer or working uses the shown label; the stored row is untouched;
  - a lone part has NO letter — `questionPreview`, `candidatePayload`, the rollup must print a
    plain question, and an answer with no "(a)";
  - `needsCheck` (undecided dependents, or unconfirmed checks) = do not hand the question out,
    assigned or not — same rule as `partMarksBlockAlways`;
  - marking a paper WE printed (`lib/mock-grounding.js`, `handinPartList` kind `printed-paper`):
    read the sheet's row in **`part_label_prints`** (by surface + ref, else the student's latest
    print of that question before the hand-in) and map each shown label back with it — never
    re-derive the letters from the bank as it stands on marking day;
  - a Practice Again sheet the bot builds from its own snapshot: write the same
    `part_label_prints` row when the snapshot is taken (surface `practice-again`, ref = the
    sheet job), or keep the `{shown: original}` map inside the snapshot;
  - a student's typed "(ii)" in chat about a served question → `originalPartKey` before any
    lookup against the bank.
- Keep ALL parts (no change): `lib/bank-grounding.js`, `lib/bank-allocation.js`,
  `lib/solver-grounding.js`, `lib/reference-read.js`, `lib/handin-completeness.js` — these read
  a real paper the student already holds.
