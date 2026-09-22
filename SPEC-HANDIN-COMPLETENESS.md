# SPEC — Missing questions at hand-in: ask the student before marking

Adrian, 22 Sep 2026, after Joey Goh Zhi Xuan's O-Level 2024 P2 came back without Q1(a),
Q1(d) and Q2:

> "then we should notify her of that before marking? do it in general for all
> submissions / and who is checking the marked papers to flag this again?"

Then: "missing-questions check at hand-in, spec first? — yes".

Status: **SPEC ONLY, 22 Sep 2026 — nothing built.** Follows the 5-step recipe in
CLAUDE.md §Building doctrine. Owner of the standard: Adrian. Related:
[`SPEC-PAPER-MATCH.md`](SPEC-PAPER-MATCH.md) (the paper key, bank, library and fingerprint
this reuses), `docs/MARKING.md`.

## Why Joey's gaps were not caught

The app already has a hand-in check (below). On Joey's run `9ab6da10` (15 photos, typed
name "O Level 2024 P2") it stayed silent, for three reasons:

1. **The page reader gave part labels without the question number.** Every page came back
   as `(b),(c)` / `(a),(b)` / `(c)` … — never `1(b)`, not even on Q3's first page. The
   checker only reasons about question NUMBERS, so it saw nothing.
2. **The checker only looks for whole questions missing from the middle.** It never looks
   for a missing part (Q1(d)), and never for a missing start (the first page began at (b)).
3. **The typed name had no subject**, so the paper key was `null` (`gce-has-no-school`,
   `no-level`) and nothing compared the photos against the real paper. The bank holds GCE
   2024 E Math P2 in full (Q1 a–d … Q9 a–c). Put side by side, the gaps are exactly
   Q1(a), Q1(d) and Q2, and photos 5 and 6 are swapped (Q5(a) before Q4(a)(iv)).

The marker later wrote "Not attempted: 1, 2, 3", which is wrong in both directions: Q1 and
Q3 were partly done. Nobody read it, because auto-release sends the paper out as soon as
it is marked. **Today nobody checks a marked paper for missing questions.** The desk
shows the line in small text, and that is all.

## What exists today (do not rebuild)

| Piece | Where | What it does |
|---|---|---|
| The pre-flight call | site `api/portal/submit` (when `!body.confirmed`) → bot `{phase:'preflight'}` | a `blocking` finding → 409 `{needsConfirm, findings}` |
| The student's warning | site `app/submit/submit-client.tsx` | amber "Before you send — check this" box; the button turns into "📤 Send anyway" → resend with `confirmed:true` |
| The page reader | bot `ai/paper-marker.js classifyPagesForContext` (Sonnet, `PAGE_CLASSIFY_SYSTEM`) | per page: printed question labels + verbatim openings |
| The checker | bot `ai/handin-check.js` (pure, tested) | whole-question gaps in the middle, duplicates, order, unreadable, orientation |
| The paper's identity | bot `lib/paper-key` `parsePaperKey`, `lib/bank-grounding.js` (`pickRowsForPaper`, `rowOpenings`, `sameOpening`), `lib/scheme-store.js isMatch` | name → key → bank rows, confirmed by the fingerprint (≥3 shared, ≥50 %) |
| The short-lived app line | site `lib/paper-notice.ts` (`result_json.student_notice`) | a 3-day line on the paper's card and at the top of its page; nothing is sent |
| The marker's "not attempted" list | bot `ai/paper-marker.js` (`unattempted_questions`) → desk "Not attempted: Q…" | question level, not part level |

Hand-ins over the last 30 days: **71 through the app, 0 through Telegram /handin.** So
Phase 1 is the app only.

## The flow to build

```
Submit (photos + typed name)
  │  preflight now also gets: paperName, subject, studentId, generatedPaperId
  ▼
① page reader: every part now carries the QUESTION it belongs to
  ▼
② the paper's own list of parts, when we can know it:
     printed bank paper → its generated_question_ids   (exact)
     named paper → bank rows by key; no subject in the name → try AM and EM,
                   and the fingerprint picks one                (grounded)
     otherwise → no list                                         (heuristics)
  ▼
③ compare: parts on the paper that no photo shows → missing
  ▼
④ the student answers: ➕ Add the pages  |  I didn't do these
  ▼
⑤ the answer is stored on the run → the marker and the desk use it
  ▼
⑥ after marking: backstop line in the app (3 days) + a ⚠️ watch-out for Adrian
```

