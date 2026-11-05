# SPEC — Tools for tuition teachers

> **23 Sep 2026: the umbrella plan is [`SPEC-COMPANY.md`](SPEC-COMPANY.md)** — the tutor app is its App 2 (§5), with tiers Solo → Centre → API and a proposed price ladder (§7). This spec stays the detail.

*Drafted 11 Sep 2026 at Adrian's request ("let's target solo tuition teachers first,
then later institutional — marking is already one of them"). A product spec, not a
build plan: what we sell, to whom, in what order, and what has to change in the code
for a second teacher to use it. Everything in the AdrianMath repos today is
single-tenant — built by Adrian for Adrian — and that is both the proof and the gap.*

## 1. Who, and why now

**First customer: the solo tuition teacher in Singapore** — one person, 15–60 students,
O-Level / A-Level maths first (because that is what the bank, the marker and the
calibration know). They teach in the evenings and do everything else at night. **Later:
the tuition centre** (§6) — the same jobs at scale plus the jobs that only exist when
there is more than one teacher.

The evidence for the order is Adrian's own build history: he built the marker first,
then the schedule, invoices and reminders, then the bank and generators. A tutor who
builds for himself builds what hurts most, in the order it hurts.

## 2. The three pain points, and the product for each

### 2.1 Marking and feedback — **Product 1, exists**

The pain: hours every week marking papers by hand, feedback that is a score and a few
ticks, and parents who never see any of it.

What we have: the whole marking line — hand-in from a phone or Telegram, the Mac /
Batch marker with the red pen in Adrian's voice, the cover page ("Where your marks
went"), auto-release, the student app to read it, Practice Again on request, the
calibration gate. For the teacher: the desk, overrides, the re-mark door.

What "sold to another tutor" needs (the multi-tenant delta, §4): the tutor's own students
and hand-in door, **their name on the cover and in the pen's voice**, their own
calibration row (the ±2 gate is per teacher — their marking is the truth for their
students), their own desk, their own daily cap and billing. The marking standard stays
Adrian's until a tutor's overrides say otherwise; that is a feature, not a gap.

> **17 Sep 2026: the calibration method now lives in [`SPEC-MARKING-CALIBRATION.md`](SPEC-MARKING-CALIBRATION.md)** — Adrian's two phases (send in ten hand-marked scripts, the computer reads the circled marks; then annotate) replace the three-door list below, and the typed form is gone. The text below is kept as the history of the design.

