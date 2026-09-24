# SPEC-PRACTICE-PHOTO — the Practice tab: photo a question, get one like it

**Agreed with Adrian 23 Sep 2026** (discussion in full before this was written; "ok go, write the spec with re-skin as default"). Nothing built yet. This replaces the topic picker as what a student sees when they tap **Practice** in the bottom menu.

## 0. The one-sentence version

A student photographs the question they want more of; we file it under a sub-skill, re-skin a real question from that sub-skill into a fresh one of our own, gate it, and put it on their Practice list to answer by a photo of their working. Every accepted question joins the bank as `ai_generated`.

## 1. Decisions, in Adrian's words

| Decision | Source |
|---|---|
| Practice tab → a page that asks for a photo (drag-and-drop on web). Nothing else on it. | "just use the Practice tab in the bottom menu … don't put topic picker inside / don't put recommended from your last paper too" |
| A model generates the question, with gates, matched to what the student wants. | "a model generates for them … with gates so ensure question is of good quality and matches what the student wants" |
| The question lives in the app; the student photographs their working and submits. Not a worksheet. | "have the question in the app … students can take photo of their working and submit … not a worksheet" |
| Every accepted question is filed in the bank as AI-generated. | "put the question in question bank (source: ai-generated …) and overtime we would [grow] the bank" |
| No promotion rule. One button: **Report this question**. | "this is unnecessary, just put a 'Report this question'" |
| Generation must be able to draw diagrams. | "make sure generation can also generate diagrams" |
| **Re-skin a bank question by default**; from scratch only when the sub-skill has no seed. Never serve a clone. | "write the spec with re-skin as default" |
| Sub-skill classification, not embedding search, is how the photo is matched. | "embedding doesn't work well → need to search using skills" |
| We do not serve bank rows to the student. The bank seeds and calibrates; the student always gets a fresh question. | "so we are not serving question bank questions right?" — confirmed |
| Plan-billed by default, API as overflow. | from the cost table in §6 |

## 2. What the student sees

