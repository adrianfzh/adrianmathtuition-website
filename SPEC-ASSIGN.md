# SPEC — Assigned Work ("From Adrian")

> **Status: APPROVED 2026-08-21 — v1 built the same day** (this doc is the record of what
> was decided and what was deliberately deferred; keep the v2 list below alive).
> Origin: Adrian, 2026-08-21 — "use the portal to send students questions I think will be
> helpful to them; they do it (take a photo and submit), bot marks — immediate learning."
> Same day, extended: "also send students practice worksheets in PDFs, students do them
> and submit for marking."

## What it is

The portal today is submit-a-paper + view-released-marked-papers + topic practice. This adds
the reverse direction: **Adrian pushes work to a student** — a single question-bank question
or a worksheet PDF — the student sees it at the top of `/app`, does it, and the marked result
appears **as soon as marking finishes** — no manual Release step. That immediacy is the
point: the student is still warm on the question when the feedback lands.

## Decisions — approved by Adrian 2026-08-21 ("1 agree, 2 agree, 3 include worksheets in v1, 4 yes, 5 v1")

| # | Decision | Outcome |
|---|---|---|
| 1 | **Split routing by kind.** A bank **question** goes through the existing in-browser **practice grader** (`/api/portal/practice/grade`): instant, line-by-line, grounded on the bank solution, feeds `student_attempts`/mastery exactly like self-practice. A **worksheet PDF** (or any ad-hoc question later) goes through the existing **paper pipeline** (`/app/submit` → 🌙 queue → marked PDF → auto-release). | Approved. The grader is the better experience for a single bank question (format + grounding + mastery), not a latency argument — the 🌙 queue marks within minutes anyway. |
| 2 | **Where it lives.** A "📬 From Adrian · N to do" card at the TOP of Home, hidden at zero, plus a small dot on the 🏠 tab. **No 5th tab.** Done items fold into practice history / Marked papers; the list page `/app/assignments` shows everything incl. done. | Approved. |
| 3 | **Worksheets in v1.** Adrian uploads a PDF or picks one from the Dropbox practice/prelim library the kiosk already lists. Dropbox picks are **copied to Vercel Blob at assign time** (`assignments/<uuid>.pdf`) so the student link never expires (Dropbox temp links die in ~4h). | Approved (was proposed as v2). |
| 4 | **Optional due date** — shown as "by Fri" on the card/list. No nagging, no overdue state beyond a muted label. | Approved. |
| 5 | **"📬 Send follow-up" from marking** — on `/admin/mark/triage` (per flagged question, pre-filled with that question's topic) and on `/admin/papers` (topic chips). Both deep-link to `/admin/students/<id>?send=<topic>` which opens the Send-work card pre-filled; the card is also usable cold from the student profile. | Approved for v1. Hand-ins now auto-release and rarely sit in triage, so the profile card is the universal entry point and triage/papers are shortcuts into it. |

Spec defaults that stand (from the original proposal):

| # | Decision | Default | Why |
|---|---|---|---|
| D1 | Marked result auto-releases to the student | **Yes** — plus a Telegram to Adrian per marked assignment ("📬 <name> did your assigned question (<topic>) — x/y") for after-the-fact spot-checks | "Immediate learning" is the feature. Adrian *chose* the question and knows what good working looks like |
| D2 | Question source | **Bank question** (practice grader) or **worksheet PDF** (paper pipeline). Ad-hoc pasted/photographed questions are v2 — they'd go down the paper pipeline too | QB = grounded marking + mastery; worksheets cover the "it's in a school handout" case |
| D3 | Do assignment submissions count against the daily caps? | **No** — a bank-question assignment is exempt from `DAILY_GRADE_CAP`; a worksheet hand-in is exempt from the 1-paper/day submit cap. Implicit cap = one submission per assignment (latest re-mark of the same attempt wins) | The caps brake student-initiated volume; assignments are Adrian-initiated |
| D4 | Student notification on assignment | **Telegram if `telegram_chat_id` linked, else silent** (they see it on next portal visit) | No new channel to build |

## Routing table (what happens after the student acts)

| Kind | Student does | Marked by | Result lands in | Assignment status |
|---|---|---|---|---|
| `question` | `/app/practice?assignment=<id>` — same question card / working editor as self-practice, banner "📬 From Adrian" + note; tier toggle and "Try another" hidden | practice grader, instantly | inline feedback + `student_attempts` (mastery) | `assigned` → `marked` (attempt_id, score/out_of) |
| `worksheet` | `/app/assignments/<id>` — PDF viewer/download → "📷 Submit your working" → `/app/submit?assignment=<id>` (paper name locked to the title) | 🌙 queue, minutes | Marked papers (auto-released; only the margin-tick-degradation hold applies) | `assigned` → `submitted` (run_id) → `marked` (on release) |

## Build (v1, shipped 2026-08-21)

1. **Schema** — Supabase `portal_assignments` (migration `portal_assignments_v1`):
   `id, airtable_student_id, kind ('question'|'worksheet'), question_id → questions, title,
   topic, level, tier, note, pdf_url, pdf_source ('upload'|'dropbox:<path>'), due_on,
   status ('assigned'|'submitted'|'marked'|'revoked'), attempt_id, run_id, score, out_of,
   created_at, submitted_at, marked_at, revoked_at`. RLS: student SELECTs own non-revoked
   rows via `portal_accounts` on `auth.uid()`; all writes server-side (service role).
   RPC `practice_candidates(p_level, p_topic, p_tier, p_limit)` = `practice_next`'s quality
   filters without the random-one limit, for the admin picker.
2. **Pure logic** — `src/lib/assignments.ts` (+ `.test.ts`): input validation, due-date
   label, pending count, status transitions.
3. **Admin** — `POST/GET/PATCH /api/admin/assignments` (create / list by student / revoke),
   `/api/admin/assignments/candidates` (level+topic+tier → up to 12 stems),
   `/api/admin/assignments/upload-token` (PDF → Blob). Send-work card on
   `/admin/students/[id]` (reads `?send=<topic>`); follow-up links on triage + papers.
4. **Student** — `GET /api/portal/assignments`; Home card + tab dot; `/app/assignments`
   list; `/app/assignments/[id]` worksheet page; `PracticeFlow` assignment mode;
   `SubmitClient` assignment mode.
5. **Marking hooks** — `/api/portal/practice/grade` accepts `assignmentId` (ownership +
   question match, cap-exempt, marks the assignment, Telegrams Adrian);
   `/api/portal/submit` accepts `assignmentId` (cap-exempt, stamps
   `result_json.assignment_id`, status → submitted); `mark-triage release` flips an
   assignment-tagged run's assignment to `marked`.
6. **Health check** — `timed('assignments', …)` probes the table with the service key and
   asserts `/api/portal/assignments` is 401 anonymously.

## v2 backlog — DO NOT LOSE (discussed 2026-08-21, deliberately deferred)

- **Re-attempts after marking** — let the student try an assigned question again after seeing
  feedback (keep both attempts; show improvement). Today: Adrian re-assigns instead.
- **Group / bulk / level assign** — one send to a whole slot or level (e.g. "all Sec 4 A-Math").
- **Auto-suggest questions** from the student's weakness tags and marking bleed (the
  `student_attempts.marking_json` weakness tags + triage flags already carry the data); the
  Send-work card pre-ranks candidates instead of Adrian scanning stems.
- **WhatsApp nudges** on assign / due date (blocked on the Twilio display-name status anyway).
- **Student-side reply / "ask Adrian"** on an assignment (a one-line message back, surfaced
  in Adrian's Telegram).
- **Bot command** `/assign <student> <topic> <tier>` from Telegram — same API, no browser.
- **Ad-hoc question** (paste text / photograph a question from a school worksheet) as a
  third kind, marked through the paper pipeline.
