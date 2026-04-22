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

## /admin/progress — Student Progress & Exam Season

Password-protected progress logging page. Shows lesson cards for a selected date; cards expand to log topics, homework, mastery, mood, and notes.

### Exam season detection

- **Hardcoded windows** in `lib/exam-season.ts` (`EXAM_WINDOWS`): WA1 02-01→03-15, WA2 04-15→06-05, WA3 07-15→09-05, EOY 09-20→11-10 (MM-DD, SGT)
- **Manual override** stored in Airtable `Settings` table: `Setting Name = 'exam_season_override'`, `Value = '{"forceOn":"WA2"}'` (or `{"forceOn":null}` to clear)
- `resolveActiveExamType(override)` returns override if set, else date-based window, else null
- Override UI: toggle row in sticky header lets admin force a season on or off; uses GET/POST `/api/admin/exam-season`

### Exam info status

- Each lesson card fetches the student's exam record for the active exam type (from `Exams` Airtable table)
- **Complete** = has both `Exam Date` and `Tested Topics` filled in
- **Incomplete** = missing either field (or no record at all)
- A red `⚠ WA2` pill appears on the card header when `activeType !== null && !complete`
- Pill tooltip explains what's missing: "No WA2 exam record", "Missing exam date", "Missing tested topics", or "Missing exam date & topics"
- Off-season (activeType null): no pills shown, `checkExamInfoStatus` returns `complete: true`

### Key files

| File | Purpose |
|---|---|
| `lib/exam-season.ts` | `EXAM_WINDOWS`, `resolveActiveExamType()`, `checkExamInfoStatus()`, types |
| `app/api/admin/exam-season/route.ts` | GET/POST for reading and writing the override |
| `app/api/admin/progress/lessons/route.ts` | Attaches `examStatus` to each lesson card in response |
| `app/admin/progress/page.tsx` | Toggle row UI + red pill per card |

### Graceful degradation

- If the `Settings` row doesn't exist (new installs, deleted row): GET returns null override → auto-detect kicks in
- If the `Exams` fetch fails: error is logged, `examsByStudent` stays empty → all cards show `complete: true` (no pills)
- If `activeType` is null (off-season, no override): `checkExamInfoStatus` short-circuits and returns complete

## Pending Tasks

- Fix revision page content priority (`data.content || data.generatedContent`)
- Revision page formatting improvements
- Chat page smart scroll
- Add image support for revision notes (diagrams from DOCX files)

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

## Batch Marking (Prompt 1 of 3 — Detection only)

Three-endpoint architecture, client-orchestrated, stays within Vercel Hobby 60 s limit.

### Endpoints

| Route | Method | Purpose |
|---|---|---|
| `/api/mark-batch/init` | GET | Student list for dropdown |
| `/api/mark-batch/init` | POST | PDF/image splitting + Gemini region detection → batch record |
| `/api/mark-batch/mark` | POST | Mark each detected region (Prompt 2, not yet built) |
| `/api/mark-batch/finalize` | POST | Stitch marked pages into PDF (Prompt 3, not yet built) |

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
  "studentId": "recXXX" | null,
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
| `src/app/api/mark-batch/init/route.ts` | Init endpoint (GET students + POST batch) |
| `src/app/admin/mark/page.tsx` | Upload + detection preview UI |

### Airtable Batches table (create manually)

Adrian must create this table in Airtable before the init endpoint can write to it. Writes are non-fatal — init returns its response even if Airtable write fails.

| Field | Type | Notes |
|---|---|---|
| `Batch ID` | Single line text | Primary — e.g. `batch_1714029384_abc123` |
| `Student` | Link to Students | Optional |
| `Student Name` | Single line text | |
| `Total Pages` | Number | |
| `Total Questions` | Number | |
| `Status` | Single select | `detected` / `marking` / `finalized` / `failed` |
| `Page Image URLs` | Long text | Newline-separated blob URLs |
| `Detection JSON` | Long text | Full init response payload (for replay/debug) |
| `Final PDF URL` | URL | Set in Prompt 3 |
| `Created At` | Date with time | |
| `Finalized At` | Date with time | Set in Prompt 3 |
| `Submissions` | Link to Submissions | Set in Prompt 2 |

### Dependencies added

`pdfjs-dist` (v5.x, legacy ESM build), `@napi-rs/canvas` (Node.js canvas — NOT the `canvas` package), `p-limit`, `@google/generative-ai`

`next.config.ts` has `serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist']` — required because these are native modules.

**Important:** Use `@napi-rs/canvas`, not the `canvas` npm package. `canvas` requires system libraries (Cairo, Pango) that aren't available in Vercel's serverless runtime and causes `DOMMatrix is not defined` errors from pdfjs-dist. `@napi-rs/canvas` uses prebuilt binaries and works out of the box.

### PDF rendering notes

- Uses `pdfjs-dist/legacy/build/pdf.mjs` (legacy build avoids DOMMatrix error in Node.js)
- Worker path set to local file URL: `file://<cwd>/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`
- Scale 2.0 = ~150 DPI A4 (1224×1584 px per page)
- Gemini detection on each page in parallel (p-limit 5 concurrent)
- Page images stored at `batches/<batchId>/page-<index>.png` in Vercel Blob (public, unguessable path)

### Upload size limit

50 MB max enforced both client-side (immediate feedback) and server-side. The Vercel default 4.5 MB body limit is raised via `vercel.json` `functions` config — `memory: 3008` on the init route gives Pro-plan body limits up to ~50 MB. If uploads still 413 after deploy, check that `vercel.json` `functions` key deployed correctly. UI shows a descriptive error for non-JSON platform errors (e.g. 413 from Vercel before the handler runs).

### Env var required

`GOOGLE_API_KEY` — Google AI Studio key with Gemini 2.5 Pro access. Add to Vercel environment variables.

## Environment Variables

`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`, `SIGNUP_SECRET`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RECEIPT_API_TOKEN`, `RENDER_MARKING_SECRET`, `GOOGLE_API_KEY`
