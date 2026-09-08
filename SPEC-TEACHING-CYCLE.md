# SPEC-TEACHING-CYCLE — the repeatable per-student round

> **Status: THIS IS THE CURRENT FLOW (Adrian, 30 Aug 2026).** Run once end to
> end for Alessi Tay (AM 2021 P1). The origin ask: *"besides practice questions
> (which are kind of passive), are you able to identify each area (pedagogy now)
> that the student is weak in … produce a report, come up with useful teaching
> materials (say worked examples) that can be sent to the student to self
> study, then practice that relevant / similar question that they got wrong,
> then submit for marking through app…"*
>
> The portal-automated version — a drafted plan Adrian activates, the student
> clearing drills in `/app/fixit` — is **a LATER build**, already spec'd and
> built but deliberately not in use: [`SPEC-REMEDIATION.md`](SPEC-REMEDIATION.md).
> Until Adrian says otherwise, THIS file is the flow.
>
> Machinery lives elsewhere: [`SPEC-ASSIGN.md`](SPEC-ASSIGN.md) (assignment
> rails), [`docs/MARKING.md`](docs/MARKING.md) (marking → triage → release),
> `AdrianMath/teaching_style/FEEDBACK.md` (binding authoring style),
> [`IDEAS.md`](IDEAS.md) (queued builds that shorten the round).

## The round

Owner: **A** = Adrian (never automate), **S** = system, **C** = a Claude session.

| # | Step | Owner | Notes |
|---|---|---|---|
| 1 | Mark the paper | S | `/admin/mark-paper` — ▶ Mark or 🌙 Queue |
| 2 | **Vet the marking** | **A** | triage: agree / override the flagged questions. **Checkpoint** |
| 3 | Diagnose | C | from the run's **failed question prompts + the student's own working + error summaries** — never the marker's topic labels (grounding rule). Output: marks lost by loss class (blank / procedure / discipline / concept) + a teaching brief for Adrian |
| 4 | **Pick the wave** | **A** | ONE cluster this round. Everything else is shelved WITH its evidence (question, part scores, annotated page). **Checkpoint — teaching judgment** |
| 5 | Author the sheet | C | Example → Practice pairs in Adrian's style; worked examples reproduce the failed question's SHAPE with changed numbers; **every answer verified computationally** |
| 6 | **Amend the sheet** | **A** | he edits the DOCX. **Checkpoint — his name is on it** |
| 7 | **Release together** | **A** | the marked copy AND the sheet reach the student in ONE delivery: release the run + assign the sheet, with a note tying them ("read your marked paper, then work this"). A bare score with the remedy arriving later is the thing this step exists to prevent |
| 2–7 | **→ the marking desk** | A | **Since 2 Sep 2026 steps 2–7 happen on ONE screen — [`/admin/desk`](SPEC-MARKING-DESK.md).** **Since 8 Sep 2026 the paper goes out by itself** once it clears the accuracy gates, and **a sheet exists only when someone asks for it**: Adrian's 📘 Queue on the desk (3–5 run headless; he vets it and releases it — then it is COMPULSORY and the app reminds the student until it is handed in) or the student's **Request Practice Again** button in the app (goes out on its own once written and checked). See the amendment below |
| 8 | Student works + hands in | — | on paper → photo → `/app/submit` (or the assignment's 📷 button) |
| 9 | Mark the hand-in | S | the normal pipeline — auto-release live since 8 Sep 2026, the same gates as any hand-in |
| 10 | **Vet after release** | **A** | the sign-off checkpoint sits AFTER release since 8 Sep 2026 — he looks at the returned work on the desk's Completed lane; an override re-issues the copy. **Checkpoint** |
| 11 | Next wave | A | pull the next cluster off the shelf → back to step 4 |

**Release happens at step 7, not before** — *as written on 2 Sep 2026.* **Amended
8 Sep 2026:** the marked copy goes out the moment it clears the gates (marking is
near-fully accurate); the remedy follows only when asked for. A sheet Adrian
queues and releases arrives on the paper's own page in the app and is
compulsory; a sheet the student asks for arrives when written. The "bare score
with the remedy later" worry is answered by the request button on every marked
paper and by the reminder that a compulsory sheet is still to do.

The four human checkpoints — vet the marking, pick the wave, amend the sheet,
vet the return — are the moat (standard, accountability). Automate around them,
never through them.

## The rules that bind every round

1. **Grounding** — build from the student's actual failed questions, never from
   the marker's topic labels. (Cost two rewrites on the first run: "Exponentials
   and logarithms" hid a change-of-base log equation; "Circle theorems" hid an
   A-Math plane-geometry proof.)
2. **One wave at a time** — deliberately leave topics out rather than
   overwhelm. Deferred topics carry their evidence forward.
3. **Completeness** — nothing goes out as bare questions: every practice item
   carries its teaching (a worked example on the sheet).
4. **Style** — `AdrianMath/teaching_style/FEEDBACK.md` is binding: teaching
   lives inside the annotated example, plain skill-phrase headings, teach by
   contrast, chained examples, escalating practice, tight colour semantics,
   equation steps aligned at the `=`.
5. **Verify** — every worked and practice answer recomputed (sympy) before the
   sheet is shown to anyone; figures verified from their coordinates.
