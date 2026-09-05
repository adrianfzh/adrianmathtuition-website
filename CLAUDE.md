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
| **Question-bank figure images** — `/admin/figures-bank`, `figure_flags`/`figure_clean_log`, repairing or recovering a figure, any bulk figure work (claim protocol — parallel sessions collide here) | [`docs/FIGURES.md`](docs/FIGURES.md) |
| Invoices, deferred adjustments, Resend email delivery | [`docs/INVOICES.md`](docs/INVOICES.md) |
| `/tools` static pages, house style, photo-extraction service (`/api/tools/vision`) | [`docs/TOOLS.md`](docs/TOOLS.md) |
| Student Portal | [`PORTAL.md`](PORTAL.md) + [`PLAN-PORTAL-SOLO.md`](PLAN-PORTAL-SOLO.md) |
| **Portal v2 plan** — subjects on every paper (AM/EM pills, per-subject tiles, the subject gate), Practice as the to-do list, the finder's similarity tiers, the Notebook's fading mistakes list, Practice Again handing back its questions (agreed 6 Sep 2026; only the paper sort is done) | [`SPEC-PORTAL-V2.md`](SPEC-PORTAL-V2.md) |
| In-browser Pencil annotation spec | [`SPEC-ANNOTATE.md`](SPEC-ANNOTATE.md) |
| Subject expansion — Science / English / Chinese for the portal (research + phasing; nothing built yet) | [`SPEC-SUBJECTS.md`](SPEC-SUBJECTS.md) |
| **Turning a marked paper into work a student does** — the per-student teaching round (vet → diagnose → pick a wave → author the sheet → amend → release paper+sheet together → hand-in → vet), its four human checkpoints and binding rules | [`SPEC-TEACHING-CYCLE.md`](SPEC-TEACHING-CYCLE.md) — the CURRENT flow; [`SPEC-REMEDIATION.md`](SPEC-REMEDIATION.md) is the portal-drills lane, built but deliberately not in use |
| "From Adrian" assigned work — `/app/assignments`, `/api/admin/assignments`, `/api/portal/assignments`, the Send-work card on `/admin/students/[id]`, `portal_assignments` table | [`SPEC-ASSIGN.md`](SPEC-ASSIGN.md) |
| **Animated lessons** — `/app/lesson/[slug]`, `data/lessons/*.json` scene scripts, `lib/lesson-*.ts`, the narration voice track (`public/lessons/`, `scripts/lessons/generate-narration.mjs`), the player's Manual/Auto/🔊 Voice pacing, the `author-lesson` skill + `scripts/lessons/*` drafting pipeline, the release switch (admin-preview only until Adrian releases) | [`docs/LESSONS.md`](docs/LESSONS.md) |
| **Paper match at hand-in** — grounding every marking on the real paper: canonical paper key, bank grounding for math, Dropbox library auto-attach, the fingerprint guard, extraction hand-off (spec agreed 3 Sep 2026, phased build) | [`SPEC-PAPER-MATCH.md`](SPEC-PAPER-MATCH.md) |
| **The red pen** — annotating a marked page the way Adrian does: notes beside the line, circle + fix + continue-from-here, verdict lines in his voice, the nine error kinds, second-pen and bracket rules, solution placement (phase 1 shipped 5 Sep 2026; phase 2 behind `MARKING_PEN_V2`) | [`SPEC-RED-PEN.md`](SPEC-RED-PEN.md) |
| Margin teaching diagrams beside marking annotations (BUILT 2026-08-29 as `right_triangle` + `integral_region` kinds in the bot's `ai/margin-diagram.js`; deploy + Adrian's first-paper eyeball pending) | [`SPEC-MARGIN-DIAGRAMS.md`](SPEC-MARGIN-DIAGRAMS.md) |
| **Telegram `/ws` worksheet menu** — five kinds behind one menu: kind 3 instant via `/api/bot/worksheet` (marks-banded, `lib/marks-band.ts`), kinds 1/2/4/5 queued through `/api/admin/worksheet-jobs` (`lib/worksheet-jobs.ts`, `worksheet_jobs` table) to the Mac worker `scripts/worksheet-worker/` (built 5 Sep 2026; Adrian runs `install.sh`) | [`SPEC-WORKSHEET-MENU.md`](SPEC-WORKSHEET-MENU.md) |

