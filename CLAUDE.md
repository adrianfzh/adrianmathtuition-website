> **Sync rule**: This file + `docs/*.md` are the source of truth for Claude Code/Cowork sessions. Decisions made in claude.ai project chat are synced here via update prompts. **CLAUDE.md is the lean index** (policies, gotchas, maps); deep per-area docs live in `docs/` — route new detail into the right topical file, not back into this one.

# AdrianMath Website

Adrian's math tuition website on Vercel. Next.js 16 App Router + TypeScript + Tailwind CSS.

> **🚧 Student Portal v1 — largely built, pre-beta.** Specs: [`PORTAL.md`](PORTAL.md) + [`PLAN-PORTAL-SOLO.md`](PLAN-PORTAL-SOLO.md) (root of repo). Read them before touching anything under `/app/*`, `/login`, `/signup`, or `/api/portal/*`. The original `// TODO PORTAL` scaffolding markers are all consumed (none remain as of 2026-07-15); remaining work is the grading calibration gate and Phase G hardening (leak-test/RLS audit, grade rate-limit, retention cron), not scaffolding.

## 📚 Detailed docs — MANDATORY reads by area

The deep documentation (bug archaeology, invariants, field tables) was split out of this file on 2026-08-04. **Before touching an area below, read its file — this is not optional; those files are where the "this exact mistake shipped a bug" notes live.**

| Touching… | Read FIRST |
|---|---|
| `/admin/schedule`, `/admin/progress`, lessons, reschedules, capacity, recurring generation, Revision Sprint, exam season, Lessons progress fields | [`docs/SCHEDULE.md`](docs/SCHEDULE.md) |
| Marking — `/admin/mark-paper`, `/admin/mark` (batch), `mark-paper-*`/`mark-batch/*` routes, `render-marking`, marked-PDF assembly, ✏️ Annotate overlay | [`docs/MARKING.md`](docs/MARKING.md) |
| `/kiosk`, `/api/kiosk/*`, `/admin/notes`, Dropbox notes/revision/prelim PDFs | [`docs/KIOSK.md`](docs/KIOSK.md) |
| Invoices, deferred adjustments, Resend email delivery | [`docs/INVOICES.md`](docs/INVOICES.md) |
| Student Portal | [`PORTAL.md`](PORTAL.md) + [`PLAN-PORTAL-SOLO.md`](PLAN-PORTAL-SOLO.md) |
| In-browser Pencil annotation spec | [`SPEC-ANNOTATE.md`](SPEC-ANNOTATE.md) |

## Commands

- `npm run dev` / `next dev` — run locally
- `vercel --prod` — deploy to production (or auto-deploys from git push)
- `vercel env pull .env.local` — pull env vars for local dev

## Auto commit + push policy — dev-first, promote to prod on approval

**`main` = production** (auto-deploys to Vercel prod). **`dev` = preview** (auto-deploys to a Vercel preview URL, NOT prod). Work never lands on `main` without an explicit go-ahead.

**On any turn where I change code, auto commit + push to `dev` at the end of that turn — no need for the user to say "push".** **A `dev` push now AUTO-BUILDS a preview via the GitHub integration** (confirmed live 2026-08-02 — the old "not enabled" note here was stale): `source: git` deployments appear in `vercel ls` within ~a minute of the push, build in 1–2 min. After it's READY, **re-point the stable alias** so Adrian's bookmark shows the latest build:
```
vercel alias set <new-deployment-url> adrianmath-dev.vercel.app
```
**https://adrianmath-dev.vercel.app is Adrian's permanent preview bookmark** (set up 2026-07-10). Always re-alias after every preview deploy and share THIS url, not the per-deploy one. Cookies survive re-aliasing (same domain), so his login persists across deploys. The preview is fully isolated from prod; Sentry is off there (env vars are Production-scoped).

