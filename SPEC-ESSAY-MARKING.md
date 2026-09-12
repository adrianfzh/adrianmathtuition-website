# SPEC — Essay marking (English + Chinese)

> Drafted 12 Sep 2026 at Adrian's ask ("language will be an AI model's strong point,
> so how can we start building marking language essays? let's spec it"). Companion
> to [`SPEC-SUBJECTS.md`](SPEC-SUBJECTS.md) (the August research: rubric-as-spine,
> the ELLA teardown, phase L1) and [`SPEC-SCIENCE-MARKING.md`](SPEC-SCIENCE-MARKING.md)
> (the chassis/brain split this reuses). Status: **spec agreed 12 Sep 2026 (Adrian's four
> answers below), the English 1184 rubric seeded as data from the official document,
> nothing else built.**

## The three rulings this spec is built on (12 Sep 2026)

1. **Science needs calibration because calibration is trust, not build work.** The
   same is true here, and more so.
2. **Teachers disagree on essay marks.** "An essay marked by two different teachers
   may have wildly different results." So a single teacher's mark is not a truth to
   calibrate to, and the app must never present a point mark as if it were one.
3. **Language is what these models are best at.** The marking itself is not the risk.
   The risk is a confident number. So the product is the FEEDBACK, and the band is
   context at the bottom, never the headline.

What is stable across teachers, and therefore what the app can stand on:

| Stable | Not stable |
|---|---|
| The ORDER of essays in a class (which are stronger) | The absolute mark |
| The slips themselves — a tense error is a tense error | How many marks a slip costs |
| Whether the essay answers the question set | Where the band boundary sits |
| The same essay marked twice by the app gives the same band | The same essay marked by two teachers |

## Principle

**Feedback first. A band RANGE second. No point mark, ever.** Every report leads with
the corrected essay and the three habits to fix; the band range sits at the end with
one honest sentence: "an examiner-style read against the SEAB descriptors, not your
teacher's mark".

