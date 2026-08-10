# HANDOFF — Close the marking loop (triage → student submission → portal return)

> **For a fresh Claude Code session on another Mac.** Written 2026-08-10 by a strategy
> session that audited both repos + live data. Everything below was verified against
> live Supabase/Airtable/code that day — re-verify contracts marked ⚠ before relying
> on them. Work in `~/Desktop/adrianmathtuition-website` (web) and
> `~/Desktop/adrianmath-telegram-math-bot` (bot, only if Build 2 needs it).

## Why (context in 4 sentences)

Prelim season: ~25 Sec 4 students are producing exam scripts and hand-marking them is
eating 25–50 h across Aug–Sep. The AI marking pipeline already solves marking quality
(Opus 5, golden-set 15/15, queue worker built); what remains manual is **review**
(clicking through every run), **intake** (Adrian photographs and uploads everything),
and **return** (hand-delivering marked papers). These three builds remove those three
bottlenecks. Build order = 1 → 2 → 3; Build 1 alone already relieves the pain and
requires zero student behavior change.

## Read FIRST (non-negotiable)

- `docs/MARKING.md` (web repo) — marking surfaces + assembly gotchas
- `docs/KIOSK.md` (web repo) — kiosk pairing/auth model (Build 2)
- `PORTAL.md` + `PLAN-PORTAL-SOLO.md` (web repo root) — portal conventions (Build 3)
- Bot repo `CLAUDE.md` §mark-paper (~line 485+) and `handlers/webchat.js:1250–1900`
  (run creation, queue worker, phase router) — the engine you're building around
- Root `CLAUDE.md` (web) — push policy, Airtable gotchas, testing policy

## Architecture cheat sheet (verified 2026-08-10)

- **The marking engine lives on the BOT (Fly.io)**, not Vercel. The website's
  `/api/admin/mark-paper*` routes are thin proxies to `BOT_BASE_URL` (see
  `src/app/api/admin/mark-paper/route.ts`). Phases are routed in bot
  `handlers/webchat.js:1866+`; `QUICK_PHASES` includes `enqueue`, `set-student`,
  `save-paper`, `run`, `stats`, `by-student`.
- **Runs live in Supabase `paper_marking_runs`** (math project `nempslbewxtlikfzachi`).
  Columns: `id uuid, created_at, source, num_photos, num_questions, total_awarded,
  total_max, cost_usd, time_sec, input_tokens, output_tokens, model, paper_name,
  result_json jsonb, pdf_url, photos_pdf_url, annotated_pdf_url, student_id (Airtable
  recXXX as text), student_name`. **There is NO `released_at` column yet — Build 1
  adds it by migration.**
- **Queue state is INSIDE `result_json.queue`** (`{model, style, queued_at, attempts,
  failed_at?}`) — set by `enqueuePaper` (bot `webchat.js:1442`), drained by a 30 s
  worker (`:1653`), delivered by `deliverQueuedRun` (`:1537`, builds both PDFs,
  files to Dropbox, Telegrams Adrian). There is no separate status column.
- ⚠ **Per-question verdicts/flags live in `result_json`** (fields like
  `review_recommended`, `match_confidence`, per-question awarded/max/annotations).
  Inspect a real row (`select result_json from paper_marking_runs order by created_at
  desc limit 1`) AND read `MarkingOutput` in bot `ai/paper-marker.js` before writing
  the triage query — do not trust this doc for the exact JSON shape.
- **Website CAN write Supabase directly** (`SUPABASE_SECRET_KEY`, fallback
  `SUPABASE_SERVICE_ROLE_KEY`) and CAN message any Telegram chat directly
  (`TELEGRAM_BOT_TOKEN` env + `api.telegram.org` HTTP; `lib/telegram.ts` currently
  targets Adrian's chat id only — extend, don't repurpose).
- **Student identity sources**: Airtable `Students` fields `Student Telegram ID` /
  `Parent Telegram ID`; Supabase `portal_accounts.telegram_chat_id` (bigint) +
  `airtable_student_id`; kiosk: `kiosk_pairings` (`code, student_id, student_name,
  level, subjects[], claimed_at, consumed_at, expires_at`).
- **Vercel hard-caps request bodies at 4.5 MB** (platform level). The bot on Fly has
  no such cap (`/api/mark-inbox`, auth `MARK_INBOX_TOKEN`, optional
  `x-file-kind: working|paper`).

## Locked decisions (from the strategy session — don't re-litigate)

