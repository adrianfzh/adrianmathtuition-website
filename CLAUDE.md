> **Sync rule**: This file + `docs/*.md` are the source of truth for Claude Code/Cowork sessions. Decisions made in claude.ai project chat are synced here via update prompts. **CLAUDE.md is the lean index** (policies, gotchas, maps); deep per-area docs live in `docs/` — route new detail into the right topical file, not back into this one.

# AdrianMath Website

Adrian's math tuition website on Vercel. Next.js 16 App Router + TypeScript + Tailwind CSS.

> **🚧 Student Portal v1 — largely built, pre-beta.** Specs: [`PORTAL.md`](PORTAL.md) + [`PLAN-PORTAL-SOLO.md`](PLAN-PORTAL-SOLO.md) (root of repo). Read them before touching anything under `/app/*`, `/login`, `/signup`, or `/api/portal/*`. The original `// TODO PORTAL` scaffolding markers are all consumed (none remain as of 2026-07-15); remaining work is the grading calibration gate and Phase G hardening (leak-test/RLS audit, grade rate-limit, retention cron), not scaffolding.

## 📚 Detailed docs — MANDATORY reads by area

The deep documentation (bug archaeology, invariants, field tables) was split out of this file on 2026-08-04. **Before touching an area below, read its file — this is not optional; those files are where the "this exact mistake shipped a bug" notes live.**

| Touching… | Read FIRST |
|---|---|
| `/admin/schedule`, `/admin/progress`, lessons, reschedules, capacity, recurring generation, Revision Sprint, exam season, Lessons progress fields | [`docs/SCHEDULE.md`](docs/SCHEDULE.md) |
| Marking — `/admin/mark-paper`, `/admin/mark` (batch), `/admin/papers`, `/admin/mark/triage`, **`/app/marking`** (student-facing), `mark-paper-*`/`mark-batch/*` routes, `render-marking`, marked-PDF assembly, ✏️ Annotate overlay | [`docs/MARKING.md`](docs/MARKING.md) |
| `/kiosk`, `/api/kiosk/*`, `/admin/notes`, Dropbox notes/revision/practice/prelim PDFs | [`docs/KIOSK.md`](docs/KIOSK.md) |
| Invoices, deferred adjustments, Resend email delivery | [`docs/INVOICES.md`](docs/INVOICES.md) |
| `/tools` static pages, house style, photo-extraction service (`/api/tools/vision`) | [`docs/TOOLS.md`](docs/TOOLS.md) |
| Student Portal | [`PORTAL.md`](PORTAL.md) + [`PLAN-PORTAL-SOLO.md`](PLAN-PORTAL-SOLO.md) |
| In-browser Pencil annotation spec | [`SPEC-ANNOTATE.md`](SPEC-ANNOTATE.md) |
| Subject expansion — Science / English / Chinese for the portal (research + phasing; nothing built yet) | [`SPEC-SUBJECTS.md`](SPEC-SUBJECTS.md) |
| "From Adrian" assigned work — `/app/assignments`, `/api/admin/assignments`, `/api/portal/assignments`, the Send-work card on `/admin/students/[id]`, `portal_assignments` table | [`SPEC-ASSIGN.md`](SPEC-ASSIGN.md) |

> The four highest-traffic rows (marking, kiosk, schedule, invoices) also exist as
> auto-loading skills in `.claude/skills/` — belt and suspenders; this table stays
> the authoritative list.

## 🏗 Building doctrine (Adrian, 2026-08-27) — LIVING, expected to change

Apply this whenever designing a NEW feature, process, or automation — it's the shape every build should take, not a checklist to paste into code.

> **Revision rule**: this doctrine is versioned here so it can change as models
> improve and the moat line moves. Any session should PROPOSE an edit (diff +
> why, Adrian approves, dated commit) when: (a) a build genuinely fights the
> recipe, (b) a "stays human" item becomes automatable to Adrian's standard,
> (c) a new failure mode reveals a missing step, or (d) a new frontier model
> ships — on model upgrades, explicitly ask "which moat item did this move?"
> Never silently ignore the doctrine; change it in the open instead.

