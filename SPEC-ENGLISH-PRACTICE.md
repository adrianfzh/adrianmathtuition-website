# English practice — on our own passages

Adrian, 6 Oct 2026: *"do all of step 5"* (after "can we do this now?" on the English plan). **Built
the same day, CLOSED** — `ENGLISH_PRACTICE_OPEN_TO_STUDENTS = false`, Adrian's cookie only.

## Own content only (7 Oct 2026)

Adrian, 7 Oct 2026: *"build english first"* — step 1 of `docs/HANDOFF-ENGLISH-BUILD.md`. The page
now serves **only passages, questions and schemes we wrote ourselves**. It does not read the
language bank at all, so no school or national text can reach a student, and opening it is no
longer a content-policy decision. What it waits on: enough own sets (5 of 51 so far) and the bench
on all of them.

- **A set** is one file in `data/english/sets/` — `ed..` editing (12 lines, 8 wrong words, 2 clean
  lines), `vt..` visual text (drawn from blocks, 5 marks), `na..` narrative (20 marks), `nn..`
  non-narrative (10 marks, then a summary with at least 8 points). Shapes and the checks:
  `src/lib/english-own.ts` (`ownProblems`). Build: `npx tsx scripts/english-own/build.ts` →
  `data/english/own-sets.json`, which the app reads. A test fails the push if the built file and the
  folder differ, or any set has a problem.
- **Each question carries seeded answers at a known mark** (full · paraphrase · half · wrong ·
  lifted · vague) and a `skill` (literal · inference · own_words · vocabulary · language_use ·
  evidence · visual · summary). Seeds are the bench's truth and never reach a page; the skill is for
  the skill picture (step 4).
- **Ours, checked**: `npx tsx scripts/english-own/novelty.ts` reads the bank and fails a set that
  shares a run of 8 words (text) or 12 words (questions) with any banked row.
- **Questions point at paragraphs, never line numbers** — lines move on a phone.
- The writers' brief for a batch: `docs/english-own-brief.md`.

## The bench (7 Oct 2026) — `npx tsx scripts/english-bench/run.ts`

Runs on a Mac with the paid key; the same reading the page uses, no cap, nothing logged. About
3 US cents a read. Verdicts are pure functions in `src/lib/english-bench.ts` (tested).

| Check | What | Gate |
|---|---|---|
| Seeded | every seeded short answer read once | ≥ 90 % on the seeded mark, no gross miss (full for a 0, 0 for a full, 2+ marks away) |
| Repeats | every fourth read twice | same mark ≥ 90 %, never 2 apart |
| Padding | every fifth read again with empty words around it | unmoved ≥ 90 % |
| Swapped | a full answer handed to a question half the set away | earns 0, ≥ 90 % |
| Summary | every seeded summary, twice | content within 1 point ≥ 90 %, never 3 away |

**Pilot, 7 Oct 2026** (`results/pilot-2026-10-07.json`, 3 reading sets, 220 reads): seeded 128/128 ·
repeats 33/33 · padding 25/25 · swapped 24/24 · summary 10/10, every point agreed. Limits: few sets,
and clean seeded answers written by the set's own writer — a HARD set (answers the way students
write them) is still owed, and every new set is benched before it counts.

## What it is

`/app/languages/practice` (door: a row on Languages Home) — four tabs:

| Tab | What the student does | How it is marked |
|---|---|---|
| Editing | the 12-line passage, a box per line (a word, or ✓) | by rule, no model: the scheme's word(s), a tick in any form schools write it |
| Comprehension | a text, then each question with its own box and Check | the free rule when the answer is one exact thing; else ONE reading against the scheme → marks, one line why, "Still needed", then "The scheme says" / "You wrote" |
| Visual text | the same, on a poster / webpage (its picture when one is stored) | the same |
| Summary | the last question on a text, with a live word count | ONE reading: which of the scheme's points were made (content out of 8 at most) + one line on the wording. No language mark is invented |

## Red lines (held in `lib/english-practice.ts`, tested)

- **Own content only**: the store reads `lib/english-own-data.ts` and nothing else. (The bank-row
  gate `servable` / `unitsOf` / `toEditingSet` is still in the file and tested, unused by the page.)
- **The scheme arrives only with the check** — `publicUnit` strips it from the page.
- **The marker's notes stay out** (`marks_note` is never carried), except an editing line's own
  explanation, which is teaching.
- **Caps**: `DAILY_ENGLISH_MODEL_CAP` = 40 judged answers a student a day; editing and exact
  answers are free.

## Files

- `src/lib/english-practice.ts` (+ test, 19) — the gate, units, the editing rule, the prompts and
  their parsers. `src/lib/english-practice-store.ts` — loaders, the image, the check, the cap.
- `src/app/api/portal/english/practice/route.ts` — GET `?image=`, POST `{editing, answers}` or
  `{unit, answer}`; 401 anonymous (health-check `portal-english-practice`).
- Pages: `app/languages/practice/page.tsx`, `editing/[id]`, `text/[id]` + their two forms.
- Table `english_practice_attempts` (`migrations/english_practice.sql`, RLS, no policies).
- Model: `ENGLISH_CHECK_MODEL` (default `claude-sonnet-5`; it thinks first, so `max_tokens` is
  generous and the reply is read with `anthropicText`). Sonnet 5.5 is on an approved-sites list —
  moving this check to it is Adrian's call.

## First trial (6 Oct 2026, local, real bank questions — small)

- Editing: half scheme words, half junk → 5 of 10, each line right.
- Short answers: the scheme's own answer → full; three correct paraphrases → full; two wrong
  answers → 0; two of three ideas → 2 of 3. One muddle: a right answer plus an extra the school's
  scheme penalises got 1 of 2 with a confusing "Still needed" line.
- Summary: the scheme's own summary → 7 of 8; its first two sentences → 2 of 8.
- Speed: 3–7 s a short answer; a summary 7–30 s.

## Not done

- The bench on a hard set and on every new set (see The bench).
- Marking history on the list (what was tried, what was right).
- 46 more own sets (the bulk batch).
