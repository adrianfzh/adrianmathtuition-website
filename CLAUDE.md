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

## Testing & monitoring policy (2026-07-16)

Two layers guard parent/student-facing operations; keep BOTH current as features land:

1. **Unit tests (vitest, pre-push gated)** — money and date logic MUST live as pure
   functions in `src/lib/` with a sibling `.test.ts`, not inline in routes/handlers.
   Existing homes: `billing-math.ts` (lesson-date counting — use it, never re-implement
   a weekday/proration loop; a duplicated loop in the bot dropped the last Friday of a
   month, Kieran Lai Jul 2026), `invoice-month.ts` (invoice month labels/spanning),
   `invoice-payments.ts`, `additional-lessons.ts` (billable Additional-lesson matching —
   the linked-record-filter regression). When a money bug is fixed, add a named regression test.
   `.githooks/pre-push` runs `npm test` and blocks the push on failure.
2. **Synthetic monitoring** — `/api/health-check` (cron every 6h) probes the live
   parent-facing surfaces (Airtable, public schedule, signup-link HMAC handshake,
   invoice PDF blob, Dropbox notes, Resend, kiosk, the Fly bot) and Telegram-alerts
   ONLY on failure. **Any new parent/student-facing surface must add a check here**
   (a `timed('name', …)` entry) in the same PR that ships the feature.

Definition of done for a feature touching money or parents/students: pure logic in
lib + tests + a health-check entry when it adds a surface. Browser E2E is deliberately
NOT used (solo-maintenance cost outweighs value).

## Key Pages (`src/app/`)