**The 5-step recipe** — the ladder from "ask Claude" to a self-running process:
1. **Spec** — write down inputs, output format, tone, red lines, and 2–3 worked examples, in a repo doc (or Supabase row) the agent follows verbatim.
2. **Tools** — wire the APIs/queries the process needs; no manual copy-paste step left inside the loop.
3. **Checkpoints** — the agent does everything reversible; a human approves the outward-facing step (send, publish, charge).
4. **Trigger** — automate the firing: cron / routine / queue, never "when Adrian remembers".
5. **Log + alarm** — stamp `job_runs` + add a `JOB_RHYTHMS` line ([`docs/OPS.md`](docs/OPS.md)) so a dead process alarms by absence.

**What stays human (the moat)** — design so these four keep Adrian in the loop, and automate everything else:
- **Standard** — Adrian's marking/teaching judgment is the calibration ground truth. Setting and correcting the standard is expert work; the system executes it at scale.
- **Accountability** — parents pay a person who answers for outcomes. Parent-facing output carries his name and passes his sign-off checkpoint.
- **Relationships** — trust with parents and students is the distribution channel. Agents draft; Adrian delivers in his own voice.
- **Novelty** — noticing the spec itself is wrong (new syllabus, new failure mode) is human work. Surface anomalies to him; never smooth them over.

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

## 📱 File deliverables → Adrian's phone (2026-08-26)

When a turn produces a user-facing FILE (worksheet/prelim/revision `.docx`, marked or assembled PDF, a report) and the session is **headless/remote** — remote-control CLI session, cron/launchd run, or any session WITHOUT the desktop-app panes (heuristic: no `mcp__Claude_Browser__*` tools in context = headless) — ALSO send it to Adrian's Telegram, same chat as health-check alerts:

```
curl -s -F chat_id="$TELEGRAM_CHAT_ID" -F document=@"<file>" \
  -F caption="<short title>" \
  "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendDocument"
```

Vars are in `.env.local` (trim quotes/trailing newline before interpolating — see the env-var escaping gotcha below). Bot uploads cap at 50MB — fine for docx/PDF. Verified working 2026-08-26 (msg 18833).

- Telegram = "hand it to me NOW" channel; Dropbox stays the filing system — files that belong in the notes library still go to their normal Dropbox home as well.
- In desktop-app sessions with Adrian at the machine, the in-app file card is enough — don't double-send unless he asks.
- "don't send" / "no telegram" for the turn skips it.

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
   **Scheduled jobs additionally stamp the `job_runs` logbook** (missed-slot alarms
   + the /admin/ops board) — the one-line contract is in [`docs/OPS.md`](docs/OPS.md).

Definition of done for a feature touching money or parents/students: pure logic in
lib + tests + a health-check entry when it adds a surface. Browser E2E is deliberately
NOT used (solo-maintenance cost outweighs value).

## Key Pages (`src/app/`) — map

Deep details for schedule/marking/kiosk pages live in `docs/` (see the table at top).