**Calibrate their own marking — the harness (Adrian, 11 Sep 2026: "able to let
tutors calibrate their own marking? build them the harness").** Adrian's standard is
the default; a tutor's own marking becomes THEIR truth the same way his does today:

- *What exists:* `calibration_results` (one row per script — AI marks vs a trusted
  human marking, per question), the ±2 gate + 10-paper minimum on `/admin/calibration`,
  the eval harness (`scripts/eval-mark-model.js --truth --save`), the desk's Override
  as the truth channel after release, the science "Your teacher's mark" box.
- *The harness for a tutor:* a **Calibration tab on their desk**. Step 1 — they hand in
  five to ten scripts they have ALREADY marked, with their marks per question typed in
  a short form (or their mark scheme + totals). Step 2 — the marker marks the same
  scripts blind. Step 3 — the tab shows the agreement per question and per script, the
  gate (within ±2 on 90 % of papers), and where the marker is stricter or kinder than
  they are. Step 4 — every override they make after release adds to their row. All of
  it per tutor: their rows, their gate, their trend.
- *How the model extracts a tutor's marks — three doors, best first (Adrian, 11 Sep
  2026: "allowing tutors to annotate over the marked copy of the marker, then uploading
  it again, then model extracts the marking style — isn't that better?" Yes):*
  1. **Annotate the marked copy.** The tutor opens the marker's marked PDF (Preview on an
     iPad, any PDF annotator, or the ✏️ Annotate overlay), writes over it the way they
     mark by hand — crosses out a tick, changes a mark, writes "no units, −1" — and
     hands it back. The pages are rasterised with the ink and a vision pass reads them
     WITH the original marking as context (it already knows every part, its box, the
     mark awarded, the comment), so it reads only what changed: `{part, original,
     tutor's mark, what they wrote}`. A one-screen summary ("you changed 7 of 33 parts")
     is confirmed by the tutor before anything becomes truth — the checkpoint. This is
     the natural workflow (they mark by hand anyway) and it captures the WHY, not just
     the number. Convention printed on the cover: write the new mark beside the box,
     cross out what you disagree with, one line why.
  2. **Agree / Override on the desk** — in-app, no paper, already built for Adrian.
  3. **The typed form** — marks per question for scripts marked before the tool
     existed; fallback only.
  The style comes from the notes, not the numbers: recurring reasons ("no marks for a
  bare answer", "units every time") are extracted as candidate rules into the tutor's
  marking profile, shown as a list they approve — never applied silently.
- *What is missing to make it change behaviour:* today overrides are a record, not a
  dial. A tutor **marking profile** — leniency per error kind, scheme strictness,
  method-mark rules — derived from their calibration rows and read by the marker's
  prompt, is the piece that turns "measured" into "marks like me". Phase 0 ships the
  measurement (the tab); the profile follows once one tutor's rows exist.

### 2.2 The admin tail — **Product 2, exists for one tutor**

The pain: scheduling and rescheduling, make-up lessons, attendance, invoices and
receipts, chasing payment, year-end billing, and the WhatsApp traffic with parents that
wraps all of it. It is the part of the job nobody went into teaching for, and a solo
tutor does it at 11 pm.

What we have: the weekly schedule with capacity rules, reschedule chains and the
student's own Change door, attendance and end-of-day logging, monthly invoices with
PayNow and Stripe, payment reminders, receipts, the arrears cycle, the parent digest,
the Telegram bot as the parent channel, the health checks and the ops logbook.

What it needs: a tutor account that owns a schedule, students and rates; the Airtable
base per tutor (or a Postgres mirror — §4 decides); their own bot identity or a shared
bot that routes by tutor; PayNow QR per tutor; their own invoice template with their
name and bank. The reschedule and billing rules are already pure, tested library code
(`billing-math`, `reschedule-chain`, `year-end-billing`) and carry over unchanged.

### 2.3 Materials and "what next" — **Product 3, exists as Adrian's bank**

The pain: finding good questions by topic and level, assembling a worksheet or a paper
with an answer key, and — the harder half — knowing what to give *this* student after
*this* paper.

What we have: the question bank with sub-skill filing, the kiosk and bot worksheets, the
print-a-paper presets and GCE-format generation, the self-study sheet from a marked
paper, the find-a-question tiers, the teaching-knowledge layer.

What it needs: the bank served to other tutors under licence rules (originating-school
metadata never leaks — the kiosk gate already enforces that), a tutor's own uploads
filed alongside, and Practice Again in the tutor's name.

**The fourth pain, deliberately not a product:** getting students. Tutors would pay the
most for it, but it is marketing, not software. The referral loop and the SEO work stay
Adrian's own.

## 3. Packaging and price (a first shape — Adrian decides)

- **Marking** — per paper. Credits: a pack of marked papers; a tutor tops up. This is the
  shape already chosen for non-tuition students (a marked submission is the unit, never
  generation). A monthly plan with a paper allowance is the same thing with a floor.
- **Admin** — per month, per active student, flat. Cheap enough that "I'll keep my
  spreadsheet" loses.
- **Materials** — bundled with marking (Practice Again is marking's second half) and a
  print quota; the bank alone is not the product, the "what next" is.
- Everything the tutor's students see carries the tutor's name; AdrianMath is the
  engine, not the brand on the student's phone.

**Payment collection — later, specced now (Adrian, 11 Sep 2026).** Two shapes, in order:

1. **Direct to the tutor** (first): each invoice carries the tutor's own PayNow QR
   and a Stripe payment link on the tutor's own Stripe account; parents pay the tutor,
   never us. We reconcile — HitPay/Stripe webhooks mark the invoice paid, a bank-statement
   upload matches PayNow references — and send the reminders and receipts. No money
   passes through AdrianMath, so no payment-services licensing question, no payouts,
   no float. Priced inside the admin plan.
2. **Collect on their behalf** (only if tutors ask): Stripe Connect, we collect and pay
   out weekly, a percentage fee. This is where MAS payment-services rules and chargeback
   liability begin; not before a tutor has asked for it twice.

What exists for both: the invoice engine, PayNow + Stripe rails, the payment reminder
and receipt crons, the arrears cycle. What is missing: a rail configuration per tutor
and the reconciliation UI a tutor can trust without Adrian in the loop.

## 4. What must change in the code — the multi-tenant delta

This is the honest cost. Every table, route and job assumes one teacher.

- **Identity.** A `tutors` table and a tutor session; every student, run, invoice, slot,
  assignment and notebook row gains `tutor_id`; every admin route checks it; RLS by
  tutor on the tables students read.
- **Data home.** Airtable is Adrian's base. A second tutor either gets a base of their
  own (fast, fragile, one API key each) or the schedule/students/invoices move to
  Postgres with Airtable kept as Adrian's view. The second is the right one and the
  larger job; it is also the one that makes the admin product sellable.
- **Voice and name.** The pen, the cover, the Telegram messages, the invoice, the app
  shell: every "Adrian" becomes the tutor's name from their profile.
- **Marking standard.** Calibration rows per tutor; the auto-release switch and the
  Monday report per tutor; overrides become each tutor's own truth channel.
  **Decided 5 Oct 2026:** a tutor's corrections become THEIR OWN marking rules (a per-tutor
  profile the marker reads only for their students), never a change to the shared marker; the
  learning messages and approvals go to the tutor, not Adrian. Details:
  [`SPEC-MARKING-CALIBRATION.md`](SPEC-MARKING-CALIBRATION.md) §2, "Decided 5 Oct 2026".
- **Channels.** One Telegram bot routing by tutor, or one bot per tutor (their own
  token, our code). Web hand-in and the student app are already per-account.
- **Billing.** Stripe customer per tutor; credits ledger; the per-paper meter.
- **Ops.** The health check, `job_runs` and alarms become per tenant, or at least name
  the tenant in every line.

Phase 0 is the cheapest real test: **one other tutor's students on Adrian's marking**,
by hand — a second "teacher" record, their students tagged to them, their name on the
cover, their own desk filter. No new data home, no billing code; a bank transfer for
the credits. It proves whether a tutor pays before the multi-tenant work is done.

## 5. Order

1. Phase 0 marking for one external tutor (weeks, not months).
2. Marking as a product: tutor accounts, credits, their name everywhere, calibration
   per tutor.
3. The admin tail on Postgres, tutor-owned, PayNow and Stripe per tutor.
4. Materials: the bank under licence, Practice Again in their name.
5. Then §6.

## 6. Tuition centres — sell the standard, not the operations

Adrian, 11 Sep 2026: "those admin operations seem more work than what's worth (the
revenue that you can collect)". Agreed — a centre's rooms, class timetables, teacher
payroll and fee collection at scale are a different product with thin margins and
long sales cycles, and the incumbents already sell it. Not ours.