### ① The page reader names the question for every part

`PAGE_CLASSIFY_SYSTEM` adds one field to each printed label: `question`, the whole
question it belongs to. It is taken from the printed number when the page prints one,
otherwise from the running header ("Question 3 continued"), otherwise
`continues:true` ("this carries on the question from the page before"). The checker then
carries the number forward, page to page, in code. Parts go down to the letter —
(a), (b) — never the roman numerals (i), (ii), because the reader often merges those and
the student gets asked about gaps that aren't there.

This changes what the marker reads as well, so **verify it on the golden bench before
it ships** (docs/FANOUT.md). No marking result may change, and the new field has to
read Joey's 15 pages as Q1–Q9.

### ② The paper's list

- **Printed bank paper** (`generated_paper_id` on the hand-in): the exact list is the
  bank rows it was printed from.
- **Named paper**: `parsePaperKey` → `pickRowsForPaper`. When the name has year and
  paper but no subject (Joey's case), try both the A Math and the E Math key. Keep only
  the one whose rows pass `isMatch` against the photos' openings (**thresholds
  unchanged**). If both pass or neither does, there is no list.
- The bank is the only source in Phase 1. The library PDFs need a model read, which is
  too slow while the student waits, and that read belongs to marking.
- Science and Languages: heuristics only in Phase 1.

### ③ The comparison

- **With a list:** match each photo's openings to a bank part by `sameOpening`, then by
  label within the matched question. A part the paper has and no photo shows is missing.
  A question with every part missing is reported as "Q2", not "Q2(a), Q2(b), Q2(c)". A
  missing trailing question is reported too, because the list proves it exists.
- **Without a list** (heuristics, all quiet by default):
  - today's rule for whole questions missing from the middle, kept as it is (including
    the rule that a hand-in with holes in more than half its range is homework, so say
    nothing);
  - a letter skipped inside one question ("3(a), 3(b), 3(d)" → Q3(c));
  - the first question starting at a part other than (a) → "the start of Q1".
  - Never a trailing gap and never a whole first question. Without the paper we cannot
    know it exists.
- **Stay silent when:** fewer than 3 photos; the reader failed; a Practice Again or
  From Adrian sheet (`assignment_id` — no stored part list; its sections are not exam
  parts); the typed name does not look like a paper and there is no list.

### ④ What the student sees

A new finding kind, `missing-questions`, with `blocking:true`. The existing amber box
shows:

> **We can't see Q1(a), Q1(d) and Q2 in your photos.**
> If you did them, add those pages. If you didn't, tell us so they're marked as not done.
>
> [ ➕ Add the pages ]  [ I didn't do these — send ]

- **➕ Add the pages** goes back to the photo picker with the photos kept. Sending again
  runs the check again.
- **I didn't do these — send** sends with `confirmed:true`, `handinAnswer:'not-done'`
  and the list.
- Other findings (order, duplicates) keep their "Send anyway" button.
- The copy says "app", never "portal". It never says "we don't have your paper", in line
  with SPEC-PAPER-MATCH's copy rule of 10 Sep 2026.

### ⑤ What the run records — `result_json.handin_check`

```
{ checked_at, list: 'printed-paper' | 'bank' | 'none', key,       // what we compared against
  missing: [{ q: 1, part: 'a' }, { q: 1, part: 'd' }, { q: 2 }],   // at the final send
  asked: [ … ],                                                     // what the first check found
  answer: 'not-done' | 'added' | 'sent-anyway' | null,
  pages_added: 0 }
```

- The submit route stamps this next to `portal_submission`.
- The marker reads it. `answer:'not-done'` makes those parts "not attempted (the student
  said so)", at part level, instead of the marker's own guess.
