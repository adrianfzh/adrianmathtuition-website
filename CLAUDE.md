> **Sync rule**: This file is the source of truth for Claude Code/Cowork sessions. Decisions made in claude.ai project chat are synced here via update prompts.

# AdrianMath Website

Adrian's math tuition website on Vercel. Next.js 16 App Router + TypeScript + Tailwind CSS.

> **🚧 Student Portal v1 — largely built, pre-beta.** Specs: [`PORTAL.md`](PORTAL.md) + [`PLAN-PORTAL-SOLO.md`](PLAN-PORTAL-SOLO.md) (root of repo). Read them before touching anything under `/app/*`, `/login`, `/signup`, or `/api/portal/*`. The original `// TODO PORTAL` scaffolding markers are all consumed (none remain as of 2026-07-15); remaining work is the grading calibration gate and Phase G hardening (leak-test/RLS audit, grade rate-limit, retention cron), not scaffolding.

## Commands

- `npm run dev` / `next dev` — run locally
- `vercel --prod` — deploy to production (or auto-deploys from git push)
- `vercel env pull .env.local` — pull env vars for local dev

## Auto commit + push policy — dev-first, promote to prod on approval

**`main` = production** (auto-deploys to Vercel prod). **`dev` = preview** (auto-deploys to a Vercel preview URL, NOT prod). Work never lands on `main` without an explicit go-ahead.

**On any turn where I change code, auto commit + push to `dev` at the end of that turn — no need for the user to say "push".** Pushing to `dev` does NOT deploy anything (this Vercel project only auto-deploys the production branch). To give the user something to look at, after pushing to `dev` run **`vercel deploy --yes`** (preview, NOT `--prod`), then **re-point the stable alias** so Adrian's bookmark shows the latest build:
```
vercel alias set <new-deployment-url> adrianmath-dev.vercel.app
```
**https://adrianmath-dev.vercel.app is Adrian's permanent preview bookmark** (set up 2026-07-10). Always re-alias after every preview deploy and share THIS url, not the per-deploy one. Cookies survive re-aliasing (same domain), so his login persists across deploys. The preview is fully isolated from prod; Sentry is off there (env vars are Production-scoped).

> Optional nicety: enabling "preview deployments for all branches" in Vercel → Settings → Git would auto-build a **stable** `…-git-dev-…vercel.app` URL on every `dev` push, removing the manual `vercel deploy` step. Not enabled currently.

- Only when code/files actually changed. Pure-discussion or read-only turns → no commit, no push.
- Always run the build/typecheck first; never push a broken build. The pre-push hook (`.githooks/pre-push`) runs the test suite and blocks the push on failure.
- The advisory pre-push review hook (`.claude/settings.json`) still runs on every push.
- The user can say **"don't push"** (or "hold off") to skip auto-push for that turn.
- Write a real, descriptive commit message (not "auto"); end with the `Co-Authored-By` trailer.

**Promote to production** only when the user explicitly says so — e.g. **"promote"**, **"ship it"**, **"to prod"**, **"push to prod"**. To promote: fast-forward `main` to `dev` and push `main`:
```
git checkout main && git merge --ff-only dev && git push origin main && git checkout dev
```
This keeps history linear (`dev` is always at or ahead of `main`). If `--ff-only` fails (main moved independently), rebase `dev` onto `main` first, then promote. After promoting, keep working on `dev`.

- **Hotfix exception:** if the user says something is broken in prod and wants it fixed *now*, it's fine to commit to `dev` and promote in the same turn — but still say so, don't silently push to `main`.
- Rollback is `git revert` on `main` + push, or Vercel → Deployments → promote a previous build.

## Architecture

Next.js App Router (`src/app/`) with TypeScript. API routes in `src/app/api/*/route.ts`. Shared components in `src/`. Deployed on Vercel.

## Key Pages (`src/app/`)