What a centre WILL pay for, and what we already have most of:

- **Consistency across teachers.** Ten tutors mark and teach ten ways; the centre's
  promise to parents is one standard. The marking line plus per-teacher calibration
  (§2.1) is that standard as a product: every teacher's marking measured against the
  centre's, a management view of who marks generously and who deviates from the scheme,
  and one bank of materials. The bridge from the solo product to the centre product is
  the calibration tab turned into a table of teachers.
- **Retention.** Parents leave after an exam when they cannot see progress. Per-student
  progress reports a manager sends in bulk, and an early-warning list (attendance
  dropping, marks dropping, no hand-ins) — the digest and the activity signals exist
  for one teacher already.

The rest — operations at scale, staff onboarding, compliance paperwork — stays out of
scope unless a centre pays for the two above first.

## 7. The tutor portal prototype — BUILT 5 Nov 2026 (test site only)

Adrian, 5 Nov 2026: *"yes shall we build it first? but gatekeep first"*. Phase 0 of §4–§5 as
software: another tutor hands in their own students' papers and gets them back marked by the
same marker. On the test site only until Adrian promotes it.

**Gatekeeping**
- **Invite only.** No sign-up page. Adrian makes the account on **`/admin/tutors`** (name,
  email, papers a month) and gets a one-time link `/tutor/invite/<token>` (14 days; only its
  sha256 is stored). The tutor sets a password there. "New invite link" is also the forgotten-
  password path (it clears the old password). "Switch off" locks the account at once.
