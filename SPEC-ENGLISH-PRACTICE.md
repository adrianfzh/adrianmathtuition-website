# English practice — on our own passages

Adrian, 6 Oct 2026: *"do all of step 5"* (after "can we do this now?" on the English plan). **Built
the same day, CLOSED** — `ENGLISH_PRACTICE_OPEN_TO_STUDENTS = false`, Adrian's cookie only.

## Own content only (7 Oct 2026)

Adrian, 7 Oct 2026: *"build english first"* — step 1 of `docs/HANDOFF-ENGLISH-BUILD.md`. The page
now serves **only passages, questions and schemes we wrote ourselves**. It does not read the
language bank at all, so no school or national text can reach a student, and opening it is no
longer a content-policy decision. What it waits on: the bench on all 51 own sets (written 7 Oct 2026) and a hard set. (63 sets since 8 Oct 2026: 12 more editing passages, marked by rule.)

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

## Editing starts from a difficulty, one passage at a time (8 Oct 2026)

Adrian, 8 Oct 2026: *"we shouldn't list questions like that … they should select difficulty, then
start, then questions will be shown one by one, and they can type in their responses, and get
immediate feedback when they submit"*.

- **No list of titles.** The Editing tab shows three levels (Easier · Standard · Harder, each with
  "n of m done") and **Start** (`editing/editing-start.tsx`).
- **One passage, asked ONE LINE AT A TIME** (Adrian, 8 Oct 2026, after seeing the first build:
  *"why not one line at a time when asking?"* — the ten answer boxes sat in a card far below the
  passage). `/app/languages/practice/editing?level=N` picks the passage. The whole passage stays on
  the screen (a wrong word is spotted from the lines around it); the line being asked is
  highlighted, and **its answer box sits inside the highlight, right under the line**, so there is
  no scrolling between passage and answer. Type the word or tap ✓ → Submit or Enter → right or
  wrong with the right word and why, at once → Next line (Enter again; the keyboard stays up).
  A line already answered shows its result under it. After line 10 the passage is handed in (the
  attempt is stored as before), the score shows, then **Next passage**.
  *Tried first and dropped:* a question bar fixed to the foot of the screen. On an iPhone (the
  simulator, 8 Oct 2026) opening the keyboard slid the first lines off the top of the screen, where
  they could not be scrolled back; steering the page with `visualViewport` made it worse. With the
  box under its line the phone itself keeps the two together above the keyboard.
  *Not seen yet:* the new layout with a real phone keyboard open — the simulator stopped showing
  its keyboard. Adrian to try one passage on his phone.
  Per-line marking is `POST { editing, line, answer }` — the same rule, nothing stored.
- **No repeats until the level is used up**: a passage not yet handed in comes first, in the sets'
  order; once all are done, the one done longest ago; never the one just finished
  (`nextEditing`, tested; done = an `english_practice_attempts` row of kind `editing`).
