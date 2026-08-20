# SPEC — Assigned Work ("From Adrian")

> **Status: PROPOSAL (2026-08-21) — awaiting Adrian's go-ahead on the D# decisions below.**
> Origin: Adrian, 2026-08-21 — "use the portal to send students questions I think will be
> helpful to them; they do it (take a photo and submit), bot marks — immediate learning."
> Same day, extended: "also send students practice worksheets in PDFs, students do them
> and submit for marking."

## What it is

The portal today is submit-a-paper + view-released-marked-papers. This adds the reverse
direction: **Adrian pushes work to a student** — a single question or a worksheet PDF —
the student sees it on their `/app` dashboard, does it on paper, photographs and submits
it through the existing hand-in pipeline, the bot marks it, and the marked result appears
to the student **as soon as marking finishes** — no manual Release step. That immediacy
is the point: the student is still warm on the question when the feedback lands.

Two kinds of assignment, one flow:

| Kind | What Adrian sends | What the student sees |
|---|---|---|
| **Question** | A question-bank pick, or pasted text / a photo | The question rendered on the page (KaTeX), with Adrian's note |
| **Worksheet** | A PDF — uploaded from his device, or picked from the Dropbox practice/prelim library the kiosk already lists | The PDF, viewable in the browser and downloadable to print |

Everything downstream (photograph working → submit → 🌙 queue marks → instant release +
Telegram to Adrian) is identical for both kinds.

## Decisions (defaults chosen; Adrian can veto any)

| # | Decision | Default | Why |
|---|---|---|---|
| D1 | Marked result auto-releases to the student | **Yes** — plus a Telegram to Adrian per marked assignment for after-the-fact spot-checks | "Immediate learning" is the feature. Risk R2 (bad grade seen by student) is mitigated because Adrian *chose* the question and knows what good working looks like |
| D2 | Question source | **Both**: pick from the question bank (search by level/topic — QB rows carry answers/solutions, so marking is grounded) OR ad-hoc (paste text / photo a question) | QB = quality marking; ad-hoc = zero friction when the question is in a school worksheet |
| D3 | Do assignment submissions count against the 1-paper/day cap? | **No** — separate flow, own implicit cap (one submission per assignment; Adrian controls volume by what he sends) | The cap brakes student-initiated full papers; assignments are Adrian-initiated single questions |
| D4 | Student notification on assignment | **Telegram if `telegram_chat_id` linked, else silent** (they see it on next portal visit) | No new channel to build; WhatsApp can come later |

## Build sketch (in order)

1. **Schema** — Supabase `portal_assignments`: `id uuid pk`, `airtable_student_id text`,
   `question_id uuid null` (QB pick), `custom_text text null` + `custom_image_urls jsonb null`
   (ad-hoc), `note text null` (Adrian's "why"), `status text` (`assigned`→`submitted`→`marked`),
   `run_id uuid null` (→ `paper_marking_runs`), `created_at/submitted_at/marked_at`.
   RLS: student SELECTs own rows only (via `portal_accounts` join on `auth.uid()`); all writes
   server-side.
2. **Admin send** — a "Send a question" card on `/admin/students/[id]`: QB search (level/topic,
   server-side service-role read) or paste/photo; `POST /api/admin/assignments`. List + revoke.
3. **Student side** — "From Adrian" card on `/app` dashboard (count badge) + list page:
   question rendered via `lib/bank-question-markdown.ts` (KaTeX), Adrian's note, then the
   existing photo-capture → Blob → submit flow, tagged `assignment_id`. The submit stamps the
   run `assignment_submission: true` + the assignment id (same pattern as `portal_submission`).
4. **Immediate release** — website-only, no bot deploy: `buildStudentMarking` treats an
   assignment-tagged run as released the moment its marking JSON exists. The 🌙 queue already
   marks hand-ins promptly and Telegrams Adrian the finished PDF — that message becomes the
   spot-check hook (D1).
5. **Health check** — new student-facing surface ⇒ a `timed('assignments', …)` entry in
   `/api/health-check` (list assignments for the demo student) in the same PR.

## Explicitly out of v1

Re-submission after marking (Adrian re-assigns instead); WhatsApp notifications; assigning to
groups/levels in bulk; auto-suggesting questions from weakness tags (v2 — the data's there).