- **Hidden.** `/tutor` is `noindex`, disallowed in `robots.ts`, not in the sitemap, linked from
  nowhere public. The sign-in page says only "Sign in".
- **Own login, not the student portal's.** A signed httpOnly cookie `tutor_session`
  (`lib/tutor-auth.ts`, secret `TUTOR_SESSION_SECRET` → `SIGNUP_SECRET`, its own HMAC label so
  an admin token never passes as a tutor one). A tutor can never reach `/app` or `/admin`.

**What a tutor does** — `/tutor`: their name, "N of CAP papers this month", their students, add
a student. `/tutor/s/<id>`: hand in a paper (photos or a PDF, the paper's name with the same "we
have this paper ✓" check students get, A/E/H2 Math), then the list of papers: waiting → being
marked → marked with the score, **weak topics** (marks lost per topic), **Marked paper** (the
red-pen PDF), **Full report**, and **Where the marks went** (the cover page).

**Data and separation**
- Tables `tutor_accounts`, `tutor_students`, `tutor_papers` (migration
  `migrations/2026-11-05-tutor-portal.sql`): RLS on, no policies, no grants to anon /
  authenticated — only the server's service key reads them, and every route filters by the
  tutor id from the signed cookie, never from the request.
- **Names stay with the tutor.** The marking run's `student_id` is `tutor:<tutor_students.id>`
  and its `student_name` is `Tutor: <tutor's name>`. With `tutor_students` left out, the marked
  data Adrian keeps is anonymous. The cover page is drawn with the student's name for the tutor
  only and never cached.
- Uploads go to the private store under `handins/tutor:<student id>/` (the prefix is the
  ownership proof, as for portal hand-ins).

**Adrian's students first — the waiting room** (`lib/tutor-portal.ts tutorPapersToRelease`,
`lib/tutor-store.ts releaseWaitingTutorPapers`). A tutor's paper is saved as an ordinary run at
hand-in but NOT queued. It joins the 🌙 queue only when **no paper of Adrian's students is
waiting**, **one tutor paper at a time**, **at most 15 a day** across all tutors. Checked after
every tutor hand-in, whenever a tutor opens a student's papers, and by
`/api/cron/tutor-queue` every 30 min (job_runs `tutor-queue`; Vercel crons run on the main site
only, so on the test site the first two do the work).

**The meter.** One `tutor_papers` row per hand-in, never deleted, with `month` (SGT `YYYY-MM`).
The monthly cap is checked before saving. `/admin/tutors` shows papers this month / cap and ≈
US$1.40 a paper. Billing reads these rows later; nothing is charged today.

**After marking.** The bot marks it like any tagged paper and calls the release door; the
release door (`/api/admin/mark-triage`) sees `tutor:` and only stamps `released_at`
(`released_via 'auto:tutor'`) — no Telegram, push, notebook, voice clips or practice work.
Adrian still gets the bot's usual "📝 Marked from queue" Telegram line for each one.

**First end-to-end test, 5 Nov 2026 (test site):** a one-page algebra sheet with a planted sign
slip in Q2 → waited 0 min (queue empty), marked by the Mac in about 3 min, **5/6**, Q2 caught
(M1 A0, "−3x + 2x = −x"), weak topic "Expansion of algebraic expressions −1", red-pen PDF and
cover open from the tutor's page; no student name on the run. **Until this is promoted, the
bot's release call goes to the MAIN site**, which does not have the tutor guard yet: the
test run was released `auto:none` and got one `notebook_mistakes` row under `tutor:…`
(deleted by hand). After a promote the guard handles it.

