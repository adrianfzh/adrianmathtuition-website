# English practice from the language bank

Adrian, 6 Oct 2026: *"do all of step 5"* (after "can we do this now?" on the English plan). **Built
the same day, CLOSED** — `ENGLISH_PRACTICE_OPEN_TO_STUDENTS = false`, Adrian's cookie only.

## ⚠ Before this opens — a content-policy decision, not only a readiness one

`docs/CONTENT-POLICY.md` says the language bank is **grounding-only: nothing served**. This
feature is the first thing that could serve it. Building it closed serves nothing. Opening it
needs Adrian to say, in so many words, that school English questions may be served, and the
policy doc changed in the same commit. Three things make English different from maths:

1. **The passages are other people's writing twice over** — a school paper reprinting a book
   extract or a news article. A whole passage with all its questions is a large part of a paper
   (rule 2: never a whole paper).
2. **All but two papers came from a seller's compilation**; pictures carrying its stamp were
   withheld at extraction, so some visual-text questions have words only.
3. **The long-run answer is our own passages** (the twins direction): our own texts and
   questions, checked the same way. Not built.

## What it is

`/app/languages/practice` (door: a row on Languages Home) — four tabs:

| Tab | What the student does | How it is marked |
|---|---|---|
| Editing | the 12-line passage, a box per line (a word, or ✓) | by rule, no model: the scheme's word(s), a tick in any form schools write it |
| Comprehension | a text, then each question with its own box and Check | the free rule when the answer is one exact thing; else ONE reading against the school's own scheme → marks, one line why, "Still needed", then "The scheme says" / "You wrote" |
| Visual text | the same, on a poster / webpage (its picture when one is stored) | the same |
| Summary | the last question on a text, with a live word count | ONE reading: which of the scheme's points were made (content out of 8 at most) + one line on the wording. No language mark is invented |

## Red lines (held in `lib/english-practice.ts`, tested)

- **Serve gate**: a school row (not national), not deleted, `answer_source = 'mark_scheme'`,
  level `EL` / `EL_NA`. A unit with no scheme is not served — nothing is ever marked against an
  answer of ours.
- **No source**: no school, year, exam or file name in any page or reply. A picture is streamed
  by text id (`GET ?image=`), because its storage name carries the school.
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

- A proper bench (seeded answers at known marks, as the science bench) — the gate before opening.
- Marking history on the list (what was tried, what was right).
- The editing passage keeps the paper's line breaks, which wrap on a phone.
- Our own passages.