> ⚠ **CLI `vercel deploy` is currently SEAT-BLOCKED** (found 2026-08-02): CLI-sourced
> deployments attach the local git author `adrianfong@Adrians-MacBook-Pro.local`, which
> is not a Vercel team member, so they sit forever in `readyState: BLOCKED` —
> `vercel ls`/`inspect` render that as **UNKNOWN with no duration and NO build logs**,
> and the deployment URL serves Vercel's geist-styled "building" placeholder with HTTP
> 200 (don't read a 200 there as READY; `vercel alias set` refuses with "not ready").
> The GitHub auto-build is the working path — push to `dev`, wait for the `source: git`
> deployment, alias it. To re-enable CLI deploys, either verify/approve the author in
> Vercel team settings or set `git config user.email adrianmathtuition@gmail.com`
> (the Vercel account email) — Adrian's call, since it changes commit attribution.

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

Next.js App Router (`src/app/`) with TypeScript. API routes in `src/app/api/*/route.ts`. Shared components in `src/`. Deployed on Vercel. The Telegram/WhatsApp bot is a SEPARATE repo (`~/Desktop/adrianmath-telegram-math-bot`, Fly.io, manual `npm run deploy`).

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

## Key Pages (`src/app/`) — map

Deep details for schedule/marking/kiosk pages live in `docs/` (see the table at top).

- `page.tsx` — homepage with schedule widget (fetches `/api/schedule`)
- `chat/page.tsx` — web math solver (SSE to Fly.io `/api/chat`, NOT to Vercel)
- `admin/page.tsx` — **admin hub**: status cards + launcher tile grid. Cookie-based auth (30-day), PWA-ready. Phone tile reorder = iOS-style arrange mode (dnd archaeology in `docs/SCHEDULE.md`).
- `admin/my-todos/page.tsx` — Adrian's personal to-do list (Supabase `admin_todos` via `/api/admin/my-todos`). NOT the loop queue.
- `admin/todo/page.tsx` — **Loop Tasks**: dev-task queue for the build-test-fix `/loop` (Airtable `Todos` via `/api/admin/todo`).
- `admin/schedule/page.tsx` — lesson management calendar → `docs/SCHEDULE.md`
- `admin/progress/page.tsx` — read-only student timeline → `docs/SCHEDULE.md`
- `admin/invoices/page.tsx` — invoice dashboard → `docs/INVOICES.md`
- `admin/students/page.tsx` — student directory (search + level filter)
- `admin/students/[id]/page.tsx` — student profile hub: Weekly slots (🔀 Switch / ＋ Add), upcoming lessons/exams/invoices, **Marked papers** section. Data from `/api/admin/student-profile?id=`; contact lazy-loaded via `student-contact`.
- `admin/mark-paper/page.tsx` — **the marking page in use** → `docs/MARKING.md`
- `admin/mark/page.tsx` + `admin/mark/batch/[batchId]/page.tsx` — AI batch marking → `docs/MARKING.md`
- `admin/revision-signups/page.tsx` — June Revision Sprint sign-ups + attendance → `docs/SCHEDULE.md`
- `admin/notes/*` — printable notes hub → `docs/KIOSK.md`
- `admin/edit-notes/page.tsx` — revision notes editor with editor mode toggle
- `admin/edit-cards/page.tsx` + `admin/edit-cards/[id]/page.tsx` — Cards editor (list: level/topic/subgroup, drag-to-reorder; single: markdown+KaTeX textarea, live preview, AI assist with diff/accept/reject)
- `kiosk/page.tsx` — iPad print station → `docs/KIOSK.md`
- `signup/page.tsx` — student registration form (HMAC-signed URL); `thankyou/`, `terms/`
- `revise/page.tsx`, `revise/[topic]/…` — revision notes landing/topic/lesson player; `revise/[topic]/[subtopic]/worked-examples/page.tsx` — TikTok-style swipe cards over `content_snippets` (accepts `?subgroup={id}`)
- `explain/[id]/page.tsx` — public annotated-explanation page (`explanations` table, KaTeX, full `\underbrace`); deep-links into Teach Me
- `learn/page.tsx` — Adrian's PARKING PLACE for interactive visuals. Deliberately unlinked from nav — do NOT retire or "clean up"; Adrian is deciding what it becomes (noted 2026-07-16)
- `formulas/*` — formula reference pages
- `o-level-a-math-tuition/`, `jc-h2-math-tuition/`, `secondary-math-tuition/` — SEO landing pages

Each admin page (`/admin`, `/admin/schedule`, `/admin/progress`, `/admin/invoices`) has its own `layout.tsx` with PWA metadata and its own manifest + apple-touch-icon. Icons live in `public/icons/`.

## API Routes (`src/app/api/`) — map

### Public
- `schedule/route.ts` — public schedule data from Airtable Slots table

### Admin schedule (details + full table → `docs/SCHEDULE.md`)
- `admin-schedule/` — weekly calendar data; sub-routes: `reschedule`, `add`, `add-weekly-slot`, `switch`, `delete`, `attendance`, `lesson-context`, `lesson-update`, `lesson-prev-update`, `quick-add-exam`, `student-contact`, `unmarked-count`, `topic-timeline`, `set-exams`
- `admin-revision-attendance/`, `admin-revision-signup/`, `admin-revision-revert/` — Revision Sprint → `docs/SCHEDULE.md`
- `admin/capacity-override/` — Sec-cap toggle GET/POST → `docs/SCHEDULE.md`

### Admin progress / hub
- `admin/progress/student-timeline/route.ts` — timeline data + aggregations (GET `?id=recXXX&range=90`)
- `admin/exam-season/route.ts` — GET/POST exam season override
- `admin/admin-stats/route.ts` — status card data for hub page
- `admin/my-todos/route.ts` — personal to-do CRUD (Supabase `admin_todos`)
- `admin/todo/route.ts` — loop-queue CRUD (Airtable `Todos`)
- `admin/status/route.ts` — At-a-glance data: loop todos, personal `myTodos {open,overdue}`, unpaid invoices, students, bot week count
- `admin/student-profile/route.ts` — student profile hub data

### Cards editor (`/admin/edit-cards`)
- `admin/cards/topics` (GET `?level=` → topics), `admin/cards/list`, `admin/cards/[id]` (GET/PATCH/DELETE), `admin/cards/create`, `admin/cards/reorder`
- `admin/cards/sections/{list,rename,delete,move-card}` — display_group sections (rename merges; delete 409s non-empty)
- `admin/cards/subgroups/{create,[id],reorder}` — sub-groups (409 on duplicate; delete only when unreferenced)
- `admin/cards/move` — move card across sub-groups within (level, topic)
- `edit-cards-ai/route.ts` — SSE stream for AI card edits

### Invoices (cron + admin) → `docs/INVOICES.md`
- `admin-invoices/` (GET/PATCH; paid-window ~5 months, `?all=1` full history), `generate-invoices` (cron 14th 7am), `generate-pdf-batch`, `regenerate-invoice`, `preview-invoice`, `send-invoices` (cron 15th 9am), `send-receipt`, `payment-reminder` (cron 14th 8pm), `admin-emails` (Email Log + resend), `resend-webhook`

### Signup
- `signup/route.ts` — registration form → Student + Enrollment + Token in Airtable
- `signup-data/route.ts` — validates HMAC-signed signup link, returns slot info

### Content / AI
- `notes/route.ts` — revision notes CRUD; `revision/route.ts`; `generate-lesson`; `generate-tts`; `edit-notes-ai`; `learn`
- `admin-notes/` — Dropbox notes listing (`?level=&kind=notes|revision|prelim`), `counts`, `dropbox-open` → `docs/KIOSK.md`
- `kiosk/` — `pair`, `print-log`, `topics`, `notes`, `worksheet` → `docs/KIOSK.md`
- `render-marking/route.ts` — marking JSON → PNG via Puppeteer → `docs/MARKING.md`
- `admin/mark-paper*` routes (proxy, pdf, download, send, annotated-token, annotate-pdf, inbox) → `docs/MARKING.md`
- `mark-batch/{init,execute,assemble-pdf,list,get,submissions,delete,upload-amended}` → `docs/MARKING.md`
- `health-check/route.ts` — synthetic monitoring cron (6h)

### Bot integrations
- `explanations/route.ts` — bot writes annotated-explain content here (auth: `x-render-secret`), gets back a UUID used for the `/explain/{id}` public page

## Database

**Airtable** — student/lesson/invoice data. See bot project for full schema.

Key tables used by website: `Slots`, `Students`, `Enrollments`, `Lessons` (progress fields table → `docs/SCHEDULE.md`), `Exams`, `Invoices`, `Tokens`, `Rates`, `Rate History`, `Settings` (global flags: `exam_season_override`, `sec_capacity_override`), `Questions` (bot Q&A log, has `Subject` since 2026-08-03).

**Supabase (math project)** — revision lesson content in `lesson_content` table (NOT `revision_content`). Holds both notes (`content_type='notes'`) and revision lessons (`content_type='lesson'`). Also: `content_snippets` (swipe cards; `display_group` text column = student-facing section name, independent of `subgroup_id`, NULL falls back to sub-group name), `topic_cards`, `kiosk_pairings`, `kiosk_prints`, `admin_todos`, `paper_marking_runs`.

## Auth Patterns

- **Admin pages:** Cookie-based auth (30-day expiry, `ADMIN_PASSWORD`)
- **Admin API routes:** `Authorization: Bearer ADMIN_PASSWORD` header; verified via `verifyAdminAuth(req)` in `lib/schedule-helpers.ts`
- **Cron jobs:** `CRON_SECRET` in Bearer token, or `x-vercel-cron: 1` header, or `ADMIN_PASSWORD`
- **Signup:** HMAC-SHA256 signature using `SIGNUP_SECRET` — validates slotId + level + subjects + expires
- **Kiosk students:** signed HMAC token (`x-kiosk-student`) → `docs/KIOSK.md`

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
- PDF generation uses Puppeteer with `@sparticuz/chromium` on Vercel, local Chrome path for dev; reuse `getBrowser()`, call `closeBrowser()` after batches
- PayNow logo in invoice template is embedded as base64 — read from `public/paynow.png`
- **All admin web UI actions are silent** (no Telegram) — notification policy details in `docs/SCHEDULE.md`

## Gotchas

- **Airtable date filter bug**: `{Date}<='endStr'` silently excludes records on `endStr` when Date is date-typed. Always use exclusive upper bound: `{Date}<'dayAfterEnd'` (add 1 day). Reference: `bot/flows.js:643`.
- **Linked record filtering**: Cannot use `{Student}='recXXX'` on a linked record field, AND `FIND('recXXX', ARRAYJOIN({Student}))>0` also does NOT work — `ARRAYJOIN` returns the linked record's **display name** (e.g. "Sim Ze Kai"), not the record ID. Correct pattern: filter by other fields (Date, Status, Exam Type, etc.) in Airtable, fetch the `Student`/`Slot` fields too, then match the record ID in JS: `r.fields['Student']?.[0] === studentId`. Applies to all linked-record fields. **This exact mistake sat in `generate-invoices`' Additional-lesson query and silently unbilled every Additional lesson from launch until 2026-07-26** (0 of 315 invoices ever carried one) — fixed via `lib/additional-lessons.ts` (window-fetch all, match student in JS; unit-tested).
- **Single-record GET has no `fields[]`**: Airtable's single-record endpoint (`GET /v0/{base}/{table}/{recXXX}`) ignores `fields[]` query params — they only work on list endpoints. Fetch all fields and filter in JS.
- **Privacy — lazy-load contact info**: `/api/admin-schedule` does NOT return `parentEmail`/`parentName` eagerly. Use `/api/admin-schedule/student-contact?id=recXXX` to fetch on demand.
- **UTC vs local time**: `getMondayOfWeek`/`addDays`/`isoDate` in `admin-schedule/route.ts` use UTC. `localToday()`/`daysAgo()` in `lib/schedule-helpers.ts` use local time. Do NOT merge — they serve different domains.
- Vercel serverless functions: 10s timeout (free) / 60s (Pro) — PDF generation is the bottleneck
- **Vercel hard-caps request bodies at 4.5MB at the PLATFORM level** — `vercel.json` memory bumps do NOT lift it. Big uploads must chunk (`mark-batch`), go client-token → Blob, or go to the bot (`/api/mark-inbox`).
- Signup link expiry is checked against `Date.now()` — links become invalid after the `expires` timestamp
- Supabase table is `lesson_content`, NOT `revision_content` — easy to confuse
- ⚠ `src/lib/latex-repair.ts` reads as binary to `grep` (non-printing mask sentinel) — use `grep -a`

## Pending Tasks

- Revision page formatting improvements
- Chat page smart scroll
- Add image support for revision notes (diagrams from DOCX files)

## Environment Variables

`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`, `SIGNUP_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RECEIPT_API_TOKEN`, `RENDER_MARKING_SECRET`, `GOOGLE_API_KEY`, `SUPABASE_SECRET_KEY`, `MARK_INBOX_TOKEN`, `KIOSK_WA_NUMBER`, `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`/`DROPBOX_REFRESH_TOKEN`

> **`BOT_BASE_URL` + `BOT_INTERNAL_SECRET` exist in Preview scope too** (added 2026-08-02
> — they were Production-only, so every preview deploy showed "bot not configured" on
> mark-paper; Adrian's real marking had always been on prod so it never surfaced).
> ⚠ When copying Vercel env values between scopes: `vercel env pull` writes a
> dotenv-ESCAPED file — parse it with `require('dotenv').parse`, never grep/sed. The
> stored production values carry a trailing newline (harmless at runtime), which naive
> extraction turns into a literal `\n` → a `\` in the URL shunts the fetch to
> `/n/api/mark-paper` (bot 404s) and a 2-char-longer secret gets 401 `unauthorized`.
> Both bit on 2026-08-02. Trim before re-adding, and functionally verify (the CLI
> masks stored values as `[SENSITIVE]`, so pull-and-compare proves nothing).

> **Supabase key convention (2026-07-06):** privileged (RLS-bypassing) access uses `SUPABASE_SECRET_KEY` holding a new-style `sb_secret_...` key. All code reads `SUPABASE_SECRET_KEY` first and falls back to the legacy `SUPABASE_SERVICE_ROLE_KEY` JWT, so either name works — prefer `SUPABASE_SECRET_KEY` in new code and new env setups.