The pipeline is the marking **chassis** the math and science marking already run on
(hand-in, queue, review, release, the app's paper page, Telegram notify) with a new
**essay brain** and a new **report shape** — essays are text, not pages of working,
so the red-pen layer and PDF assembly are NOT reused; a text renderer is.

## What the student hands in

- **The essay**: typed or pasted text (phase E1), or a photo of the handwritten
  script (E2). A photo is TRANSCRIBED first and the transcript is shown to the
  student to confirm or fix before marking — a handwriting misread must never come
  back as a spelling error. Typed text skips this step.
- **The question**: the prompt as set, typed or photographed. Task fulfilment cannot
  be judged without it; an essay with no question is marked on language only and
  the report says so.
- **The kind**: English continuous writing · English situational writing · 华文作文 ·
  华文实用文 (electronic mail / 报章报道 etc.) · Higher Chinese versions. Level:
  Sec 1–4 (Sec 1–2 school essays are marked against the O-Level descriptors scaled
  down, and the report says "against the O-Level bar").
- **Optionally, the teacher's marked copy** — a photo of the returned script with the
  teacher's mark and comments. Stored as the calibration signal, never shown back as
  "the answer". This is how the ranking test (below) gets its data without Adrian
  marking essays himself.

One essay per student per Singapore day, the science rule, its own slot.

## What comes back — the report

In this order, top to bottom:

1. **The corrected essay.** The student's text with every slip marked in place: the
   wrong words underlined, the fix beside them, a two-word reason in the margin
   ("tense", "comma splice", "搭配不当"). The text stays the student's; nothing is
   rewritten wholesale. In the app this is HTML with the marks as tooltips and a
   toggle to hide them; on the phone it is readable at one glance per paragraph.
2. **Three habits to fix.** Not every slip — the three PATTERNS that cost the most,
   each with the count in this essay and one example from it. "Tense slips ×7: the
   story is told in the past but 'he walks in' — keep to 'walked'."
3. **Task and structure.** Did it answer the question set (each point the prompt
   demanded, ticked or missing); paragraphs with and without a controlling
   sentence; the opening and the ending, each in one line.
4. **Upgrades, at most five.** A sentence from the essay and a stronger version
   with the reason it is stronger ("shows instead of tells", "one image instead of
   three adjectives", 用具体动作代替"很伤心"). Never a list of fancy words.
5. **The band range.** Per criterion (Content and Language, or the Chinese
   criteria), a band with the descriptor sentence that fits, and a total as a
   range of about three marks. One line of disclaimer. Parents see the same.
6. **The trend (from the second essay on).** The habit counts across the student's
   last five essays: "tense slips 7 → 4 → 2". This is the line that goes into the
   parent digest.

The band is computed but never shown as a single number anywhere — not in the app,
not in Telegram, not on the desk, not in a digest.

## The error taxonomy — fixed codes, the moat

Counts per essay per student are what makes the trend and the digest possible.
Codes are fixed so that counts are comparable across essays and markers.

**English** (≤ 16): `tense` · `sva` (subject–verb agreement) · `article` ·
`preposition` · `word_form` · `collocation` · `spelling` · `punctuation` ·
`comma_splice` (with run-on) · `fragment` · `pronoun_ref` · `register` (situational
writing: wrong tone for the audience) · `vague` (cliché or empty phrase) ·
`paragraph` (no controlling idea / one paragraph doing two jobs) · `off_task` (a
point the question asked for is missing or the essay drifts) · `length`.

**中文** (≤ 14): `错别字` · `病句·成分残缺` · `病句·搭配不当` · `病句·语序不当` ·
`病句·重复累赘` · `标点` · `词语误用` · `成语误用` · `口语化` · `格式` (实用文的称呼、
署名、日期) · `离题` · `段落` · `篇幅` · `开头结尾`.

The marker may not invent a code. A slip that fits nothing is marked in place with a
plain reason and counted under no code. (Same rule as the eight error kinds in math
marking — `lib/error-kinds`.)

## Rubric and anchors as data

- **`rubrics`** — one row per (subject, level, essay kind, criterion, band):
  descriptor text, mark range, source document + version. **English 1184 is seeded
  — `data/rubrics/english-1184-writing.json`, transcribed verbatim from the
  2026 syllabus document (kept at `docs/rubrics/1184_y26_sy.pdf`).** The verified
  shape, which corrects the August note of "15 + 15":
  - **Continuous Writing /30 = Content /10 + Language /20.** Content has one
    criterion, "addressing the task"; bands 5→1 are 9–10 · 7–8 · 5–6 · 3–4 · 1–2.
  - **Situational Writing /30 = Task Fulfilment /10 + Language /20.** Task
    Fulfilment = the required points, awareness of purpose/audience/context, use of
    the given information; the same band marks as Content.
  - **Language /20** is the same descriptor table for both: organisation of ideas,
    clarity of expression, accuracy of language; bands 5→1 are 17–20 · 13–16 ·
    9–12 · 5–8 · 1–4. Band 5 reads "coherent and cohesive … ambitious vocabulary and
    grammar structures … complex vocabulary, grammar, punctuation and spelling used
    accurately"; band 3 "most ideas coherently presented … sufficiently varied to
    convey intended meaning … often used accurately".
  - So the **band range** the report shows is the two bands' mark ranges added:
    Content band 4 + Language band 4 = 20–24 out of 30. That is the honest width.
  华文 1160 / 高级华文 1116 Paper 1 写作 are seeded the same way in E2, from their
  own documents (the 1184 file's sibling links are on the SEAB syllabus listing page;
  the PDFs live on isomer-user-content.by.gov.sg, not under seab.gov.sg/files). Nothing
  here is typed from memory.
- **`essay_anchors`** — essays with a KNOWN band per criterion: school-issued
  exemplars, SEAB examiner-report samples where published, and later the app's own
  marked essays that Adrian or a teacher confirmed. Each anchor carries its
  source. The marker sees two or three anchors bracketing the likely band on every
  call; the calibration harness marks every anchor blind.
- **`essay_runs`** — one row per hand-in: text, transcript status, question, kind,
  level, the report JSON, the code counts, band ranges, model, cost, released_at,
  and the teacher's mark when the student attached one. Kept apart from
  `paper_marking_runs` — different shape, different renderers, and the desk's math
  lanes must not fill with essays. The desk gets an Essays lane of its own.

## The marking pipeline

1. **Intake** — `/app/essays/submit` (typed) or the existing photo hand-in with
   `kind: 'essay'`; the transcript-confirm step for photos.
2. **Mark** — ONE structured call: the rubric rows for that kind and level, the
   bracketing anchors, the code list, the prompt as set, the essay. Output is JSON:
   the in-place marks (offset, length, code, fix, reason), the three habits, the
   task/structure notes, the upgrades, the per-criterion band with its descriptor
   sentence. Model: the judging tier (Opus 5), not the reading tier — the whole
   value is judgment, and one essay is a few thousand tokens either way.
3. **Second read** — the same essay marked again with the anchors shuffled. If the
   two reads' bands differ by more than one band on either criterion, the report is
   held with a watch-out; if they agree, the reported band is theirs and the marks
   in place come from the first read. This is the consistency the app sells, so it
   is measured on every essay, not only in calibration.
4. **Belt** (pure functions in `lib/essay-marking.ts`, tested): every in-place
   mark's offset lands on the text it names; the habit counts equal the in-place
   marks with that code; no code outside the list; the band range is at most one
   band wide and never printed as a point; an essay with no question carries no
   task section; the text returned is the student's, not a rewrite (diff ratio
   check).
5. **Release** — the same door as science: released at once when the second read
   agrees (the 8 Sep 2026 rule — release everything, ping the watch-outs);
   Adrian's Telegram gets one line per essay with the band range and the three
   habits; a held essay waits on the desk with the two reads side by side.
6. **Trend** — `lib/essay-trend.ts` (pure, tested) folds the last five essays'
   counts; the report's trend card and the parent digest's line read from it.

## Calibration — what "trusted" means here

Not "within ±2 of Adrian". Three tests, all in `scripts/essay-calibration/` with the
results on `/admin/calibration` under subjects `english` / `chinese`:

1. **Consistency** — every anchor and every calibration essay marked twice, a day
   apart: the bands agree on both criteria in ≥ 90 % of pairs, and never differ by
   two bands.
2. **Ranking** — for each class set with a teacher's marks (≥ 8 essays, same prompt,
   same teacher): the app's ordering agrees with the teacher's ordering with rank
   correlation ≥ 0.7 (in words: the app and the teacher put the same essays at the
   top and the bottom; they may disagree on numbers). Per teacher, because teachers
   disagree with each other — the app cannot beat their disagreement, only match
   each one's order.