6. **Auto-release, checkpoint after** (was "no auto-release in this loop" until
   8 Sep 2026) — the student's returned work goes out through the same gates as
   any hand-in; Adrian's sign-off sits after release, and a compulsory sheet is
   reminded until it is handed in.

## Amendment — Practice Again on request (8 Sep 2026)

Adrian: *"when student hands up a paper via the student portal or telegram
handin, should just auto mark their paper and released (marking is almost fully
accurate), and allow them to request for Practice Again worksheets, so only
generate when they request. Optionally, i can generate for them by clicking on
desk, and vetting it and asking them to do → that is compulsory, so we should
build a mechanism that reminds them it is not done."*

- **No sheet is written unless someone asks.** The auto-queue on tagging /
  marking done / the ScanSnap sweep / the bot's hand-in path is gone.
  `lib/sheet-queue.ts` has two doors: `queueSheetJob(runId, {requestedBy})` and
  `requeueSheetAfterRemark`, which only REPLACES a sheet that already exists.
- **Adrian's door** — 📘 Queue on the desk (`POST /api/admin/sheet-jobs`,
  `sheet_jobs.requested_by='adrian'`). When it lands it keeps the 12-hour clock /
  hold rules; when released (desk tap or clock) the assignment carries
  `portal_assignments.required_at` — **compulsory** — and
  `/api/cron/practice-again-reminders` (daily 9am SGT) nudges the student on
  day 3, then weekly, four times at most, Telegram + push, one summary line to
  Adrian. The hub shows "📘 N Practice Again sheets you set, not handed in".
- **The student's door** — **Request Practice Again** on their marked paper in
  the app (`/app/marking/[id]`, `POST /api/portal/practice-again/request`, their
  own released run only, `requested_by='student'`). When the worker finishes,
  `sheet-jobs` runs the same gate (`autoReleaseGate` — the example check; the
  paper's accuracy signals are watch-outs on Adrian's line, not holds) and, if
  clean, sends it AT ONCE through
  `release-with-sheet` — no clock, not compulsory. A gate failure holds it on
  the desk and Telegram says the student asked. The app shows where the sheet
  is (being written · Adrian is checking it · nothing worth practising).
- Rows 2–7, 9, 10 and rule 6 above are read with this amendment.

## How a round is started

**Today:** ask a session — *"run a teaching round for \<student\>"* or *"self-study
notes from \<student\>'s latest marked paper"*. The session runs steps 3–5,
proposes the wave for approval, returns the DOCX for amendment.

**Queued builds that shorten it** (see IDEAS.md):
- **Release-with-sheet as ONE action** — today step 7 is two taps (triage
  Release + create the assignment); it should be one, with the nudge naming
  both.
- 📘 **Self-study notes button** → job queue → headless Mac worker
  (plan-billed) → DOCX into Dropbox `Apps/AdrianMathNotes/Self-Study/` →
  Telegram.
- 🧺 **Student shelf — BUILT 2026-09-02** (`student_shelf` + `/api/admin/shelf`;
  design agreed 2026-08-30). Doors in: 🧺 Shelve beside lost-marks questions in
  `/admin/desk` (triage retired 8 Sep 2026) + `/admin/papers` (evidence auto-grabbed from the run's
  result_json), 🧺 Shelve-or-✕ when pruning a game-plan draft on
  `/admin/remediation`, and the API. Views out: "🧺 On the shelf" on
  `/admin/students/[id]` (evidence expand, done/reopen, "🎯 Draft game plan from
  these" feeding the remediation draft pipeline), the "Later" lane on
  `/admin/remediation`, and a "🧺 wave 2 waiting: N topics" line on the 🎯
  plan-finished Telegram. Admin-only; no auto-shelving, no reminder cron.
- **Auto-tag suggestion** on mark-paper (112 of 123 runs carry no student, so
  they reach no profile, report or round).

### Stopping a sheet (31 Aug 2026)

While a sheet is queued or being written, the 📘 button on the paper row *is*
its cancel (📘✕) — the way out lives where the mistake is made. Adrian mis-tapped
📘 beside 🗑 on a phone-sized row and a second sheet started building for a paper
that already had one; undoing that took a hand-written DELETE, because
`sheet_jobs.status` had no value meaning "I changed my mind" and `failed`
requeues.

`cancelled` is now a terminal status: `pickNextJob` never returns one (asserted
in the tests, both as queued work and as an expired lease), `done` on one is
refused so no Telegram fires, and `fail` on one does not requeue it. A **running**
session learns it through the heartbeat — a `409 {cancelled:true}` means stop
where you are, file nothing, call neither `done` nor `fail` — which is why the
runbook beats at every stage rather than only near the lease edge. A queued sheet
cancels without a confirm (it is the undo for a mis-tap); one already being
written asks first.

## Reference instance — Alessi Tay, 30 Aug 2026

AM 2021 P1 re-marked to 50/90 (four re-marks; accuracy fixes shipped between
them), vetted, released. Diagnosis across two papers: ~29 marks lost to
unwritten first moves vs ~12 to wrong execution. Wave 1 = exp/log first moves +
calculus procedure rules + sign discipline; sheets "First Moves" v3 and
"Calculus Essentials" v2 (both fully verified), which Adrian re-cut into one
4-page "Practice Again" sheet. Shelved for wave 2: Polynomials, Plane Geometry,
Integration (Area) — each with its question, score and annotated page. Release
and assignment went out separately on this first run; step 7 exists so the next
one doesn't.