1. **Practice tab → the photo page.** One heading ("What do you want to practise?"), one big button (📷 Take a photo · 🖼 Choose from photos on a phone; a drop zone + file picker on web), one line under it: "Photograph one question. We'll write you a fresh one that tests the same thing." Nothing else: no picker, no recommended row, no topic chips. Below the fold, the existing **Practice list** (`todo-list.tsx`) — every question already waiting for them, newest first.
2. **After the photo** (client-downscaled JPEG, the existing `image-downscale.ts`): a card "✍️ Writing your question… we'll ping you when it's ready (usually a few minutes)". The student can leave. The request appears on the list as a greyed **Writing…** row so a second tap does not double-request.
3. **When it lands:** a push (and a Telegram line where linked): "Your practice question on *Completing the square* is ready." The row on the list becomes live. Tapping it opens the existing question view (`question-view.tsx`) with the diagram (if any), the marks, 💡 How to approach it (the existing hint route, answer-free), and the **Your working** card — 📷 photo / 🖼 gallery / typed lines → **Mark my working**, graded line by line by the existing practice grader.
4. **Report this question** on every generated question (list row and question view). One tap + optional one-line reason. The question is hidden from every other student at once (`questions.reported_at`, `serving_policy` excludes it), the reporting student keeps it on their list so they can still finish it, and Adrian gets one Telegram line to the marking topic with the question id, the sub-skill, the reason. Adrian's desk: **Reported questions** section on `/admin/figures-bank`'s sibling page `/admin/generated` (§9) with Restore / Retire.
5. **Not readable:** if no question can be read from the photo (blank, not maths, a whole page), the page says so and asks for one question, close up. Nothing is queued, nothing counted against the cap.
6. **Caps:** `DAILY_PRACTICE_PHOTO_CAP` = 10 requests per student per SGT day (tuition students; a stranger's pass keeps its own ceiling). The 11th tap is refused with a friendly line; the list stays open.

The old topic picker stays in the code behind `PRACTICE_PICKER_OPEN_TO_STUDENTS=false` for Adrian's admin cookie (retrieval + generation harness). Students never see it.

## 3. The pipeline per request

```
photo ─▶ read ─▶ file under a sub-skill ─▶ pick a seed ─▶ re-skin ─▶ gates ─▶ bank row + list row ─▶ ping
```

### 3a. Read the photo
The bot's existing photo path (`/api/portal-find` → transcription, the same one Find a question uses): the question text as LaTeX, the parts, the marks if printed, and whether a figure is present. Empty/unreadable → §2.5.

### 3b. File under a sub-skill
The bot's `classifySubgroup` (`lib/ask-skill.js`, the Haiku/Sonnet-class call that files every ask under a bank `subgroups` row). Level comes from the student's account (`portal_accounts`/Airtable Level), so a Sec 3 A Math student's photo is filed among Sec 3 A Math sub-skills. Output: `{subgroupId, subgroupName, topic, confidence}`. Confidence below the threshold → the student is told "we couldn't tell what this tests" and offered a second photo, nothing queued. **No embedding search anywhere in this flow.**

### 3c. Pick a seed
From the bank: `questions` joined through `question_subgroups` on that sub-skill, at the student's level, `verified=true`, not `ai_generated`, not reported, marks within ±1 of the photographed question when the marks are known. Prefer the seed whose difficulty tier matches (Standard/Advanced per `difficulty`), then the most recent year. The photographed question itself is never the seed (we do not have its rights and it is what the student already has). **No seed under the sub-skill → §3e.**

### 3d. Re-skin (the default)
The bot generator's `re-skin` dial (`ai/generation-worker.js SIMILARITY_SPECS['re-skin']`): same skeleton — same parts, same skills, same mark allocation, same difficulty — new context AND new values. The prompt carries the seed, the student's transcribed question as a **"match this intent"** block (what to test, how many parts, roughly how many marks, whether a figure is expected), and the sub-skill name. The author is `GEN_MODEL` (`claude-opus-4-8` today; pin to Opus 5 with the env override once the calibration bench has compared — same rule as everywhere else).

**Gates, all existing** (`ai/question-gen.js`):
- **code**: the answer is computed, not asserted.
- **blind**: an independent solve agrees.
- **skill**: the classifier files the new question under the SAME sub-skill as the seed (this is the "matches what the student wants" gate — a re-skin that drifts to a different sub-skill is rejected).
- **grade**: marks band consistent with the level.
- **novelty** (from SPEC-TWINS §1, reused): word-trigram Jaccard ≤ 0.4 against the seed and against every real question at the level, plus the number-swap detector (seed with digits masked ≠ twin with digits masked). This is what makes it ours and not "the school's question with the numbers changed".
- **figure** (§4).

Budget: `CALLS_PER_QUESTION` = 12 (18 with a figure), max 5 attempts; the skill and grade gates may be **skipped on a re-skin whose seed already carries sub-skill + marks** and whose text passes novelty — the seed's filing is inherited (`twin_of` = seed id). That is where the saving over from-scratch comes from (§6).

### 3e. From scratch (the fallback)
No seed → the `same-skills` dial with the transcribed question as the intent block and the sub-skill's *description* as the skill statement; every gate on, nothing inherited. Logged as `generation_requests.similarity_level='same-skills'` so the ledger shows how often the bank had no seed (that is a bank-gap signal for the top-up).

### 3f. Never
- **Never `clone`** for serving. A clone keeps the school's expression (SPEC-TWINS §1, docs/CONTENT-POLICY.md). The clone dial is allowed for one private thing only: **Try another like this** after a wrong attempt, a second question with the same wording and new numbers, visible to that student alone, never filed in the bank, never counted as a twin.
- Never serve a bank row, real or generated, in this flow. The student's question is always the fresh one.
- Never the photographed question as the seed.
- Never `image_watermark_status='clean'` on a generated row (FIGURES.md §4 — the serving pool for the kiosk stays separate).

## 4. Diagrams

Both existing figure gates ride the pipeline, in this order:
1. **Gate 5a — typed figure specs** from the registry (`lib/figures`, 33 families, `verify(spec)` fails closed). The author emits a spec when a family fits; a spec the verifier rejects draws nothing and the attempt is regenerated. This is the default.
2. **Gate 5 — matplotlib** (`figure_py` authored by `FIGURE_MODEL`, checked by `VISION_MODEL` for faithfulness, one repair). Only when no family fits.
3. A question whose seed or intent has a figure and that comes out with none is **rejected** (the student photographed a diagram question; a text-only twin does not match intent).

The figure is rendered once to `figure_url` (Singapore Storage, `lib/bank-pdf-store` path family), shown in the question view above the text, and baked into any PDF later. The figure budget stays at 18 calls.

## 5. Where it runs — plan by default, API as overflow

- **Default: the plan worker — a sheet slot's idle tick (BUILT 23 Sep 2026).** Every sheet slot (`scripts/sheet-worker/run.sh`, every 2 min) asks `sheet-jobs?peek=1`, which now also answers `photo` = pending photo rows (+ plan-worker claims older than 240 min; `lib/practice-photo.ts countPhotoWaiting`, tested). A slot with NO sheet to write and a photo waiting runs `claude -p` on `PHOTO_PROMPT.md` in the BOT repo (one `--claim`, author, the gate subagents, `--insert-gated`, stop; 40-min cap; one photo session per machine via `~/.adrianmath_gate/photo.lock`; stamps `job_runs` `practice-photo-author`; a machine without the bot checkout — the Fly worker — leaves photos to a Mac). A sheet always comes first. A request is a `generation_requests` row (`requested_by='practice-photo:<portal uuid>'`, `similarity_level='re-skin'`, `source_question_id=<seed>`, `source_text=<transcribed intent>`, `tier`, `topic`, `figure_mode`). The bot's plan worker (`scripts/topup-plan-worker.js`, Claude Code on a Mac slot, the same picker as the sheet slots so it spreads across the three logins) claims pending rows oldest-first. **Student requests go ahead of the nightly top-up's rows** (a `priority` column, 1 for students, 0 for top-up; claim order `priority desc, created_at asc`).
- **Overflow: the API.** A row still `pending` after `PRACTICE_PHOTO_OVERFLOW_MIN` = 15 minutes is claimed by the Fly bot's `generation-worker` on the API instead (the existing worker, `GEN_WORKER_DISABLE` lifted for `requested_by like 'practice-photo:%'` only). This caps the wait without paying for every question. Adrian's switch: the same 🖥 **Mac plan only** setting that governs marking — ON means no overflow, the student waits.
- **Wall time the student is told:** "usually a few minutes"; the truth from the ledger is 2–5 min on the API, 2.5–9 min on a plan slot, longer when a marking run holds every slot. Never a spinner the student has to watch.

## 6. Cost and time (from the ledgers, 23 Sep 2026)

| Route | Calls per accepted question | Cost (API) | Time |
|---|---|---|---|
| From scratch (`same-skills`) | 5–12 | ≈ US$0.50 (two July runs: 6 calls US$0.28, 16 calls US$0.76 on Opus 4.8) | 2–5 min |
| **Re-skin of a bank row (default)** | 4–6 | ≈ US$0.25 | 1–3 min |
| Clone (numbers only, gates trimmed) — private retry only | 2–3 | ≈ US$0.10 | < 1 min |
| With a figure | +2–6 | +US$0.20–0.50 | +1–2 min |

At 50 requests a day, all API: ≈ US$12–25 a day, US$400–750 a month. All plan: nil marginal, ≈ 2–4 slot-hours a day drawn from the same pool as marking and sheets (a Practice Again sheet is US$4–14 plan-equivalent and 11–33 minutes, so fifty re-skins ≈ one to two sheets' worth of slot time). The overflow rule in §5 bounds the wait; the ops board (§10) shows the split.

## 7. Data

- `questions`: `ai_generated=true`, `school='AI Generated'`, `exam_type='Practice'`, `solution_source='ai_opus'`, `verified=true`, `figure_url`, `source_question_id` (the seed), **new** `twin_of` (= seed id; the SPEC-TWINS column, created here first), **new** `reported_at`/`reported_by`/`report_reason`, `gen_meta` (`{kind:'practice-photo', similarity:'re-skin'|'same-skills', intent:{...}, gates:{...}, author_model, blind_model, figure:{family|'matplotlib'}}`). Linked in `question_subgroups` to the seed's sub-skill.
- `generation_requests`: **new** `priority smallint default 0`, **new** `portal_account_id uuid` (the requester; `requested_by` keeps the string for the digest), **new** `intent_json` (the transcription + the classifier's verdict, so a failed request is debuggable).
- `portal_assignments`: one row per delivered question, `kind='generated'`, `source='practice-photo'`, `question_id` (the bank row — this time the generated question DOES have a bank row, unlike Find's Made-for-you), `question_text`, `answer_latex`, `marks`, `skill_title` (the sub-skill), `topic`, `level`, `tier`, `status='pending'` → `submitted`/`marked` by the grader as today. The **Writing…** row is the same table with `status='writing'` and `question_id=null`, flipped when the request completes (the completion handler, not the client, does the flip).
- `portal_generation_log`: one row per request (`seed_text`, `tier`, `assignment_id`, `candidates`=[seed], `review`), so the nightly find-review's reader sees these too.
- `portal_event_log`: `practice-photo:request`, `:unreadable`, `:unclassified`, `:ready`, `:report`.
- RLS on in the same migration for any new table (memory: Supabase new tables are born public).

## 8. Report this question

- Student taps → `POST /api/portal/practice/report {questionId, reason?}` (session-scoped; the question must be on their own list). Sets `questions.reported_at`, writes the event, one Telegram line to the marking topic: "🚩 Reported · Sec 3 AM · Completing the square · <first 80 chars> · reason: … · /admin/generated?q=<id>".
- Effect: the row leaves the seed pool and every serving path at once (`serving_policy` in the RPCs excludes `reported_at is not null`). The reporter keeps their copy.
- Adrian: **Restore** (clears `reported_at`, keeps the report in `gen_meta.reports[]`) or **Retire** (`verified=false`, stays for audit). No promotion rule, no "one clean attempt" rule — one report is enough to hide, one tick is enough to bring back.

## 9. Adrian's side

- `/admin/generated` — every `ai_generated` row from this flow, newest first, with the seed beside it (two columns: seed · twin), the gates' verdicts, the novelty score, who asked, the report state. Filters: reported / by sub-skill / by student. This is also where the SPEC-TWINS phase-0 "20 twins for Adrian's read" lands, so the two specs share one page.
- The student profile's **Work** tab gets a "📷 Asked for practice on" line per request (sub-skill + date), so he sees what a student is worried about before a lesson.
- The Monday report gets one line: requests · delivered · median wait · from-scratch share (bank gaps) · reports.

## 10. Doctrine mapping (CLAUDE.md §Building doctrine)

1. **Spec** — this file; worked examples in §11.
2. **Tools** — all existing: transcription, `classifySubgroup`, the generator's dials and gates, the figure registry, the plan worker, the grader, `portal_assignments`, push + Telegram. New code is the photo page, the request route, the completion handler, the report route, `/admin/generated`, three columns and a priority order.
3. **Checkpoints** — the outward step (the question reaching the student) is gated by machines (§3d), and Adrian's checkpoint is AFTER, via reports and `/admin/generated`, exactly as marked hand-ins are released then signed off (doctrine, 8 Sep 2026 revision). Nothing waits on him.
4. **Trigger** — the student's tap; the plan worker's tick; the 15-minute overflow.
5. **Log + alarm** — `job_runs` stamp `practice-photo-worker` per claim; `JOB_RHYTHMS` line: a pending row older than 30 min ambers the ops board; a day with requests and zero deliveries alarms. Health-check probes the request route's 401.

**What stays human:** the standard for what a good re-skin is (Adrian reads the first 20 on `/admin/generated` and the doctrine's "Standard" line governs the gates' thresholds), and the report queue. Everything else runs itself.

## 11. Worked examples

**A. Sec 3 A Math, photo of "Express 2x² − 12x + 7 in the form a(x − h)² + k, hence state the minimum value. [4]".**
Read → filed under *Completing the square → min/max value* (confidence 0.93). Seed: Cedar 2023 Q3 (4 marks, same sub-skill). Re-skin: "The height of a projectile … h(t) = −3t² + 18t + 5 … express in the form … hence find the greatest height and when it occurs. [4]". Code gate computes (3, 32); blind agrees; novelty 0.18 vs seed, 0.22 max vs level; skill gate skipped (inherited). No figure expected, none drawn. Filed `twin_of=<Cedar id>`; list row live in 2 min 40 s on a plan slot. Student photographs working, grader marks it.

**B. Sec 4 E Math, photo of a circle-geometry question with a diagram (tangent, two chords, find two angles). [5]**
Filed under *Angle properties of circles → tangent-chord*. Seed: Bukit View 2022 Q8. Re-skin with a **different configuration** of the same properties (tangent at a different point, the given angle moved), figure from the registry's circle-configuration family; `verify(spec)` re-derives both asked angles from the spec before drawing. Blind solve agrees with the spec's derived values. Novelty passes. Delivered with the drawn figure. Had the first attempt come out figure-less it would have been rejected (§4.3).

**C. JC1 H2, photo of a question on a sub-skill with no bank seed (a new syllabus item).**
Classifier confidence 0.81 → filed; seed pool empty → §3e from scratch, `same-skills`, every gate on. Logged as a bank gap; the nightly top-up sees the sub-skill in the gap count.

**D. A blurry photo of half a page.**
Transcription empty → "We couldn't read a question there — try one question, close up." Nothing queued, cap untouched.

## 12. Build order

| # | What | Where |
|---|---|---|
| 1 | Migration: `questions.twin_of`, `reported_*`; `generation_requests.priority`, `portal_account_id`, `intent_json`; `portal_assignments.status='writing'` allowed; RLS unchanged (existing tables) | `migrations/` |
| 2 | Bot: the re-skin request shape (intent block in the prompt, inherited filing when the seed carries it, the novelty gate lifted from `scripts/gce-paper/` into `ai/question-gen.js`, the figure-expected rejection), `classifySubgroup` exposed on `/api/portal-classify`, the plan worker's priority order, the overflow rule in `generation-worker.js` | bot repo |
| 3 | Website: `POST /api/portal/practice/photo` (read → classify → seed → enqueue → `writing` row), the completion webhook the worker calls (`POST /api/portal/practice/photo/done`, Bearer `BOT_INTERNAL_SECRET`) that files the assignment + pings, `POST /api/portal/practice/report`, caps in `lib/portal-submit-limit.ts` style (pure/tested) | `src/app/api/portal/practice/*` |
| 4 | The photo page replacing the picker for students (`practice/page.tsx` → `photo-page.tsx`; the list below it), the Writing… row and the Report button in `todo-list.tsx` + `question-view.tsx` | `src/app/app/practice/*` |
| 5 | `/admin/generated`, the Work-tab line, the Monday-report line, ops board rhythm, health-check probe | admin |
| 6 | Adrian reads the first 20 on `/admin/generated`; thresholds tuned; then the demo student (`SCIENCE_PREVIEW_IDENTITIES`' pattern) → all students | — |

Flag: `PRACTICE_PHOTO_OPEN_TO_STUDENTS` in `lib/portal-beta.ts`, false until step 6; Adrian's cookie and the demo student see it before then.

**Status (23 Sep 2026):** steps 1–5 BUILT. 1 = `migrations/practice_photo_v1.sql` (applied). 2 = bot commit `b3add1e7` (`/api/portal-classify`, the re-skin request in `ai/question-gen.js`, the done webhook call in `generation-worker.js`). 3 = the three routes + `lib/practice-photo.ts` (pure/tested: cap, seed pick, request shape, done outcome, report parse). 4 = `practice/photo-page.tsx` + `photo-client.tsx` above the list, the Writing… row (`status='writing'`, section "From your photos"), the Report block in `practice-flow.tsx`. 5 = `/admin/generated` (+ `api/admin/generated` GET/POST restore|retire), the 📷 line on the profile's Work tab, the 📷 line on the Monday `auto-release-report`, the `practice-photo` health-check probe (four 401 gates). The ledger row a photo writes carries `tier='practice-photo'` and `generated=false`, so the finder's own made-for-you cap is untouched. Step 6 (Adrian reads the first 20) is what flips the flag. **23 Sep 2026 (later):** the plan consumer exists — a sheet slot's idle tick claims a priority-1 row (§5). Under 🖥 Mac plan only the bot's 15-min API overflow stays shut (Adrian: "stay switched off with mac plan only"), so a photo waits at most for the next free slot tick plus one authoring session (typically 3–12 min).

## 13. Open items (not blocking)

- Whether `GEN_MODEL` moves to Opus 5 for this path before the calibration bench compares (§3d).
- Whether a stranger on a pass gets this at all in v1 (SPEC-PUBLIC-LAUNCH lists "first paper free"; practice photos are a natural second door but the cap and cost story differs). Default: tuition students only.
- SPEC-TWINS phase 1 (the batch over ~3,000 sources) can reuse everything from step 2 unchanged; that spec's `twin_of` column is created here.

## 14. Photos in, one sheet a day out (agreed 24 Sep 2026 — BUILT the same day)

Adrian, 24 Sep 2026: *"can allow students to upload multiple photos then provide them with a
worksheet pdf instead? Something like practice again? 2 practice questions will be provided for
each photo they sent — one similar question and another one with slight variation to test their
understanding of the concept. So we limit to 10 questions per day right? And if students upload
more than the required number of questions per day, they will be queued for the next day. But
max queue is 3 days? We can put this idea for PDFs uploads for marking also — for science. If
they upload more than 2, then the rest will be queued. Allow them to remove the queued items too.
And for just a single question, shall we provide an option for worked example too?"* On the two
ways to write the questions: *"i would go for b"* (write them fresh, with a taught part, the way a
Practice Again sheet is written — not a pull from the bank). On what the sheet is for: *"for #2,
do option A"* — the sheet is handed in and marked like a Practice Again sheet.

This section REPLACES the student-facing shape of §§1–12 (the single-question card on the
Practice list). That path stays in the code behind the same flag,
`PRACTICE_PHOTO_OPEN_TO_STUDENTS`, for Adrian's own reading on `/admin/generated`; students
get the sheet.

### 14.1 What the student sees

- The Practice tab is a photo page and the list. Up to **5 photos** (camera or album, 64 px
  thumbnails with ✕), the level chips, and one button: **Write my sheet · n questions**. The
  header says: *Photos in, a practice sheet out · Up to 5 questions a day · 2 practice questions
  for each, in about an hour.*
- A **single photo** offers one tick: *include a worked example*.
- Tapping the button puts one row on the Practice list at once: *Writing…* with a Remove
  button, then the finished sheet (a worksheet the student hands in from the same row, marked
  like Practice Again). The sheet's page is headed *📷 Your practice sheet* with a back link to
  Practice.
- A second tap today lands on the waiting list: the row's chip says *Queued · Thursday* and the
  reply says so in one line. Remove is allowed while it waits AND while it is being written.

### 14.2 What the sheet is

One sheet a day (`PHOTO_SHEET_ALLOWANCE` = 1), up to 5 photos, **2 questions per photo**
(`QUESTIONS_PER_PHOTO`), so **10 questions a day** at most. For each photo the sheet worker
writes:

- a short **taught part** — the method the photographed question needs, in Adrian's voice, the
  way a Practice Again section teaches a missed step; every taught part is filed in the section
  bank (`sheet_sections`) like any other;
- **one question like it** — the same sub-skill and marks, re-skinned (a bank seed by default,
  from scratch only without one, never a clone);
- **one turned-around variation** — the same sub-skill and marks, asked the other way round, so
  the student shows they hold the idea and not the shape;
- a **worked example** when the single-photo tick is on: one fully worked question of the same
  kind before the two practice questions.

The novelty gate accepts the pair only when the two questions are distinct from each other AND
from the seed. Every question passes the existing gates (structure, blind solve, moderate,
figure registry) and is filed `ai_generated` with `twin_of`.

### 14.3 The waiting list — one pure rule, two users

`lib/daily-queue.ts` (pure, tested) is the whole rule; it knows nothing about sheets or papers:

- an **allowance per Singapore day** (practice sheets 1, science papers 2);
- a **horizon of 3 days beyond today** (`QUEUE_HORIZON_DAYS`);
- each new item lands on the **first day with room**, today first; past the horizon it is refused
  with a plain line;
- a queued item **starts at midnight SGT** on its day and takes that day's allowance first;
- the student sees *Queued · Thursday* rows with **Remove**.

Science has no practice; it uses the rule for **hand-ins**: the third paper today uploads, its run
is created with `result_json.queued_for` and is NOT put in the marking queue; the midnight cron
`/api/cron/daily-queue` enqueues it when its day comes and stamps `queue_released_at`. Remove
(`POST /api/portal/science/queue`) deletes the run and its files while it waits; once marking
starts the button is gone (409). The science notice gained one sentence: *Limit: two papers a
day.* — and `/app/science/submit` says which day a paper will queue for before the upload.

### 14.4 Where it lives

| Piece | Where |
|---|---|
| The pure rule (allowance, horizon, placement, day words) | `src/lib/daily-queue.ts` + test |
| Sheet constants + body parsing (`MAX_SHEET_PHOTOS`, `QUESTIONS_PER_PHOTO`, `parseSheetBody`, `sheetSentMessage`) | `src/lib/practice-sheet.ts` + test |
| Science placement on the database (counts a direct hand-in on its day, a queued one on its `queued_for` day) | `src/lib/science-queue-store.ts` |
| "Write my sheet" + Remove | `POST /api/portal/practice/sheet` |
| The science Remove door | `POST /api/portal/science/queue` |
| The midnight cron (`0 16 * * *` UTC, `job_runs` `daily-queue`, health 36 h) | `/api/cron/daily-queue` |
| The sheet worker's rules for a photo sheet (taught part + the pair + the worked example) | `scripts/sheet-worker/WORKER_PROMPT.md` §1h; the worker peeks `sheet-jobs?peek=1` and `dueFilter()` hides a job until its `scheduled_for` day |
| Rows | `sheet_jobs` (`kind='photo-sheet'`, `photos`, `scheduled_for`, `worked_example`, `run_id` nullable — migration `practice_sheet_v1`); `portal_assignments` (`source='practice-photo'`, `sheet_job_id`); `paper_marking_runs.result_json.queued_for / queue_released_at / queue_removed_at` |
| The student's pages | `app/practice/photo-client.tsx`, `todo-list.tsx` (+ `remove-sheet-button.tsx`), `app/science/submit` + `submit-client.tsx` (`queueNotice`), `app/science/science-papers.tsx` (+ `science-queue-remove.tsx`) |
| The worker reads the photos | `GET /api/files/<key>` with `Authorization: Bearer $SHEETS_API_TOKEN` (the same token the worker already carries) |

### 14.5 Rules that bind

- A sheet exists only when the student asks; nothing is written from a hand-in or a marking.
- The **allowance is by sheet, not by question**: five photos in one sheet is one day's sheet;
  one photo is also one day's sheet. The student is told the count before tapping.
- A queued sheet **starts writing at midnight SGT** of its day, never earlier, so the worker's
  hour lands in the morning.
- Remove is always the student's: it deletes the job (and the science run with its files); no
  admin step, no Telegram question.
- Every taught part goes to the section bank; a sheet that fails the gates is refused, the job
  is failed, and the student sees the plain line — never a half sheet.
- Cost: one sheet ≈ one Practice Again sheet on the plan worker; nothing goes to the API.

### 14.6 Open

- Whether the 23 Sep single-question card comes back as a "just one, now" door beside the sheet.
- Whether a stranger on a pass gets the sheet (default: tuition students only, as §13).