- `page.tsx` — homepage with schedule widget (fetches `/api/schedule`)
- `chat/page.tsx` — web math solver (SSE to Fly.io `/api/chat`)
- `admin/page.tsx` — **admin hub**: status cards (logged today, unpaid invoices, makeups owed, this week's lessons) + 4 launcher tiles (Schedule, Progress, Invoices, Students). Cookie-based auth (30-day), PWA-ready.
- `admin/schedule/page.tsx` — lesson management calendar. See [/admin/schedule](#adminschedule--lesson-management) below.
- `admin/progress/page.tsx` — read-only student timeline. See [/admin/progress](#adminprogress--student-timeline) below.
- `admin/invoices/page.tsx` — invoice management dashboard (was `/admin` before restructure)
- `admin/students/page.tsx` — **student directory**: searchable + level-filtered list, links into each profile
- `admin/students/[id]/page.tsx` — **student profile hub** (Phase 1): header (level/subjects/status), **Weekly slots** with 🔀 Switch slot + ＋ Add slot (reuses `/api/admin-schedule/switch` + `/add-weekly-slot`), and read-only Upcoming lessons / Exams / Recent invoices. Data from `/api/admin/student-profile?id=`. Phases 2–4 (inline lesson actions, embedded progress/LessonModal, exam quick-add) pending. Contact lazy-loaded via `student-contact`.
- `admin/mark/page.tsx` — AI batch marking landing page (tabs + upload flow)
- `admin/mark/batch/[batchId]/page.tsx` — batch detail page
- `admin/edit-notes/page.tsx` — revision notes editor with editor mode toggle
- `admin/edit-cards/page.tsx` — Cards editor list view: pick level/topic/subgroup, drag-to-reorder, create/delete cards
- `admin/edit-cards/[id]/page.tsx` — Single card editor: markdown+LaTeX textarea, live KaTeX preview, AI assist sidebar with diff/accept/reject
- `signup/page.tsx` — student registration form (HMAC-signed URL)
- `thankyou/page.tsx` — post-signup confirmation page
- `terms/page.tsx` — terms and conditions
- `revise/page.tsx` — revision notes landing page
- `revise/[topic]/page.tsx` — topic listing
- `revise/[topic]/[subtopic]/[subsubtopic]/lesson/page.tsx` — revision lesson player
- `revise/[topic]/[subtopic]/worked-examples/page.tsx` — TikTok-style swipe cards over `content_snippets` (route: `/revise/[level]/[topic-slug]/worked-examples`); accepts `?subgroup={id}` to filter to one sub-group
- `explain/[id]/page.tsx` — public annotated-explanation page; renders content from `explanations` table with KaTeX (full `\underbrace` support); deep-links into Teach Me via "🎓 Teach me this concept" CTA
- `learn/page.tsx` — learn page
- `formulas/*` — formula reference pages (indices, factorization, statistics, etc.)
- `o-level-a-math-tuition/`, `jc-h2-math-tuition/`, `secondary-math-tuition/` — SEO landing pages

Each admin page (`/admin`, `/admin/schedule`, `/admin/progress`, `/admin/invoices`) has its own `layout.tsx` with PWA metadata and its own manifest + apple-touch-icon. Icons live in `public/icons/`.

## API Routes (`src/app/api/`)

### Public
- `schedule/route.ts` — public schedule data from Airtable Slots table

### Admin schedule
- `admin-schedule/route.ts` — weekly calendar data (GET `?week=YYYY-MM-DD`)
- `admin-schedule/reschedule/route.ts` — create Rescheduled lesson + mark original
- `admin-schedule/add/route.ts` — create Additional/Makeup/Trial/Revision Makeup (Revision Makeup skips the capacity check + sets `Is Revision Makeup`, no Billing Month)
- `admin-schedule/delete/route.ts` — hard-delete or mark Absent
- `admin-schedule/attendance/route.ts` — update lesson Status (Completed/Absent/Cancelled etc.)
- `admin-schedule/lesson-context/route.ts` — load progress fields + prev lesson + exam info for LessonModal
- `admin-schedule/lesson-update/route.ts` — save Mastery/Mood/Topics/Notes on current lesson (14-day window)
- `admin-schedule/lesson-prev-update/route.ts` — save Homework Returned on previous lesson (14-day window)
- `admin-schedule/quick-add-exam/route.ts` — upsert Exams record for active exam type
- `admin-schedule/student-contact/route.ts` — lazy-load student contact info (NOT returned by main schedule route)
- `admin-schedule/unmarked-count/route.ts` — count of past lessons with no status set

### Admin progress / hub
- `admin/progress/student-timeline/route.ts` — student timeline data + aggregations (GET `?id=recXXX&range=90`)
- `admin/exam-season/route.ts` — GET/POST exam season override
- `admin/admin-stats/route.ts` — status card data for hub page

### Cards editor (`/admin/edit-cards`)
- `admin/cards/topics/route.ts` — GET `?level=AM` → `{ topics: string[] }` (distinct topics from subgroups)
- `admin/cards/list/route.ts` — GET `?level=AM&topic=Surds&subgroupId=105` → cards[] + subgroups[]
- `admin/cards/[id]/route.ts` — GET / PATCH / DELETE single card
- `admin/cards/create/route.ts` — POST → new card with auto order_index
- `admin/cards/reorder/route.ts` — POST `{ orderedIds }` → rewrite order_index 1..N
- `admin/cards/sections/list/route.ts` — GET distinct display_groups + card counts for a (level, topic)
- `admin/cards/sections/rename/route.ts` — POST rename a display_group across all cards in scope (merging allowed)
- `admin/cards/sections/delete/route.ts` — POST delete a section (refuses 409 if non-empty)
- `admin/cards/sections/move-card/route.ts` — POST move card to a different display_group section, recompute order_index
- `admin/cards/subgroups/create/route.ts` — POST `{ level, topic, name, description? }` → new `subgroups` row; 409 on duplicate (level+topic+name)
- `admin/cards/subgroups/[id]/route.ts` — PATCH (rename, 409 on duplicate) / DELETE (only when no QB/KB/cards reference)
- `admin/cards/subgroups/reorder/route.ts` — POST `{ level, topic, orderedIds }` → rewrite order_index 1..N for sub-groups in scope
- `admin/cards/move/route.ts` — POST `{ cardId, targetSubgroupId, sourceOrderedIds, destOrderedIds }` → move card to different sub-group within same (level, topic), recomputes order_index for both sections
- `edit-cards-ai/route.ts` — SSE stream for AI card edits (claude-opus-4-6, max 4000 tokens)

### Invoices (cron + admin)
- `admin-invoices/route.ts` — GET/PATCH invoices for `/admin/invoices`
- `generate-invoices/route.ts` — creates Draft invoice records (cron: 14th 7am SGT)
- `generate-pdf-batch/route.ts` — batch PDF generation → Vercel Blob upload
- `preview-invoice/route.ts` — generates and returns PDF inline
- `send-invoices/route.ts` — emails invoices via Resend (cron: 15th 9am SGT)
- `send-receipt/route.ts` — send receipt email
- `payment-reminder/route.ts` — Telegram reminder to check payments (cron: 14th 8pm SGT)

### Signup
- `signup/route.ts` — processes registration form → creates Student + Enrollment + Token in Airtable
- `signup-data/route.ts` — validates HMAC-signed signup link, returns slot info

### Content / AI
- `notes/route.ts` — revision notes CRUD
- `revision/route.ts` — revision content API
- `generate-lesson/route.ts` — AI-generated lesson content
- `generate-tts/route.ts` — text-to-speech generation
- `edit-notes-ai/route.ts` — AI-assisted notes editing
- `learn/route.ts` — learn API
- `render-marking/route.ts` — accepts marking JSON, returns PNG via Puppeteer
- `mark-batch/init`, `execute`, `assemble-pdf`, `list`, `get`, `submissions`, `delete`, `upload-amended` — AI batch marking pipeline

### Bot integrations
- `explanations/route.ts` — bot writes annotated-explain content here (auth: `x-render-secret`), gets back a UUID used for the `/explain/{id}` public page

## Database

**Airtable** — student/lesson/invoice data. See bot project for full schema.

Key tables used by website:
- `Slots` — Day, Time, Level, Normal Capacity, Makeup Capacity, Enrolled Count, Is Active
- `Students` — Student Name, Parent Email, Level, Subjects, Student Telegram ID, Parent Telegram ID
- `Enrollments` — Student, Slot, Rate Per Lesson, Status
- `Lessons` — Date, Slot, Student, Type, Status, Notes, Rescheduled Lesson ID, Progress Logged + progress fields below
- `Exams` — Student, Exam Type, Exam Date, Tested Topics, No Exam
- `Invoices` — all invoice fields
- `Tokens` — registration tokens
- `Rates` — current rate lookup by level
- `Rate History` — tracks rate changes per student
- `Settings` — global flags; one row: `Setting Name='exam_season_override'`, `Value='{"forceOn":"WA2"}'` (or `null` to clear)

### Lessons table — progress fields added

| Field | Type | Notes |
|---|---|---|
| `Mastery` | Single select | `Strong` / `OK` / `Slow` (plain text; emoji added in UI) |
| `Mood` | Single select | Full emoji-prefixed strings: `'😄 Engaged'` / `'🙂 Fine'` / `'😟 Distracted'` / `'😴 Tired'` / `'😤 Frustrated'` — stored exactly as shown |
| `Topics Covered` | Long text | JSON array of canonical topic names (from `lib/canonical-topics.ts`) |
| `Topics Free Text` | Long text | Freeform topics not in the canonical list |
| `Lesson Notes` | Long text | Admin notes on the lesson — **distinct** from `Notes` (system field for reschedule reasons etc.) |
| `Homework Assigned` | Long text | What was set |
| `Homework Returned` | Single select | `Yes` / `Partial` / `No` — written to the **previous** lesson record |
| `Homework Returned Reason` | Long text | Optional reason if partial/no |
| `Progress Logged` | Checkbox | Auto-set `true` when any content field is non-empty |

**Supabase** — revision lesson content in `lesson_content` table (NOT `revision_content`). Holds both notes (`content_type='notes'`) and revision lessons (`content_type='lesson'`).

- `content_snippets.display_group` (text, nullable) — student-facing section name used in the swipe app and cards editor sidebar. Independent of `subgroup_id` (which remains for QB labelling). Cards with the same `display_group` within `(level, topic)` appear as one section. NULL falls back to the sub-group's name. Backfilled from `subgroups.name` on 2026-05-13.

## Auth Patterns

- **Admin pages:** Cookie-based auth (30-day expiry, `ADMIN_PASSWORD`)
- **Admin API routes:** `Authorization: Bearer ADMIN_PASSWORD` header; verified via `verifyAdminAuth(req)` in `lib/schedule-helpers.ts`
- **Cron jobs:** `CRON_SECRET` in Bearer token, or `x-vercel-cron: 1` header, or `ADMIN_PASSWORD`
- **Signup:** HMAC-SHA256 signature using `SIGNUP_SECRET` — validates slotId + level + subjects + expires

## Invoice Flow

1. `generate-invoices` (14th 7am) → counts lessons per enrollment → creates Draft invoices with Line Items JSON
2. `payment-reminder` (14th 8pm) → Telegram reminder
3. Admin reviews on `/admin/invoices` → adjusts amounts, approves
4. "Generate Missing PDFs" → `generate-pdf-batch` → Puppeteer → Vercel Blob → PDF URL in Airtable
5. `send-invoices` (15th 9am) → Resend email with PDF attachment → marks Sent

### Deferred Adjustments (carry a credit/charge to a FUTURE month's invoice)

For when an adjustment must land on a month whose invoice doesn't exist yet (e.g. a referral credit deferred from June to July). Stored on the student's **current** invoice via 4 Invoices fields:

| Field | Type | Notes |
|---|---|---|
| `Deferred Amount` | Currency | Signed — negative = credit, positive = extra charge |
| `Deferred Note` | Long text | Reason, shown as the line-item description on the future invoice |
| `Deferred To Month` | Single line text | Target month, exactly `Month YYYY` (e.g. `July 2026`) |
| `Deferred Applied` | Checkbox | Auto-ticked by the generator once applied (applies exactly once) |

- **Set it:** via the Invoice Assistant AI ("defer Kiara's −$280 referral to July") → `patch_invoice` sets the 4 fields; or manually in Airtable.
- **Apply:** `generate-invoices` queries `AND({Deferred To Month}='<month>', NOT({Deferred Applied}), {Deferred Amount}!=0)`, adds a `Line Items Extra` line to that student's new invoice, bumps `Final Amount`, appends `Auto Notes`, ticks `Deferred Applied`. If no invoice exists that month to attach to, it's left unapplied (resurfaces next run) and flagged in the Telegram summary.
- **Banner:** `/admin/invoices` shows a blue "⏰ Pending adjustments" banner (data from `/api/admin-invoices/deferred-pending`) grouped by target month, each with a ✕ Cancel button.
- PDF caveat: like referral credits, the deferral changes `Final Amount` after the draft PDF was rendered — regenerate PDFs before sending (the normal draft-review step covers this).

## Kiosk (`/kiosk`) — iPad print station with WhatsApp QR sign-in

Self-service iPad kiosk at the centre: students print practice worksheets + revision notes.
Device authorised once (admin password → 180-day `kiosk_session` cookie); open/closed gate =
`kiosk_config` mode (closed/open/scheduled) + opening hours in `lib/kiosk-hours.ts`; admin
control at `/admin/kiosk`.

**Student identity (Phase 1, 2026-07-16): WhatsApp reverse-QR pairing — students are HARD-LOCKED
to their own level.** No anonymous browsing.

1. Idle kiosk shows a QR encoding `wa.me/<KIOSK_WA_NUMBER>?text=KIOSK-<6-digit-code>` (3-min TTL,
   auto-regenerates; code from POST `/api/kiosk/pair {action:'create'}`).
2. Student scans → WhatsApp opens prefilled → sends. Bot (`handlers/whatsapp.js` `kioskSignIn`)
   resolves the phone via `identify()` and claims the pairing: POST `/api/kiosk/pair` with
   `x-render-secret` + `{code, studentId, studentName, level, subjects}`.
3. Kiosk polls GET `/api/kiosk/pair?code=` (2.5s) → one-shot `{student, token}` (signed HMAC
   student token, 30 min, `lib/kiosk-student.ts`). UI greets by name, shows only entitled levels,
   5-min idle reset ("Done ✓" button ends session).
4. Entitlements from Level+Subjects (`deriveEntitlements`): Sec 3–5 E/A Math → EM/AM; IP Math →
   both; JC (H2/H1) → JC2; Sec 1/2 → notes only (s1/s2 — no practice pool yet, S1/S2 banks pending
   sub-group labelling). Content routes (`topics`/`notes`/`worksheet`) 401 without the
   `x-kiosk-student` token and 403 on a non-entitled level — enforced server-side, admin bypasses.
5. **Print cap 4 worksheets/day per student** (SGT day) via POST `/api/kiosk/print-log` (gates
   `window.print()`, logs to `kiosk_prints`). GET returns `{used, remaining}` for the "n/4" chip.
5b. **Deterministic daily draw** — the worksheet is seeded on `SGT-date|level|topic|tier`
   (seeded Fisher–Yates over an `.order('id')`-pinned pool), so students printing the same
   topic+tier the same day get the SAME sheet (they can discuss); reprints are identical;
   counts slice one shared order (print 8 then 15 → Q9–15 are new). Rotates at SGT midnight.
6. **Answers always print inline** — one `[Ans: …]` line closing each question after the working
   space, right-aligned, orange `#843C0C`, KaTeX coloured too (STYLE.md house rule). No answers-at-
   back section, no toggle. Name line prefills the student's name.

Supabase (math project): `kiosk_pairings` (code pk, claim/consume timestamps, student fields),
`kiosk_prints` (print log). Both RLS-on, service-role only.

**Env: `KIOSK_WA_NUMBER`** (digits only, the Twilio WhatsApp business number) — REQUIRED in Vercel
for the QR to be scannable; without it the kiosk shows a manual "WhatsApp KIOSK-<code>" fallback.
SET (2026-07-16) to `6580164142` — Adrian's real SG WhatsApp Business sender — in Vercel
(Production + Preview dev) and `.env.local`. ⚠ NOT the Twilio sandbox `14155238886` (that sender
is OFFLINE; the bot's `TWILIO_WHATSAPP_FROM` fly secret was also updated to the SG number).

⚠ **Bot side committed but NOT deployed** (commit `0d00e7a` in the bot repo) — `fly deploy` needed
before students can actually sign in. Phase 2 (planned): recommended-for-you topics from lesson
progress, homework pickup, exam-season packs. Phase 3: print → photograph → AI-mark loop.

## June 2026 Revision Sprint

`/admin/revision-signups` has two tabs: **Sign-ups** (manage sign-ups) and **Attendance**.

### Attendance tab (`/api/admin-revision-attendance`)

Tracks revision-lesson attendance + makeups for signed-up students. Revision lessons (`Type='Revision Sprint'`) were created with only `{Student, Date}` — no subject/time — so the **subject/session label (EM 10am–12pm / AM 1–3pm / H2 2–5pm) is derived at read time** from the student's signed-up subjects (parsed from the Revision Sprint invoice line items) + the fixed sprint date schedule. EM dates ⊂ AM dates, so EM+AM students get two records on shared dates, assigned deterministically (sorted by record id).

- **GET** → per student: sessions (date · subject · time · status · `assignmentSubmitted` · `topics[]`) + linked makeup + summary (attended/missed/madeUp/outstanding). `topics` merges `Topics Covered` (JSON) + `Topics Free Text` (comma list). Optional **`?studentId=recXXX`** scopes the response to one student (used by the `/admin/schedule` Revision Makeup session picker).
- **POST** `{action:'mark', lessonId, status}` — set a revision lesson's Status.
- **POST** `{action:'assignment', lessonId, value}` — set HW state on **`Homework Returned`**: `'Yes'` = handed up, `'No'` = not handed up, `''` = clear. (Back-compat: boolean `submitted` → `'Yes'`/clear.) UI: per-session **✓ / ✗ toggle** on the Attendance tab (optimistic).
- **POST** `{action:'hwnote', lessonId, note}` — free-text HW note (e.g. "partial — only Q1–5") stored on **`Homework Returned Reason`**. UI: a **"+ note" / 📝 chip** beside the HW ✓/✗ toggle on the Attendance tab (click-to-edit inline, optimistic). For tracking partial hand-ups.
- **POST** `{action:'topics', lessonId, topics}` — set topics covered (freeform, comma-separated) on **`Topics Free Text`**. UI: click the topic chips (or "+ topics") beside the session date to edit inline. When no manual topics are set, sessions **default to the published schedule** (`SCHEDULE_TOPICS` in the route, mirroring `/june-revision/sec4` + `/jc2`), split into chips on `+`.
- **Attendance tab layout**: student cards render in a responsive grid (4 cols web → 3 → 2 → 1 on narrow screens), grouped by subject section.
- **POST** `{action:'makeup', lessonId, studentId, date, slotId}` — **the "reschedule a missed (or known-to-be-missed) June-holiday lesson" action**: creates a makeup lesson at any active regular slot with a real **`Type='Revision Makeup'`** + **`Is Revision Makeup=true`** flag (Notes `'Revision makeup'`), marks the **original revision lesson `Rescheduled`** (NOT `Absent` — its outcome is read from the makeup's status), and links them via `Rescheduled Lesson ID`. (Both `Revision Makeup` Type and the `Is Revision Makeup` checkbox now exist on the Lessons table — the older "makeups borrow `Type='Additional'`" workaround is gone.) The makeup then shows on `/admin/schedule` at that slot with a teal **🏖 Revision makeup** chip badge (schedule route flags it via `revisionMakeup` = `Is Revision Makeup` true OR Notes matches `/revision makeup/i`).
  - **Where to trigger it:** (a) Attendance tab — **＋ Log makeup** on a *Missed* session, or **↻ Reschedule** on a *Scheduled* session (reschedule one you know will be missed; the action marks it Rescheduled + creates the makeup in one step). (b) `/admin/schedule` — a **↻ Reschedule** button on each *Scheduled* Revision Sprint chip opens the same date+slot dialog (auth via `savedPw`, refetches the week). (c) `/admin/schedule` **Add lesson → "Revision Makeup (not billed)"** type — pick the student, then a **session picker** (date · subject · time · ⚠ missed, with the selected session's topics shown) lists their Revision Sprint sessions (from `/api/admin-revision-attendance?studentId=`); selecting one routes through this same `action:'makeup'` endpoint, or leaving it on "— Standalone —" creates an unlinked makeup via `/api/admin-schedule/add` (which also accepts `type='Revision Makeup'`, skips the capacity check, sets `Is Revision Makeup` + no Billing Month). The picker only offers sessions not already made up.
  - **Slot picker** groups the student's same JC/Sec-level slots first (`sameLevelSlot()`), with all other slots still selectable under "Other slots". No capacity check.
  - **Billing:** the makeup is `Type='Revision Makeup'`, so it's already outside `generate-invoices`'s Additional-lesson billing query (which only counts `Type='Additional'`); that query **also** explicitly excludes `Is Revision Makeup` (with the `Notes`-matching `Revision makeup` as a legacy safety net) — the Revision Sprint was already paid, so the makeup is NOT billed again. **Any new "don't bill this lesson" case must keep it out of the Additional query and/or add the same exclusion.**
- **POST** `{action:'unmakeup', lessonId}` OR `{action:'unmakeup', makeupId}` — undo a makeup: deletes the makeup lesson + unlinks. `lessonId` (Attendance-tab ✕) leaves the revision lesson `Absent`; `makeupId` (schedule undo) reverts it to `Scheduled` (it was rescheduled-ahead, not truly missed). On `/admin/schedule`, the makeup chip's action sheet shows **↩ Undo revision reschedule**; a regular `Rescheduled` chip shows **↩ Undo reschedule** (calls `/api/admin-schedule/delete` which restores the source lesson).

Sign-ups tab: Sign-up (`/api/admin-revision-signup`) does: (1) mark Student `June Revision 2026='Signed Up'`, (2) void the regular June invoice, (3) create a `Revision Sprint` invoice, (4) create `Revision Sprint` lesson records on the sprint dates, (5) **soft-cancel the student's June `Regular` lessons** (they don't attend normal weekly lessons in June). Revert (`/api/admin-revision-revert`) undoes all of it, including restoring those regular lessons.

- Regular-lesson cancel/restore lives in `src/lib/revision-regular-lessons.ts` (`cancelJuneRegularLessons` / `restoreJuneRegularLessons`).
- Cancelled lessons get `Status='Cancelled'` and a Notes marker `Cancelled — June Revision Sprint sign-up`; restore matches that marker so only the auto-cancelled ones come back.
- Soft-cancel (not hard delete) → reversible, auditable, and dropped from the schedule (the schedule filters out `Status='Cancelled'`). Doesn't affect June invoicing (June isn't prorated; invoice generation counts slot occurrences, not these records).

## Notification Policy

**All admin web UI actions are silent** — no Telegram messages sent when admin uses the website.

Students/parents are notified via the bot's day-before reminder cron (`runDayBeforeReminders` in `flows.js`), which automatically picks up Rescheduled/Additional/Makeup/Trial lesson records. Same-day or next-day reschedules won't reach that cron in time — admin should message manually.

> ⚠ **Unverified:** revision makeups are now `Type='Revision Makeup'` (previously `Additional`). Confirm `runDayBeforeReminders` in the Fly.io bot includes `Revision Makeup` in its type filter, or those makeups won't get the automatic day-before reminder.

## Airtable Schema — MANDATORY pre-coding check

**Before writing any code that touches an Airtable table, always query the live schema first:**

```python
import urllib.request, urllib.parse, json
TOKEN = "<from .env.local>"; BASE = "<from .env.local>"
url = f"https://api.airtable.com/v0/meta/bases/{BASE}/tables"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
with urllib.request.urlopen(req) as r:
    meta = json.loads(r.read())
for table in meta["tables"]:
    if table["name"] in ["Students", "Invoices"]:  # tables you need
        for f in table["fields"]:
            opts = [o["name"] for o in f.get("options",{}).get("choices",[])]
            print(f"  {f['name']} ({f['type']}){' → ' + str(opts) if opts else ''}")
```

This takes 2 seconds and returns **no student data** — only field names, types, and option values. It catches wrong field names before they become silent bugs.

- The committed `src/lib/airtable-schema.ts` is a searchable reference (auto-synced at session start via hook)
- But always do a **live query** for the specific tables you're about to write code against — it's always current
- Never assume field names from memory or spec — verify them

## Important Patterns

- `airtableRequest()` / `airtableRequestAll()` in `lib/airtable.ts` — use `airtableRequestAll` for any "list all matching" query; it handles Airtable's 100-record page cap transparently
- `verifyAdminAuth(req)`, `localToday()`, `daysAgo(n)`, `EDIT_WINDOW_DAYS` exported from `lib/schedule-helpers.ts`
- `lib/canonical-topics.ts` — canonical O-Level Sec and JC H2 topic lists; `getTopicsForLevel(level)` returns categories with topic arrays
- Invoice `Line Items` and `Line Items Extra` stored as JSON strings in Airtable long text fields — always `JSON.parse()` when reading
- `getInvoiceMonth()` returns next month from today (used by generate-invoices)
- `countOccurrencesInMonth()` counts how many times a weekday falls in a month
- `NO_LESSON_DATES` — CNY + Christmas, same list as bot
- PDF generation uses Puppeteer with `@sparticuz/chromium` on Vercel, local Chrome path for dev
- Chat page SSE connects to Fly.io `https://adrianmath-telegram-math-bot.fly.dev/api/chat`, NOT to Vercel

## Gotchas

- **Airtable date filter bug**: `{Date}<='endStr'` silently excludes records on `endStr` when Date is date-typed. Always use exclusive upper bound: `{Date}<'dayAfterEnd'` (add 1 day). Reference: `bot/flows.js:643`.
- **Linked record filtering**: Cannot use `{Student}='recXXX'` on a linked record field, AND `FIND('recXXX', ARRAYJOIN({Student}))>0` also does NOT work — `ARRAYJOIN` returns the linked record's **display name** (e.g. "Sim Ze Kai"), not the record ID. Correct pattern: filter by other fields (Date, Status, Exam Type, etc.) in Airtable, fetch the `Student`/`Slot` fields too, then match the record ID in JS: `r.fields['Student']?.[0] === studentId`. Applies to all linked-record fields.
- **Single-record GET has no `fields[]`**: Airtable's single-record endpoint (`GET /v0/{base}/{table}/{recXXX}`) ignores `fields[]` query params — they only work on list endpoints. Fetch all fields and filter in JS.
- **Privacy — lazy-load contact info**: `/api/admin-schedule` does NOT return `parentEmail`/`parentName` eagerly. Use `/api/admin-schedule/student-contact?id=recXXX` to fetch on demand.
- **UTC vs local time**: `getMondayOfWeek`/`addDays`/`isoDate` in `admin-schedule/route.ts` use UTC. `localToday()`/`daysAgo()` in `lib/schedule-helpers.ts` use local time. Do NOT merge — they serve different domains.
- Vercel serverless functions: 10s timeout (free) / 60s (Pro) — PDF generation is the bottleneck
- PDF generation reuses a browser instance (`getBrowser()`) — must call `closeBrowser()` after batch operations
- PayNow logo in invoice template is embedded as base64 — read from `public/paynow.png`
- Signup link expiry is checked against `Date.now()` — links become invalid after the `expires` timestamp
- Supabase table is `lesson_content`, NOT `revision_content` — easy to confuse

## /admin/schedule — Lesson Management

Two-tab interface, cookie-auth protected (30-day), PWA-ready.

### Tabs

- **Lessons** (default) — editable calendar. Shows Regular/Rescheduled/Makeup/Additional/Trial/Revision Makeup lesson records. Drag-to-reschedule, tap-to-action-sheet, per-slot [+] button, floating FAB.
- **Roster** — read-only slot enrollment view (which students are in which weekly slot).

Tab choice persists in `localStorage` (key: `schedule_view_mode`).

### Chip features

- **Quick attendance pills** — ✅ / ❌ appear on chips for today and yesterday only; tap to set Completed/Absent
- **Status pill** — full menu (Completed / Absent / Cancelled / Cancelled-Prorated / Clear). Past unmarked lessons show amber `?`
- **⚠ exam season pill** — appears when student is missing exam date or tested topics for the active exam type
- **Progress dot** — green `●` on chip when `Progress Logged = true`
- **Student name tap** — opens LessonModal as overlay (non-Trial lessons with studentId); Trial lessons open `/admin/progress` in new tab

### Drag-and-drop stack

- `@dnd-kit/core` — `PointerSensor` (distance: 8px), `TouchSensor` (delay: 500ms, tolerance: 5px)
- `DragOverlay` renders floating copy with scale/rotate; source chip drops to 0.3 opacity
- `navigator.vibrate(30)` on drag start for haptic feedback
- `touchAction: 'none'` on draggable chips (required for iOS Safari)
- `DraggableLessonChip` and `DroppableLessonSlot` are **module-level components** (not inline) — required because they use `useDraggable`/`useDroppable` hooks

### Recurring lesson generation (Regular lessons)

Regular weekly lessons exist as individual `Lessons` records. Three things create them, all using `src/lib/lesson-generation.ts > generateRegularLessonsForSlot` (9-week default horizon, dedup by date+slot, holidays → `Cancelled`):
- **Signup** (`/api/signup`) — for new students (own inline copy, 9 weeks).
- **Slot switch** (`/api/admin-schedule/switch`) — deletes future old-slot lessons, generates 9 weeks on the new slot (was 28 days — too short). Accepts `{lessonId}` (calendar) OR `{studentId, oldSlotId}` (profile page). **Also mirrors the bot's `sw_confirm` proration + enrollment history:**
  - **Proration:** counts remaining lessons this month on the old-slot weekday vs the new-slot weekday (switchDate→month-end, excluding `NO_LESSON_DATES`), `adjustment = (newRemaining − oldRemaining) × ratePerLesson`. If non-zero, creates a Draft **`Invoice Type='Adjustment'`** invoice (`Adjustment Amount`, `Adjustment Notes`="Slot switch from X to Y effective &lt;date&gt;", `Month`="June 2026"). The `Adjustment` option is created on write via `typecast:true` (the live Invoice Type select only had Regular/Enrollment/Revision Sprint).
  - **Enrollment history:** ENDs the old enrollment (`Status='Ended'`, `End Date`=day before switch) and CREATEs a new `Active` enrollment on the new slot, carrying over `Rate Per Lesson` + `Rate Type` (not an in-place Slot PATCH — preserves tenure history). Enrollments.Status live options are `Active`/`Ended` (committed schema.ts was stale).
- **Add weekly slot** (`/api/admin-schedule/add-weekly-slot`) — Roster tab [+] button → creates a 2nd Active Enrollment + 9 weeks of lessons.

**The forward-extender lives in the BOT**, not here: `generateUpcomingLessons(weeksAhead=4)` in `bot.js` runs **Mon 7am SGT** (and via `/generate`), topping up Regular lessons 4 weeks ahead for all Active enrollments. It only generates *forward from today* and never backfills, so a **missed cron run leaves a permanent gap** (the cause of the June 2026 hole). It dedups by `studentId|date` (not `+slot`), an edge-case bug for students whose two slots fall on the same date. If gaps appear, run `/generate` in the bot or backfill via the Airtable API.

### API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/admin-schedule` | GET | Weekly data: slots + lessons + students + exam info |
| `/api/admin-schedule/reschedule` | POST | New Rescheduled lesson + mark original |
| `/api/admin-schedule/add` | POST | Create Additional/Makeup/Trial/Revision Makeup (Revision Makeup: no capacity check, `Is Revision Makeup`, not billed) |
| `/api/admin-schedule/add-weekly-slot` | POST | Create an Active Enrollment + generate 9 weeks of Regular lessons (Roster tab [+] button) |
| `/api/admin-schedule/switch` | POST | Permanent slot switch: delete future old-slot lessons + generate 9 weeks on new slot + update enrollment |
| `/api/admin-schedule/delete` | POST | Hard-delete or mark Absent |
| `/api/admin-schedule/attendance` | POST | Update lesson Status |
| `/api/admin-schedule/lesson-context` | GET | Fetch progress fields + prev lesson + exam info for LessonModal |
| `/api/admin-schedule/lesson-update` | POST | Save Mastery/Mood/Topics/Notes (14-day window) |
| `/api/admin-schedule/lesson-prev-update` | POST | Save Homework Returned on previous lesson (14-day window) |
| `/api/admin-schedule/quick-add-exam` | POST | Upsert Exams record for active exam type |
| `/api/admin-schedule/student-contact` | GET | Lazy-load student contact info |
| `/api/admin-schedule/unmarked-count` | GET | Count of past lessons needing status |

### LessonModal

Opens as an overlay when the student name is tapped on a non-Trial lesson chip. Sections:

1. **Edit-lock banner** — shown if lesson date is outside 14-day window or in future; inputs are disabled
2. **Previous lesson recap** — read-only (topics, homework set); includes Homework Returned radio (Yes/Partial/No) that writes to the PREVIOUS lesson record
3. **Exam season quick-add** — shown during active exam season if student is missing exam date or tested topics
4. **This lesson input** — editable fields:
   - Topics Covered: canonical multi-select (from `lib/canonical-topics.ts`) + free text
   - Mastery: Strong / OK / Slow (displayed as 🟢/🟡/🔴, stored as plain text)
   - Mood: 5 options stored as full emoji-prefixed strings matching Airtable option names exactly
   - Homework Assigned: long text
   - Lesson Notes: long text
5. **Autosave footer** — 500ms debounced save per field; shows saving/saved/error status

14-day edit window enforced server-side in both `lesson-update` and `lesson-prev-update`. Debounce timers cleared on modal unmount.

### Reschedule semantics (mirrors bot /rs exactly)

- Creates new lesson: `Type: 'Rescheduled'`, `Status: 'Scheduled'`
- PATCHes original: `Status: 'Rescheduled'`, `Rescheduled Lesson ID: [newId]`, appends `| auto-linked` to Notes
- Capacity check uses `Makeup Capacity` field (not `Normal Capacity`); excludes Cancelled/Absent lessons
- Deleting a Rescheduled record reverts source lesson to `Status: 'Scheduled'` and clears the link

### Shared helpers (`lib/schedule-helpers.ts`)

- `verifyAdminAuth(req)` — Bearer token check
- `localToday()` — today as `YYYY-MM-DD` in local/SGT time
- `daysAgo(n)` — `n` days before today as `YYYY-MM-DD`
- `EDIT_WINDOW_DAYS` — `14` (the edit window constant; shared by all lesson-* routes)
- `formatDateSlotLabel(dateStr, slotFields)` — e.g. `"Mon, 24 Nov 3-5pm"`
- `countLessonsInSlot(slotId, date)` — excludes Cancelled/Absent; uses `FIND('id', ARRAYJOIN({Slot}))>0`

### Telegram (`lib/telegram.ts`)

- `sendTelegram(text)` — posts to `TELEGRAM_CHAT_ID` (admin alerts)
- `sendTelegramTo(chatId, text)` — posts to arbitrary chat ID (student/parent)

### Error conventions

- 401 auth, 400 bad body, 403 outside edit window, 409 slot full, 500 Airtable errors
- Notification failures are logged but never fail the parent request

### UI patterns

- Toasts: 3s auto-dismiss, fixed bottom-centre, success (green) / error (red)
- Drop targets: dashed navy border on hover
- All destructive actions require modal confirmation

## /admin/progress — Student Timeline

Read-only student history view. Cookie-auth protected (same 30-day session), PWA-ready.

### Structure

- **Header**: "Progress" + search box ("Search students…") + Level dropdown filter (All / Sec 1–5 / JC1–2)
- **Student selection**: URL deep-link via `?student=recXXX`. Selecting a student updates the URL.
- **Aggregations panel** (4 cards): Attendance % · Mastery breakdown (Strong/OK/Slow counts) · Top topic · Homework returned %
- **Date range filter**: Last 30 days / Last 90 days (default) / Last 6 months / Last 12 months / All time — triggers refetch
- **Timeline** (desktop ≥768px): horizontal interactive timeline, lessons + exams interleaved chronologically. Lesson nodes: top half = mastery colour, bottom half = mood emoji. Exam nodes: hexagon shape. Jump buttons: [< 6mo] [< 3mo] [< 1mo] [Now].
- **Mobile** (<768px): vertical reverse-chronological card list with the same data.
- **Detail panel**: click any node → full lesson or exam details below the timeline.
- **"Edit in Schedule" link**: `/admin/schedule?date=YYYY-MM-DD&openLesson=recXXX` — only active within 14-day window; shows muted "Editing locked" otherwise.

### Exam season

- Hardcoded windows in `lib/exam-season.ts` (`EXAM_WINDOWS`): WA1 02-01→03-15, WA2 04-15→06-05, WA3 07-15→09-05, EOY 09-20→11-10 (MM-DD, SGT)
- Manual override: Airtable `Settings` row `exam_season_override` → `{"forceOn":"WA2"}` (or `null`)
- `resolveActiveExamType(override)` — override if set, else date-based window, else null
- ⚠ pill on schedule chips when student missing exam date or tested topics for active type

### Key files

| File | Purpose |
|---|---|
| `app/admin/progress/page.tsx` | Student timeline page |
| `app/api/admin/progress/student-timeline/route.ts` | Timeline data + aggregations |
| `app/api/admin/exam-season/route.ts` | GET/POST exam season override |
| `lib/exam-season.ts` | `EXAM_WINDOWS`, `resolveActiveExamType()`, `checkExamInfoStatus()` |
| `lib/canonical-topics.ts` | Canonical topic lists for O-Level Sec and JC H2 |

## Pending Tasks

- ~~Fix revision page content priority (`data.content || data.generatedContent`)~~ — **done** (`src/app/revise/page.tsx:358` prefers `content`, falls back to `generatedContent`)
- Revision page formatting improvements
- Chat page smart scroll
- Add image support for revision notes (diagrams from DOCX files)
- ~~Revision lesson player + LessonPlayer~~ — **removed** (orphaned; backing `/api/revision` was retired in `9856906`, page was never linked; worked-examples swipe cards superseded it)

## AI Marking PNG Renderer

**Route:** `POST /api/render-marking`

Accepts a structured marking JSON payload from the Fly.io bot (Stage B.1a) and returns a typeset PNG image — a handwritten-style red-pen correction sheet rendered via Puppeteer.

**Auth:** `x-render-secret: <RENDER_MARKING_SECRET>` header. Validated against `process.env.RENDER_MARKING_SECRET`.

**Request body shape:**
```ts
{
  marking: MarkingOutput;          // structured marking JSON from bot AI step
  student: { name: string; level: string };
  timestamp: string;               // ISO8601, shown in header
  diagram_crop_data_url?: string;  // base64 data URL, embedded if has_diagram=true
}
```

**Response:** `200 image/png` on success; `401`/`400`/`500` JSON on error.

**Implementation:**
- `src/lib/render-marking.ts` — Puppeteer browser singleton + `renderMarkingPNG()`, same pattern as `generate-pdf.ts`
- `public/marking-template.html` — self-contained HTML+CSS+JS template; receives payload via `<script type="application/json">` placeholder; builds DOM and calls KaTeX auto-render client-side; sets `window.__katexRendered = true` when done
- Puppeteer waits for `__katexRendered` then screenshots `.container` at 2× device pixel ratio

**Visual aesthetic:** Warm off-white ruled paper, Crimson Pro body, Caveat cursive red-pen corrections, JetBrains Mono meta labels. Red circle around question number (−3° rotation). Per-line tick/cross, inline corrections with arrow, struck-through wrong answers, Caveat correct answer written alongside.

**Local test:** `curl -X POST http://localhost:3000/api/render-marking -H "x-render-secret: test" -H "Content-Type: application/json" -d @src/lib/fixtures/sample-marking.json --output marking.png && open marking.png`

**Known cold-start latency:** First request after deploy takes 5–15 s (Chromium download + launch). Subsequent warm requests: 1–3 s.

**Bot wiring:** Stage B.1c (not yet implemented). The bot will call this endpoint after the AI marking step and upload the PNG to Vercel Blob.

## Batch Marking

Three-endpoint architecture, client-orchestrated, stays within Vercel Hobby 60 s limit.

### Endpoints

| Route | Method | Purpose |
|---|---|---|
| `/api/mark-batch/init` | GET | Student list for dropdown |
| `/api/mark-batch/init` | POST | PDF/image splitting + Gemini region detection → batch record |
| `/api/mark-batch/execute` | POST | Mark each detected region (Claude Sonnet + Gemini annotation) |
| `/api/mark-batch/assemble-pdf` | POST | Stitch annotated pages into PDF, update batch status → `finalized` |
| `/api/mark-batch/list` | GET | Batch list for landing page (`?status=to-mark\|marked\|all`) |
| `/api/mark-batch/get` | GET | Single batch + submissions for detail page (`?batchId=...`) |
| `/api/mark-batch/submissions` | GET | Submissions for a batch (used internally) |
| `/api/mark-batch/delete` | POST | Soft-delete a batch (sets Status=deleted) |
| `/api/mark-batch/upload-amended` | POST | Upload amended PDF → overwrites Final PDF URL |

### Tab filter semantics

- **"To be marked"** tab (`?status=to-mark`): `detected` + `marking` only — not yet AI-processed
- **"Already marked"** tab (`?status=marked`): `marked` + `finalized` — AI has marked; PDF may or may not be assembled
- `marked` = AI marking done, no PDF yet; `finalized` = PDF assembled, downloadable

### UX flow

1. Upload PDF → Gemini detects question regions → batch record created (`detected`)
2. Click "Start marking" in upload flow OR batch detail page → execute endpoint runs → status → `marked`
3. "Already marked" tab now shows the batch
4. Click into batch → review annotated gallery → click "Save as marked (assemble PDF)" → status → `finalized`
5. "Download PDF" appears on finalized batch detail page

### Init endpoint — POST /api/mark-batch/init

**Auth:** `Authorization: Bearer ADMIN_PASSWORD` (same as all admin routes).

**Request:** `multipart/form-data`
- `file` — single PDF, OR `images[]` — one or more image files (png/jpeg/webp)
- `studentName` — required display name
- `studentId` — optional Airtable Students record ID

**Response:**
```json
{
  "batchId": "batch_<timestamp>_<rand>",
  "studentName": "Gavin",
  "studentId": "recXXX | null",
  "pages": [
    {
      "pageIndex": 0,
      "pageImageUrl": "https://blob.vercel-storage.com/.../page-0.png",
      "pageImageWidth": 2480,
      "pageImageHeight": 3508,
      "questions": [
        {
          "questionLabel": "Q1",
          "questionRegionBox": [yMin, xMin, yMax, xMax],
          "questionRegionPixels": { "x1": 120, "y1": 230, "x2": 2360, "y2": 850 },
          "hasDiagram": false
        }
      ]
    }
  ],
  "summary": { "totalPages": 10, "totalQuestions": 27 }
}
```

### Key files

| File | Purpose |
|---|---|
| `src/lib/batch-marking.ts` | PDF→images (pdfjs-dist+canvas), Gemini detection, Blob upload, p-limit orchestration |
| `src/lib/marking-pipeline.ts` | Claude Sonnet marking prompt, Gemini bbox annotation, Sharp SVG composite |
| `src/app/api/mark-batch/init/route.ts` | Init endpoint (GET students + POST batch) |
| `src/app/api/mark-batch/execute/route.ts` | Execute marking per question group |
| `src/app/api/mark-batch/assemble-pdf/route.ts` | PDF assembly + finalize |
| `src/app/api/mark-batch/get/route.ts` | Batch + submissions for detail page |
| `src/app/admin/mark/page.tsx` | Landing page (tabs + upload flow) |
| `src/app/admin/mark/batch/[batchId]/page.tsx` | Batch detail page (all statuses) |

### Airtable Batches table (create manually)

Adrian must create this table in Airtable before the init endpoint can write to it. Writes are non-fatal — init returns its response even if Airtable write fails.

| Field | Type | Notes |
|---|---|---|
| `Batch ID` | Single line text | Primary — e.g. `batch_1714029384_abc123` |
| `Student` | Link to Students | Optional |
| `Student Name` | Single line text | |
| `Total Pages` | Number | |
| `Total Questions` | Number | |
| `Status` | Single select | `detected` / `marking` / `marked` / `finalized` / `failed` / `deleted` |
| `Page Image URLs` | Long text | Newline-separated blob URLs |
| `Detection JSON` | Long text | Full init response payload (for replay/debug) |
| `Final PDF URL` | URL | Set in assemble-pdf step |
| `Created At` | Date with time | |
| `Finalized At` | Date with time | Set in assemble-pdf step |
| `Submissions` | Link to Submissions | Set in execute step |

### Dependencies added

`pdfjs-dist` (v5.x, legacy ESM build), `@napi-rs/canvas` (Node.js canvas — NOT the `canvas` package), `p-limit`, `@google/generative-ai`

`next.config.ts` has `serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist']` — required because these are native modules.

**Important:** Use `@napi-rs/canvas`, not the `canvas` npm package. `canvas` requires system libraries (Cairo, Pango) that aren't available in Vercel's serverless runtime and causes `DOMMatrix is not defined` errors from pdfjs-dist. `@napi-rs/canvas` uses prebuilt binaries and works out of the box.

### Cross-page continuation handling

Gemini detection runs **sequentially** per page (not in parallel) so each page call receives the previous page's last question label and last visible sub-part. This lets Gemini correctly label continuation regions — e.g. if page 1 ends with Q1 part (ii), page 2 beginning with "(iii)" is labelled "Q1" not "Q(iii)".

Each `DetectedQuestion` has:
- `isContinuation: boolean` — true if this is a continuation from the previous page
- `lastPartVisible: string` — last sub-part label visible in this region (feeds context to next page)

The summary includes `questionGroups` — logical questions grouped across pages:
```json
"questionGroups": [{ "questionLabel": "Q1", "pages": [0, 1] }, { "questionLabel": "Q2", "pages": [2, 3] }]
```
`totalQuestions` = number of unique logical questions; `totalRegions` = number of page regions (may be higher if questions span multiple pages).

Page image **uploads** are parallelised (independent). Only the Gemini detection calls are sequential (for context).

### PDF rendering notes

- Uses `pdfjs-dist/legacy/build/pdf.mjs` (legacy build avoids DOMMatrix error in Node.js)
- Worker path set to local file URL: `file://<cwd>/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`
- Scale 2.0 = ~150 DPI A4 (1224×1584 px per page)
- PDF page rendering is parallel (p-limit 5); Gemini detection is sequential for cross-page context
- Page images stored at `batches/<batchId>/page-<index>.png` in Vercel Blob (public, unguessable path)

### Upload size limit

50 MB max enforced both client-side (immediate feedback) and server-side. The Vercel default 4.5 MB body limit is raised via `vercel.json` `functions` config — `memory: 3008` on the init route gives Pro-plan body limits up to ~50 MB. If uploads still 413 after deploy, check that `vercel.json` `functions` key deployed correctly. UI shows a descriptive error for non-JSON platform errors (e.g. 413 from Vercel before the handler runs).

### Env var required

`GOOGLE_API_KEY` — Google AI Studio key with Gemini 2.5 Pro access. Add to Vercel environment variables.

## Environment Variables

`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`, `SIGNUP_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RECEIPT_API_TOKEN`, `RENDER_MARKING_SECRET`, `GOOGLE_API_KEY`, `SUPABASE_SECRET_KEY`

> **Supabase key convention (2026-07-06):** privileged (RLS-bypassing) access uses `SUPABASE_SECRET_KEY` holding a new-style `sb_secret_...` key. All code reads `SUPABASE_SECRET_KEY` first and falls back to the legacy `SUPABASE_SERVICE_ROLE_KEY` JWT, so either name works — prefer `SUPABASE_SECRET_KEY` in new code and new env setups.

## Email delivery reliability

Resend returns **200 + an email id even when it SUPPRESSES** a send (address blocked because a prior email to it hard-bounced or was marked spam) — the mail is never delivered. So "Resend accepted it" ≠ "delivered". Two guards:

- **Send-time suppression check** (`send-invoices`, `admin-emails` resend): after the Resend POST, GET the email's `last_event`; if `suppressed`/`failed`/`bounced`, treat it as **not delivered** — the invoice is NOT marked `Sent`, the EmailLog row is `failed`, the Telegram summary reports it under "NOT delivered", and the bot send shows ❌.
- **Resend webhook** (`/api/resend-webhook`): real-time async events (`delivered`/`bounced`/`complained`/`delivery_delayed`) update the EmailLog `Status` by Resend ID and **Telegram-alert on bounce/complaint**. Setup: Resend dashboard → Webhooks → add `https://www.adrianmathtuition.com/api/resend-webhook`, subscribe to those events, put the signing secret in `RESEND_WEBHOOK_SECRET` (Svix-verified; if unset, events still flow but unverified). To clear a stuck address: Resend dashboard → Suppressions → remove it, then resend.

Email Log resend (`/api/admin-emails` POST) re-attaches the archived PDF and posts a Telegram confirmation ("↩ Email resent" / "⚠️ Resend NOT delivered").
