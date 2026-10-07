# Writing a Social Studies case study — the brief (A1, 7 Oct 2026)

For whoever writes sets s12–s40 (a session or its agents). Follow it to the letter.
The worked example is **s11** in `data/humanities/social-studies/case-studies.json` — read it first.
The level schemes are `data/humanities/social-studies/schemes.json` (the six source skills only).

## What one case study is

One JSON object, the same shape as s11:

- `id` (`sNN`), `theme` (`citizenship` · `diversity` · `globalised`), `title` (9 words at most),
  `issue` (one question).
- `background` — 50 to 160 words, two or three short paragraphs. It sets the scene with facts,
  takes no side, and ends "Study the sources to find out …".
- `sources` — 5 or 6, lettered A, B, C … Each has a `provenance` line (who, what kind of
  source, when or to whom) and a `text` of 25 to 130 words.
- `questions` — exactly five, ids `sNN-q1` … `sNN-q5`, marks **5, 6, 7, 7, 10**.
  - Q1: `inference` (a message question) or `purpose`.
  - Q2: `comparison` of two sources.
  - Q3 and Q4: from `reliability`, `usefulness`, `purpose`, `inference`. At least three
    different skills across Q1–Q4. The skill pattern for each set is in the table below.
  - Q5: `how_far` — opens with the statement in single quotation marks, then "Using the
    sources in this case study, explain how far you would agree with this statement."
    It names every source.
  - `sources` on a question = the source(s) it names. A student sees all the sources and
    may cross-refer to any of them.
- `seeded` on every question — one answer at each level of that skill's scheme
  (inference 3 levels, the rest 4).

## Rules for the sources

1. **Ours.** Never copy, paraphrase or number-swap a school or national paper
   (`docs/CONTENT-POLICY.md`). The bank is a guide to shape only.
2. **No real named person, party, company, school or organisation speaks.** A source is from a
   role: "a hawker", "a town council", "a ministry spokesperson", "an environment group",
   "researchers at a university". Never put words in a real named person's mouth.
   No invented statistic is pinned on a real named body.
3. **Singapore-flavoured, but the case is made up.** A real policy area is fine (water prices,
   housing, hiring); the estate, the scheme's details and the numbers are ours.
4. **Sources must disagree usefully.** At least two lean each way on the Q5 statement, and at
   least one is mixed. At least one has a clear motive to shade the truth (it is promoting,
   defending or campaigning). At least one can be checked against another (a figure, a claim).
5. **Mix the kinds**: a poster or advertisement (as words), a speech, a letter, an online post,
   a report or survey, an interview. No pictures or cartoons — text only.
6. **Plain words.** A Sec 3 student reads it once and understands. No long dash. No quotation
   marks inside a source (a seeded answer must be able to quote it cleanly) — write "said the
   vote was fairer", not "said the vote was 'fairer'". Avoid plural possessives (residents').
7. **Care with race, religion and nationality** (the diversity sets): no group is the villain;
   no slur, no stereotype stated as fact, even in a source a student is meant to criticise.
8. Never the tutor's name, never a model's name, no disclaimers.

## Rules for the seeded answers

- Each answer is written to sit **exactly** at its level in the scheme, by doing what that
  level's line says and nothing from the level above. Read the scheme's `levels`, `note` and
  `slips` before writing.
- Build upward: Level 3 is usually Level 2 plus the next move. A higher level is longer.
- **Every quotation is in single quotation marks and is in the source word for word**
  (the provenance line counts). The checker fails the set otherwise.
- Level 1 has no quotation doing real work. From Level 2 up (Level 3 for inference) there is
  at least one quotation.
- Write as a good student writes: short sentences, one idea each. No "he" or "she" for a
  source's author — "the writer", "the speaker".
- The top answer is shown to students as the model answer. It must be right and readable.
- 330 words at most.

## Before handing a set back

```
npx tsx scripts/humanities-bench/check-set.ts <your file>.json
```

It must print `sNN: fit to list`. Then read your own set once more as a marker: for each seeded
answer, name the level line it meets and check it does not also meet the next one.

Write each set to `data/humanities/social-studies/drafts/sNN.json` (one object per file). Do not
edit `case-studies.json`, do not commit, do not push. Report once, at the end: the ids written,
and anything you were unsure about. No progress messages.

## The sets

Pattern = the skills of Q1–Q4 in order (Q5 is always `how_far`).
P1 inference · comparison · reliability · usefulness. P2 purpose · comparison · usefulness · reliability.
P3 inference · comparison · usefulness · purpose. P4 inference · comparison · purpose · reliability.

| id | theme | the case | pattern |
|---|---|---|---|
| s11 | citizenship | Residents vote on the upgrading budget (done — the example) | P1 |
| s12 | citizenship | Raising the price of water | P2 |
| s13 | citizenship | Closing a neighbourhood school with few pupils | P3 |
| s14 | citizenship | A citizens' panel on cutting food waste | P4 |
| s15 | citizenship | Banning e-scooters from footpaths | P1 |
| s16 | citizenship | Second-hand smoke between neighbouring flats | P2 |
| s17 | citizenship | Raising the retirement age | P3 |
| s18 | citizenship | Keeping an old market building or building homes on it | P4 |
| s19 | citizenship | Volunteers running a community fridge | P1 |
| s20 | citizenship | Heavier fines for littering | P2 |
| s21 | diversity | New citizens and a neighbourhood welcome programme | P3 |
| s22 | diversity | Sharing the void deck for different events | P4 |
| s23 | diversity | Mixing households of different races in each block | P1 |
| s24 | diversity | Help by community groups or help by income alone | P2 |
| s25 | diversity | Dialect classes for the young | P3 |
| s26 | diversity | A festival street closure and the shops nearby | P4 |
| s27 | diversity | Job applications with the name hidden | P1 |
| s28 | diversity | Pupils with special needs in the same classroom | P2 |
| s29 | diversity | Paid enrichment classes and a free tuition scheme | P3 |
| s30 | diversity | A shared canteen menu at school | P4 |
| s31 | globalised | A foreign chain opens where local shops stood | P1 |
| s32 | globalised | A factory moves its work abroad | P2 |
| s33 | globalised | Buying from overseas sellers online | P3 |
| s34 | globalised | Foreign pop music and local musicians | P4 |
| s35 | globalised | A cyber attack on a clinic chain | P1 |
| s36 | globalised | Scam calls from overseas | P2 |
| s37 | globalised | Working from home for a company abroad | P3 |
| s38 | globalised | Imported food and a push for local farms | P4 |
| s39 | globalised | Foreign students in a university town | P1 |
| s40 | globalised | Tighter checks at the border | P2 |

## After the writing (the orchestrating session)

1. Run the checker on every draft; read each set (rule 2 and rule 7 are judgement, not code).
2. Add the passing sets to `case-studies.json`; `npm test`; push `dev`.
3. Bench on the preview: `npx tsx scripts/humanities-bench/run.ts --base <preview> --name a1-<date> --sets s12,s13,…`
   — gate as SPEC §4. A set with a seeded answer the reader does not place is fixed or dropped,
   and the disagreements go to Adrian.
