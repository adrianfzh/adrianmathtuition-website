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
| 8 | Student works + hands in | — | on paper → photo → `/app/submit` (or the assignment's 📷 button) |
| 9 | Mark the hand-in | S | the normal pipeline; auto-release stays PAUSED for this loop |
| 10 | **Vet before release** | **A** | so progress is monitored, not merely recorded. **Checkpoint** |
| 11 | Next wave | A | pull the next cluster off the shelf → back to step 4 |

**Release happens at step 7, not before.** Steps 3–6 run while the marked copy
is still held in triage; the student sees marks and remedy at the same moment.

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
6. **No auto-release in this loop** — the student's returned work waits for
   Adrian's tap.

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
  `/admin/mark/triage` + `/admin/papers` (evidence auto-grabbed from the run's
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