1. **Portal is the return destination; Telegram is the doorbell** (a one-line nudge
   with a link/PDF). Students without portal accounts get the PDF in Telegram as
   fallback.
2. **Release is always an explicit Adrian action** (triage "Release" / per-run
   button). Nothing auto-releases to students without his tap. His review stays the
   trust gate.
3. **Unflagged questions need no review** — triage shows flagged-only. That's the
   point of the feature.
4. **Do NOT un-gate Telegram student-facing marking** (bot `messages.js:2195`
   `isAdmin` gate) — deliberate re-gate, separate decision, out of scope here.
5. **Do NOT touch** `MARK_SEVERITY_RULES` / marking prompts / the severity model.
6. Kiosk submissions auto-enqueue (marking cost ≪ Adrian time); review still gates
   release per (2).

---

## Build 1 — Batch triage screen (web repo only, no bot deploy)

**Goal:** one page where Adrian reviews ONLY the flagged questions across all recent
runs, then releases scripts. Cuts review from per-run click-through to ~5 min/day.

**Migration** (Supabase math project): `alter table paper_marking_runs add column
released_at timestamptz;` (nullable). Optionally `released_via text`.

**API** (new `src/app/api/admin/mark-triage/route.ts`, `verifyAdminAuth`):
- `GET` → runs from last ~14 days with `result_json` marked (has questions), not yet
  released. Server-side: extract flagged questions (review_recommended OR
  match_confidence below the threshold used in `result_json` — confirm exact field
  names per ⚠ above), return
  `{runs: [{id, paper_name, student_id, student_name, created_at, total_awarded,
  total_max, annotated_pdf_url, flagged: [...], unflaggedCount}]}`.
- `POST {action:'override', runId, questionIdx, awarded, note}` → patch that question
  inside `result_json` (read-modify-write, same pattern as bot `webchat.js:1422`) and
  recompute `total_awarded`.
- `POST {action:'release', runIds:[]}` → set `released_at=now()`, then nudge (below).
- `POST {action:'agree', ...}` → mark the flag resolved (store e.g.
  `reviewed_at`/`reviewed: true` on the question object) so it drops off the list.

**Release side-effect (the return):** for each released run resolve recipient:
`portal_accounts.airtable_student_id = run.student_id` → if found and portal enabled,
Telegram-nudge `telegram_chat_id` "📄 Your marked <paper_name> is ready — <portal
link>"; else fall back to Airtable `Student Telegram ID` and send the
`annotated_pdf_url` PDF directly (Telegram `sendDocument` accepts a URL). No
recipient found → tell Adrian in the response ("no Telegram link — hand back
manually") rather than failing the release.

**UI** (`src/app/admin/mark/triage/page.tsx` or a tab on `/admin/mark-paper` — match
whichever fits that page's existing structure): header stats (N scripts, N questions,
N confident, N flagged) → rows grouped by student+paper: question label, AI marks +
deduction reason, flag-reason chip, [✓ Agree] [✏️ Override] (inline number input)
[🔁 view photo] → footer "Release N scripts" with per-run checkboxes. Show the
question region via the run's annotated images/PDF link (a cropped thumbnail is a
nice-to-have, not v1 — the bbox data in result_json makes it possible later).
Mobile-usable (Adrian triages from his phone).

**Acceptance:** a run marked yesterday shows only its flagged questions; Agree clears
a row; Override changes `total_awarded` in the DB; Release stamps `released_at`,
sends exactly one nudge per script, released runs disappear from GET; unflagged-only
runs can be released without opening anything.

**Tests:** flag-extraction + total-recompute as pure functions in `src/lib/` with a
sibling `.test.ts` (repo testing policy — money/marks logic never inline in routes).

## Build 2 — Kiosk "Submit paper" tile (web repo; small bot change only if needed)

**Goal:** end-of-lesson ritual — students scan/photograph their own script at the
iPad kiosk (or their phone); a run appears pre-named, pre-linked, auto-enqueued.
Adrian's intake time → 0.

**Identity:** kiosk pairing already yields `student_id`/`student_name`/`level`
(`docs/KIOSK.md`; `kiosk_pairings`). Reuse the signed `x-kiosk-student` token flow
the other kiosk APIs use.

