# Hand-over — the English build (Adrian, 7 Oct 2026)

Adrian, 7 Oct 2026: *"i will also want to build english on top of humanities - build english
first before building english literature"*. So the order across the two families is:
Humanities (its own note, [`HANDOFF-HUMANITIES-BUILD.md`](HANDOFF-HUMANITIES-BUILD.md)) and
**English Language (1184) — this note — before English Literature (2065)**. Literature is not
started until English is done and Adrian says go.

For a FRESH session (one topic per session). Read first: `CLAUDE.md`,
[`SPEC-ESSAY-MARKING.md`](../SPEC-ESSAY-MARKING.md), [`SPEC-ENGLISH-PRACTICE.md`](../SPEC-ENGLISH-PRACTICE.md),
[`docs/english-guidance-draft.md`](english-guidance-draft.md), `docs/CONTENT-POLICY.md`.
Talk to Adrian in plain, short words. No jargon.

## Where it stands (checked 7 Oct 2026) — all closed to students

| Part | State | Switch |
|---|---|---|
| Essay marking (English + 中文), with our own guidance in the marker | built | `ESSAY_MARKING_OPEN_TO_STUDENTS` |
| Formats guide for Situational Writing | built | `ENGLISH_FORMATS_OPEN_TO_STUDENTS` |
| Practise: editing · comprehension · visual text · summary, each answer checked against the scheme | built | `ENGLISH_PRACTICE_OPEN_TO_STUDENTS` |
| The language bank (`language_items` 846, `language_texts` 174: 528 comprehension, 132 visual text, 33 summary, 19 editing) | banked | grounding-only |

The paper (syllabus 1184): Paper 1 = Editing 10 + Situational 30 + Continuous 30 · Paper 2 =
Visual text, narrative comprehension, non-narrative comprehension + summary · Paper 3 Listening ·
Paper 4 Oral (planned response + spoken interaction). No reading aloud.

## What is missing — the build, in order

1. **Our own passages and texts.** Practise today serves other schools' passages, which the
   content policy keeps as grounding-only — so it cannot open. Write our OWN: editing passages,
   visual texts (poster / webpage / post), narrative and non-narrative passages with questions,
   and summary tasks, each with a scheme in the bank's shape. The banked rows guide the shape,
   question types, mark spread and difficulty; nothing is copied or lightly reworded
   (`docs/CONTENT-POLICY.md`). Once enough own sets exist, Practise serves those and the
   school rows go back to grounding only. A first target: 15 editing passages, 12 visual texts,
   12 narrative + 12 non-narrative comprehension sets (each non-narrative with a summary).
2. **A bench for the Practise checker.** Seeded answers per question (full marks, half, wrong,
   lifted-from-the-passage, right idea in other words), the same answer read twice, truth-free
   checks — like the humanities bench (`SPEC-HUMANITIES.md` §4). Gate before any opening.
3. **A bench for essay marking.** Seeded essays by band + consistency. Real marked student
   essays when Adrian can get some — still owed by him.
4. **A skill picture per student.** From `english_practice_attempts` and the essay runs: which
   question types lose marks (inference, language use, summary content, editing by error kind).
5. **Practice by question type**, weakest first (needs 1 and 4).
6. **A timed paper** in exam shape (Paper 1, then Paper 2), once there are enough own sets.
7. **Oral (Paper 4).** A planned-response prompt with a video/visual stimulus, the student
   speaks, feedback on content and delivery. Needs a design talk with Adrian first (recording,
   storage of a child's voice, consent) — do not build before that.
8. **Listening (Paper 3).** Last; needs our own recordings.

Then, only on Adrian's word: **English Literature** (prose, unseen poetry, drama; band
descriptors are published in the syllabus) on the essay marker.

## Rules that bind

- Every switch stays closed. Opening any of them is Adrian's decision.
- No school or national passage or question is served to a student.
- The app never names Adrian or a model; no disclaimers; readability rule (CLAUDE.md).
- Model for the English checks is `claude-sonnet-5` (env `ENGLISH_CHECK_MODEL`); these models
  think first — keep `max_tokens` generous and read replies with `anthropicText`.
- Bulk writing is a batch: `docs/FANOUT.md`, agents report once. Tell Adrian the cost before
  starting — the plan's weekly meter was past 70% on 7 Oct 2026, and the Humanities build and
  the WhatsApp build are running at the same time.
- Each new student surface: a `timed()` check in `/api/health-check`, a `docs/APP-MAP.md` row,
  tests beside every pure function. Commit + push `dev` each turn that changed code; promote
  only on Adrian's word.

## Still needed from Adrian

- Real marked English essays and Paper 2 scripts, if he can get any.
- The decision on voice recordings before Oral is designed.
