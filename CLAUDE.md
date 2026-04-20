> **Sync rule**: This file is the source of truth for Claude Code/Cowork sessions. Decisions made in claude.ai project chat are synced here via update prompts.

# AdrianMath Website

Adrian's math tuition website on Vercel. Next.js 16 App Router + TypeScript + Tailwind CSS.

## Commands

- `npm run dev` / `next dev` — run locally
- `vercel --prod` — deploy to production (or auto-deploys from git push)
- `vercel env pull .env.local` — pull env vars for local dev

## Architecture

Next.js App Router (`src/app/`) with TypeScript. API routes in `src/app/api/*/route.ts`. Shared components in `src/`. Deployed on Vercel.

## Key Pages (`src/app/`)

- `page.tsx` — homepage with schedule widget (fetches `/api/schedule`)
- `chat/page.tsx` — web math solver (SSE to Fly.io `/api/chat`)
- `admin/page.tsx` — invoice management dashboard (password-protected)
- `admin/schedule/page.tsx` — two-tab schedule: **Lessons** (editable DnD calendar) + **Roster** (read-only enrollment view). Cookie-based auth (30-day), PWA-ready. See [/admin/schedule — Lesson Management](#adminschedule--lesson-management) below.
- `admin/edit-notes/page.tsx` — revision notes editor with editor mode toggle for lesson content
- `signup/page.tsx` — student registration form (HMAC-signed URL)
- `thankyou/page.tsx` — post-signup confirmation page
- `terms/page.tsx` — terms and conditions
- `revise/page.tsx` — revision notes landing page
- `revise/[topic]/page.tsx` — topic listing
- `revise/[topic]/[subtopic]/[subsubtopic]/lesson/page.tsx` — revision lesson player
- `learn/page.tsx` — learn page
- `formulas/*` — formula reference pages (indices, factorization, statistics, etc.)
- `o-level-a-math-tuition/`, `jc-h2-math-tuition/`, `secondary-math-tuition/` — SEO landing pages

## API Routes (`src/app/api/`)

- `schedule/route.ts` — public schedule data from Airtable Slots table
- `admin-schedule/route.ts` — admin schedule calendar data (GET, week param)
- `admin-schedule/reschedule/route.ts` — create Rescheduled lesson, mark original, notify
- `admin-schedule/add/route.ts` — create Additional/Makeup/Trial lesson with capacity check
- `admin-schedule/delete/route.ts` — hard-delete or mark absent, optional notification
- `signup/route.ts` — processes registration form → creates Student + Enrollment + Token in Airtable
- `signup-data/route.ts` — validates HMAC-signed signup link, returns slot info
- `admin-invoices/route.ts` — GET/PATCH invoices for admin dashboard
- `generate-invoices/route.ts` — creates Draft invoice records (cron: 14th 7am SGT)
- `generate-pdf-batch/route.ts` — batch PDF generation → Vercel Blob upload
- `preview-invoice/route.ts` — generates and returns PDF inline
- `send-invoices/route.ts` — emails invoices via Resend (cron: 15th 9am SGT)
- `send-receipt/route.ts` — send receipt email
- `payment-reminder/route.ts` — Telegram reminder to check payments (cron: 14th 8pm SGT)
- `notes/route.ts` — revision notes CRUD
- `revision/route.ts` — revision content API
- `generate-lesson/route.ts` — AI-generated lesson content
- `generate-tts/route.ts` — text-to-speech generation
- `edit-notes-ai/route.ts` — AI-assisted notes editing
- `learn/route.ts` — learn API
- `bot-health/route.ts` — health check for Telegram bot

## Database

**Airtable** — student/lesson/invoice data. See bot project for full schema.

Key tables used by website:
- `Slots` (schedule) — Day, Time, Level, Normal Capacity, Enrolled Count, Is Active
- `Students` (signup, admin-invoices) — Student Name, Parent Email, Level, Subjects
- `Enrollments` (signup) — Student, Slot, Rate Per Lesson, Status
- `Invoices` (admin-invoices, generate-invoices) — all invoice fields
- `Tokens` (signup) — registration tokens
- `Rates` (signup) — current rate lookup by level
- `Rate History` (signup) — tracks rate changes per student

**Supabase** — revision lesson content in `lesson_content` table (NOT `revision_content`). Holds both notes (`content_type='notes'`) and revision lessons (`content_type='lesson'`). Regular notes still in Airtable Notes table.

## Auth Patterns

- **Admin pages:** `ADMIN_PASSWORD` in Bearer token header
- **Admin schedule:** Cookie-based auth (30-day expiry)
- **Cron jobs:** `CRON_SECRET` in Bearer token, or `x-vercel-cron: 1` header, or `ADMIN_PASSWORD`
- **Signup:** HMAC-SHA256 signature using `SIGNUP_SECRET` — validates slotId + level + subjects + expires

## Invoice Flow

1. `generate-invoices` (14th 7am) → counts lessons per enrollment → creates Draft invoices with Line Items JSON
2. `payment-reminder` (14th 8pm) → Telegram reminder
3. Admin reviews on `/admin` → adjusts amounts, approves
4. "Generate Missing PDFs" → `generate-pdf-batch` → Puppeteer → Vercel Blob → PDF URL in Airtable
5. `send-invoices` (15th 9am) → Resend email with PDF attachment → marks Sent

## Important Patterns

- `airtableRequest()` helper shared across API files
- Invoice `Line Items` and `Line Items Extra` stored as JSON strings in Airtable long text fields — always `JSON.parse()` when reading
- `getInvoiceMonth()` returns next month from today (used by generate-invoices)
- `countOccurrencesInMonth()` counts how many times a weekday falls in a month
- `NO_LESSON_DATES` — CNY + Christmas, same list as bot
- PDF generation uses Puppeteer with `@sparticuz/chromium` on Vercel, local Chrome path for dev
- Chat page SSE connects to Fly.io `https://adrianmath-telegram-math-bot.fly.dev/api/chat`, NOT to Vercel

## Dead Code

- `api/chat.js` — already deleted. The old Vercel serverless chat endpoint was dead code; chat.html connects directly to Fly.io.

## Gotchas

- Vercel serverless functions have a 10s timeout (free) / 60s (Pro) — PDF generation is the bottleneck
- PDF generation reuses a browser instance (`getBrowser()`) — must call `closeBrowser()` after batch operations
- PayNow logo in invoice template is embedded as base64 — read from `public/paynow.png`
- Font loading is blocked in Puppeteer (`page.setRequestInterception`) to speed up PDF generation
- Signup link expiry is checked against `Date.now()` — links become invalid after the `expires` timestamp
- Supabase table is `lesson_content`, NOT `revision_content` — easy to confuse

## /admin/schedule — Lesson Management

Two-tab interface, cookie-auth protected (30-day session, `ADMIN_PASSWORD`), PWA-ready.

### Tabs

- **Lessons** (default) — editable calendar showing actual lesson records (Regular/Rescheduled/Makeup/Additional/Trial). Drag-to-reschedule (desktop click-drag / mobile 500ms long-press), tap-to-action-sheet (Reschedule / Mark Absent / Delete / Edit Notes), per-slot [+] button and floating FAB.
- **Roster** — read-only slot enrollment view (which students sit in which weekly slot). Unchanged from original.

Tab choice persists in `localStorage` (key: `schedule_view_mode`).

### Drag-and-drop stack

- `@dnd-kit/core` — `PointerSensor` (distance: 8px), `TouchSensor` (delay: 500ms, tolerance: 5px)
- `DragOverlay` renders floating copy with scale/rotate; source chip drops to 0.3 opacity
- `navigator.vibrate(30)` on drag start for haptic feedback
- `touchAction: 'none'` on draggable chips (required for iOS Safari)
- `DraggableLessonChip` and `DroppableLessonSlot` are **module-level components** (not inline) — required because they use `useDraggable`/`useDroppable` hooks

### API routes (all require `Authorization: Bearer ADMIN_PASSWORD`)

| Route | Method | Purpose |
|---|---|---|
| `/api/admin-schedule` | GET | Weekly schedule data (slots + lessons + students) |
| `/api/admin-schedule/reschedule` | POST | Mirror bot `/rs`: new Rescheduled lesson + mark original |
| `/api/admin-schedule/add` | POST | Create Additional/Makeup/Trial with capacity check |
| `/api/admin-schedule/delete` | POST | Hard-delete or mark Absent, optional notification |

### Reschedule semantics (mirrors bot /rs exactly)

- Creates new lesson: `Type: 'Rescheduled'`, `Status: 'Scheduled'`
- PATCHes original: `Status: 'Rescheduled'`, `Rescheduled Lesson ID: [newId]`, appends `| auto-linked` to Notes
- Capacity check uses `Makeup Capacity` field (not `Normal Capacity`); excludes Cancelled/Absent lessons
- Applies to all lesson types — always creates a new record
- Deleting a Rescheduled record reverts source lesson to `Status: 'Scheduled'` and clears the link

### Notification behaviour

- Reschedule / Add Additional or Makeup: default notify ON → sends to both `Student Telegram ID` and `Parent Telegram ID`
- Add Trial: no notification (student not yet registered)
- Delete / Mark Absent: default notify OFF (admin opts in per action)
- Day-before reminders: handled by bot cron (`runDayBeforeReminders`) — picks up new Rescheduled/Additional records automatically

### Shared helpers (`lib/schedule-helpers.ts`)

- `verifyAdminAuth(req)` — Bearer token check
- `formatDateSlotLabel(dateStr, slotFields)` — e.g. `"Mon, 24 Nov 3-5pm"`
- `countLessonsInSlot(slotId, date)` — excludes Cancelled/Absent; uses `FIND('id', ARRAYJOIN({Slot})) > 0` formula (NOT `{Slot}='id'`)
- `notifyLessonChange(studentId, message)` — fetches student, sends to both Telegram IDs

### Telegram (`lib/telegram.ts`)

- `sendTelegram(text)` — existing, posts to `TELEGRAM_CHAT_ID` (admin alerts)
- `sendTelegramTo(chatId, text)` — new, posts to arbitrary chat ID (student/parent)

### Error conventions

- 401 auth, 400 bad body, 409 slot full, 500 Airtable errors
- Notification failures are logged but never fail the parent request

### UI patterns

- Toasts: 3s auto-dismiss, fixed bottom-centre, success (green) / error (red)
- Drop targets: dashed navy border on hover
- All destructive actions require modal confirmation

### Date gotcha

All `isoDate()` / `addDays()` helpers use `getFullYear()`/`getMonth()`/`getDate()` (local time), **not** `toISOString()` — SGT is UTC+8 so `toISOString()` returns the previous day for midnight-local Dates.

## Pending Tasks

- Fix revision page content priority (`data.content || data.generatedContent`)
- Revision page formatting improvements
- Chat page smart scroll
- Add image support for revision notes (diagrams from DOCX files)

## Environment Variables

`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`, `SIGNUP_SECRET`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