3. **Anchor fit** — every anchor marked blind lands in its known band, or one band
   away with the descriptor sentence explaining why.

Gate to open to students: 1 and 3 pass, and 2 passes on at least two class sets
per subject. Until then the report is visible to the preview identity and to
Adrian only. The switch is an Airtable Settings row like `science_marking_open`
(`essay_marking_open`), flipped from the marking page.

## Student surfaces

- A third family in the app's switcher: **Math | Science | Languages** with its own
  bottom menu Home · Hand in · Essays. Both languages live under one family; the
  kind picker chooses the subject.
- **The essay page** = the report above. The corrected essay first, habits, task
  and structure, upgrades, then the band range with its disclaimer, then the trend.
  A "Was this useful?" tap like science, feeding one Telegram line, never the
  truth signal.
- **Home card**: "Your last essay: tense slips 7 → 4. Hand in the next one."
- **Telegram**: the same one-line summary when linked; no essay hand-in by Telegram
  in v1 (typed text is easier in the app).
- **Parents**: the digest gets one sentence per language from the trend, in
  Adrian's voice, with no band unless Adrian chooses to include the range.

## The building doctrine, mapped

| Step | Here |
|---|---|
| Spec | this file + the `rubrics` and `essay_anchors` rows (the marker follows the rows, never a prose summary) |
| Tools | `/api/essays/*` routes, the marking call in the bot (`ai/essay-marker.js`), `lib/essay-marking.ts` + `lib/essay-trend.ts` pure and tested, a health-check entry per surface |
| Checkpoints | the transcript confirm (student); the second-read hold (machine); the calibration gate (Adrian flips the switch) — no per-essay human review once open, per the 8 Sep 2026 release rule |
| Trigger | the queue tick, as for papers; nothing waits on Adrian |
| Log + alarm | `job_runs` `essay-marking` stamp per tick, a `JOB_RHYTHMS` line, `essay-calibration` weekly |