- The desk shows it. `sent-anyway` with a non-empty `missing` is a ⚠️ watch-out ("missing
  at hand-in, sent anyway"). It is never a hold: auto-release stays as it is.

### ⑥ Backstop after marking — the answer to "who is checking?"

Once marking is done, the paper has a trusted list, the marker found parts with no
working, and the student had NOT said "I didn't do these" for those parts:

- **The student** sees a new `student_notice` kind, `missing-questions`. It lasts 3 days,
  on the paper's card and at the top of its page, and nothing is sent:
  "This paper came back without Q1(a), Q1(d) and Q2. If you did them, hand those pages
  in." It opens `/app/submit` with the paper name filled in.
- **Adrian** gets the same line as a ⚠️ watch-out on the desk and in the auto-release ping.

Adding the pages to the SAME marked paper (append the photos, re-mark only those pages,
re-issue) reuses the page-by-page re-mark (docs/MARKING.md §Compartmentalised marking).
Appending pages to a marked run is the one new part, and it is Phase 3. Until then the
extra pages come in as their own hand-in, and Adrian joins them by hand.

## Checkpoints (what stays human)

- The student decides: add pages, or say they didn't do them. Nothing is refused and
  nothing waits.
- Adrian owns the standard for what counts as missing. The checker is quiet when unsure,
  and a finding he thinks is wrong goes into the regression tests.

## Triggers and logging

- Runs on every app hand-in with ≥3 photos, inside the existing pre-flight. It adds no
  model call: the reader returns one more field, plus one Supabase query for the bank rows.
- Stays fail-open, as now: any error, a slow bot, or no rows → no finding, and the hand-in
  goes through.
- The existing `[preflight]` log line gains `list=<bank|printed-paper|none> missing=<n>
  answer=<…>`. The Monday report counts: asked, added, not-done, sent-anyway, and the
  backstop lines that fired (each backstop line is a miss the check should have caught).
- Health-check: no new route. The pre-flight already runs inside `portal/submit`.

## Phases

1. **At hand-in, app only:** ① reader field (golden bench first), ② bank + printed-paper
   list with the AM/EM fallback, ③ comparison + heuristics, ④ the two buttons, ⑤ the
   stamp + the marker/desk reading it. Pure pieces in `ai/handin-check.js` with tests;
   Joey's 15 pages become a named regression fixture.
2. **The backstop:** the `missing-questions` notice kind + the desk watch-out + the Monday
   count.
3. **Later:** add pages to a marked paper; the library as a list source; science lists;
   the same question inside Telegram /handin (a reply in the student's own /done
   conversation, not a new message — Adrian's call, 0 uses in 30 days).

## Worked examples

1. **Joey, O-Level 2024 P2, 15 photos, no subject in the name.**
   - The reader now returns 1(b), 1(c) · 3(a), 3(b) · 3(c) · 4(a) · 5(a) · 4(a)(iv), 4(b)
     · … · 9(c).
   - The AM key has no rows that pass. The EM key passes the fingerprint → list = GCE 2024
     EM P2.
   - Missing: Q1(a), Q1(d), Q2. She sees "We can't see Q1(a), Q1(d) and Q2", plus the
     non-blocking order note for photos 5–6. If she adds the pages, they are marked. If she
     taps "I didn't do these", the desk says "Not attempted (student said so): Q1(a),
     Q1(d), Q2", not "1, 2, 3".
2. **A school prelim the bank doesn't hold, pages printed "3(a) 3(b)" then "3(d)".** No
   list, so heuristics: "We can't see Q3(c)". Nothing about Q12 onwards, because without
   the paper we cannot know Q12 exists.
3. **Homework, "Ex 5.2" named, photos show Q3, Q7, Q12.** Not a paper name, no list,
   holes in more than half the range → silent. Same for a Practice Again sheet.
4. **A printed bank paper (Print a paper, 8 questions), Q6 absent.** Exact list → "We
   can't see Q6".
5. **GCE 2024 AM P1, the student ran out of time after Q9.** The list shows Q10–Q12
   absent → asked; she taps "I didn't do these". No backstop line afterwards, because she
   already answered.

## Red lines

- **Never block a hand-in.** Every path has a send button. A checker that cannot run says
  nothing.
- **Never lower `MIN_SHARED` / `MIN_SHARE`** to get a list. A wrong list asks about
  questions from another paper, which is worse than asking nothing.
- **Never report a trailing gap or a whole first question without a list.**
- **Never ask about roman-numeral parts.**
- **Never send the student's working anywhere to find the list.** Only the reader's
  printed openings are compared, as in SPEC-PAPER-MATCH.
- **Never contact the student outside the app.** The backstop is a 3-day line on the
  paper, not a Telegram message (Adrian, 14 Sep 2026).