- `page.tsx` — homepage with schedule widget (fetches `/api/schedule`)
- `chat/page.tsx` — web math solver (SSE to Fly.io `/api/chat`, NOT to Vercel)
- `admin/page.tsx` — **admin hub**: status cards + launcher tile grid. Cookie-based auth (30-day), PWA-ready. Phone tile reorder = iOS-style arrange mode (dnd archaeology in `docs/SCHEDULE.md`). Since 2026-08-04 the hub also shows fail-soft attention cards (⏳ papers to mark, ❓ unmarked lessons, ⚠ exam-info gaps) — hidden at zero; see docs/MARKING.md + lib/unmarked-lessons.ts.
- `admin/my-todos/page.tsx` — Adrian's personal to-do list (Supabase `admin_todos` via `/api/admin/my-todos`). NOT the loop queue.
- `admin/todo/page.tsx` — **Loop Tasks**: dev-task queue for the build-test-fix `/loop` (Airtable `Todos` via `/api/admin/todo`).
- `admin/schedule/page.tsx` — lesson management calendar → `docs/SCHEDULE.md`
- `admin/progress/page.tsx` — read-only student timeline → `docs/SCHEDULE.md`
- `admin/invoices/page.tsx` — invoice dashboard → `docs/INVOICES.md`
- `admin/students/page.tsx` — student directory (search + level filter)
- `admin/students/[id]/page.tsx` — student profile hub: Weekly slots (🔀 Switch / ＋ Add), upcoming lessons/exams/invoices, **Marked papers** section. Data from `/api/admin/student-profile?id=`; contact lazy-loaded via `student-contact`.
- `admin/mark-paper/page.tsx` — **the marking page in use** → `docs/MARKING.md`
- `admin/papers/page.tsx` — **marked-script library**: every run, filter by student / needs-tagging, inline student tagging, ✍️ deep-link into mark-paper → `docs/MARKING.md`
- `admin/log/page.tsx` — **one-tap end-of-day lesson logging**: every unlogged lesson on one screen (mastery / homework / topics / notes / next plan). Owns no writes — posts to the existing lesson routes → `docs/SCHEDULE.md`
- `admin/digests/page.tsx` — parent-report drafts (Supabase `parent_digests`); weekly/monthly/term, generated by `/api/progress-digest` (monthly cron on the 1st)
- `admin/ops/page.tsx` — 🩺 **the centre's logbook board**: every automated job's last run (Supabase `job_runs`), missed-slot ambers, marking-queue lag → [`docs/OPS.md`](docs/OPS.md)
- `admin/mark/page.tsx` + `admin/mark/batch/[batchId]/page.tsx` — AI batch marking → `docs/MARKING.md`
- `admin/revision-signups/page.tsx` — June Revision Sprint sign-ups + attendance → `docs/SCHEDULE.md`
- `admin/notes/*` — printable notes hub → `docs/KIOSK.md`
- `admin/edit-notes/page.tsx` — revision notes editor (content in Airtable `Notes`)
- `admin/edit-cards/page.tsx` + `admin/edit-cards/[id]/page.tsx` — Cards editor (list: level/topic/subgroup, drag-to-reorder; single: markdown+KaTeX textarea, live preview, AI assist with diff/accept/reject)
- `kiosk/page.tsx` — iPad print station → `docs/KIOSK.md`
- `app/*` — **Student Portal** (`/app` dashboard, `practice`, `learn`, `notes`, `reference`, `settings`). `app/plan/page.tsx` = **"My Plan"** adaptive revision plan (SPEC-REVISION-PLAN.md): three bands (Focus / Keep warm / Wins) derived on read via `lib/plan.ts` (pure, tested) over the shared papers+notebook assembly `lib/notebook-data.ts`; in the marking-only beta allowlist. **Marking-only beta since 2026-08-21** (`lib/portal-beta.ts` `MARKING_ONLY_BETA`): students see only Home / Submit / Marked (+ Settings); practice/learn/notes/reference routes bounce students to `/app`, Adrian's admin cookie sees everything. `app/marking/page.tsx` = the student's own released marked scripts; `app/submit/page.tsx` = phone-first paper hand-in (**1 per student per SGT day, shared with the bot's /handin** — `countHandinsToday` in `lib/portal-submit-limit.ts`; spread-split + Blob client tokens → a ⏳ pending run **auto-queued into the bot's 🌙 marking queue** → marked → **auto-released** to the student (bot calls `mark-triage {action:'release', auto:true}`; margin-tick degradation is the only hold) — Adrian's Telegram says "✅ Released"; papers Adrian uploads himself still need his manual Release in triage) → `docs/MARKING.md`
- `app/reschedule/page.tsx` — student self-service lesson moves (Home → Change; thin proxy to the bot's canonical reschedule module → `docs/SCHEDULE.md`)
- `app/assignments/*` — **"From Adrian" assigned work** (v1 2026-08-22): Home card "📬 From Mr Fong · N to do" (hidden at zero) → list + worksheet page. Bank question → practice grader (instant, exempt from `DAILY_GRADE_CAP`); worksheet PDF → `/app/submit?assignment=` → 🌙 queue → auto-release flips it to marked. Assign from the Send-work card on `/admin/students/[id]` (`?send=<topic>` prefills it — the 📬 links in triage + papers). `attempt_id` is a **bigint** FK to `student_attempts` → [`SPEC-ASSIGN.md`](SPEC-ASSIGN.md)
- `app/ask/page.tsx` — **Ask tab**: the web solver inside the portal (shared client core `lib/chat-solver.ts`, SSE to the Fly bot); every question logged to Airtable `Questions` per student via `/api/portal/ask-log`
- `app/requests/*` — student resource requests (2/SGT-day cap) → Telegram ping → `/admin/requests` queue (`portal_requests`)
- `app/my-notes/*` — ✂️ clippings gallery from marked papers (`portal_notes`, Blob `portal-notes/`); clip UI lives on `/app/marking`
- `app/reschedule/*`, `app/print/*` (open to ALL students since 2026-08-28), practice `?qid=` deep links + 📷/🔍 finder (`/api/portal/similar|generate`, 5-gen/day cap in `portal_generation_log`, bot endpoints `/api/portal-similar|generate`) → docs/SCHEDULE.md + SPEC-PRINT-PAPER.md
- `api/payments/{stripe,hitpay}-webhook` — pass auto-grant (S$25 floor, idempotent; `portal_passes` + `lib/portal-passes.ts`; Stripe primary, `client_reference_id` = portal account uuid); `api/admin/passes` = manual grant
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
- `admin-schedule/` — weekly calendar data; sub-routes: `reschedule`, `add`, `add-weekly-slot`, `switch`, `delete`, `attendance`, `lesson-context`, `lesson-update`, `lesson-prev-update`, `quick-add-exam`, `student-contact`, `unmarked-count`, `topic-timeline`, `set-exams`, `extract-exam-topics`
- `admin-revision-attendance/`, `admin-revision-signup/`, `admin-revision-revert/` — Revision Sprint → `docs/SCHEDULE.md`
- `admin/capacity-override/` — Sec-cap toggle GET/POST → `docs/SCHEDULE.md`

### Admin progress / hub
- `admin/progress/student-timeline/route.ts` — timeline data + aggregations (GET `?id=recXXX&range=90`)
- `admin/exam-season/route.ts` — GET/POST exam season override
- `admin/admin-stats/route.ts` — status card data for hub page
- `admin/ops/route.ts` — logbook board data; `job-log/route.ts` — POST stamp for Mac/shell jobs → [`docs/OPS.md`](docs/OPS.md)
- `admin/my-todos/route.ts` — personal to-do CRUD (Supabase `admin_todos`)
- `admin/todo/route.ts` — loop-queue CRUD (Airtable `Todos`)
- `admin/status/route.ts` — At-a-glance data: loop todos, personal `myTodos {open,overdue}`, unpaid invoices, students, bot week count
- `admin/student-profile/route.ts` — student profile hub data
- `admin/log-queue/route.ts` — read half of `/admin/log`: every unlogged in-window lesson + `prev` + `topicsByLevel`. **Owns no writes** → `docs/SCHEDULE.md`
- `admin/papers/route.ts` — marked-script library (Supabase `paper_marking_runs` direct, NOT the bot proxy); GET `?days=&limit=&student=&untagged=1`, POST `{runId, studentId|null}` to tag → `docs/MARKING.md`

### Assigned work → `SPEC-ASSIGN.md`
- `admin/assignments/route.ts` — GET `?studentId=` list, POST create (bank `questionId` | worksheet `pdfUrl` — `pdfSource:'dropbox:<path>'` is copied to Blob `assignments/<uuid>.pdf` at assign time), PATCH `{id, action:'revoke'}`; `candidates/` (bank picks by level/topic/tier), `upload-token/` (Blob client token)
- `portal/assignments/route.ts` — student's own rows (session-scoped; 401 anon — health-check probes it)

### Parent reports
- `progress-digest/route.ts` — weekly/monthly/term parent drafts into Supabase `parent_digests`; **monthly cron `0 0 1 * *` = 08:00 SGT on the 1st** (targets the previous month when `now.getDate() <= 10`). Arithmetic comes from `lib/report-facts.ts` and is rendered as a fact block ABOVE the prose, separated by `---`, so model drift can't corrupt the numbers. UI: `/admin/digests`.

### Cards editor (`/admin/edit-cards`)
- `admin/cards/topics` (GET `?level=` → topics), `admin/cards/list`, `admin/cards/[id]` (GET/PATCH/DELETE), `admin/cards/create`, `admin/cards/reorder`
- `admin/cards/sections/{list,rename,delete,move-card}` — display_group sections (rename merges; delete 409s non-empty)
- `admin/cards/subgroups/{create,[id],reorder}` — sub-groups (409 on duplicate; delete only when unreferenced)
- `admin/cards/move` — move card across sub-groups within (level, topic)
- `edit-cards-ai/route.ts` — SSE stream for AI card edits

### Invoices (cron + admin) → `docs/INVOICES.md`
- `admin-invoices/` (GET/PATCH; paid-window ~5 months, `?all=1` full history), `generate-invoices` (cron 14th 7am), `generate-pdf-batch`, `regenerate-invoice`, `preview-invoice`, `send-invoices` (cron 15th 10am SGT — `0 2 15 * *` UTC; Vercel fires it up to ~20 min late, last months ~10:18), `send-receipt`, `payment-reminder` (cron 14th 8pm), `admin-emails` (Email Log + resend), `resend-webhook`

### Signup
- `signup/route.ts` — registration form → Student + Enrollment + Token in Airtable
- `signup-data/route.ts` — validates HMAC-signed signup link, returns slot info

### Content / AI
- `notes/route.ts` — revision notes CRUD (Airtable `Notes`); `edit-notes-ai`; `learn`
- `admin-notes/` — Dropbox notes listing (`?level=&kind=notes|revision|practice|prelim`), `counts`, `dropbox-open` → `docs/KIOSK.md`
- `kiosk/` — `pair`, `print-log`, `topics`, `notes`, `worksheet` → `docs/KIOSK.md`
- `render-marking/route.ts` — marking JSON → PNG via Puppeteer → `docs/MARKING.md`
- `admin/mark-paper*` routes (proxy, pdf, download, send, annotated-token, annotate-pdf, inbox) → `docs/MARKING.md`
- `mark-batch/{init,execute,assemble-pdf,list,get,submissions,delete,upload-amended}` → `docs/MARKING.md`
- `health-check/route.ts` — synthetic monitoring cron (6h)

### Bot integrations
- `explanations/route.ts` — bot writes annotated-explain content here (auth: `x-render-secret`), gets back a UUID used for the `/explain/{id}` public page
- `bot/worksheet/route.ts` — **worksheet-on-demand** (auth: `x-render-secret`). POST `{level, topic, tier?, count?≤12, answers?}` → house-style A4 PDF on Vercel Blob, `{url, title, count, questionIds, filename}`. Same deterministic daily draw + eligibility gate as the kiosk (`lib/kiosk-pool` + `lib/kiosk-draw`), so it can never leak worked solutions or originating-school metadata. `{dry:true, level, topic}` → `{ok, poolSize}`, the health-check probe. Renderer: `lib/render-bot-worksheet.ts`; request logic + tests: `lib/bot-worksheet.ts` → `docs/KIOSK.md`

## Database

**Airtable** — student/lesson/invoice data. See bot project for full schema.

Key tables used by website: `Slots`, `Students`, `Enrollments`, `Lessons` (progress fields table → `docs/SCHEDULE.md`), `Exams`, `Invoices`, `Tokens`, `Rates`, `Rate History`, `Settings` (global flags: `exam_season_override`, `sec_capacity_override`), `Questions` (bot Q&A log, has `Subject` since 2026-08-03), `Notes` (revision notes markdown, `/api/notes`).

**Supabase (math project)** — `lesson_content` is RETIRED (dropped in the 2026-07 learning-units pivot; its last code reference — `/api/generate-tts` + the edit-notes lesson mode — was removed 2026-08-04). Live content tables: `content_snippets` (742 swipe cards; `display_group` text column = student-facing section name, independent of `subgroup_id`, NULL falls back to sub-group name) + `subgroups`/`sections_meta` (the tree `/revise` reads), `lesson_concepts` (topic→concept checklists), portal learning-units tables (`learning_units`, `lesson_cards`, `unit_events` → `PORTAL.md`), `topic_cards`, `kiosk_pairings`, `kiosk_prints`, `admin_todos`, `paper_marking_runs`, `job_runs` (the ops logbook → `docs/OPS.md`). Notes-portal build spec: [`SPEC-NOTES-PORTAL.md`](SPEC-NOTES-PORTAL.md).

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

- **Scripting against prod: use `https://www.adrianmathtuition.com`, never the apex.** The apex `adrianmathtuition.com` 307-redirects to www at the Vercel edge, and HTTP clients drop `Cookie` + `Authorization` when following a cross-host redirect (Node fetch/undici, Python requests) — but 307 replays a POST body, so `/api/admin/session` login "succeeds" while every credentialed call then 401s / `{"authed":false}`. Looks exactly like a server-side sign/verify secret mismatch; it isn't (burned 2026-08-10 — sessions + Bearer all verified fine once pointed at www). Related: `vercel env pull` writes literal `[SENSITIVE]` for Sensitive-type vars (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, …) — a value missing/masked in the pulled file is NOT evidence the var is unset; check `vercel env ls`.
- **Airtable date filter bug**: `{Date}<='endStr'` silently excludes records on `endStr` when Date is date-typed. Always use exclusive upper bound: `{Date}<'dayAfterEnd'` (add 1 day). Reference: `bot/flows.js:643`.
- **Linked record filtering**: Cannot use `{Student}='recXXX'` on a linked record field, AND `FIND('recXXX', ARRAYJOIN({Student}))>0` also does NOT work — `ARRAYJOIN` returns the linked record's **display name** (e.g. "Sim Ze Kai"), not the record ID. Correct pattern: filter by other fields (Date, Status, Exam Type, etc.) in Airtable, fetch the `Student`/`Slot` fields too, then match the record ID in JS: `r.fields['Student']?.[0] === studentId`. Applies to all linked-record fields. **This exact mistake sat in `generate-invoices`' Additional-lesson query and silently unbilled every Additional lesson from launch until 2026-07-26** (0 of 315 invoices ever carried one) — fixed via `lib/additional-lessons.ts` (window-fetch all, match student in JS; unit-tested).
- **Single-record GET has no `fields[]`**: Airtable's single-record endpoint (`GET /v0/{base}/{table}/{recXXX}`) ignores `fields[]` query params — they only work on list endpoints. Fetch all fields and filter in JS.
- **Privacy — lazy-load contact info**: `/api/admin-schedule` does NOT return `parentEmail`/`parentName` eagerly. Use `/api/admin-schedule/student-contact?id=recXXX` to fetch on demand.
- **UTC vs local time**: `getMondayOfWeek`/`addDays`/`isoDate` in `admin-schedule/route.ts` use UTC. `localToday()`/`daysAgo()` in `lib/schedule-helpers.ts` use local time. Do NOT merge — they serve different domains.
- Vercel serverless functions: 10s timeout (free) / 60s (Pro) — PDF generation is the bottleneck
- **Vercel hard-caps request bodies at 4.5MB at the PLATFORM level** — `vercel.json` memory bumps do NOT lift it. Big uploads must chunk (`mark-batch`), go client-token → Blob, go to the bot (`/api/mark-inbox`), or reference already-uploaded files by id — mark-paper auto-falls back to `phase:'remark'` on the saved run when the inline body would bust the cap (`lib/mark-payload.ts`, 2026-08-13).
- Signup link expiry is checked against `Date.now()` — links become invalid after the `expires` timestamp
- ⚠ `src/lib/latex-repair.ts` reads as binary to `grep` (non-printing mask sentinel) — use `grep -a`

## Pending Tasks

- Revision page formatting improvements
- Chat page smart scroll
- Add image support for revision notes (diagrams from DOCX files)

## ☁️ Cloud sessions (claude.ai/code) → [`docs/CLOUD.md`](docs/CLOUD.md)

claude.ai environments and skill libraries are **per-account**, but everything committed in this repo (skills, docs, the `env` block in `.claude/settings.json` with the public Supabase config) carries to any account/machine automatically. The only per-account step is a one-time ~5-min secrets bootstrap — `CRON_SECRET` + a read-only Airtable token + the network allowlist. Recipe, verification probes, and the crown-jewels-never-in-cloud list: [`docs/CLOUD.md`](docs/CLOUD.md). Posture: **the cloud agent holds triggers, not power**.

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
