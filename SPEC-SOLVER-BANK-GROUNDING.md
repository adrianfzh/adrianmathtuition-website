# Ground the chat solver on the question bank

**Status:** specified 9 Sep 2026 — **BUILT 10 Sep 2026** in the **bot** repo
(`~/dev/adrianmath-telegram-math-bot`, `lib/solver-grounding.js` + `ai/embeddings.js readPhotoText`
+ the two prompt rules; bot CLAUDE.md §Solver bank grounding is the runbook). Items 1–3 below are
live on the Telegram photo path; item 4 (what a low-confidence answer may do) is unchanged — still
Adrian's policy call, though a solver that DISAGREES with the paper's key now reaches him as a card
with verdict buttons and files the row Low. Verified by replaying the incident photo through
`scripts/replay-photo.js`: median **46**, y = 60, no "matches your reading", BANK:AGREE; the
rules-only control (`--no-bank`) named the right axis but still read 50 off the angled photo.
Not wired: the web chat's image path.

## The incident that produced this spec

Telegram chat `1884447512` (username `sobbin4soobin`, 100 questions logged, **not
linked to any student record**) photographed CCHMS 2025 EM Prelim P1 Q18 — a
cumulative-frequency curve — and asked the bot to solve it.

The bot read values off the photo and got every one of them wrong. Worse, it
**agreed with the student's own readings** each time:

| | bot told her | the paper |
|---|---|---|
| (a) median | "median ≈ 50 marks ✅ **(matches your reading)**" | **46** |
| pupils scoring < 40 | 30 — "Good, that confirms the reading I used" | **26** |
| (c) probability | 75/158 ≈ 0.475 | **351/790 ≈ 0.444** |

(26 is forced by the paper's own answer: 2·n(80−n)/(80·79) = 351/790 ⟹ n = 26.)

Three separate failures compounded:

1. **It asserted precise values read off a low-resolution photo of a graph.** A CF
   curve photographed at an angle cannot support a confident ±1 claim.
2. **It anchored on the student's visible answer.** Her "50" was written on the page
   in the photo; the bot saw it and certified it. The same "✅ (matches your work)"
   pattern appears in her earlier questions — it is a habit, not a one-off.
3. **The bank already held the answer and was never consulted.** The question is in
   the bank as *Chung Cheng High (Main) 2025 EM Prelim P1 Q18* with
   `(a) 46; (b) y = 60; (c) 351/790`.

The cross-check caught the disagreement and alerted Adrian — but the answer had
**already been sent**. `Confidence: Low` was recorded on both messages and they went
out anyway.

## What already exists

`lib/bank-grounding.js` does exactly the needed matching — photographed question →
the bank's typeset copy — and is proven in production. It has exactly one caller:

```
ai/paper-marker.js:1365   →  fetchBankGroundTruth({ parsed, printedOpenings, subject, runId, sb })
```

**Marking is grounded on the bank. The chat solver is not.** `ai/marker.js` (the
Telegram photo Q&A path) never asks.

## The build

### 1 · Call the existing grounding from the solver

In the photo-solve path, before answering:

- build a paper key with `parsePaperKey({ paperName, studentName, firstPageText })`
  from the photo's own text (`lib/paper-key.js`);
- call `fetchBankGroundTruth(...)` with the printed openings the vision pre-pass
  already extracts;
- when a row matches with the same confidence bar marking uses, put the bank's
  `answer` (and `solution` when present) in the solver's context as **ground truth,
  not a hint**.

A matched bank answer that disagrees with the model's own working is a **stop**, not
a tiebreak: say so, give the bank's answer, and show the method.

### 2 · Never confirm a value the student has already written

Remove the "✅ (matches your reading/work)" behaviour from the solver prompt. The
student's own answer, visible in the photo, must not be treated as evidence. Derive
independently, then state agreement or disagreement plainly — and when they differ,
lead with the difference.

### 3 · Treat a value read off a photographed graph as low-confidence by construction

Reading a coordinate off a scanned/photographed curve is not a computation. The
solver should give the method and its own read, explicitly flag that the read is
approximate, and ask the student to check it against their own copy — which it did
for part (b) and abandoned for (a).

### 4 · Decide what a low-confidence answer may do

Today `Confidence: Low` sends to the student and notifies Adrian. That is the choice
that let this reach her. Options, for Adrian:

- **hold** — low-confidence answers wait for his release (safest, slowest);
- **hedge** — send, but without a stated numeric answer, method only;
- **today** — send as-is and alert (status quo).

This is a policy decision, not an implementation detail. It belongs to him.

## Verification

Not "the tests pass" — replay this exact question through the solver and require:
the median comes back **46**, no "matches your reading" phrasing appears, and the
bank match is recorded on the logged row so the grounding can be audited later.

Then re-run a sample of `Confidence: Low` rows from the Airtable `Questions` log
(field `Confidence`) and count how many change answer once grounded. That number is
the size of the problem this fixes.

## Notes for whoever builds it

- The bot's `main` can lag what is deployed on Fly — verify before building on it.
- A push to the bot's `main` auto-deploys; the Checks job must go green first, and a
  red check skips the deploy **silently**, so check `gh run list` after pushing.
- Never `git worktree` the bot repo (`core.worktree` trap).
- `questions.answer` in the bank is the school's key and is not always right — this
  session found a North Vista IQR answer that disagrees with its own data. Treat a
  bank/model disagreement as a flag for Adrian, not as automatic proof the model is
  wrong.