> The four highest-traffic rows (marking, kiosk, schedule, invoices) also exist as
> auto-loading skills in `.claude/skills/` — belt and suspenders; this table stays
> the authoritative list.

**Which skill does what → [`docs/SKILLS.md`](docs/SKILLS.md).** All skills are
committed under `.claude/skills/`, so they travel with the repo to every machine
and claude.ai account — there is nothing per-account to install. Read the index
before reaching for a worksheet/paper skill: five of them are paper-shaped and
differ by *what they start from*. Add a row there whenever you add a skill.

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

Next.js App Router (`src/app/`) with TypeScript. API routes in `src/app/api/*/route.ts`. Shared components in `src/`. Deployed on Vercel. The Telegram/WhatsApp bot is a SEPARATE repo (`~/dev/adrianmath-telegram-math-bot`, Fly.io — **a push to its `main` AUTO-DEPLOYS** via `.github/workflows/fly-deploy.yml`: the Checks job (`npm test` + model/content gates) must go green first, and a red check SKIPS the deploy silently, so look at `gh run list -R adrianfzh/adrianmath-telegram-bot` after pushing; `npm run deploy` is only the manual fallback).

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
- `admin/desk/page.tsx` — 🖊 **the marking desk** (2026-09-02, the hub's marking tile): one queue in four DERIVED lanes (needs a student · marked, sheet on the way · ready to vet · released — `lib/desk-state.ts`, pure/tested) + one detail view (cover + every marked page with Agree/Override on EVERY question | the self-study sheet rendered via pdf.js + re-queue + diagnosis) ending in **Approve & release** (→ `release-with-sheet`). No writes of its own; sheets auto-queue via `lib/sheet-queue.ts` → `docs/MARKING.md` §The marking desk
- `admin/log/page.tsx` — **one-tap end-of-day lesson logging**: every unlogged lesson on one screen (mastery / homework / topics / notes / next plan). Owns no writes — posts to the existing lesson routes → `docs/SCHEDULE.md`
- `admin/digests/page.tsx` — parent-report drafts (Supabase `parent_digests`); weekly/monthly/term, generated by `/api/progress-digest` (monthly cron on the 1st)
- `admin/ops/page.tsx` — 🩺 **the centre's logbook board**: every automated job's last run (Supabase `job_runs`), missed-slot ambers, marking-queue lag → [`docs/OPS.md`](docs/OPS.md)
- `admin/calibration/page.tsx` — ⚖️ **calibration dashboard** (2026-09-02): AI marks vs a trusted human marking per subject (Supabase `calibration_results`, read-only), the ±2 gate + 10-paper minimum, 8-week trend, per-question verdicts → `docs/MARKING.md`
- `admin/mark/page.tsx` + `admin/mark/batch/[batchId]/page.tsx` — AI batch marking → `docs/MARKING.md`
- `admin/revision-signups/page.tsx` — June Revision Sprint sign-ups + attendance → `docs/SCHEDULE.md`
- `admin/notes/*` — printable notes hub → `docs/KIOSK.md`
- `admin/edit-notes/page.tsx` — revision notes editor (content in Airtable `Notes`)
- `admin/edit-cards/page.tsx` + `admin/edit-cards/[id]/page.tsx` — Cards editor (list: level/topic/subgroup, drag-to-reorder; single: markdown+KaTeX textarea, live preview, AI assist with diff/accept/reject)
- `kiosk/page.tsx` — iPad print station → `docs/KIOSK.md`
- `app/*` — **Student Portal** (`/app` dashboard, `practice`, `learn`, `notes`, `reference`, `settings`). `app/plan` = redirect to `/app/my-notes` since 2026-08-28 — the "My Plan" bands (SPEC-REVISION-PLAN.md; `lib/plan.ts` pure/tested over `lib/notebook-data.ts`) now render inside **My Notebook**. **Marking-only beta since 2026-08-21** (`lib/portal-beta.ts` `MARKING_ONLY_BETA`): students see only Home / Submit / Marked (+ Settings); practice/learn/notes/reference routes bounce students to `/app`, Adrian's admin cookie sees everything. `app/marking/page.tsx` = the student's own released marked scripts; `app/submit/page.tsx` = phone-first paper hand-in (**1 per student per SGT day, shared with the bot's /handin** — `countHandinsToday` in `lib/portal-submit-limit.ts`; spread-split + Blob client tokens → a ⏳ pending run **auto-queued into the bot's 🌙 marking queue** → marked → **auto-released** to the student (bot calls `mark-triage {action:'release', auto:true}`; margin-tick degradation is the only hold) — Adrian's Telegram says "✅ Released"; papers Adrian uploads himself still need his manual Release in triage) → `docs/MARKING.md`
- `app/reschedule/page.tsx` — student self-service lesson moves (Home → Change; thin proxy to the bot's canonical reschedule module → `docs/SCHEDULE.md`)
- `app/assignments/*` — **"From Adrian" assigned work** (v1 2026-08-22): Home card "📬 From Adrian · N to do" (hidden at zero) → list + worksheet page. Bank question → practice grader (instant, exempt from `DAILY_GRADE_CAP`); worksheet PDF → `/app/submit?assignment=` → 🌙 queue → auto-release flips it to marked. Assign from the Send-work card on `/admin/students/[id]` (`?send=<topic>` prefills it — the 📬 links in triage + papers). `attempt_id` is a **bigint** FK to `student_attempts` → [`SPEC-ASSIGN.md`](SPEC-ASSIGN.md)
- `app/practice/timed/*` — **⏱ Timed set** (2026-09-02): 3 or 5 real bank questions (same `practice_next` RPC + eligibility gate as the picker, one call per slot) against an **exam-pace clock** (`lib/timed-set.ts`, tested: 90 s/mark O-Level, 108 s/mark H2, whole minutes, 5-min floor); no solutions/marking until the clock stops, then every attempted question goes through `/api/portal/practice/grade` tagged `timed:{setId,elapsedSec,timeLimitSec}` → `student_attempts.duration_seconds` + `marking_json.timed` (blanks never hit the grader; `timed:start/finish/blank` in `portal_event_log`). Builder = `POST /api/portal/practice/timed-set` (health-check probes its 401). Doors: slim row on `/app/practice`, and Home's exam card prefills `?level=&topics=`. **In prod but NOT student-facing** (Adrian, 2026-09-02: "promote, but don't face students yet") — `EXAM_PREP_OPEN_TO_STUDENTS=false` in `lib/portal-beta.ts` hides the row, bounces the page to `/app/practice`, and 403s student builds; his admin cookie sees it all. One flag covers the exam card too — flip it to open both.
- `app/exam-countdown.tsx` — Home **"Next exam" countdown** (2026-09-02): Airtable `Exams` rows dated today→+120d (fetched inside `getDashboardData`'s existing batch, `lib/portal-exams.ts` pure/tested — `~|` approx flag honoured, Exam Notes text + results never surface), nearest 3 rows, tested-topic chips → `/app/practice?level=&topic=`, ⏱ link → timed set on those topics. Hidden at zero; strangers (no Airtable record) never see it. **Student-hidden until `EXAM_PREP_OPEN_TO_STUDENTS` flips** (same flag as the timed set — the card's last row is the timed-set door).
- `app/ask/page.tsx` — **Ask tab**: the web solver inside the portal (shared client core `lib/chat-solver.ts`, SSE to the Fly bot); every question logged to Airtable `Questions` per student via `/api/portal/ask-log`
- `app/find/*` — 🔍 **Find a question** (6 Sep 2026, SPEC-PORTAL-V2 §4): photo or typed question → `POST /api/portal/find` → the bot's embedding matches enriched from the bank's sub-skill filing → **the tier rule** (`lib/portal-find.ts` `classifyFindCandidates`, pure/tested: same canonical topic AND same `subgroups` filing corroborated by ≥2 matches AND marks within one — never "same chapter") → a **Similar question** straight onto the Practice list (`portal_assignments` source `find`, `find_tier`), else `/api/portal/generate` writes a **Made for you** one (cap `DAILY_GENERATE_CAP` = 10/day) and lists it the same way. Subject gate = `allowedSubjects` (§2). Ledger `portal_generation_log` (+ `seed_text`/`tier`/`assignment_id`/`candidates`/`review`) feeds the nightly **find-review** (`scripts/find-review/`, `GET|POST /api/admin/find-review`, `job_runs` `find-review` → `docs/OPS.md`). Home's old "Request materials" door became this; `app/requests` stays for Adrian's full-portal view only
- `app/requests/*` — student resource requests (2/SGT-day cap) → Telegram ping → `/admin/requests` queue (`portal_requests`). **No longer linked from the student Home or nav since 6 Sep 2026** (Find a question took the door; SPEC-PORTAL-V2 §5 merges requests into one queue later)
- `app/my-notes/*` — **"My Notebook"** (2026-08-28, merged tab; nav label renamed from My Notes): ① **Your mistakes** (6 Sep 2026, SPEC-PORTAL-V2 §6 — `notebook_mistakes`, one row per student × mistake pattern, `lib/notebook-mistakes.ts` pure/tested + `lib/notebook-mistakes-store.ts`; fed by mark-triage's release action and the practice grader, fail-soft; Still happening → Getting better → Fixed, "Corrected" via `POST /api/portal/notebook/mistakes`; "This week's focus" + Home's focus card were removed with it — `lib/plan.ts` only serves `/api/portal/plan` now) ② Questions to retry (live `notebook_entries`, `retryOrder` in `lib/notebook.ts`; bank twins deep-link `/app/practice?qid=…&from=notebook`) ③ ✂️ clippings gallery from marked papers (`portal_notes`, Blob `portal-notes/`; clip UI lives on `/app/marking`)
- `app/reschedule/*`, `app/print/*` (open to ALL students since 2026-08-28), practice `?qid=` deep links + 📷/🔍 finder (`/api/portal/similar|generate`, 5-gen/day cap in `portal_generation_log`, bot endpoints `/api/portal-similar|generate`) → docs/SCHEDULE.md + SPEC-PRINT-PAPER.md
- `api/payments/{stripe,hitpay}-webhook` — pass auto-grant (S$25 floor, idempotent; `portal_passes` + `lib/portal-passes.ts`; Stripe primary, `client_reference_id` = portal account uuid); `api/admin/passes` = manual grant
- `signup/page.tsx` — student registration form (HMAC-signed URL); `thankyou/`, `terms/`
- `revise/page.tsx`, `revise/[topic]/…` — revision notes landing/topic/lesson player; `revise/[topic]/[subtopic]/worked-examples/page.tsx` — TikTok-style swipe cards over `content_snippets` (accepts `?subgroup={id}`)
- `notes/[[...slug]]/page.tsx` — **the notes reader** (`/notes` → level → topic = worked examples over `content_snippets`; `/notes/<lvl>/<topic>/learn` = the teaching stack of `learning_units`, `NotesUnits.tsx`). Adrian's admin cookie (and not "viewing as a student", `lib/notes-viewer.ts`) gets the review chrome, all writing through cookie-authed `/api/admin/notes-units`: ReviewBar approve-all, per-block ⚑ Flag + note + ✓ Fixed receipts (`ReviewControls.tsx`), and since 2026-09-03 **hold-and-drag reordering** of the unit cards (⠿ handle, `ReorderUnits.tsx` → `{action:'reorder'}`; fixed-slots rule in `lib/unit-reorder.ts`, shared with `/admin/learn-review` — existing `unit_order` values are the slots, a drop only changes who sits where). Students get none of the review JS. Feature log: `IDEAS.md` §Notes reader content.
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
- `admin/calibration/route.ts` — read-only `calibration_results` (latest 200 + `lib/calibration-stats.ts` stats; `?subject=`) → `docs/MARKING.md`
- `admin/my-todos/route.ts` — personal to-do CRUD (Supabase `admin_todos`)
- `admin/todo/route.ts` — loop-queue CRUD (Airtable `Todos`)
- `admin/status/route.ts` — At-a-glance data: loop todos, personal `myTodos {open,overdue}`, unpaid invoices, students, bot week count
- `admin/student-profile/route.ts` — student profile hub data
- `admin/log-queue/route.ts` — read half of `/admin/log`: every unlogged in-window lesson + `prev` + `topicsByLevel`. **Owns no writes** → `docs/SCHEDULE.md`
- `admin/papers/route.ts` — marked-script library (Supabase `paper_marking_runs` direct, NOT the bot proxy); GET `?days=&limit=&student=&untagged=1&subject=`, POST `{runId, studentId|null}` to tag (tagging auto-queues the self-study sheet) → `docs/MARKING.md`
- `admin/desk/route.ts` (GET `?lane=&days=60` — lane rows + counts), `admin/desk/run/route.ts` (GET `?runId=` — the detail view's everything), `admin/desk/rebuild/route.ts` (POST `{runId}` → `lib/rebuild-run-pdfs`, 409 on released) — the marking desk; service-key reads, `verifyAdminAuth`, health-check `desk` probes the 401 → `docs/MARKING.md` §The marking desk
- `admin/portal-activity/route.ts` — portal activity visibility (GET, `verifyAdminAuth`): `lib/portal-activity.ts` `summariseActivity()` over `portal_accounts.last_seen_at` + marking-view events + practice + hand-ins; feeds the hub's 📱 card and the student-profile `portal` block; health-check `portal-activity` probes the 401 → `PORTAL.md` §Activity
- `portal/event/route.ts` — student-side counterpart (POST `{kind}`, allow-list `marking:view`/`marking:open`, writes `portal_event_log`); fired by `/app/marking`'s `MarkingBeacon.tsx` → `PORTAL.md` §Activity

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
- **Year-end arrears cycle (Oct→Jan only)** — the same three routes with `?mode=arrears`, on their own crons (Nov/Dec/Jan; `job_runs` slugs get an `-arrears` suffix):
  - `generate-invoices?mode=arrears` — `0 0 1 11,12,1 *` UTC = **1st 8am SGT**
  - `payment-reminder?mode=arrears` — `0 12 1 11,12,1 *` UTC = **1st 8pm SGT**
  - `send-invoices?mode=arrears` — `0 2 2 11,12,1 *` UTC = **2nd 10am SGT**
  - Who's billed in which lane, the exam cut-offs, combined Dec+Jan, regenerate rules, gaps → **`docs/INVOICES.md` §Year-end billing**. Rules live in `lib/year-end-billing.ts`; never re-derive them in a route.

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
- **🕗 Singapore time = `lib/sgt.ts`** (2026-09-02): `sgtTodayISO()`, `sgtDateISO(at)`, `sgtDaysAgoISO(n)`, `addDaysISO`, `sgtDayStart(at)` (the 16:00Z instant a Singapore day begins — for "how many today" caps), `sgtClock(at)` (weekday/hour/minute), `sgtMMDD`. Every helper takes an optional instant so tests pin a moment. `localToday()`/`daysAgo()`, `invoice-month`'s `sgtTodayISO`, `notebook`'s `sgtToday`/`addDaysIso`, `kiosk-draw`'s `sgtDate`, `assignments`' `sgToday` etc. are thin delegates kept for their callers. **Never hand-roll `Date.now() + 8 * 3600_000` or `new Date().getDate()` for a Singapore date again** — import from `lib/sgt.ts`.
- **🧠 Teaching-knowledge layer = `lib/teaching-knowledge.ts`** (2026-09-03, Adrian: "shouldn't these extractions be available in all surfaces?"): ONE accessor over Adrian's mined teaching material — Supabase `method_templates` (his method per question type + watch-out), `pitfalls` (wrong move / why / cue) and `formula_ref` — via the `teaching_knowledge(level, topics[], context, methods, pitfalls, formulae)` Postgres function (migration `teaching_knowledge_layer`; strict canonical-topic match, **approved-only on BOTH tables** — `method_templates.status` exists since then, miners write `pending` — duplicates collapsed, rows ranked by overlap with the question text). Consumers: `/api/portal/practice/hint` (💡 "How to approach it" on /app/practice, answer-free, before the solution), the practice grader (`methods` + `pitfalls` in `practice-grade-prompt.ts`, wording only, never a mark), the bot's paper marker (`lib/teaching-knowledge.js` `paperKnowledgeBlock` — one block per paper, topics detected by Haiku, rides every page read; `result.teaching_knowledge` stamps what it used — **OFF by default: `MARKING_TEACHING_NOTES=1` on Fly turns it on**, Adrian held it 2026-09-03 until the calibration harness compares runs with it on; the Mac plan worker's external reads skip it regardless), question generation (`generationBlock`, live), **the bot's chat solver** (`solverBlock`/`solverNotesFor` on the Telegram + web Q&A paths, wording only — **OFF by default: `SOLVER_TEACHING_NOTES=1` on Fly turns it on**, and it stays off until Adrian marks the blind A/B from the bot's `scripts/solver-ab.js`; bot CLAUDE.md §Solver teaching notes), the `self-study-sheet` skill, **the plan above the examples** (`loadDeckPlan` + `filterRedundantMethods`: `/notes/[level]/[topic]` "How Adrian approaches it" and the `/revise` worked-example decks' 📋 panel/overlay — methods the deck's titles/ledes already announce are dropped), and the Reference page. **Never query the three tables directly from a new surface — call the function, and add the surface to this list.** Health-check probes `portal-hint`.
- `lib/canonical-topics.ts` — canonical O-Level Sec and JC H2 topic lists; `getTopicsForLevel(level)` returns categories with topic arrays
- **🎨 FIGURE LIBRARY — never hand-write SVG for a math figure before checking it**: the BOT repo (`~/dev/adrianmath-telegram-math-bot`) has `lib/figures/` — a typed-spec registry of **33 figure families** (triangle/circle/similarity/quad configs, box-plot, cumulative-frequency, histogram, dot-stem, sector, number-line, venn, parallel-lines, coordinate-plane, function-graph — with oblique asymptotes since 4 Sep 2026 — speed-time, polygon-angles, argand, normal-curve, vector-3d, tree-diagram, mensuration-3d, trig-3d, scatter-regression; **added 3–4 Sep 2026**: graph-paper, construction, plane-geometry-configuration, pie-chart, curve-sketch-from-features, parametric-curve, conic-section, inverse-function-pair, piecewise-graph, argand-polygon — each stopped after its FIRST figure for Adrian's look, local bot commits until he clears them). Contract per family: `{ FAMILY, verify(spec), render(spec) }`, verify re-derives the maths and **fails closed** — inconsistent specs draw nothing. Also `ai/figure-render.js` (computed matplotlib figures). Use the registry for question/notes/redraw figures; bespoke SVG only for out-of-registry art (floor plans, real-world illustrations). Both former gaps (graph paper, pie charts) are closed; the only named-but-unbuilt shapes are `venn-probability` (2 candidates) and `riemann-rectangles` (1) — under the 3-candidate gate.
  **Figures are also gated at INGESTION** (2026-09-03): the extraction law makes every worker run five fitness checks per figure before storing it, only a figure passing all five may set `image_watermark_status='clean'`, and the nightly `figure-fitness` task re-judges anything ingested without a `fitness:` stamp — five checks, who may set 'clean', who may un-serve, and where holds land are in [`docs/FIGURES.md`](docs/FIGURES.md) §4 "Ingestion gate + nightly catch-up".
- **📁 Student files = `lib/student-files.ts` (5 Sep 2026):** every file that is a student's own data (hand-in photos, originals, annotated pages, marked/full/annotated PDFs, clippings, assignment worksheets, the iPad inbox) lives in the PRIVATE Supabase Storage bucket `student-files` (Singapore) and is served ONLY through `GET /api/files/<key>` (admin session/bearer, or the owning student once the run is released). The stored reference is the canonical URL `https://www.adrianmathtuition.com/api/files/<key>`; readers call `fetchOurFile(url)` (never a plain `fetch`), gates use `isOurFileUrl` (accepts legacy Blob URLs too), pages render with `fileHref(url)` (same-origin path so the preview deploy's cookie rides along), browser uploads use `lib/student-files-client.ts` `uploadStudentFile(tokenUrl, file)` against a signed upload URL. **Never `put()` a student file to Vercel Blob or file one into Dropbox again** (`mark-paper-dropbox` refuses unless `STUDENT_FILES_TO_DROPBOX=1`). Bot twin: `lib/student-files.js` (`storeFile` writes to the bucket when the Fly secret `STUDENT_FILES_BUCKET=1`). Legacy Blob URLs stay readable until the backfill; details → `docs/MARKING.md` §Student files.
- Invoice `Line Items` and `Line Items Extra` stored as JSON strings in Airtable long text fields — always `JSON.parse()` when reading
- `getInvoiceMonth()` returns next month from today — the **advance** run's target only; the arrears run resolves its month via `arrearsRunTarget()` / `arrearsTargetForMonth()` in `lib/year-end-billing.ts`
- `invoiceMonthLessonDates()` in `lib/billing-math.ts` gives an invoice month's **projected** regular-lesson dates (weekday walk + End Date clamp + NO_LESSON_DATES) — it replaced generate-invoices' inline `countOccurrencesInMonth` loop 2026-09-02; parity is pinned in `billing-math.test.ts`. Arrears months bill **attended** lessons instead (`arrearsRegularLessonsFor` + `lib/arrears-lines.ts`); projection is still used for the January half of the combined Dec+Jan invoice
- `NO_LESSON_DATES` — CNY + Christmas, same list as bot
- PDF generation uses Puppeteer with `@sparticuz/chromium` on Vercel (the BUNDLED binary since 5 Sep 2026 — `chromium-min` used to download a 50MB pack from GitHub on every cold start, ~8s of a 14.5s "Print this paper"; `next.config.ts` traces `bin/**` into every `/api/**` route), local Chrome path for dev; reuse `getBrowser()`, call `closeBrowser()` after batches. **Maths in a rendered page comes from `lib/katex-inline.ts`** (`katexInlineHead()` + `katexAutoRenderScript()` + `waitForPageReady(page)`: KaTeX CSS/JS/woff2 inlined from node_modules, no CDN, no `networkidle0`) — `render-paper-pdf` and `render-solutions-pdf` use it; the other renderers still load KaTeX from jsDelivr and should be moved over when touched. Puppeteer routes want `memory: 3008` in `vercel.json` (default 1GB ≈ ⅓ of a core, Chromium runs ~3× slower)
- PayNow logo in invoice template is embedded as base64 — read from `public/paynow.png`
- **All admin web UI actions are silent** (no Telegram) — notification policy details in `docs/SCHEDULE.md`

## Gotchas

- **Scripting against prod: use `https://www.adrianmathtuition.com`, never the apex.** The apex `adrianmathtuition.com` 307-redirects to www at the Vercel edge, and HTTP clients drop `Cookie` + `Authorization` when following a cross-host redirect (Node fetch/undici, Python requests) — but 307 replays a POST body, so `/api/admin/session` login "succeeds" while every credentialed call then 401s / `{"authed":false}`. Looks exactly like a server-side sign/verify secret mismatch; it isn't (burned 2026-08-10 — sessions + Bearer all verified fine once pointed at www). Related: `vercel env pull` writes literal `[SENSITIVE]` for Sensitive-type vars (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, …) — a value missing/masked in the pulled file is NOT evidence the var is unset; check `vercel env ls`.
- **Airtable date filter bug**: `{Date}<='endStr'` silently excludes records on `endStr` when Date is date-typed. Always use exclusive upper bound: `{Date}<'dayAfterEnd'` (add 1 day). Reference: `bot/flows.js:643`.
- **Linked record filtering**: Cannot use `{Student}='recXXX'` on a linked record field, AND `FIND('recXXX', ARRAYJOIN({Student}))>0` also does NOT work — `ARRAYJOIN` returns the linked record's **display name** (e.g. "Sim Ze Kai"), not the record ID. Correct pattern: filter by other fields (Date, Status, Exam Type, etc.) in Airtable, fetch the `Student`/`Slot` fields too, then match the record ID in JS: `r.fields['Student']?.[0] === studentId`. Applies to all linked-record fields. **This exact mistake sat in `generate-invoices`' Additional-lesson query and silently unbilled every Additional lesson from launch until 2026-07-26** (0 of 315 invoices ever carried one) — fixed via `lib/additional-lessons.ts` (window-fetch all, match student in JS; unit-tested).
- **Single-record GET has no `fields[]`**: Airtable's single-record endpoint (`GET /v0/{base}/{table}/{recXXX}`) ignores `fields[]` query params — they only work on list endpoints. Fetch all fields and filter in JS.
- **Privacy — lazy-load contact info**: `/api/admin-schedule` does NOT return `parentEmail`/`parentName` eagerly. Use `/api/admin-schedule/student-contact?id=recXXX` to fetch on demand.
- **UTC vs Singapore time**: `getMondayOfWeek`/`addDays`/`isoDate` in `admin-schedule/route.ts` are UTC week arithmetic on date labels — do NOT merge them into `lib/sgt.ts`; they serve a different domain. `localToday()`/`daysAgo()` in `lib/schedule-helpers.ts` delegate to `lib/sgt.ts` since 2026-09-02. Before that they read server-LOCAL date components, and Vercel runs UTC with no `TZ` env var, so every "today" built on them was a day behind between 00:00 and 08:00 SGT (edit windows, unlogged-lesson queues, capacity checks). Local `next dev` never showed it because the Mac is on SGT.
- Vercel serverless functions: 10s timeout (free) / 60s (Pro) — PDF generation is the bottleneck
- **Vercel hard-caps request bodies at 4.5MB at the PLATFORM level** — `vercel.json` memory bumps do NOT lift it. Big uploads must chunk (`mark-batch`), go client-token → Blob, go to the bot (`/api/mark-inbox`), or reference already-uploaded files by id — mark-paper auto-falls back to `phase:'remark'` on the saved run when the inline body would bust the cap (`lib/mark-payload.ts`, 2026-08-13).
- Signup link expiry is checked against `Date.now()` — links become invalid after the `expires` timestamp
- ⚠ `src/lib/latex-repair.ts` reads as binary to `grep` (non-printing mask sentinel) — use `grep -a`
- **iCloud/Finder " 2" duplicate files** (`page 2.tsx`, `SPEC-X 2.md`, `.gitignore 2`): the repo lived in the iCloud-synced Desktop until 4 Sept 2026 and Finder kept minting these sync-conflict copies — in worktrees too. Both repos now live in `~/dev` (outside iCloud), so new ones should stop; the old ones remain until swept. They are stale snapshots: **delete on sight, never commit or edit one.** They're gitignored (so invisible to `git status`) but still hit greps and get typechecked by `next build`/`tsc`. Sweep check: `git ls-files -o -x node_modules | grep -E ' [0-9]+(\.[^/]+)?$'`. Full purge 2026-08-28 (152 files, every one verified byte-identical to its sibling or to a committed blob first — do the same before deleting).
  **They also land INSIDE `.git`** (bot repo, 2026-08-31): a `.git/refs/heads/main 2` made every `git fetch`/`push` die with `fatal: bad object refs/heads/main 2` + `did not send all necessary objects` — a ref name may not contain a space, so git reads the whole enumeration as corrupt. Reads like a broken repo; is one stale file. Check `find .git -name '* [0-9]'` (also mints `.git/index N`, `AUTO_MERGE N`, reflog copies — those are inert; only the one under `refs/` bites), confirm the ref is an ancestor of the live branch, delete it, refetch. **iCloud also overwrites `.git/refs/heads/main` ITSELF with the other Mac's value** (bot repo, 2026-09-02, mid-session): the file arrives with the other Mac's mtime and points at a commit only that Mac has → `fatal: bad object HEAD`, `git fetch` dies with "did not send all necessary objects", and there is NO reflog entry for the move (git didn't do it). Fix: take the last sha from `.git/logs/refs/heads/main`, `git update-ref refs/heads/main <sha>`, `git pull --ff-only`, then delete the reflog line that names the phantom sha (fsck otherwise reports "invalid reflog entry"). The other Mac's commit is safe on that Mac. Root cause is a `.git` directory inside iCloud Drive (bot + AdrianMath both) — the durable fix is `.git` → `.git.nosync` with a `gitdir:` pointer file, or moving the repo under `~/dev` — done for both repos on 4 Sept 2026.

## Pending Tasks → [`IDEAS.md`](IDEAS.md)

**The consolidated build queue lives in [`IDEAS.md`](IDEAS.md)** (repo root, 2026-08-29) —
statuses per idea, updated by whichever session ships or designs one. Read it before
proposing new builds; add agreed ideas THERE, not here (session memory is per-account;
the repo travels).

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