**Upload path — decide after reading the code** (both viable, pick ONE):
- (a) **Via existing bot phases through the website proxy**: camera captures →
  client-side downscale (~1600 px JPEG, the marker downscales to 1600 anyway) → POST
  per-photo to the existing `save-paper` phase (⚠ read its contract in bot
  `webchat.js` first — it exists in `QUICK_PHASES`), then `set-student`, then
  `enqueue`. Keeps every request under the 4.5 MB Vercel cap because photos go one
  at a time. Zero bot deploy.
- (b) **Direct to bot `/api/mark-inbox`** (no Vercel size cap): would need a small
  bot change to accept a student id + auto-create/enqueue the run. Only pick this if
  (a)'s save-paper contract turns out unsuitable. Bot changes go through the staging
  app first (bot CLAUDE.md deploy discipline), and **never `fly deploy` while a
  marking run is in flight** (a restart 502s Adrian's 1–2 min marking requests —
  check for a recent `phase:'stats'`/active run first).

**UI:** kiosk gets a "📤 Submit paper" tile → camera loop ("Add page" × N → review
thumbnails → Submit) → confirmation ("Marked copy will reach you on Telegram/portal").
Also nudge Adrian's Telegram once per submission ("Wei Jie submitted 6 pages —
EM Prelim P2") so he knows the queue is filling.

**Naming:** default `paper_name` = "<Student first name> — <subject?> <date>"; Adrian
can rename later via the existing `rename` phase.

**Acceptance:** a paired student submits 6 photos in <90 s on the iPad; a run appears
in `/admin/mark-paper` linked to them; the queue worker marks it without Adrian
touching anything; it then shows up in Build 1's triage.

**Health check:** this is a new student-facing surface → add a `timed('kiosk-submit',
…)` probe to `/api/health-check` in the same PR (repo policy).

## Build 3 — Portal marking page (web repo; needs portal beta to matter)

**Goal:** `/app/marking` — the student's gallery of released marked papers. This is
the portal's killer content and the reason to log in during prelim season.

**Pattern:** follow existing `/app/*` pages + `/api/portal/*` route conventions
(Supabase Auth session → `portal_accounts.airtable_student_id` → app-layer join;
see `PORTAL.md` "Database split"). Server route queries `paper_marking_runs` with the
service key filtered `student_id = airtable_student_id AND released_at is not null` —
do NOT add student RLS policies to `paper_marking_runs`; keep it service-role-only
and filter server-side (matches the portal's existing join-at-app-layer approach —
confirm against an existing `/api/portal/*` route before deviating).

**UI:** list (paper name, date, score chip e.g. 34/50, model-marked badge) →
detail: embedded `annotated_pdf_url` (PDF viewer already exists in the repo —
`public/pdf.worker.min.mjs` is there; reuse whatever `/admin/mark-paper` uses) +
per-question summary from `result_json` (awarded/max + deduction notes). Frame
grades as "AI-marked, reviewed by Adrian" (PLAN-PORTAL-SOLO trust framing).

**Scope guard:** read-only. No re-mark requests, no comments, v1 ships a list and a
viewer. PORTAL.md listed this page as post-launch; the strategy decision was to pull
it INTO beta scope because released scripts give beta students a reason to log in —
but the **calibration gate + beta invites remain a separate workstream**; don't block
this build on them, just keep the page behind portal auth.

**Acceptance:** a released run appears for the right student and no other account
(test with two accounts); unreleased runs never appear; the Build 1 nudge deep-links
here.

---

## Cross-cutting rules for this work

- **Push policy:** commit + push to `dev` each turn code changes (root CLAUDE.md).
  **Multiple sessions push to `dev` in parallel — `git fetch` + rebase before every
  push**, and expect the preview alias to be re-pointed by whoever deployed last.
- Never push a failing build; pre-push hook runs the test suite.
- Airtable reads: use `airtableRequestAll`, never filter linked records with
  `FIND('recXXX', ARRAYJOIN(...))` (root CLAUDE.md gotchas).
- Anything touching marks display: numbers come from `result_json` — never recompute
  marks in more than one place; one pure function in `src/lib/`, tested.
- When done, update `docs/MARKING.md` (Builds 1–2) and `PORTAL.md` (Build 3) with
  what shipped — those docs are the cross-session source of truth.

## Suggested sequencing

| Order | Build | Est. sessions | Unblocks |
|---|---|---|---|
| 1 | Triage screen + `released_at` + nudge | 1–2 | Immediate daily time relief; return mechanism exists |
| 2 | Kiosk submit tile | 1–2 | Intake → students; queue fills itself |
| 3 | Portal `/app/marking` | 1 | Beta students get their reason to log in |