**Known gaps (prototype):** the marked PDF and cover say "Adrian's Math Tuition" at the top
and "the practice sheet that came with this paper" at the foot (no sheet exists for tutors);  the tutor's name is not yet on the cover or in the pen's voice
(§4 "Voice and name"); no Practice Again for tutors; tutor papers show on Adrian's desk among
his own (filter by student `Tutor: …`); the bleed table and other "all runs" reports count
tutor papers unless they filter `student_id like 'tutor:%'`; no payment.

**Test account:** `tutor-test@example.com`, password in `.env.local` `TUTOR_TEST_PASSWORD`;
`node scripts/tutor-test-seed.mjs` makes or resets it (cap 5, one "Test Student").

## 8. The shared board — BUILT 5 Nov 2026 (test site only)

Adrian, 5 Nov 2026: *"i would like to build what gauth did > a unlimited digital canvas
(whiteboard) that tutors and tutees can write on > build it on top of what is offered to
external tutors (currently they have marking right?)"* → *"Yes, build it"*. The idea came from
the 🍵 laoshi report; we adapt the idea, never copy another product or its name.

**What it is.** One big sheet of paper between tutor and student, each on their own phone or
iPad, from home. Both write; each sees the other's writing appear within about a second.

**What the tutor does** (`/tutor/s/<id>`): **New board** (blank), or **Open board** on a marked
paper — its marked pages become the top of the board. The board is `/tutor/board/<id>`:
**＋ Photo of a question**, **Download PDF**, **Share with student** (Send on WhatsApp · Copy link ·
Switch the link off · Make a new link — the old link stops working). Boards are listed under
the student, newest first; open one again any time and carry on.

**What the student does**: opens the private link `/b/<key>` (no login — tutor students have
none; like the link in a "track your parcel" SMS). Same pen, same photo and PDF buttons.

**Rules**
- **Pages never run out**: every stored page, every page anyone wrote on, then one empty page
  (`lib/shared-board.ts displayPageCount`). Blank pages are squared paper (`public/board-blank.png`).
  A photo goes after everything written, so no stroke ever moves page.
- **Each side writes its own layer** (`tutor_ink` / `student_ink`, the `lib/student-ink` shape);
  the other side's layer is drawn under yours. You rub out only your own writing.
- **The pen is the students' pen** (`app/marking/StudentInk`: colours, highlighter, eraser,
  lasso, pointer, undo/redo, shapes, full screen). iPad: the Pencil writes, a finger moves.
  **Phone: one finger writes, two fingers move** (on by default on a phone; the ✋ button toggles it).
