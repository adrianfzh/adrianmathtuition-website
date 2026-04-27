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
- `admin/page.tsx` — **admin hub**: status cards (logged today, unpaid invoices, makeups owed, this week's lessons) + 4 launcher tiles (Schedule, Progress, Invoices, Students). Cookie-based auth (30-day), PWA-ready.
- `admin/schedule/page.tsx` — lesson management calendar. See [/admin/schedule](#adminschedule--lesson-management) below.
- `admin/progress/page.tsx` — read-only student timeline. See [/admin/progress](#adminprogress--student-timeline) below.
- `admin/invoices/page.tsx` — invoice management dashboard (was `/admin` before restructure)
- `admin/students/page.tsx` — stub page, links out to Airtable
- `admin/mark/page.tsx` — AI batch marking landing page (tabs + upload flow)
- `admin/mark/batch/[batchId]/page.tsx` — batch detail page
- `admin/edit-notes/page.tsx` — revision notes editor with editor mode toggle
- `signup/page.tsx` — student registration form (HMAC-signed URL)
- `thankyou/page.tsx` — post-signup confirmation page
- `terms/page.tsx` — terms and conditions
- `revise/page.tsx` — revision notes landing page
- `revise/[topic]/page.tsx` — topic listing
- `revise/[topic]/[subtopic]/[subsubtopic]/lesson/page.tsx` — revision lesson player
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
- `admin-schedule/add/route.ts` — create Additional/Makeup/Trial with capacity check
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

### Misc
- `bot-health/route.ts` — health check for Telegram bot

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

## Notification Policy

**All admin web UI actions are silent** — no Telegram messages sent when admin uses the website.

Students/parents are notified via the bot's day-before reminder cron (`runDayBeforeReminders` in `flows.js`), which automatically picks up Rescheduled/Additional/Makeup/Trial lesson records. Same-day or next-day reschedules won't reach that cron in time — admin should message manually.

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
- **Linked record filtering**: Cannot use `{Student}='recXXX'` on a linked record field. Must use `FIND('recXXX', ARRAYJOIN({Student}))>0`. True for all linked-record Airtable formula filtering.
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

- **Lessons** (default) — editable calendar. Shows Regular/Rescheduled/Makeup/Additional/Trial lesson records. Drag-to-reschedule, tap-to-action-sheet, per-slot [+] button, floating FAB.
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

### API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/admin-schedule` | GET | Weekly data: slots + lessons + students + exam info |
| `/api/admin-schedule/reschedule` | POST | New Rescheduled lesson + mark original |
| `/api/admin-schedule/add` | POST | Create Additional/Makeup/Trial with capacity check |
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

`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`, `SIGNUP_SECRET`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RECEIPT_API_TOKEN`, `RENDER_MARKING_SECRET`, `GOOGLE_API_KEY`
