# SPEC — Science paper marking (Physics first)

> Drafted 2026-08-26 at Adrian's ask ("is it possible to extend this marking pipeline
> to mark science papers? … spec it"). Companion to [`SPEC-SUBJECTS.md`](SPEC-SUBJECTS.md)
> (the subjects-expansion source of truth — rubric-as-spine, calibration gate) and
> [`docs/MARKING.md`](docs/MARKING.md) (the pipeline this extends). Status: the brains,
> the subject switch, scheme grounding and the calibration layer were BUILT 2–3 Sep 2026
> (see §"What was built"); the Science tab + free student marking are the 10 Sep 2026
> decision below. Nothing has passed the calibration gate yet.

## Principle

The marking pipeline splits cleanly into a subject-agnostic **chassis** and a
math-specific **brain**. Science marking = same chassis, new brain per subject, gated
by the same trust machinery (triage + release) and the SPEC-SUBJECTS calibration bar:
**Adrian hand-marks 10–15 real scripts per subject; the AI must land within ±2 marks
of him before anything is released to a student.**

**Chassis (transfers as-is, zero changes):** intake (photos/PDF, spread-split, hi-res
originals), page classification (`page_kind`), 🌙 queue + Batch API, Gemini
tick-grounding + the whole red-pen layer (score rail, two-colour ink, SEAB-style code
boxes), PDF assembly + pagination, Dropbox filing, triage + release gate, answer-key
cross-check, `/app/submit` + `/app/marking`.

**Brain (per subject):** the marking system prompt — how to derive ground truth, the
severity/deduction model, the notation of the codes, the solution-presentation rules.

## Why Physics first

| | Ground truth derivable? | Code-exec verifiable? | Scheme dependence |
|---|---|---|---|
| **Physics** | Mostly — numericals from givens | Yes (units, s.f., algebra) | Low-medium |
| **Chemistry** | Often — mole calc, equations balance | Yes for calc; concept Qs less | Medium |
| **Biology** | Rarely — answers ARE scheme points | No | **High — scheme near-required** |

Physics is closest to math: solve-it-yourself + arithmetic verification carry over
almost unchanged. Biology inverts the doctrine — marking is matching prose against
"any two of:" point lists, so the **official scheme becomes an input**, not a
cross-check. Order: **Sec Physics → Sec Chemistry → Combined Science → Biology**
(Bio only with schemes in hand).

## The Physics brain (v1 scope)

New `PHYSICS_MARK_SYSTEM` beside the math prompts in `ai/paper-marker.js`, selected by
a `subject` field on the marking request (default `math` — nothing changes for math):

- **SOLVE step:** derive the answer from the printed givens; **carry units through
  every line** and verify numerics with code-exec. Anti-anchoring + setup-before-
  arithmetic rules carry over verbatim (a wrong formula computed correctly is the
  same trap in physics).
- **Deduction model:** SEAB physics convention — method/substitution/answer marks;
  **unit errors and s.f. errors cost the answer mark** (configurable severity);
  ECF across parts as in math. Codes stay M/A/B shorthand (schools use variants;
  the box/tick rendering is notation-agnostic).
- **Definition/explain questions:** marking points, not prose quality — the severity
  rules' "explain" section carries over, plus a physics keyword discipline (a
  definition missing its qualifying condition — "per unit *time*", "in a *vacuum*" —
  is the DEFINITION COMPLETENESS case, −1 with the missing words named).
- **Diagrams:** ray diagrams, circuit reading, graphs — reuse the sketch
  feature-by-feature rules; the margin-figure system gains kinds only when
  calibration shows the need (candidates: circuit fragment, ray box). Not v1.
- **Answer key:** same cross-check layer; for physics it should be encouraged —
  Adrian attaches the school's answer page where he has it.

## Data & plumbing (small)

- `paper_marking_runs` gains `subject text default 'math'` (one migration); runs
  filter cleanly per subject in `/admin/papers`, triage, and the bleed table
  (bleed topics come from `topic_detected` — physics topics slot in unchanged).