- `page.tsx` — homepage with schedule widget (fetches `/api/schedule`)
- `chat/page.tsx` — web math solver (SSE to Fly.io `/api/chat`)
- `admin/page.tsx` — **admin hub**: status cards (logged today, unpaid invoices, makeups owed, this week's lessons) + launcher tile grid (Schedule, Invoices, Students, My To-Dos, Loop Tasks, Kiosk, …). Cookie-based auth (30-day), PWA-ready. **Tile reorder on phone = iOS-style arrange mode** (2026-07-30): long-press a tile (pointer events, `pointerType==='touch'` only) → tiles jiggle, taps stop navigating, `touchAction` flips to `'none'`, drag freely, ✓ Done exits. Plain long-press-drag can NEVER work here: tiles need `touchAction:'manipulation'` for page scroll, and Safari fixes touch-action at GESTURE START — the arming press can't drag, the NEXT touch can. The long-press detector COMPOSES dnd-kit's `onPointerDown` (spreading over it kills mouse drag).
- `admin/my-todos/page.tsx` — **Adrian's personal to-do list** (add/edit/check/delete, optional due dates with overdue/Today/Tomorrow chips). Supabase `admin_todos` (math project, RLS-on service-role-only) via `/api/admin/my-todos`. NOT the loop queue — nothing automated reads it.
- `admin/todo/page.tsx` — **Loop Tasks** (was titled "To-Do" until 2026-07-24): dev-task queue for the build-test-fix `/loop`; Airtable `Todos` table via `/api/admin/todo`. Open items oldest-first; the loop implements each, runs `npm test`, marks Done.
- `admin/schedule/page.tsx` — lesson management calendar. See [/admin/schedule](#adminschedule--lesson-management) below.
- `admin/progress/page.tsx` — read-only student timeline. See [/admin/progress](#adminprogress--student-timeline) below.
- `admin/invoices/page.tsx` — invoice management dashboard (was `/admin` before restructure)
- `admin/students/page.tsx` — **student directory**: searchable + level-filtered list, links into each profile
- `admin/students/[id]/page.tsx` — **student profile hub** (Phase 1): header (level/subjects/status), **Weekly slots** with 🔀 Switch slot + ＋ Add slot (reuses `/api/admin-schedule/switch` + `/add-weekly-slot`), and read-only Upcoming lessons / Exams / Recent invoices. Data from `/api/admin/student-profile?id=`. Phases 2–4 (inline lesson actions, embedded progress/LessonModal, exam quick-add) pending. Contact lazy-loaded via `student-contact`.
- `admin/mark-paper/page.tsx` — **the marking page in use**: upload the student's working (+ optionally the question paper PDF) → `/api/admin/mark-paper`, a thin proxy to the Fly bot, where the model and all marking logic live (`ai/paper-marker.js` — Opus 5 since 2026-07-28; the page's dropdown is only a label). **Working may be photos OR a scanned PDF** — see below. **Teacher's red pen is the default mark style on every surface** — the bot safelists `style` and falls through to `'teacher'`, a Telegram photo needs a `classic` caption to opt back into pill badges, and this page initialises to `'teacher'`. A new marking surface that defaults to `'classic'` makes the same paper come back looking like a different product.
  - **PDF buttons (2026-07-30): ⚡ Generate both** builds images-then-full sequentially — the 🖼 link is clickable the moment it exists while 📄 still typesets; halves fail independently. `marked` is a labelled LIST (run history re-offers BOTH stored PDFs). **📤 send/save row** under the buttons (the "no amendments needed" fast path): `⬇ Download for WhatsApp` streams the PDF via `/api/admin/mark-paper-download` with a clean filename (Adrian drags it from Downloads into his PERSONAL WhatsApp on the Mac — bot-sent WhatsApp is deliberately NOT built, the business number's 24h window makes it unreliable); `✉️ Email PDF` posts `/api/admin/mark-paper-send` (Resend, same suppression-check-after-send guard as invoices, sender `marking@adrianmathtuition.com`) with a student picker + address prefill (GET `?studentId=`) and a "remember" checkbox that PATCHes **`Student Email`** (typecast) — **that field doesn't exist yet** (metadata create 403'd; Adrian must add it, type email, to Students) and the route degrades to `emailSaved:false` + hint until he does. Both routes gate URLs through `isOurBlobUrl()` (`lib/blob-url.ts`, unit-tested) so they can't be used as an authenticated open proxy.
  - **Filename = `Student — Paper name — 30 Jul 2026.pdf`** (2026-07-30): an editable "Paper name" input in the send row feeds the filename AND the email subject; the run's auto `worksheet (N photos)` label never reaches either (*"worksheet — 86-94 does not seem helpful"*), and the score is filename-free (it's on the PDF's total strip).
  - **Notability round trip (option B, 2026-07-30):** `✍️ Upload annotated` (or drag the PDF anywhere onto the send panel — iPad Split View drag from Notability works) uploads via `/api/admin/mark-paper-annotated-token` client tokens (Notability exports run 5–20MB, past the body cap), then links to the run via `phase:'link-pdf', kind:'annotated'` → `paper_marking_runs.annotated_pdf_url` (column added 2026-07-30; the bot's `linkPdf`/load/stats carry it). **Send-row preference: ✍️ annotated > 🖼 images > first** — once Adrian's pen is on a copy, that copy IS the paper. History rows show `✍️ Annotated ↗`.
  - **Option A (in-browser Pencil annotation) is spec'd, not built** — [`SPEC-ANNOTATE.md`](SPEC-ANNOTATE.md) at repo root, written for a separate Claude session to implement.
  - **Runs link to their student** (2026-07-30): picking a student in the send row silently fires `phase:'set-student'` (bot store → `student_id`/`student_name` on `paper_marking_runs`, indexed; last pick wins). The organizing principle is the same as Lessons/Invoices — a link to the Airtable Student record, NOT per-student Blob folders (Blob is the shelf, the DB row is the index card). `phase:'by-student'` returns one student's runs; `/admin/students/[id]` renders them in a **Marked papers** section (overview tab, ✍️/🖼/📄 links). History rows show the tagged name. Runs marked before 2026-07-30 are untagged until re-loaded and re-picked.
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
- `learn/page.tsx` — Adrian's PARKING PLACE for interactive visuals (Desmos/SVG/steps). Deliberately unlinked from nav — do NOT retire or "clean up"; Adrian is deciding what it becomes (noted 2026-07-16)
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
- `admin/my-todos/route.ts` — personal to-do CRUD (Supabase `admin_todos`): GET open+recent-done, POST `{task,dueDate?}`, PATCH `{id,done?/task?/dueDate?}`, DELETE `{id}` or `{clearDone:true}`
- `admin/todo/route.ts` — loop-queue CRUD (Airtable `Todos`: Task/Status/Notes) for `/admin/todo`
- `admin/status/route.ts` — At-a-glance data: loop todos, personal `myTodos {open,overdue}`, unpaid invoices, students, bot week count

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
- `admin-invoices/route.ts` — GET/PATCH invoices for `/admin/invoices`. GET default **windows PAID invoices to the last ~5 months** (`paidWindowCutoffISO` in `lib/invoice-month.ts`, unit-tested) so the Airtable scan doesn't grow a serial pagination page every ~2 months; unpaid/unsent are always included regardless of age; `?all=1` = full history (the month filter's "Earlier months…" option triggers it)
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

**Two regeneration routes, one intent each — don't merge them:** `generate-pdf-batch` renders the invoice **as stored** (the ✏️ Amend form's manual line-item/credit edits, verbatim); `regenerate-invoice` (the ♻️ Regenerate button) **recalculates** line items from the current schedule (preserving manual `Line Items Extra`). **Issue Date is one shared rule for both** — `resolveInvoiceIssueDate(status, currentIssueDate, todayISO)` in `lib/invoice-month.ts` (unit-tested): a **Sent** invoice being regenerated is *reissued* → **today** (SGT, via `sgtTodayISO()`); a fresh Draft → the **15th**; an unsent Draft with a date → **preserved**. Never re-implement this in a route or the `admin-invoices` PATCH — an amended Sent invoice must carry today's issue date, and the split where one path stamped today and another preserved the old date is exactly the bug that put a stale 15 Jul date on Kiara's amended Aug invoice.

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
   both; JC (H2/H1) → JC2; **Sec 1/2 → S1/S2 practice + notes** (enabled 2026-07-16 — unblocked by
   the sub-group backfill; the `practice_topics` RPC counts via sub-group joins, now also counts
   `parts[].answer`-only questions, AND applies the worksheet's figure gate so picker counts match
   what the sheet can actually serve — diagram-heavy topics show honest small counts until their
   figures are verified). Content routes (`topics`/`notes`/`worksheet`) 401 without the
   `x-kiosk-student` token and 403 on a non-entitled level — enforced server-side, admin bypasses.
5. **Print cap 4 worksheets/day per student** (SGT day) via POST `/api/kiosk/print-log` (gates
   `window.print()`, logs to `kiosk_prints`). GET returns `{used, remaining}` for the "n/4" chip.
5b. **Deterministic daily draw** — the worksheet is seeded on `SGT-date|level|topic|tier`
   (seeded Fisher–Yates over an `.order('id')`-pinned pool; helpers in `lib/kiosk-draw.ts`,
   unit-tested incl. a pinned permutation), so students printing the same topic+tier the same
   day get the SAME sheet (they can discuss); reprints are identical; counts slice one shared
   order (print 8 then 15 → Q9–15 are new). Rotates at SGT midnight. The shuffle runs over the
   **FULL answer-gated pool** with the count slice LAST (fixed 2026-07-16: the old POOL_CAP=120
   applied *before* the shuffle permanently starved every row past position 120 in id order —
   69 of AM Trig (Graphs)' 189 rows could never print). Only the RPC's 400-row fetch cap bounds
   the pool now; any future cap must slice *after* the shuffle.
5c. **Pool is ANSWER-gated, not solution-gated** (fixed 2026-07-16): eligibility = has a
   printable answer (top-level `answer` OR any `parts[].answer`, checked in JS post-flatten)
   + not-deleted + text-only-or-verified-figure. The old `solution NOT NULL` filter was an
   AI-pool leftover that hid ~80% of the extracted bank. Fetch cap 400 → answer gate → seeded
   shuffle over the whole gated pool (no post-gate cap).
5c-ii. **Figure crops resolve via `lib/kiosk-worksheet-images.ts`** (fixed 2026-07-16): the
   `questions.image_url` JSON array holds bare paths (`<file>.png` /
   `question_images/<file>.png`) **or `{url,pos}` objects** (the 2025 EM batch, ~270 rows —
   the old `String(entry)` printed `[object Object]` URLs for all of them). Part-level
   figures (`parts[].image_url` / `image_url_after`, relative or full URL) print inline as
   markdown images at their position — previously dropped, so figure-dependent questions
   (e.g. Mayflower 2024 AM Q10) printed without their graphs. Unit-tested; don't re-inline
   this logic in the route.
5d. **Type A revision worksheets** — "Worksheet type" toggle (✏️ Practice only / 📘 Notes +
   practice). `card=1` on `/api/kiosk/worksheet` attaches the topic's **`topic_cards`** row
   (math Supabase; one per kiosk-level+canonical-topic; `content_md` = markdown+KaTeX, 1-page
   budget; `draft`→`approved` workflow, drafts print with a DRAFT watermark). Card renders as
   page 1 (facts/techniques/traps, blockquotes = boxed formula panels), questions from page 2.
   Cards are authored by the Cowork notes session per `~/Desktop/AdrianMath/TOPIC_CARD_SPEC.md`;
   2 AM pilot drafts seeded (Coordinate Geometry, Circles). Types B (worked-example paired) and
   C (mixed-topic) planned — B needs the S1 sub-group backfill for example↔question matching.
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

✅ **Bot side DEPLOYED** (2026-07-16, rebased as `d0cb2c0` after reconciling with Mac B's
commits) — the full sign-in loop is live end-to-end on the preview. Phase 2 (planned):
recommended-for-you topics from lesson progress, homework pickup, exam-season packs.
Phase 3: print → photograph → AI-mark loop.

## Printable PDFs — Dropbox drop-in folder (`/admin/notes`, kiosk Notes tab)

Adrian saves a DOCX → exports a PDF into his Dropbox app folder → it appears on the
website. **Nothing is copied or synced**: every page load lists Dropbox live, and each
click mints a fresh ~4h temporary link (`/api/admin-notes/dropbox-open`), so a listed
link is never stale. Auth: refresh-token OAuth (`DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET`
/ `DROPBOX_REFRESH_TOKEN`), app-folder scoped to `Dropbox/Apps/AdrianMathNotes/` — the
site can see nothing else in his Dropbox. Health-checked every 6h (`dropbox-notes`).

**Three kinds, one folder layout — encoded ONLY in `dropboxFolderFor()` (`lib/notes-list.ts`,
unit-tested). Never re-derive a folder path in a route:**

| Kind | Dropbox path | Surfaces | Legacy Airtable/Blob merge |
|---|---|---|---|
| `notes` | `/Notes/<LEVEL>` e.g. `/Notes/AM` | `/admin/notes/<level>` + student kiosk | yes (`PrintNotes` table) |
| `revision` | `/Revision/<LEVEL>` e.g. `/Revision/AM` | `/admin/notes/<level>` only (2026-07-28) | no — Dropbox only |
| `prelim` | `/Prelim/<LEVEL>` e.g. `/Prelim/AM` | `/admin/notes/<level>` only (2026-07-30) — 🎯 Prelim segment; O-Level EM/AM + JC prelim practice sets (S1/S2 valid but unused) | no — Dropbox only |

- Levels are the same five slugs everywhere: `s1 s2 em am jc`.
- **Legacy-root fallback (transition shim, 2026-07-28)** — notes used to sit loose at the
  app-folder root (`/AM`). `legacyDropboxFolderFor()` makes an empty `Notes/<LEVEL>` fall
  back to `/<LEVEL>` so the deploy and the Dropbox move needn't be simultaneous. **Delete
  the fallback + its test once the root level folders are gone.**
- **Listing is non-recursive by design** — a PDF must sit loose in the level folder;
  `Notes/AM/Trig/foo.pdf` is invisible. A folder that doesn't exist yet lists as empty
  (Dropbox `not_found` is swallowed), so a typo'd path fails SILENTLY — hence the test.
- The site NEVER writes to Dropbox (`lib/dropbox.ts` = `listFolder` + `getTemporaryLink`
  only), so it can't create these folders — they're made by hand in Dropbox.
- Filename is the display title (`titleFromFilename`: strip `.pdf`, `-`/`_` → spaces).
- `/api/admin-notes?level=am&kind=notes|revision|prelim` (400 on a bad kind);
  `/api/admin-notes/counts` returns `{counts, revisionCounts, prelimCounts, total}` for the hub pills.
- Revision worksheets and prelim practice sets are **admin-only** (Adrian: revision
  2026-07-28, prelim 2026-07-30) — the kiosk still serves `notes` only, so no
  student-facing surface changed and the 4/day print cap is untouched. Opening either
  to students = add a kind param to `/api/kiosk/notes` + an entitlement check + a
  health-check entry.
- The Blob-upload path (`upload-token`/`register`, rename/replace/delete in Edit mode) is
  the LEGACY notes source and stays notes-only; revision and prelim have no upload UI.

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
- **Linked record filtering**: Cannot use `{Student}='recXXX'` on a linked record field, AND `FIND('recXXX', ARRAYJOIN({Student}))>0` also does NOT work — `ARRAYJOIN` returns the linked record's **display name** (e.g. "Sim Ze Kai"), not the record ID. Correct pattern: filter by other fields (Date, Status, Exam Type, etc.) in Airtable, fetch the `Student`/`Slot` fields too, then match the record ID in JS: `r.fields['Student']?.[0] === studentId`. Applies to all linked-record fields. **This exact mistake sat in `generate-invoices`' Additional-lesson query and silently unbilled every Additional lesson from launch until 2026-07-26** (0 of 315 invoices ever carried one) — fixed via `lib/additional-lessons.ts` (window-fetch all, match student in JS; unit-tested).
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
- **Roster** — read-only slot enrollment view (which students are in which weekly slot). **Date-aware**: reflects who was enrolled during the VIEWED week, not just today. The schedule API fetches ALL enrollments (not only `Status='Active'`) with Start/End Date and filters by tenure overlap `[weekStart,weekEnd]` in JS (missing Start = "since forever", missing End = "still open"). So a past week shows that week's real membership — a since-departed student reappears, a switched student sits in the slot they were actually in then. A `⏮ Roster as it stood the week of …` notice + "This week" pill appear when viewing a non-current week. (Slot switches END the old enrollment + CREATE a new one rather than editing in place, which is what makes history derivable.)

Tab choice persists in `localStorage` (key: `schedule_view_mode`).

### Chip features

- **Quick attendance pills** — ✅ / ❌ (and `undo`) appear on chips for **today and yesterday only**; tap to set Completed/Absent. This is a UI convenience gate, NOT a rule: attendance can be set on **any** date via the chip's action sheet (✅ Mark present / ❌ Mark absent → `PATCH /api/admin/progress/lessons`, which has no date window). The 14-day `EDIT_WINDOW_DAYS` lock applies to **progress fields only** (topics/mastery/mood/notes), never to Status.
- **Rescheduled-away chips report the END of the chain, not the first hop** — `Rescheduled Lesson ID` forms a *chain* (a makeup can itself be moved). `lib/reschedule-chain.ts` (`resolveRescheduleChain`, unit-tested) walks it and classifies the result: `delivered` (green ✓) / `missed` (red — makeup also missed, still owed) / `cancelled` (red) / `upcoming` (blue) / `unmarked` (amber) / `broken` (grey); `↻n` marks >1 hop. **Use this lib — never re-walk the chain inline.** Both `/api/admin-schedule` and `/api/admin/student-profile` call it; they previously had separate copies and the schedule one read only one hop, so a twice-moved-then-taught lesson showed as pending while the profile page showed it correctly. `/api/admin-schedule` fetches onward hops in a bounded loop (usually 0 extra rounds).
- **Attendance outcome is visible on every date** — green `Completed` / red `Absent` render regardless of how old the week is, and a past lesson still at `Scheduled` shows an amber `? unmarked` flag. (These used to sit behind the same today/yesterday gate as the ✓/✗ buttons, so on an older week an attended lesson looked identical to a never-marked one.) Any new chip-status affordance must gate the *buttons*, not the *label*.
- **Reschedule labels carry the weekday and the origin** (2026-07-24) — rescheduled-away sub-line reads `Rescheduled → Fri, 24 Jul 5-7pm`; the DESTINATION Rescheduled/Makeup chip shows `↩ from Fri, 24 Jul 3-5pm` (`rescheduledFrom` in the schedule payload: same-week source record reverse-lookup, else parsed from the `Rescheduled from …`/`Makeup for …` note the create routes stamp — cross-week sources with fully custom notes have no origin).
- **Topic timeline: planned next-lesson topic + self-healing corrections** (`/api/admin-schedule/topic-timeline`) — a row with **no Started and Current=false is a PLAN** ("next lesson's topic"; no new Airtable fields). POST actions: default advance (replace), `add` (another concurrent current topic), `end` (retire one row), `plan` (additive), `startPlanned` (rowId, keeps other currents), `autoStartPlanned` (ALL planned → current; fired when the sheet opens on a TODAY lesson), `clear`, rowId edit/delete. MULTIPLE topics may be current and multiple planned at once. Correction rules: retiring a topic **set today deletes** the mis-pick (no `24 Jul – 24 Jul` noise rows); re-adding a topic **ended today resurrects** its original row; adding/advancing into a planned topic consumes the plan. Every write calls `invalidateScheduleStatics()` (Topic Timeline is in the statics cache — without it the chip's 📘 line stayed stale for up to 60s). Work-tab UI (2026-07-26): ONE flowing form per subject — TODAY'S LESSON (topic chips + always-visible picker + mastery + quick note) → HOMEWORK (`Homework Assigned` via lesson-update, prefilled from lesson-context) → NEXT LESSON (planned chips + picker) → Save lesson log; the separate THIS LESSON box is gone.
- **⚠ exam season pill** — appears when student is missing exam date or tested topics for the active exam type
- **Chip info lines (no pill — retired 2026-07-26)** — the exam/topic pill is gone; the student NAME is the tap target for the Exam | Regular-work sheet. Chips show labelled sub-lines instead: `📅 WA3 · A Math · 20 Aug — topics` per subject (`examSummaryLines()`, exam type leads; P1/P2 split renders `P1 …, P2 …`), `✅ WA3 done` (green) once all exam dates are past, `📘 Working on: <topics>` + `📗 Next lesson: <topics>` (from `currentTopicByStudent`/`nextTopicByStudent`), muted `no exam / topic yet` when nothing is recorded, `📋 Project Work · no WA3` for PW/AA.
- **Prelim = all topics tested** — in the exam dialog, when `examType==='Prelim'` the per-subject topic picker is **hidden by default** (just an "＋ Add specific topics (optional)" reveal), since prelims test everything. The picker still appears if topics were already saved or the admin clicks reveal (`prelimTopicsOpen` set, reset per open). Other exam types show the picker as before.
- **Project Work / Alternative Assessment (PW/AA)** — some students sit PW or an AA *instead* of a WA. The exam dialog has a "Project Work / Alternative Assessment (no WA exam)" checkbox + a PW/AA toggle; checking it means no WA exam. Stored with NO new Airtable field: the marker record gets `No Exam=true` + a `PWAA:<type>` marker in **Exam Notes** (same marker-in-a-field pattern as the `~|` approx flag / paper-in-Subject). The schedule route parses it into `examAssessmentByStudent` (sid → 'Project Work' | 'Alternative Assessment'); the chip pill shows `📋 Project Work` / `📋 Alt. Assessment` and a `📋 … · no WA3` sub-line instead of "no upcoming exam". `set-exams` accepts `pwaa` in the body.
- **Progress dot** — green `●` on chip when `Progress Logged = true`
- **Student name tap** — opens the same tabbed **Exam | Regular work** sheet as the chip pill (2026-07-24; the old LessonModal overlay is retired on this page — the component remains on `/admin/lessons` + `/admin/students/[id]`). Trial lessons still open `/admin/progress` in a new tab. The sheet opens on the **Exam tab during an active exam season**, Regular work otherwise (`openWork` still forces the work tab from the 📘 topic pill).
- **Classmate exam fill (same school = same paper)** — in the Exam tab: (a) **"Also save for classmates"** — tick same-level students and Save writes the identical exam info to each via per-student `set-exams` POSTs (subjects filtered to what each ticked student takes; a ⚠︎ marks students whose existing exam info would be overwritten; mismatched-subject students are skipped and named in the toast); (b) **"📋 Same school? Copy exam info from:"** — shown while the current student's rows are empty; prefills rows from a classmate's saved entries (`rowsFromEntries`, shared with `openExamEdit`) for review before saving.

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
  - **Proration** (`lib/switch-proration.ts`, unit-tested): reconciles the switch month's **actual lessons** against **what the issued invoice billed** — `adjustment = (correctLessonCount − billedLessonCount) × rate`, where `correctLessonCount` = actual Regular non-cancelled lessons that month (post-switch, counted from real records) and `billedLessonCount` = `Base Amount ÷ rate` of the issued switch-month Regular invoice. **No issued invoice for that month → adjustment 0** (the monthly generator bills the new enrollment correctly). The OLD formula `(newRemaining − oldRemaining)` counted forward from the switch date only and assumed every pre-switch old-weekday lesson billed was delivered — it silently missed a $70 overbill when a billed final old-day lesson never happened (Kiara Tan, Jul 2026: billed 5 Fridays, switched to Sat, attended 4). If non-zero, creates a Draft **`Invoice Type='Adjustment'`** invoice; **a credit on an already-PAID switch month is attributed to the NEXT month** (so it reduces a future payment, not a settled one). `typecast:true` creates the `Adjustment` option on write.
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

### LessonModal (retired on /admin/schedule 2026-07-24 — still used by /admin/lessons and /admin/students/[id])

Shared component `src/components/LessonModal.tsx`. On the schedule page, name tap now opens the tabbed Exam | Regular-work sheet instead. Sections:

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
- **409 double-booked (`doubleBooked: true`)** — the same student occupying the same
  (date, slot) twice is physically impossible, so every lesson-creating route
  (`reschedule`, `add`, `admin-revision-attendance` makeup) calls
  `findStudentSlotConflict()` (`lib/schedule-helpers.ts`) and hard-409s on a hit.
  **`force` does NOT bypass it** (force covers capacity/away overrides only) and the
  client must not offer the "book anyway" retry for it. Occupancy rule (not
  Cancelled/Absent/Rescheduled) is the pure `occupiesSlot()` in `lib/double-booking.ts`
  (unit-tested); `/admin/schedule` uses its `findDoubleBookedIds()` to badge any
  pre-existing duplicates with a red "⚠ double-booked" chip pill. Added after Adele
  (26 Jul 2026) ended up with a thrice-moved lesson AND an unrelated makeup in the
  same Sun 9–11am slot. Any NEW lesson-creation path must call the same guard.
- **`Booked Via` (Lessons, single select — actor attribution, added 2026-07-23)** —
  every lesson-creating write stamps WHO booked it: website routes write `Web admin`;
  the bot (repo `adrianmath-telegram-bot`, `lib/reschedule.js` `bookReplacementLesson`
  + the Additional-lesson creations) writes `Bot (parent)` / `Bot (student)` /
  `Bot (admin)` / `WhatsApp (parent|student)`. Write with `typecast: true` and drop
  the field gracefully on `UNKNOWN_FIELD_NAME` — a booking must never fail on
  metadata. Shown in the /admin/schedule chip action sheet ("✍️ Booked via …");
  records created before the field existed are unstamped. **Any new lesson-creation
  path must stamp it.**
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

## /admin/mark-paper — scanned-PDF working (client-side rasterisation)

Adrian can drop the student's working in as **a scanned PDF** instead of phone photos.
The PDF never reaches the server as a PDF: `pdfToPageImages()` in
`src/app/admin/mark-paper/page.tsx` rasterises it **in the browser** to one JPEG per
page and feeds those into the ordinary photo path, so marking → Gemini bounding boxes →
red-pen overlay → assembled PDF are all untouched (annotation needs a raster). Doing it
client-side also keeps a fat scan off Vercel's 4.5 MB request-body ceiling.

Three non-obvious details, each a bug if changed:

- **`intent: 'print'` on `page.render()`** — the default `'display'` intent paces the
  paint loop with `requestAnimationFrame`, which a hidden or backgrounded tab never
  fires: the render promise then never settles and the conversion hangs on page 1 with
  no error and nothing in the console. `'print'` paces with timers.
- **`disableFontFace: true`** on `getDocument` — glyphs draw as paths; the page is only
  ever rasterised, so document-level `@font-face` machinery is pure risk.
- **White fill before rendering** — PDF pages have no background of their own, and JPEG
  turns the transparent paper black, so the marker would see nothing.

The worker is a **vendored copy at `public/pdf.worker.min.mjs`**, not a bundled import.
pdf.js refuses to run when worker and API versions differ, and `npm update pdfjs-dist`
would leave the copy behind — breaking PDF uploads at runtime with nothing failing at
build time. `src/lib/pdf-worker-asset.test.ts` pins the pair; when it fails the fix is
`cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs`.

## Marked-PDF assembly — page order + LaTeX repair

The marked PDF (`/api/admin/mark-paper-pdf`) interleaves each **annotated photo** with the
**typeset transcript sheets for that photo** — photo 1, its transcripts, photo 2, its
transcripts, … (changed 2026-07-28; transcripts used to be a block at the very end).

**Two PDF buttons, two products** (`mode` on the route): **📄 Generate full PDF** =
annotated photos **+** the typeset transcript sheets interleaved behind each photo (the
route renders one PNG per question through Puppeteer — the slow path). **🖼️ Generate
images PDF** (`mode:'photos'`) = the annotated original photos ONLY, no typeset pages,
no Puppeteer — a few seconds, and the closest thing to a hand-marked script. With a
single photo the full mode returns a PNG (`kind:'image'`) instead of a PDF.

### Photo vs transcript — who says what (2026-07-29)

The two surfaces look overlapping but are not interchangeable, and the division below is
load-bearing: **the photo is the only surface that exists in BOTH PDF modes.** 🖼 images-only
has no transcript at all, so anything shown only on a transcript is something a student may
never receive.

| | **Annotated photo** (bot, `ai/annotate.js`) | **Transcript sheet** (site, `marking-template.html`) |
|---|---|---|
| What it is | the marked script — his own paper, red pen on it | a legible re-write of his working |
| Carries | boxed `awarded/max` per part · one-line `error_summary` per part below max · ticks/crosses · circled page total · footer "Marker's notes" · **in 🖼 mode only: the "Where you went wrong" paragraphs + the worked solution** | every line of his working re-typeset with ✓/✗ · the corrected line inline · struck wrong answer + the right one · "Where you went wrong" paragraph · **the worked solution** |
| Says | what each part scored, and WHY a mark was lost | what the answer WAS |
| Granularity | per PART | per LINE |
| In 🖼 images-only mode | ✅ | ❌ absent |
| Legible when the handwriting isn't | no | yes — that is the whole point |

- **"Marker's notes" is not a duplicate of the transcript — it is the OVERFLOW of the photo's
  own margin.** A part's score box and `error_summary` are written beside the working when
  `findSpot` finds room; when it doesn't (crowded scan, part Gemini couldn't locate), that same
  text spills to the strip under the page rather than being dropped. Sparse Marker's notes =
  the margins had room. A long one = a dense page, not a second opinion.
- **The comments go on the PHOTO, the worked solution goes on the TRANSCRIPT** — Adrian's
  call, 2026-07-29: *"there is no need for comments to be on both, so the comments are on the
  actual image/pdf, as well as why student's working is wrong, then the correct solution on
  transcript."* The rule is **once per document, not once per system**: a 📄 full PDF has a
  transcript sheet behind every photo, so the photo omits the solution; a 🖼 images-only PDF
  has no transcript anywhere, so its photos must carry it or the answer is nowhere. (First
  cut suppressed it on the photo unconditionally — which silently emptied 🖼, the button
  Adrian actually presses: 5 of the 6 sample PDFs he sent were images-only.)
  - **Two renders, one grounding pass.** `annotateToBuffer` composites the SAME Gemini
    `annotations` object twice — `buffer` without the 🖼-only footer content,
    `bufferWithSolutions` with it — and `annotateAndUpload` puts both to Blob (`-sol`
    suffix; the timestamp alone can collide on parallel puts). Gemini runs once; the twin
    costs one sharp pass. **Don't "simplify" it into two `annotateToBuffer` calls** — that
    doubles the vision spend on every photo of every paper. Since 2026-07-30 the twin
    carries TWO things the plain copy never does: the **"Where you went wrong" paragraphs**
    (one per question below max — `feedbackEntry` in `ai/solution-entry.js`, gate is
    `awarded < max`, NOT `matches_correct`: a right answer with a lost method mark still
    deserves it) above the **worked solutions**. The twin is null when neither list has
    entries (nothing dropped marks → the two images would be identical), and on the
    last-resort margin rung, which has no footer strip.
  - `annotated_photos[]` therefore carries `{ photo_index, url, url_with_solutions, method }`.
    **Which one goes in is `pickAnnotatedPhotoUrl()` (`lib/annotated-photo-source.ts`,
    unit-tested), not an inline ternary in the route** — it is silent in both directions: the
    plain copy in 🖼 mode answers nothing, the twin in 📄 mode answers twice. `url` is the
    fallback everywhere (twin absent, upload failed, or a run marked before 2026-07-29), and
    the route re-fetches `url` if the twin 404s out of Blob.
  - The photo's footer keeps its `solutions` capability for exactly this reason — it is the
    same strip that carries the `question_found` notices and the Marker's-notes spill.
  - The Telegram flow is unaffected — it renders overlay and transcription in parallel and
    sends the transcription first, so its photo passes no solutions (it is the 📄 case). If
    BOTH renderers fail, `structuredMarkingToText` still writes `📖 Correct solution:` into
    the plain-text message: with no picture at all, that text is the only thing that arrives,
    so it does NOT adopt the split.
  - **A THIRD surface must answer the same question before it ships: does a student holding
    only this document learn what the answer was?** If yes it omits the solution, if no it
    carries it. Neither answer is "always".
- Adrian, seeing both for the first time: *"what's really the difference between Marker's notes
  and the transcript? seems duplicated, but each has it's good points"* — keep both, keep the
  split above.
- **The marker's comments on the photo are 0.85× the score-box size, floor 12px** (changed
  2026-07-30; they briefly matched the boxes per Adrian 2026-07-29, but at that size whole
  notes rarely fit a dense page's holes and nearly everything spilled to the footer — Adrian:
  *"make the fonts smaller for corrected lines?"*). Still ONE source: `ai/annotate.js` derives
  `cFs` from `_marginScoreGeom('0/0', mFs).fs`, and `lineH` + the leader-curve threshold
  follow from it.
- **Pages are rotated upright BEFORE marking** (2026-07-30). EXIF rotation only covers phone
  photos; a CamScanner page scanned upside down is upside down in its pixels — it was marked
  inverted with weak tick grounding and stapled inverted into both PDFs. `ensureUpright` in
  `ai/paper-marker.js` runs one tiny vision call per photo (`detectRotation`/`parseRotation`
  in `ai/photo-overlay.js`, unit-tested); only exactly 90/180/270 rotates, anything else
  means leave-the-page-alone — a wrong guess rotates a GOOD page. Failures fall back to the
  unrotated photo.
- **A successful line pass can still leave parts unboxed — on spreads, a region-only
  recovery re-looks per half** (2026-07-30). A null part region sends that part's score and
  diagnosis straight to Marker's notes without placement ever being attempted (the Q5(a)(i)
  case: acres of white space, note still in the footer). On a landscape image, teacher style
  re-asks for just the missing parts per half at full resolution; `applyRecoveredRegions`
  (pure, unit-tested) fills ONLY null bboxes — located regions are never second-guessed,
  invented keys ignored.

**One feedback comment per attempt, not two** (2026-07-29). The marking JSON used to
carry `summary.body_markdown` (rendered on the sheet) *and* `overall_comment` (printed
raw in the results table) — the same judgement written twice, so the wording drifted
between the two surfaces. The bot now asks for `summary` only, spec'd Unicode-only (no
LaTeX), and derives `overall_comment` from it via `plainFromMarkdown()`
(`ai/plain-text.js` in the bot, unit-tested). **Don't add a second free-text summary
field** — a new surface strips the one that exists.

- Order lives in `lib/marked-pdf-order.ts` (`orderMarkedPages`, unit-tested), not in the
  route. Sheets are bucketed by **`photo_index`**, which the mark-paper page must keep
  sending in its `results[]` payload — drop it and every transcript falls to the back
  again (orphans and index-less sheets are appended, never lost).
- **No cover page — the paper total rides on the first marked page** (2026-07-29, Adrian:
  "don't have to put the first page"). `mark-paper-pdf` grows page 1 by a `stripHeight()`
  header band (`addPage([w, h + strip])`, image still drawn at `y: 0`) and stamps a boxed
  red `PAPER TOTAL  x / y` at the **left** of it, student/date muted at the right. Left,
  not right, because the annotated photo already carries the bot's hand-circled **page**
  total in its top-right corner — two unlabelled red scores in one corner read as a
  contradiction. The strip flag is set *before* drawing so a throw can't slide it onto
  page 2, and the single-photo `kind:'image'` path is untouched (one page, one total).
- **Every page is laid out at `PAGE_W = 595` pt, height proportional** — pages used to be
  sized to their own pixel dimensions, so a typeset transcript came out visibly bigger
  than the photo it explained ("why is the transcript larger than the marked page
  itself?", Adrian 2026-07-29). Uniform WIDTH, not uniform A4: letterboxing a landscape
  two-page CamScanner spread into portrait would shrink the working to a band adrift in
  white space.
- **Fonts: the transcript needs explicit symbol fallbacks** — `marking-template.html`
  loads Noto Sans Math + Noto Sans Symbols 2 and lists them *after* Caveat / Crimson Pro /
  JetBrains Mono in every `--font-*` stack. None of the three primaries has `∠ ≅ △ ∴`, and
  the serverless Chromium has almost no system fonts behind them, so plain-text fields
  rendered those as tofu boxes (LaTeX is fine — KaTeX draws its own glyphs). Per-character
  fallback means the Notos only ever supply the missing glyph.
- **`.final-answer` is a flex row whose children need `min-width: 0`** — a flex item
  defaults to `min-width: auto`, so the value collapsed to min-content and a long answer
  wrapped ONE WORD PER LINE in a tall narrow column. The `Answer` label is `flex: 0 0 auto`
  + `nowrap`; the value is `flex: 1 1 auto` + `min-width: 0` + `overflow-wrap: anywhere`.
- **ONE type size for the whole transcript — `--fs-body` (15px)** (2026-07-29, Adrian:
  "all fonts same size in transcript"). The question prompt, the working, the red-pen
  corrections, the answer and the feedback paragraph all read from that variable; only
  scores and label chips keep their own size (circled question number, `[n marks]`,
  the mark total, the score badge, and `--fs-label` 11px mono for `QUESTION`/`ANSWER`).
  **A new transcript element gets `var(--fs-body)`, not a number** — the sheet used to
  span 15–20px and the blocks visibly disagreed about how big the paper was.
  - **`.katex` is pinned to `1.06em`.** KaTeX's own default is `1.21em`, calibrated
    against a 16px UI font; left alone it made every typeset working line a size
    larger than the prose beside it, which is most of what "different sizes" looked
    like. 1.06em keeps maths a hair up (smaller x-height) without reading as bigger.
  - **The question prompt is differentiated by treatment, not by size** — a mono
    `QUESTION` chip (`::before`), the italic, a solid tint and a dark left rule. It is
    the same size as the working by request, so nothing else may carry that job.
- **The final answer is TYPESET, from `student_final_answer.value_latex`** (2026-07-29).
  It was the last raw LaTeX on the sheet — a plain `23.5\text{ g}` on the one line a
  student reads first. `mathify()` adds `$…$` only when the value looks like maths
  (contains `\ ^ _ {`), so a bare `60 g` stays prose instead of being set in math italic;
  the row is built with `textContent` + `data-plain` like the working lines, never
  `innerHTML`.
- **Everything crossed out is PAINTED, not `text-decoration: line-through`** — a wrong
  final answer (`.wrong-answer`) and a working line the student struck through himself
  (`.work-line.struck .line-text`) share one `linear-gradient` stripe rule.
  `text-decoration` does not propagate into KaTeX's inline-block boxes, so the moment
  either was typeset the strike simply vanished and only the fade was left.
  - **The host must be INLINE**, which is why a working line's text sits in a
    `<span class="line-text">` inside the `.line-content` block rather than directly in
    it. An inline box's background is sized from the font, so the stripe lands at strike
    height instead of halfway down a tall fraction, and `box-decoration-break: clone`
    repaints it on every wrapped fragment (without `clone`, one stripe spans the whole
    box). `data-plain` rides on that span too, so the plain-text fallback swap keeps
    the strike. A block host gets one stripe through the middle of the whole box —
    don't move the rule back up.
- **`lib/latex-repair.ts` (`repairLatex` / `repairMarkingLatex`, unit-tested)** runs in
  `render-marking.ts` before KaTeX ever sees the payload. The model's JSON escaping is
  unreliable in both directions within a single paper — `frac{1}{2}` (backslash dropped,
  renders as the letters f-r-a-c) and `\\frac` (doubled, renders as an error) — so the lib
  collapses over-escapes and restores dropped backslashes on a known command list,
  masking `\text{…}` spans so English prose isn't mangled.
- Two more render-side rules that were each a live bug: the payload is injected with a
  **function** replacement (`template.replace(ph, () => json)`) because a string
  replacement expands `$&`/`` $` ``/`$'`/`$1` in a payload that is wall-to-wall `$…$`
  maths; and line content is set with **`textContent`, never `innerHTML`**, because an
  ordinary `$\frac{d^2v}{dx^2}<0$` otherwise opens an HTML tag at the `<` and swallows
  the rest of the line. KaTeX auto-render walks text nodes, so `textContent` is enough.
- Every line carries `data-plain`; after auto-render, any element that errored
  (`.katex-error`) **or was skipped entirely** (no `.katex`, still showing `$`/`\cmd`)
  is replaced by its plain transcription. A reader never sees raw LaTeX. The sweep
  selects on `[data-plain]`, not `.line-content[data-plain]` — the answer spans opt in
  the same way, and so should anything typeset in future.
- No AI attribution anywhere on the sheet — header and footer read "AdrianMath"
  (Adrian's call, 2026-07-28).

**Prompt caching on the question paper (bot, `ai/paper-marker.js`)** — the PDF carries a
1h `cache_control`, but every photo is marked in PARALLEL, so they all raced to *write*
the same prefix: N writes at 2× input price, zero reads — worse than no caching.
`warmPdfCache()` now prefills the entry with one tiny `max_tokens: 1024` call before the
fan-out (skipped for a single photo; failures are logged and ignored). The cached prefix
is **`tools → system → messages`**, so the warm-up must use the same model, the same
code-exec tool, the same system prompt and the same leading `pdfBlock` as
`markPhotoDirect` — change any one of them and the marking calls miss the entry the
warm-up just paid to write. Thinking config is part of that too: it's shared via
`streamOpus`, so don't give the warm-up its own.

Tick/cross rendering on the photos themselves lives in the **bot** (`ai/annotate.js`):
marks are drawn just past `bbox.x2`, centred on the glyph's own optical centre, at
`~0.95 × fontSize`. The old code anchored on `annotationX + fontSize` with a glyph that
extended up-and-right of its anchor, which put marks ~130 px out in the margin.

### Margin layer — the score and the reason, beside the working (bot, 2026-07-29)

Ticks alone don't tell a parent anything. On top of the line marks the overlay now writes,
on the ORIGINAL photo: a **boxed `awarded/max` in the right margin** aligned to the top of
each part's working, and — for parts that dropped marks only — the part's **one-line
`error_summary` placed in real white space** with a leader curve to the crossed step.
Ticks/crosses stay, but they're decoration; the box and the sentence are the product.

- **Placement is arithmetic, not vibes** — `ai/whitespace.js` (pure, no sharp, 20 tests)
  thresholds the page to an ink/no-ink grid, dilates by a cell, and searches a summed-area
  table for the nearest free window to the anchor. It counts **dark pixels, never averages
  brightness** (a thin printed rule is a few dark pixels in a bright cell — an average calls
  it empty and the comment lands on the rule). `occupy()` claims every rectangle it uses,
  including the ticks already placed and the top-right corner reserved for the page total,
  so two comments on a page with one big blank area can't stack in the same hole.
  **Nothing is ever drawn over working** — a null occupancy grid means "place nothing",
  never "the page is empty".
- **`findSpot` takes hard `colMin/colMax/rowMin/rowMax` bounds, and the anchor is the
  part's own `bbox.x2` — never the image's right margin** (fixed 2026-07-29). A CamScanner
  two-page spread is ONE image, so its right margin belongs to the *right-hand* page: every
  part's score box landed there in a stack, far from the working it scored, which is what
  Adrian read as "a lot of duplicate marks". The score box now searches a band beside its
  own part (≈0.4%–19% of page width right of `x2`), relaxing through two wider bands before
  giving up; comments search a ≈30% band around the part's vertical extent at three
  wrap widths (26/16/34 chars) — **whole note or nothing**, never a mid-sentence clip.
  The LAST band of each drops the horizontal bound but keeps the vertical one: anywhere on
  the page **at the right height** still reads as this part's, and `findSpot` takes the spot
  nearest the anchor, so it only reaches across when the near margin is genuinely full.
  Without that band a crowded margin sent perfectly placeable boxes to the footer.
- **Every band is a fraction of the part's own COLUMN, never of the image** (fixed
  2026-07-29 — the second half of the same bug). Bounding each box beside its own working
  was necessary but not sufficient: the *unit* was still the image, and on a two-up scan one
  physical page is only ~40% of the image width, so a "tight 19%" band is half a page wide
  and crosses the gutter. Q7(c)'s `1/3` and Q7(d)'s `0/2` were written in the FACING page's
  margin beside Q8 — Adrian: *"the marks 1/3, 3/3, .. placement does not seem accurate"*.
  `pageColumns()` (`ai/whitespace.js`, unit-tested) projects the part bboxes onto the x axis
  and merges overlaps — two physical sheets give two intervals, an ordinary photo gives
  exactly one — and `columnBoundsFor()` returns how far left/right that part may be written,
  **splitting the gutter down the middle**. Fewer than two columns ⇒ full width ⇒ byte-for-byte
  the old behaviour for single-page photos (there is a regression test pinning exactly that).
  Even the last-resort band is clamped to the column: reaching across a gutter is never an
  improvement on the footer strip.
- **EVERY score box is captioned with its part key, `Q` and all** — `Q6(a) 2/2` (2026-07-29).
  It used to be captioned only on the attempts that had drifted, and the caption stripped the
  leading `Q`, so one page came back with `6 2/2`, a bare `1/1` and `(c) 2/2` — Adrian:
  *"sometimes marks are written, sometimes not written. And 6 2/2 is misleading, perhaps
  Q6 2/2"*. A page that captions some boxes and not others reads as two different markers, and
  a bare `2/2` beside one column of a two-up scan belongs to whichever question the reader
  guesses. **Nothing is written uncaptioned to save space**: a box that fits nowhere goes to
  the footer strip, which prints its key beside the score anyway.
  - **The caption is what we KNOW, never what we guessed** (2026-07-29). A part's number is
    taken from its own attempt (`qTag()`), and **nothing is borrowed from a neighbour**:
    `parts` is the whole PHOTO's parts — one contiguous run per attempt, every part stamped
    with that attempt's number (`paper-marker.js`: `{...pt, question: a.question_number}`) —
    so a neighbour carrying a number is by construction a *different question*. The earlier
    "borrow the first number in the array" rule captioned an unmatched attempt `Q3(b) #2`,
    filing a score under a question the student never answered. A null number is information
    (the MATCH step found no printed question), so the key falls back to the part label
    alone — `(b) 3/3` — and the per-question rung likewise stopped keying `Q${index}`, which
    numbered boxes by their position in the photo's list rather than the paper's.
  - **In teacher style the score is written ONCE, by the margin layer.** The per-question
    rung used to put the score in the annotation's `text` too, and a part-marks score renders
    as a `comment` whose text IS the score — so a boxed `Q1 4/5` came back with a bare
    unboxed `4/5` beside it, reading as two different marks for one question. Classic style
    has no margin layer, so there the annotation stays the only place it can go.
  - **The first placement band is level with the part's FIRST line** (`top - 0.6·boxH` →
    `top + 1.2·boxH`). The band below it reaches 40% of the part's height, which on the
    per-question rung — where a "part" region is a whole question — is most of a page: fine
    as a fallback, wrong as a first choice. The point of a margin score is that the eye
    travels straight left from it to the work it scored.
  - **Box geometry is `_marginScoreGeom(text, fs)` — reserve and draw share it**, like
    `_teacherScoreGeom`, and it measures with `textWidth` from `ai/font-metrics.js`. The old
    flat 0.56 em/char guess reserved a box nearly twice Patrick Hand's real width, so adding
    the caption pushed boxes out of margins a bare `2/2` had fitted easily.
  - Bands widen to fit the caption (`max(colW × frac, boxW × 1.2)`) but are still clamped to
    the part's own column — a fixed fraction of a narrow two-up column is less than the label,
    so a purely fractional reach would send every captioned box to the footer.
- **A WORKING-ONLY page is marked against a reconstruction, and must say so** (2026-07-29).
  With no question paper attached, the bot uses `STANDALONE_MARK_SYSTEM` — "the printed
  question and the working are BOTH on this page". A continuation sheet or graph paper has
  no printed question at all, so the model reconstructs the task from the working and marks
  against that; the per-part `max` is then **its own allocation, not the paper's**. That is
  a fine thing to do and an unacceptable thing to do silently: `match_confidence` was tied
  only to "partly cut off or blurred", so such a page came back looking exactly as
  trustworthy as one marked off a printed question (Adrian, Jul 2026: *"how does the marker
  know to mark question 1 when no question is provided?"*). **Mark it anyway — and disclaim
  it where it can't be missed** (Adrian: *"the marking can continue, just put a disclaimer
  that there is no question found"*).
  - **`question_found` (per attempt, defaults true)** is the flag: false ONLY when there was
    no question to read — not on the paper, not printed on the page. **A missing question
    NUMBER is not a missing QUESTION** — students routinely leave working unnumbered, and
    the prompt says so explicitly, or the marker starts disclaiming ordinary pages.
  - **The disclaimer is written on the annotated PHOTO**, at the top of the footer strip
    above "Marker's notes" (`formatQuestionNotices` in `ai/annotate.js`, unit-tested,
    threaded through `annotateAndUpload`/`annotateToBuffer` as `notices`). It goes there
    and not only in the results panel because the photo is the one surface that survives
    into 🖼 images-only mode. The last-resort margin rung carries no footer at all, so it
    can't carry this either — only the ⚠ line does there.
  - **The allocation sentence is ours, verbatim, every time**; the model's `match_note` is
    APPENDED for what it inferred the question to be, never substituted for it.
  - **An unnumbered block is located by the model's own `region`** ("The working at left
    column, top") — a page can hold a working-only block above an ordinary printed
    question, so "this page" would disclaim the wrong half.
  - The ⚠ `review_reasons` line distinguishes *no question found* (a fact about what the
    marker had) from *match was uncertain* (a blurry scan). **Any new "the marker had less
    to go on than usual" case belongs in `match_note` + low confidence, never in silence.**
- **A photo with NO ticks on it fell to the coarse rung — and `/admin/mark-paper` now says
  so.** The overlay ladder in `ai/photo-overlay.js` tries per-LINE marks first
  (`geminiLineMarks`); its placement guards cull boxes that are too tall, out of reading
  order or duplicated, and when they cull more than they keep it **throws**, dropping the
  page to `geminiQuestionMarks` — one coarse mark and a boxed score per question, no
  per-line ticks. That is a grounding failure on dense, slanted or two-page-per-photo
  working, **not** a marking failure: the marks are identical either way. The method rides
  back on `annotated_photos[].method` (`'line' | 'question' | 'margin'`), and the results
  panel prints an amber note naming the photos that came back coarse, so "the marker
  skipped my page" is legible as "re-shoot that page straighter". Adrian, Jul 2026: *"some
  questions there are no ticks, is it because the working is too messy?"*
  - **Two-up spreads get a per-half retry before falling coarse** (2026-07-30). The
    pipeline caps photos at 1600px (`normalizePhoto`), so a CamScanner two-page spread
    gives each physical page ~800px — too coarse to box dense working, which is why neat
    pages were losing their ticks (Adrian: *"it is not too messy"* — correct; the layout
    was the problem). When the line pass fails on a **landscape** image (`w > h*1.15`),
    `geminiLineMarksSpread` cuts at the gutter and re-runs each half upscaled to 1600px;
    `mergeSpreadHalves` (pure, unit-tested) shifts boxes back by the crop origin, dedupes
    cross-half line matches (left page wins), and upgrades null part regions when the
    other half found them. A sideways single page self-limits (every line straddles the
    cut → both halves empty → same fall-through as before). On success `method` stays
    `'line'` — the amber note keys off it. Cost: two extra grounding calls, only on
    already-failed landscape pages.
- **Verifying placement locally is misleading** — Patrick Hand is not installed on a Mac, so
  librsvg substitutes a wider sans and every pen line renders ~35% wider than
  `ai/font-metrics.js` measured it, overflowing bands that fit on Fly. Check the *placement*
  (which column, which side of the gutter) locally; do NOT chase apparent overflow. Real
  widths need `fly ssh console -C fc-list | grep -i patrick`.
- **Nothing that doesn't fit is lost — it spills to a footer strip.** Parts with no room,
  and parts Gemini couldn't locate at all (carried through `geminiLineMarks` with
  `bbox: null` instead of being dropped), collect in `spill` and print under
  **"Marker's notes:"** in the strip below the page, under the `question_found`
  notices. The strip is unconditional now, so a dense scan comes back with its
  diagnoses rather than a page of bare ticks. Whether it also carries the worked solution
  depends on which PDF this copy is destined for — see the photo-vs-transcript table above;
  `createAnnotatedImage`'s `solutions` array is filled on the 🖼 twin and empty on the 📄 one.
- **ONE spill entry per part.** The score box and the comment are placed independently, so
  both can fail; pushing at each failure site printed the same part's note twice under
  Marker's notes. The loop accumulates `spillScore`/`spillNote` and every exit from the
  iteration routes through a single `flush()` — **never add a bare `spill.push`**.
- **The red pen writes real mathematics: `$…$` is TYPESET, not transliterated**
  (`ai/pen-math.js`, unit-tested). librsvg does no per-glyph fallback and Patrick Hand
  carries Latin-1 and little else, so symbols either drew as tofu boxes or had to be spelled
  out by `penSafe()` — which is how the footer solutions came back as `v = ds/dt = kpi
  cos(pit)` and `18.964 ~= 19.0` (Adrian, Jul 2026: "able to write the mathematical
  notations latex style?"). Maths now goes through MathJax via `ai/figure-tex.js` and is
  emitted as **flattened SVG `<path>` data** — no installed font involved, identical in
  sharp and in a browser, with real fractions, radicals, superscripts and Greek.
  - **A worked solution is split into steps by `splitTexLines`, NEVER by `/\\n|\n/`**
    (2026-07-29). A literal backslash-`n` is also the opening of `\ne`, `\neq`, `\nabla`,
    `\not`, `\nu`, `\ncong` — the naive regex tore `6>0\neq 0` into `6>0` and `eq 0`, and
    both fragments then printed as raw LaTeX because neither parsed. The lib breaks on a
    literal `\n` only when what follows **cannot** be a command name (`/\\n(?![a-zA-Z])/`);
    the model double-escapes its separators often enough that plain `\n` must keep working.
    Named regression test in `test/pen-math.test.js`.
  - **Consecutive equation steps share an equals column** — `groupAlignedTex` merges a run
    of ≥2 genuine steps into one `$\begin{aligned}…\end{aligned}$` block (MathJax accepts
    it through `texBlock`). A step qualifies only if the whole line is one `$…$` run with a
    top-level `=`, no `\text{…}` on the left, and a short LHS — otherwise "At $x=-0.1$ the
    gradient is…" would stack the word "At" over a fraction. **An aligned block cannot
    word-wrap**, so a group too wide even at the font floor falls back to its own rows
    (`part.rows`, not a re-split of the source — re-splitting duplicated every earlier group).
  - **The footer is set at `0.72 ×` the mark size, not `1.05 ×`.** It is read, not glanced
    at; at the old size it was the loudest thing on the sheet and pushed a long solution
    onto a second screen (Adrian, Jul 2026).
  - **The split is per LINE, not per run.** A line with no maths is hand-written in the pen
    (most margin comments, every heading); a line containing any `$…$` is typeset WHOLE,
    prose included. Mixing `<text>` and `<path>` on one line means positioning the paths by
    summing *estimated* text widths while librsvg does the real shaping (kerning and hinting
    are not in the advance table), so the failure mode is prose written **on top of** a
    fraction. Rendering `so $r = 5$ not $8$` both ways settled it — mixed runs printed
    `r = 5not 8`. **Don't reintroduce per-run mixing.**
  - Prose inside a typeset line keeps `∠ ≅ ≈ → ∞ °` as written (MathJax draws them); only
    the pen path still transliterates via `penSafe()`. TeX specials are escaped by
    `texEscapeText` — every form was probed against `figure-tex` first, because MathJax has
    no `\textasciitilde`/`\textbackslash` and a bare `~` silently becomes a space.
  - `ai/font-metrics.js` reads **real advance widths** from the vendored
    `assets/fonts/PatrickHand-Regular.ttf` (mean 0.423 em, glyphs 0.224–0.68). The old flat
    0.5 em guess measured every pen line ~18% wide, which decides whether a margin comment
    fits the hole it was placed in. Falls back to a mean constant if the file can't be read.
  - Pen `<text>` carries `xml:space="preserve"` — SVG otherwise strips a run's leading and
    trailing spaces, the only thing separating it from what follows.
  - `figure-tex` costs ~47 s to require on a cold filesystem (~120 ms warm), so `pen-math`
    loads it **lazily**, like `ai/figure-engine.js`. Requiring it at module load stalls the
    first marking request after a deploy.
  - Degradation is layered: bad TeX retries transliterated, then falls back to per-run
    drawing, then to plain pen prose — a lost fraction beats a lost sentence. The model
    writes the worked answer into `correct.full_solution_latex` (one `$…$` step per line);
    the old `full_solution_plain` is still read as a fallback.
- **The circled page total reserves its true size** — reservation and drawing share
  `_teacherScoreGeom()`. They used to be computed separately and the reservation was the
  smaller, so `12/12` printed straight over a part's `2/2`.
- **Part regions are matched by KEY, never by array position** — Gemini silently omits parts
  it can't find, so an index match attaches the comment to the wrong working. `paper-marker`
  carries `question_number` onto each part so the key is `Q8(i)`, not `(i)` (a page with two
  questions has two of each label), and `photo-overlay` disambiguates a repeat with `#2`.
  `question_number` is spec'd in the prompt as the paper's **top-level** number only, but
  the model still answers `(b)` or `8(b)-(c)` often enough that `photo-overlay` also takes
  the **leading integer and nothing else** (`String(p.question).match(/\d+/)`) — the raw
  value printed keys like `Q(b)-(c)(c)`. A key is a label: tidy beats faithful.
  The keying and the matching are the pure, exported, unit-tested `buildPartKeys()` /
  `matchPartRegions()` in `ai/photo-overlay.js` (`test/part-keys.test.js`) — don't re-inline them.
- **ONE region per part key** — `matchPartRegions` keeps the FIRST box and drops repeats.
  Gemini boxes the same part twice when its working continues down the page, and the renderer
  draws one score box per region, so a page came back with `Q7 3/4` *and* a stray `3/4`
  stranded wherever the first hadn't already claimed space (Adrian's photo, Jul 2026). First,
  not last: regions arrive in reading order, so it sits at the top of that part's working.
- **A wrong part is answered in EVERY style — the only question is which surface.**
  `error_summary` is REQUIRED (non-null, one sentence, plain Unicode) on every part below
  max, and the worked solution is written whenever the final answer is wrong. Teacher style
  used to suppress the solution on the theory that per-line corrections said enough; a
  per-line fix says which STEP broke, not what the answer was.
  - **WHEN it is owed is `solutionEntry(marking, label)` in `ai/solution-entry.js`, and
    nowhere else** — a pure, exported, unit-tested rule. It lives in its own module because
    `photo-overlay` requires `annotate`, so hosting it in either would be a cycle. It was
    written out twice once before and the copies drifted (the Telegram one kept a
    `style !== 'teacher'` guard after this page dropped it, so the DEFAULT style answered
    nothing). **Style is deliberately not a parameter**: there is no style in which a wrong
    answer should go unanswered, and a caller that cannot pass one cannot suppress it again.
  - Two callers: `structuredMarkingToText` in `ai/annotate.js` (the plain-text Telegram
    message sent when BOTH renderers failed) and `markPhotoDirect` in `ai/paper-marker.js`,
    which builds the per-photo `solutions` array for the 🖼 twin. The transcript doesn't
    consult it — it prints the solution unconditionally when the field is present.
  - **An absent `matches_correct` is UNJUDGED, not wrong** — it's routinely missing when
    there's no single final answer to compare (a "show that" part). The gate is
    `=== false`; `!matches_correct` would print a model solution beside correct working.
- **Worked-solution steps split on `SOLUTION_STEP_RE`, mirrored in three runtimes** —
  `lib/latex-repair.ts` (the repair pass), `public/marking-template.html` (`STEP_RE`, the
  browser) and the bot's `splitTexLines` (`ai/pen-math.js`). The model separates steps with
  a literal backslash-`n`, which is also how `\ne`, `\neq`, `\nabla`, `\not`, `\nu` open —
  so the break is judged on the FIRST character (not a lowercase letter), with an explicit
  exception list for the only commands that continue in caps:
  `Rightarrow|Leftarrow|Leftrightarrow|VDash|Vdash`. Refusing every letter was the earlier
  rule and it merged steps: a sheet came back with a visible `\nAt` mid-solution. Change one
  copy and you must change all three; both repos have named regression tests.
- ⚠ **`src/lib/latex-repair.ts` reads as binary to `grep`** — its mask sentinel uses
  non-printing characters, so a plain `grep` silently finds nothing in it. Use `grep -a`.
- **Vision model list** — `GEMINI_VISION_MODELS` (default
  `gemini-3.1-pro-preview,gemini-2.5-pro`) is tried in order, falling through only on a
  404/unsupported. The old `gemini-2.5-pro` pin came from someone trying bare
  `gemini-3.1-pro`, which 404s — the id needs the `-preview` suffix; the model was there
  all along.
- **Font: Patrick Hand** (SIL OFL, vendored at `assets/fonts/`), installed system-wide by the
  Dockerfile via `fc-cache -f`. sharp draws SVG text through librsvg → fontconfig, so a face
  sitting in the repo is invisible to it and every annotation silently falls back to DejaVu
  sans. Verify after a deploy with `fly ssh console -C fc-list | grep -i patrick`.
  (The typeset transcript sheets are unrelated — they're Puppeteer/webfont and still Caveat.)

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