- **Difficulty is a property of the set.** Every error line carries a `kind`; each kind has a
  weight (`EDIT_KIND_WEIGHT` in `lib/english-own.ts`): 1 = seen in the word itself (number, a / an,
  agreement, a missing -ed) · 2 = needs the sentence's grammar (participle, adverb, pronoun,
  who / which, verb form, comparison, much / many, a / the) · 3 = needs the meaning of the lines
  around it (connector, preposition, noun or adjective, the passage's tense). A passage's eight
  weights add to its score; ≤ 12 Easier, 13–17 Standard, ≥ 18 Harder. A set with an untagged
  error does not build.
- **Today: 6 Easier (scores 9–10), 15 Standard (13–17), 6 Harder (22–23).** The first 15
  (`ed01`–`ed15`) were written to one brief and all sit in Standard. `ed16`–`ed21` were written to
  be plainly easy (seven or eight errors of weight 1) and `ed22`–`ed27` plainly hard (six or seven
  of weight 3) the same day, at Adrian's session's word, so the three levels are far apart.
- The kinds also feed the skill picture (hand-over step 4: editing by error kind).
- `editing/[id]` still opens one named passage (for a direct link); nothing lists it.

## On the plan, not the paid key (7 Oct 2026)

Adrian, 7 Oct 2026: *"we should not be using API"* … *"all on plan"* … (to a queue with marks in a
few minutes) *"yes"*.

- **Rule-marked answers are instant and free**, as before: editing, a choice, a "which word".
- **A judged answer is queued.** The route builds the same prompt as before and writes it to
  `plan_reads` (`migrations/plan_reads.sql`, `src/lib/plan-reads.ts`); the reply is
  `{ kind: 'queued', job }`. The card says "Handed in. The marks will show here in a few minutes"
  and asks `GET ?job=` every 6 seconds. `GET ?set=` gives the newest answer and marks per question,
  so a student who leaves and comes back still sees them.
- **The reader** is the Fly worker's one-minute lane `plan-reads` (bot `scripts/plan-reads.js`,
  `worker/fly/jobs.sh`): one `claude -p` per answer on a pooled login, model alias `sonnet`, **no
  tools at all** (the prompt holds a student's own words), an empty working directory. It writes
  the raw reply back; the website parses it with the same `parseShortReply` / `parseSummaryReply`.
  The bot starts a stopped worker when a read is queued (`lib/fly-worker.js`).
- **Speed:** about a minute when the worker is awake; a few minutes when it has to start.
- **Switch:** `plan-reads` on `/admin/switches`. **Alarm:** health-check `plan-reads` — an answer
  waiting over 20 minutes. **Cap:** 40 queued answers a student a day.
- The paid call is still in the code behind `ENGLISH_CHECK_USE_API=1` (unset everywhere). Do not
  set it without Adrian's word.
- `plan_reads` is generic (a finished prompt in, a raw reply out) — the next small check that
  should leave the paid key can use it with a new `kind`.

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

**On the plan:** `scripts/english-bench/plan.ts export` writes the unread rows as task sheets,
plan-billed readers mark them, `import` folds the marks back, `run.ts --report-only` scores. `run.ts`
without `--report-only` uses the paid key and needs `ENGLISH_CHECK_USE_API=1` — Adrian's word first.

**The batch, 7 Oct 2026** (`results/batch-2026-10-07.json`, the 33 new reading sets, 2,496 reads —
1,160 on the paid key before it was stopped, 1,336 on the plan): seeded 1454/1459 (99.7 %) ·
repeats 367/370 · padding 286/287 · swapped 268/270 · summary 110/110, every point agreed.
By the strict gate it does NOT pass: 2 gross misses. One — a full answer in the scheme's own words
read once as "copied the scheme" — is answered by a rule added to the prompt the same day, not yet
re-read. The other — a lifted line given the mark on a "what attitude" question (vt06 Q3) — stands.
The plan sheets hold many answers in one reading, where the page reads one at a time.

**The hard set, 8 Oct 2026** (`scripts/english-bench/hard-answers.json`, `run.ts --hard`,
`results/hard-2026-10-08.json`; all on the plan): 57 answers written the way students write them —
spelling slips, Singlish, a right idea buried in waffle, half an idea in clumsy words, a near miss,
passage words lightly changed, a summary in note form — over 5 sets, each read twice.
Seeded 55/57 (96 %), no gross miss · repeats 56/57 · summary 4/4. **Passes.** Both misses are
half-idea answers read half a mark or a mark low (na01 Q7, nn01 Q6) — the checker leans strict on a
clumsy half answer, never generous.

**The re-read, 8 Oct 2026** (`results/reread-2026-10-08.json`, sets na05 + vt06, with the rule
"an answer in the scheme's own words is right"): seeded 99/99 · repeats 25/25 · padding 20/20 ·
swapped 18/18. Both of the batch's gross misses now read correctly. **Passes.**

**Pilot, 7 Oct 2026** (`results/pilot-2026-10-07.json`, 3 reading sets, 220 reads): seeded 128/128 ·
repeats 33/33 · padding 25/25 · swapped 24/24 · summary 10/10, every point agreed. Limits: few sets,
and clean seeded answers written by the set's own writer — a HARD set (answers the way students
write them) is still owed, and every new set is benched before it counts.

## What it is

`/app/languages/practice` (door: a row on Languages Home) — four tabs:

| Tab | What the student does | How it is marked |
|---|---|---|
| Editing | choose a level, Start, then one 12-line passage at a time, a box per line (a word, or ✓) | by rule, no model: the scheme's word(s), a tick in any form schools write it |
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