- **Live**: a Supabase broadcast channel (the website's first live feature). Its name is a hash
  of the board id and link key, given only to someone who may open the board, and it changes
  with a new link. Only the pages that changed are sent; presence shows "<name> is here".
  The database is the truth (each side saves a moment after each stroke); a poll catches
  anything missed — every 8 s, every 2.5 s when the live channel is down.
- **Who may open it**: the owning tutor's signed cookie, or the link key in the `x-board-key`
  header while the link is on (`lib/board-store.ts boardAccess`). Photos are stored privately under
  `handins/tutor:<student id>/`; page pictures reach the browser as 6-hour signed addresses.

**Data**: table `shared_boards` (migration `migrations/2026-11-05-shared-boards.sql`, applied):
RLS on, no policies, only the server's key reads it. Student names stay in `tutor_students`.
**Company points** (CLAUDE.md §The company): boards live in our own database (§14.5); a board
uses **no marking credit** (§7.1) and no AI — nothing to meter.

**Tested 5 Nov 2026** (local, phone size, two tabs as tutor and student): marked paper as the
first page; a student stroke appeared on the tutor's screen and the reverse; writing on the
last page added a new empty page on both; two photos added from either side appeared on both;
PDF had every page with both layers; a wrong link, no sign-in, and a switched-off link were all
refused. **Not yet tried on a real iPad with a Pencil and a real phone** — do that on the test site.

**Added later on 5 Nov 2026** (Adrian: *"enable to type neat notes"* · *"annotate pdfs?"* ·
*"Go back to an earlier version … let's do this"*):
- **⌨ Type** on the pen bar (board only — `StudentInk typeTool`): tap the page, type, Enter files it
  (Shift+Enter = new line, Esc drops it). A typed note is a text stroke on your own layer, so it
  erases, lassos, undoes, saves and goes live like ink; it is in the PDF. Letter size follows the
  pen's S/M/L (`lib/inline-ink typedFontSize`, about 14 px on a phone, 29 px on an iPad).
- **＋ Photo or PDF**: a PDF becomes one board page per PDF page (up to 20 at a time), read in the
  browser by the hand-in's reader (`lib/pdf-pages`). Then write or type on it.
- **Earlier versions** (table `shared_board_versions`, migration `migrations/2026-11-05-shared-board-versions.sql`,
  applied): a copy of BOTH layers is kept every 10 minutes of writing, just before a big rub-out
  (half or more of someone's writing gone at once, e.g. "Clear my notes"), and just before every
  restore — so a restore can be undone the same way (`lib/shared-board versionReason`). Newest 60
  per board. **Bring back my writing** (anyone, own layer) · **Bring back both** (tutor only). The
  other screen reloads by itself.
- **Templates — BUILT 5 Nov 2026** (Adrian: *"do the 4 different kinds of templates you suggested + the
  paper types and the math pages and the tutor's own saved board"*). **＋ Add** on the board opens one menu:
  - *From your files*: **Photo or PDF** (new pages at the end) · **Photo on this page** (a sticker, below).
  - *A new page of paper*: Squared · Lined · Dotted · Blank.
  - *Maths pages*: Graph axes · Coordinate grid (−10…10, working lines below) · Number lines · Triangle &
    circle · Table.
  - *Organise*: Cornell notes (key words · notes · summary) · Week planner · Checklist.
  The pages are pictures drawn once by `scripts/board-paper.mjs` into `public/board/<key>.png` (the list is
  `BOARD_PAPERS` in `lib/shared-board.ts` — keep the keys the same; re-run the script after a change). A
  template page is added like a photo (after everything written). The PDF reads them from disk
  (`next.config.ts` traces `public/board/*.png` into `/api/board/**`).
  - **A tutor's own saved board**: **Save as template** on the tutor's board keeps its pages, the TUTOR's
    writing and its photo stickers — never the student's writing (table `board_templates`,
    `/api/tutor/templates`, at most 100 a tutor). On a student's page: **Start from one of your templates**
    (and Remove). Boards already made from a template are not touched when it is removed.
- **Photo stickers — BUILT 5 Nov 2026** (Adrian: *"place a photo onto a page (stuck onto a PDF page like a
  sticker, which you can move and resize - like how notability does it)"*). **＋ Add → Photo on this page**
  puts the photo on the page most in view, centred, 60% wide, and turns on **Move photos**: drag to move,
  drag the blue corner to resize (keeps its shape), ✕ removes; **Done moving** gives the pen back.
  Stickers lie UNDER the writing, so anyone can write on a photo. Either side may move one; the other screen
  follows live while it is dragged. Stored in `shared_boards.stickers` (page-image pixels,
  `lib/shared-board.ts` Sticker / applyStickerOp), drawn in the PDF under the ink. Migration
  `migrations/2026-11-05-board-templates-stickers.sql` (applied). Not in "Earlier versions" (only writing is).

**Added 5–6 Nov 2026** (Adrian: *"yes build search your handwriting"* · *"yes do page thumbnails"*):
- **🔎 Search your handwriting** — on a student's page, under Boards: **Find in boards**. Every page with
  something on it (writing, a sticker, a photo or PDF page; never an empty template) is read from a picture
  of the page (`lib/board-render` — the same picture the PDF uses) by Gemini 2.5 Flash on the site's Google
  key (`lib/board-read`, thinking switched OFF — with it on, the first test read stopped half way down a
  page). Kept in `shared_boards.page_text` with the page's `sig`, so a page is read again only when it
  changed, and not more than once in 90 s while someone is writing (after each save, `after()` in the ink
  route). A search first reads up to 6 pages that are behind, then matches: **the exact phrase first**
  ("x = 4", spaces ignored), else every word on the page; the board's name counts too. A result opens the
  board at that page (`#page-N`). Cost, measured on the test boards: about 400 input + 20–40 output tokens
  a page — roughly US$0.0002 a page read; counted per board in `shared_boards.read_usage` (the website has
  no cost ledger). Migration `migrations/2026-11-05-board-page-text.sql` (applied).
- **🗂 Pages** — on the board's bar: every page small (page, stickers and both people's writing), tap one to
  go there. The bar now folds Download PDF, Earlier versions and Save as template into **More**, so it
  takes one or two rows on a phone.
- **📝 Summary — for the STUDENT** (Adrian, 6 Nov 2026: *"i want the summary functionality to be for the
  student, not for the tutor"* → *"yes"*). The student taps **Summary** on their board → **Make my summary**:
  one phone screen — **What we did today** (1–3 lines) · **The method** (2–6 steps on the board's own
  example) · **Watch out** (the mistake they made on the board today, and the fix) · **Try these** (two real
  bank questions on the lesson's topic, **Answer** hidden until tapped). Saved on the board
  (`shared_boards.summary`, migration `migrations/2026-11-06-board-summary.sql`); reopening shows it at once;
  **Update summary** appears only when the board changed (`lib/board-summary summarySig`). The tutor reads
  it read-only (More → Student's summary) and cannot make it (403).
  - **Held to the board, because nobody checks it first:** it is written by Sonnet 5.5 from the board's read
    text only (`lib/board-read`); every number of two or more digits must be on the board — a try with one
    that is not is sent back once, then that line is dropped (`numbersNotOnBoard` / `dropUnsupported`).
    The topic must be one of the canonical topics; the level comes from the paper's subject or the tutor's
    level for the student. No disclaimers, no model named, "your tutor" (CLAUDE.md student-facing rules).
  - **Try these** come only from the bank through the student serving door: `practice_next` with a plain
    (not IP) student's audience + `studentRow` (old syllabus, part marks, national rows all held back), and
    only questions with a printed `answer` (`lib/board-summary-store practiceFor`).
  - **Cost**, measured on the first test: one call, 1,741 input + 796 output tokens — about US$0.02 a
    summary (kept on the summary as `usage`). First test (6 Nov 2026, E Math marked paper): it named the
    sign error from the red pen (+x for −x) and served two Expansion questions; the shown answer checked.

- **👪 Send to parent** (Adrian, 6 Nov 2026: *"summary would be a good thing to send to parents"* → *"yes"*).
  The TUTOR only (More → **Send to parent**): **Write the note** makes three short parts from the board, in
  everyday words, as the tutor speaking — **What we worked on** · **What to watch** · **How you can help at
  home**. The tutor reads and edits them (**Save my changes**), then **Send on WhatsApp** from their own phone
  with a private read-only link `/p/<key>` (noindex, in robots.ts; the parent sees only the note, never the
  board). **We never hold the parent's number** — the parent is the tutor's customer (§14.5 note: the note
  itself is stored with us in `shared_boards.parent_note`). Same writer and board text as the summary
  (`lib/board-summary-store makeParentNote`); a number not on the board is sent back once, then left for the
  tutor to fix. Migration `migrations/2026-11-06-board-parent-note.sql`. First test (6 Nov 2026): it named the
  same sign slip as the student's summary and gave one concrete thing to do at home; about US$0.01 a note.

**Known gaps**: a student already on the board when the link is switched off keeps the live
view until they reload (their saves are refused); no "clear the whole board"; no delete or
rename button yet (the route has rename).