- Mark-paper page: a subject picker next to the model picker (defaults math; the
  bot safelists like it does `style`). `/app/submit` unchanged until launch.
- The separate science Supabase projects (`SUPABASE_SERVICE_KEY_PHYS` etc.) are for
  the science QB/portal per SPEC-SUBJECTS — marking runs stay in the math project's
  `paper_marking_runs` with the `subject` column, so every existing surface keeps
  working (revisit only if science volume demands it).

## Calibration protocol (the gate)

1. Adrian picks **one hand-marked Sec Physics paper** (his marks = truth #1).
2. Run it through `scripts/eval-mark-model.js` with the physics prompt (the harness
   already supports prompt/model swaps — marking reads only, no side effects).
3. Compare per-question; iterate the prompt on the misses. Repeat over **10–15
   scripts**, tracking |Δ| per paper. Gate: **within ±2 marks per paper** and no
   confident-wrong award Adrian wouldn't forgive.
4. Only then: subject picker goes live for Adrian's own use; student release stays
   behind the same triage gate as math. `/app/submit` for science only after a
   month of Adrian-reviewed use.

## Explicitly out of scope (v1)

- Biology and essay-style marking (needs the scheme-as-input design — spec separately
  once Physics passes the gate; overlaps SPEC-SUBJECTS' L1 essay-rubric work).
- Practical/lab papers, MCQ bubbling (an OMR-ish feature, different machinery).
- Auto-detecting subject from the photos (the picker is one tap and never wrong).

## First concrete step

Adrian hands over one hand-marked Sec Physics paper (photos + his marked copy).
That single calibration run — physics prompt drafted, eval harness, diff against his
marks — is about a day, and tells us more than any further planning.

## What was built (2–3 Sep 2026) — the chassis has three science brains

Bot: `ai/subjects/{physics,chemistry,biology}.js` rules blocks appended to the shared
marking prompt by `ai/subjects/index.js` (math is the no-op — its prompts are byte-identical
to before); `paper_marking_runs.subject` (CHECK math|physics|chemistry|biology) is the switch,
set by `save-paper`. Grounding cascade per subject: attached scheme → stored scheme by
name/fingerprint (`paper_schemes`) → the science bank (adrianscience, `lib/science-grounding.js`)
→ rules alone. Biology without a scheme caps explain parts at medium confidence and notes
"marked without the school's scheme". `rules_version` stamps every run. Calibration:
`calibration_results` + `scripts/eval-mark-model.js --truth … --save` + `/admin/calibration`
(gate = 10 papers, 90% within ±2). Site: Subject picker on mark-paper, `/admin/schemes`,
the student gate `lib/mark-subject-for-student.ts`.

State on 10 Sep 2026: 178 runs, every one math; 2 calibration rows, both math; 25 stored
schemes, all math. No science paper had ever been through the marker.

## Decision, 10 Sep 2026 (Adrian) — free science marking for students, a Science tab

> "i can let students submit science papers to mark for free, but give a disclaimer, and
> also to ask them to submit mark scheme if they have (we can also extract from the papers
> to the qb) … two tabs (math, then science) at the top, each with their own full bottom
> menu … for the science tab, just put marking functionality first — no practice again
> for science … yes we do need marked papers for calibration."

**Why the biology rule stands.** A biology mark is a scheme point: "any four of five", with
the school's accepted wording. A correct paragraph that names other true facts scores 2/4.
The AI can judge whether the biology is right; it cannot know which points this school pays
for. Physics/chemistry numericals are derivable (the AI is the judge, B1/C1/A1 map onto M/A);
explain parts in every science are scheme-bound. So the brain does the best possible without
a scheme and says so — and the disclaimer says so to the student.

**The shape (built 10 Sep 2026, this section is its contract):**

1. **Two families, one app.** A top switcher **Math | Science** in the app shell; the
   bottom menu is per family (`components/PortalTabs.tsx` picks by pathname). Science's
   menu is marking first: **Home · Hand in · Papers** (`/app/science`, `/app/science/submit`,
   `/app/science/papers`). Nothing else for science yet — no Practice, no Practice Again, no
   Notebook. Everything under `/app/science/*` is science; everything else stays math.
2. **`paper_subject` widens** to `A Math | E Math | H2 Math | Physics | Chemistry | Biology |
   Other`. The math Papers list, Home counts and every math gate already filter with
   `subjectAllowed(account, paper_subject)`, which does not admit a science value, so science
   runs never appear on the math side; the science pages select by `subject <> 'math'`.
3. **Free for every student, with the disclaimer.** `SCIENCE_MARKING_OPEN_TO_STUDENTS = true`
   in `lib/portal-beta.ts`; the hand-in form's subject picker (physics / chemistry /
   biology) is honoured for any signed-in student — enrolment is not consulted
   (`resolveScienceSubject`). The math gate (`MARK_SUBJECT_OPEN_TO_STUDENTS`, enrolment-based)
   is untouched and still off. The disclaimer sits on the form AND on every science paper
   page: new, free, an estimate; explain answers are marked against standard syllabus points
   unless the school's scheme was attached; check it against your teacher's marking.
4. **Own daily slot.** One science paper per student per SGT day, counted separately from
   the math slot (`countHandinsToday(…, 'science')` = runs with `subject <> 'math'`); the
   bot's `/handin` count is math-only from the same day, so a science hand-in never spends
   the Telegram math slot.
5. **The scheme, if they have it.** "Mark scheme (optional)" on the science form — PDF or
   photos, uploaded under the student's own prefix (`submit-token?kind=scheme` allows pdf)
   and passed to `save-paper` as `source.scheme_source` (`{pdf_url}` or `{pages:[{url}]}`),
   the shape the admin attach already uses. The bot extracts it, grounds on it, and STORES
   it in `paper_schemes` keyed by paper — every later hand-in of that paper, by anyone,
   is grounded on it. *Phase 2 (not built): queue the stored scheme + paper into the science
   bank's extraction inbox so the questions land in the QB.*
6. **Release.** Auto-release as for math (free + disclaimer, no pre-release hold). The
   completion Telegram names the subject (🧪 physics). No Practice Again for science:
   `sheetQueueGuard` refuses a run whose `subject` is not math (status `science`) from both
   doors; the science paper page shows no sheet block. Post-release enrichment (revise map,
   notebook mistakes) is skipped for non-math runs — both are math-topic shaped.
7. **Calibration comes back later, one number at a time.** Students hand in FRESH papers,
   so no teacher-marked copy ever arrives with the hand-in (Adrian, 10 Sep 2026: "students
   will not hand this in … we won't get the marked copies"). The truth arrives a week later
   when the teacher returns the paper: every science paper page carries **"Your teacher's
   mark"** — one number (the total the teacher gave, out of the same max) →
   `POST /api/portal/science-truth` → one `calibration_results` row (`truth_source
   'teacher'`, `truth_label 'student-reported teacher total'`, `per_question []`). Whole-paper
   |Δ| is exactly the gate's unit; the dashboard reads it like any row. Editable once
   (a second POST updates the same row). The release message tells the student to come
   back with it.
8. **Calibration today, without students.** Cambridge "Example Candidate Responses"
   booklets (real scanned candidate scripts, examiner marks per part, commentary) —
   Physics 5054 (2014, 112 pp.) and Biology 5090 (2014) were downloaded 10 Sep 2026
   (physics: megalecture.com/wp-content/uploads/2021/05/5054_Physics_Example_Candidate_Responses_Booklet_2014_3.pdf;
   biology: megalecture.com/wp-content/uploads/2022/05/5090_Biology_Example_Candidate_Responses_Booklet_2014-1.pdf;
   Chemistry 5070 2015 exists on Scribd / the Cambridge support hub — the gcsetime host served
   HTML, not the PDF; a 2023 physics booklet on Scribd is examiner-WRITTEN, not real scripts); each
   grade-A/C/E set of Paper 2 pages is handed in as one admin upload named
   `CALIBRATION · Cambridge 5054 Physics 2014 P2 · grade A script`, biology with the
   booklet's own scheme attached, physics rules-alone; truth files from the examiner
   comments → `eval-mark-model.js --truth … --save`. Same board and marking codes as
   6091/6092/6093, 2014 content; per-question truth. Nothing Singapore-teacher-marked is
   published anywhere (SEAB publishes syllabuses and specimen papers only).
9. **Cost brake.** A marked paper costs ≈ US$0.37 on the Mac plan lane and a few dollars on
   the API lane; the daily slot is the brake. Watch `/admin/ops` marking-queue lag once
   science hand-ins start.

**First numbers (10 Sep 2026 evening, provisional — scored from the Mac's checkpointed page
reads, before the bot's assembly; the official `calibration_results` rows follow from
`eval-mark-model.js --save` once assembled):**

| script | examiner | marker | Δ | reading |
|---|---|---|---|---|
| Physics grade A (rules alone) | 64/90 | 65/90 | 1 ✅ | 26 of 33 parts agree |
| Physics grade C | 37/90 | 36/90 | 1 ✅ | 26 of 33 |
| Physics grade E | 20/90 | 29/90 | 9 ❌ | 11 parts over by one: a B mark for a half-right statement the examiner gave 0 |
| Biology grade A (scheme attached) | 61 on the parts handed in | 64 | +3 | five parts never reached the marker — the hand-in took one booklet page per question and Q1(c), Q2(c)(d), Q5(b) sit on the second page |
| Biology grade C | 36 | 41 | +5 | same gap; over-awards on explain parts |
| Biology grade E | 16 | 19 | +3 | same gap |

What it says: rules-alone physics is at the gate for scripts with real working, and lenient
on weak scripts — the shared severity rules give "getting close" a mark where a B mark is
all-or-nothing. Biology with the scheme still accepts wording the scheme rejects, about one
mark per explain question. Both are RULE findings for the physics/biology brains (candidate
edits, not yet made — three scripts each is evidence, not a gate). The biology re-run needs
the continuation pages included.

**Not built (deliberately):** the teacher-marked-copy tick (dropped — see 7); scheme →
science-bank extraction (5, phase 2); a science Ask tab (the web solver already answers
science for Sec 3–5 students via the existing Ask page); MCQ Paper 1; science error-kind
taxonomy (the nine math kinds are used as-is; biology's "missing point / imprecise term"
reads as `incomplete` / `concept`).


## Decision 11 Sep 2026 — ready to release, not released

Adrian: "put in the disclaimer, don't open it yet. i will see test through student
portal myself first. just keep things ready so that we can release at the moment's
notice." Built:

- **The release is a switch.** 🧪 "Science tab for students" on `/admin/mark-paper`,
  beside Mac plan only — an Airtable `Settings` row (`science_marking_open`) that
  `scienceMarkingOpen()` reads on every request (30 s cache). One tap opens the tab
  to every signed-in student; one tap closes it. No deploy. The code flag stays as a
  hard override. Adrian's admin preview sees the tab either way, and so does the demo
  student (`SCIENCE_PREVIEW_IDENTITIES`), which is how Adrian tests it as a student.
- **Feedback first.** A science paper page has no score pill in the header. The
  disclaimer says the total is an estimate and the comments are the part to use; the
  cover and the marked pages follow; then an "Our estimate" card with the total, then
  the teacher's-mark card, then "Was this marking useful?". The list card says
  `est. 31/40`.
- **"Was this marking useful?"** — 👍 / 👎 and an optional line, one Telegram line to
  the marking topic per tap and a `portal_event_log` row (`science:feedback`). This is
  the student's opinion of the feedback; the teacher's mark (rule 7) is still the only
  truth signal.

Calibration stays where the night of 10–11 Sep left it: physics A/C/E fail the ±2 gate
on single runs (A +3, C +3, E +8; per-part agreement 28/23/23 of 33), and one re-run per
script cannot separate a rule's effect from run-to-run noise. Next: measure the noise
(the same script three times under one rule), the biology dial list, Singapore
teacher-marked chemistry scripts.