**What stays human.** The STANDARD is not Adrian's here, and the spec says so: it is
the SEAB descriptors plus anchors, and the app's own consistency. Adrian's
accountability is in what the report claims — "an examiner-style read", never "your
mark" — and in the relationship line he adds to the digest. Novelty flags: an
unusual prompt kind, a second read that disagrees, an essay whose transcript the
student edited heavily, a teacher's mark two bands from the app's — all surface to
him, none are smoothed over.

## Phasing

| Phase | Ships | Needs |
|---|---|---|
| **E1** | English continuous writing, TYPED hand-in, the full report, preview identity only; the calibration harness with the three tests; the Essays lane on the desk | `rubrics` seeded from the 1184 document, ≥ 6 anchors, the essay brain, the belt, the report page. 3–4 days |
| **E2** | Photo hand-in with the transcript confirm; 华文作文 with its taxonomy and rubric; the switch | Handwriting transcription quality check on 10 real scripts; Chinese rubric seeded from 1160/1116 |
| **E3** | Situational writing and 实用文 (task points from the prompt, register, format); Sec 1–2 essays against the scaled bar | Prompt-point extraction; format rules per 实用文 kind |
| **E4** | The trend card, the Home card, the parent-digest line, "Was this useful?" | `lib/essay-trend.ts`; digest hook |
| **E5** | Open to students once the gate passes; a "rewrite this paragraph" follow-up task from the report (the assigned-instrument idea from SPEC-SUBJECTS, not a chat) | calibration results; `portal_assignments` kind `rewrite` |

JC General Paper is deliberately after E5: a different rubric family, argument
quality over language, and a different cohort. It reuses everything here when
its turn comes.

## Cost and model

One essay ≈ 4–6k tokens in, 2–3k out, twice for the second read: a few cents at the
judging tier. A hundred essays a week is under ten dollars. No batch API needed; the
queue's normal tick is enough.

## Out of scope (v1)

- Any point mark, anywhere.
- Rewriting the essay for the student (upgrades are five sentences, with reasons).
- Oral practice, reading aloud (SPEC-SUBJECTS L4 — its own build).
- A public model-essay library (L2) — later, and only with our own essays.
- Marking against a specific school teacher's style.

## Adrian's answers (12 Sep 2026)

1. **English first.** E1 = English continuous writing.
2. **Students see the band range**, at the foot of the report, with the disclaimer.
3. **No reading round** before the preview identity becomes a real student — the
   machine gate decides; his eye stays on the Telegram one-liners after release.
4. **Anchors: "not sure"** whether any school issues band exemplars. So E1 starts
   WITHOUT school anchors: the descriptors' own sentences pin the bands, the
   consistency test runs from day one, and anchors accrue from students who attach
   their teacher-marked copy (the ranking test needs eight from one teacher on one
   prompt — a whole class's returned essays, which one student can bring). Until
   two class sets have passed, the switch stays off.

## Open questions for Adrian (answered above; kept for the record)

1. **Which first: English or Chinese?** E1 assumes English continuous writing; if
   your students lose more on Chinese, swap.
2. **Show the band range to students, or to parents only?** The spec shows both,
   at the bottom, with the disclaimer.
3. **Do you want to read the first twenty reports before the preview identity
   becomes a real student?** The gate is machine-measured, but your eye on the
   VOICE of the feedback is worth one evening.
4. **Anchors**: do any of your students' schools issue band exemplars you can
   collect? Six per subject is enough to start.

## First concrete step

Seed `rubrics` for English 1184 continuous writing from the syllabus document
(verified, not remembered), write `ai/essay-marker.js` with the JSON shape above,
mark six anchor essays blind, and run the consistency test. If the bands hold, build
the report page. If they do not, the brain is not ready and nothing else is worth
building yet.
