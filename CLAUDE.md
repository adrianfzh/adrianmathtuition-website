# AdrianMath Website

Adrian's math tuition website on Vercel. Plain HTML/CSS/JS — no framework.

## Commands

- `vercel dev` — run locally
- `vercel --prod` — deploy to production (or auto-deploys from git push)
- `vercel env pull .env.local` — pull env vars for local dev

## Architecture

Static HTML pages + Vercel serverless functions (`/api/*`). No React, no Next.js, no build step.

## Key Files

### Pages (root directory)
- `index.html` — homepage with schedule widget (fetches `/api/schedule`)
- `chat.html` + `chat.js` — web math solver (SSE to Fly.io `/api/chat`)
- `admin.html` — invoice management dashboard (password-protected)
- `signup.html` — student registration form (HMAC-signed URL)
- `thankyou.html` — post-signup confirmation page
- `invoice-final.html` — invoice PDF template (rendered by Puppeteer)
- `terms.html` — terms and conditions

### API Functions (`/api/`)
- `chat.js` — legacy web chat endpoint (Claude Sonnet 4.6, streaming SSE)
- `schedule.js` — public schedule data from Airtable Slots table
- `signup.js` — processes registration form → creates Student + Enrollment + Token in Airtable
- `signup-data.js` — validates HMAC-signed signup link, returns slot info
- `admin-invoices.js` — GET/PATCH invoices for admin dashboard
- `generate-invoices.js` — creates Draft invoice records (cron: 14th 7am SGT)
- `generate-pdf.js` — Puppeteer PDF generation from `invoice-final.html` template
- `generate-pdf-batch.js` — batch PDF generation → Vercel Blob upload
- `preview-invoice.js` — generates and returns PDF inline
- `send-invoices.js` — emails invoices via Resend (cron: 15th 9am SGT)
- `send-invoice.js` — single invoice email helper module
- `payment-reminder.js` — Telegram reminder to check payments (cron: 14th 8pm SGT)
- `telegram.js` — `sendTelegram()` helper for admin notifications

## Database

**Airtable** — all student/lesson/invoice data. See bot project for full schema.

Key tables used by website:
- `Slots` (schedule.js) — Day, Time, Level, Normal Capacity, Enrolled Count, Is Active
- `Students` (signup.js, admin-invoices.js) — Student Name, Parent Email, Level, Subjects
- `Enrollments` (signup.js) — Student, Slot, Rate Per Lesson, Status
- `Invoices` (admin-invoices.js, generate-invoices.js) — all invoice fields
- `Tokens` (signup.js) — registration tokens
- `Rates` (signup.js) — current rate lookup by level
- `Rate History` (signup.js) — tracks rate changes per student

## Auth Patterns

- **Admin pages:** `ADMIN_PASSWORD` in Bearer token header
- **Cron jobs:** `CRON_SECRET` in Bearer token, or `x-vercel-cron: 1` header, or `ADMIN_PASSWORD`
- **Signup:** HMAC-SHA256 signature using `SIGNUP_SECRET` — validates slotId + level + subjects + expires

## Invoice Flow

1. `generate-invoices.js` (14th 7am) → counts lessons per enrollment → creates Draft invoices with Line Items JSON
2. `payment-reminder.js` (14th 8pm) → Telegram reminder
3. Admin reviews on `/admin` → adjusts amounts, approves
4. "Generate Missing PDFs" → `generate-pdf-batch.js` → Puppeteer → Vercel Blob → PDF URL in Airtable
5. `send-invoices.js` (15th 9am) → Resend email with PDF attachment → marks Sent

## Important Patterns

- `airtableRequest()` helper shared across all API files
- Invoice `Line Items` and `Line Items Extra` stored as JSON strings in Airtable long text fields — always `JSON.parse()` when reading
- `getInvoiceMonth()` returns next month from today (used by generate-invoices)
- `countOccurrencesInMonth()` counts how many times a weekday falls in a month
- `NO_LESSON_DATES` — CNY + Christmas, same list as bot
- PDF generation uses Puppeteer with `@sparticuz/chromium` on Vercel, local Chrome path for dev
- Chat page SSE connects to Fly.io `https://adrianmath-telegram-math-bot.fly.dev/api/chat`, NOT to Vercel

## Gotchas

- Vercel serverless functions have a 10s timeout (free) / 60s (Pro) — PDF generation is the bottleneck
- `generate-pdf.js` reuses a browser instance (`getBrowser()`) — must call `closeBrowser()` after batch operations
- PayNow logo in invoice template is embedded as base64 — read from `public/paynow.png`
- Font loading is blocked in Puppeteer (`page.setRequestInterception`) to speed up PDF generation
- CORS headers must be set on both OPTIONS and POST handlers for `/api/chat` (legacy)
- Signup link expiry is checked against `Date.now()` — links become invalid after the `expires` timestamp

## Environment Variables

`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`, `SIGNUP_SECRET`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
