> **Sync rule**: This file + `docs/*.md` are the source of truth for Claude Code/Cowork sessions. Decisions made in claude.ai project chat are synced here via update prompts.
> **This file is the LEAN INDEX (6 Oct 2026, Adrian: "yes").** Policies, red lines, gotchas that bite on any task, and a routing table — nothing else. Every detail, history and bug note lives in `docs/` or a `SPEC-*.md`. **Keep it under 40 KB** — `scripts/doc-sweep/claude-size.test.mjs` fails the push otherwise, and the Sunday doc-sweep reports it. Adding detail? Put it in the topical doc and add at most one line here.

# AdrianMath Website

Adrian's math tuition website on Vercel. Next.js 16 App Router + TypeScript + Tailwind CSS. The Telegram/WhatsApp bot is a separate repo (`~/dev/adrianmath-telegram-math-bot`, Fly.io).

**Student Portal (`/app/*`, `/login`, `/signup`, `/api/portal/*`)**: read [`PORTAL.md`](PORTAL.md) + [`PLAN-PORTAL-SOLO.md`](PLAN-PORTAL-SOLO.md) first. Phase G safety checks → `docs/OPS.md` §Safety checks; erasure = `lib/erasure.ts`; which bank rows a student may open = `lib/serve-gate.ts`.

## 🪙 Token rules — every session and every agent (Adrian, 6 Oct 2026)

Every session and subagent loads this file on start, so its size and our habits are the bill. Detail + examples: [`docs/FANOUT.md`](docs/FANOUT.md) §9a.
- **(a) Report once.** Background/batch agents report ONCE at the end (or on a real blocker) — no per-batch progress messages to the main session. A coordinator collects sub-results silently and sends one summary.
- **(b) One topic per session.** Start a fresh session for unrelated work.
- **(c) Model per agent.** Haiku/Sonnet for search, counting, formatting, screenshot checks; Opus for writing, checking, marking rules and judgement. Medium effort by default.
- **(d) Bulk jobs off the interactive session** — the Fly worker lanes or the cloud credit.
- **(e) Don't re-read big files** — use the library index (`scripts/library-index.ts`), `grep`, and targeted line ranges.
- **Keep CLAUDE.md lean** — detail goes to `docs/`, never back here.

## 📚 Touching X → read Y FIRST (mandatory)

One line per area; the full table with every detail and date is [`docs/AREAS.md`](docs/AREAS.md). Those docs hold the "this exact mistake shipped a bug" notes — reading them is not optional.

| Touching… | Read FIRST |
|---|---|
| `/admin/schedule`, `/admin/progress`, `/admin/log`, lessons, reschedules, capacity, Revision Sprint, exam season, the lesson log that fills itself, the end-of-lesson voice note | [`docs/SCHEDULE.md`](docs/SCHEDULE.md) |
| Any marking surface (`/admin/mark-paper`, `/admin/papers`, `/app/marking`, `/app/submit`, `mark-paper-*`, `render-marking`, Annotate, paper schemes, totals, duplicates, fix-first, learning loops) | [`docs/MARKING.md`](docs/MARKING.md) |
| `/kiosk`, `/api/kiosk/*`, `/admin/notes`, Dropbox notes PDFs, `/api/bot/worksheet` | [`docs/KIOSK.md`](docs/KIOSK.md) |
| Question-bank figures, `/admin/figures-bank`, bulk figure work (claim protocol) | [`docs/FIGURES.md`](docs/FIGURES.md) |
| Extraction rules, the extraction queue + worker, what is already extracted (`scripts/library-index.ts`) | [`docs/EXTRACTION-QUEUE.md`](docs/EXTRACTION-QUEUE.md) §4b–4d |
| Invoices, adjustments, Resend | [`docs/INVOICES.md`](docs/INVOICES.md) |
| `/tools`, `/api/tools/vision` | [`docs/TOOLS.md`](docs/TOOLS.md) |
| Every page / API route / table — the map | [`docs/APP-MAP.md`](docs/APP-MAP.md) |
| Portal v2 (subjects, Practice list, finder tiers, Notebook) | [`SPEC-PORTAL-V2.md`](SPEC-PORTAL-V2.md) |
| Pencil annotation | [`SPEC-ANNOTATE.md`](SPEC-ANNOTATE.md) §17 |
| Subjects expansion · Humanities · Essays (English + 中文) | [`SPEC-SUBJECTS.md`](SPEC-SUBJECTS.md) · [`SPEC-HUMANITIES.md`](SPEC-HUMANITIES.md) · [`SPEC-ESSAY-MARKING.md`](SPEC-ESSAY-MARKING.md) |
| 🧭 Where students are stuck (`stuck-weekly`, `/admin/stuck`) | [`docs/AREAS.md`](docs/AREAS.md) row "Where students are stuck" |
| When a student leaves (marked-papers zip, leaver notice) | [`docs/AREAS.md`](docs/AREAS.md) row "When a student leaves" |
| 📌 Next lesson, progress note, students-first admin | [`SPEC-STUDENT-FIRST.md`](SPEC-STUDENT-FIRST.md) §15 |
| Marking calibration · science marking · science bench | [`SPEC-MARKING-CALIBRATION.md`](SPEC-MARKING-CALIBRATION.md) · [`SPEC-SCIENCE-MARKING.md`](SPEC-SCIENCE-MARKING.md) · [`SPEC-SCIENCE-BENCH.md`](SPEC-SCIENCE-BENCH.md) |
| My Notebook | [`SPEC-NOTEBOOK-V2.md`](SPEC-NOTEBOOK-V2.md) + `docs/APP-MAP.md` §app/my-notes |
| Student app (App Store) · public launch · the company · tutor tools | [`SPEC-STUDENT-APP.md`](SPEC-STUDENT-APP.md) · [`SPEC-PUBLIC-LAUNCH.md`](SPEC-PUBLIC-LAUNCH.md) · [`SPEC-COMPANY.md`](SPEC-COMPANY.md) · [`SPEC-TUTOR-TOOLS.md`](SPEC-TUTOR-TOOLS.md) |
| Teaching cycle · section bank · remediation (parked) | [`SPEC-TEACHING-CYCLE.md`](SPEC-TEACHING-CYCLE.md) · [`SPEC-SECTION-BANK.md`](SPEC-SECTION-BANK.md) · [`SPEC-REMEDIATION.md`](SPEC-REMEDIATION.md) |
| "From Adrian" assigned work | [`SPEC-ASSIGN.md`](SPEC-ASSIGN.md) |
| Animated lessons, ▶ one-minute explanation, voice, characters, stickers | [`docs/LESSONS.md`](docs/LESSONS.md) |
| Paper match at hand-in · missing questions at hand-in | [`SPEC-PAPER-MATCH.md`](SPEC-PAPER-MATCH.md) · [`SPEC-HANDIN-COMPLETENESS.md`](SPEC-HANDIN-COMPLETENESS.md) |
| Chat solver bank grounding | [`SPEC-SOLVER-BANK-GROUNDING.md`](SPEC-SOLVER-BANK-GROUNDING.md) |
| The red pen · margin diagrams | [`SPEC-RED-PEN.md`](SPEC-RED-PEN.md) · [`SPEC-MARGIN-DIAGRAMS.md`](SPEC-MARGIN-DIAGRAMS.md) |
| GCE-format papers + Set papers · school-style papers | [`docs/GCE-PAPER.md`](docs/GCE-PAPER.md) · [`docs/SCHOOL-PAPER.md`](docs/SCHOOL-PAPER.md) |
| Practice photo + photo sheets | [`SPEC-PRACTICE-PHOTO.md`](SPEC-PRACTICE-PHOTO.md) |
| Twins (our own questions) | [`SPEC-TWINS.md`](SPEC-TWINS.md) |
| Measuring the marking (shadow reads, consistency) · ops, switches, safety checks, job_runs | [`docs/MARKING.md`](docs/MARKING.md) + [`docs/OPS.md`](docs/OPS.md) |
| Running a batch of fixes with agents; which model does which job | [`docs/FANOUT.md`](docs/FANOUT.md) (§9 is LIVING) |
| 🌙 Nightly builder | [`docs/NIGHTLY-BUILDER.md`](docs/NIGHTLY-BUILDER.md) |
| Stale-doc sweeper | [`docs/OPS.md`](docs/OPS.md) §🧹 |
| Other people's exam questions (what may be served) | [`docs/CONTENT-POLICY.md`](docs/CONTENT-POLICY.md) |
| Telegram `/ws` worksheet menu | [`SPEC-WORKSHEET-MENU.md`](SPEC-WORKSHEET-MENU.md) |
| Learn from Adrian | [`docs/LEARN-FROM-ADRIAN.md`](docs/LEARN-FROM-ADRIAN.md) |
| Commit / push / preview alias / promote detail, CLI seat block | [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| Patterns (sgt.ts, teaching-knowledge layer, figure library, student files, Puppeteer, KaTeX), every gotcha, env-var notes | [`docs/PATTERNS.md`](docs/PATTERNS.md) |
| Cloud sessions (claude.ai/code) | [`docs/CLOUD.md`](docs/CLOUD.md) |
| Which skill does what | [`docs/SKILLS.md`](docs/SKILLS.md) — add a row when you add a skill |

The marking, kiosk, schedule and invoices rows also exist as auto-loading skills in `.claude/skills/`.

## 📝 Say it once — write it where every session reads it (Adrian, 21 Sep → 6 Oct 2026)

Adrian, 2 Oct 2026: *"can you save as memory so that other claude sessions from other claude
accounts also follow?"* — about 20 times since 21 Sep, latest 6 Oct: *"does future sessions and
in other claude accounts know about this?"*. Why: a memory file reaches one account on one Mac;
cloud sessions and his other accounts never see it, so he says it again.
- **He states a preference, a rule or a product decision → write it into the repo in the same
  turn, unasked**: the area's doc or spec (dated, his words), plus one line here only when every
  session needs it. A memory file is extra, never the only copy.
- **A build lands or changes state → update its doc in the same commit.**
- **End with one line:** "Saved for every session: <where>". Not sure it is standing? Ask in one
  line: "Keep this as a rule?"

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
- **Standard** — **Revised 17 Sep 2026 (Adrian, case (b): a "stays human" item became automatable to his standard).** The ground truth for marking is the SEAB mark scheme and published examiner convention (Cambridge Example Candidate Responses, examiner reports), not Adrian's own marks — his hand-marked papers were useful once to shake out the interpretation layer (method marks on an unlisted route, error carried forward, what the scheme leaves unsaid) and that job is done. A model-built SEAB-style scheme for a school paper with no scheme is accepted as at least as principled as the spread between schools' own schemes. What stays his: **adjudicating the parts where the marker and a published examiner disagree** (never marking whole papers to calibrate), and owning the standard for what the scheme does not cover. Calibration benches are scheme-faithfulness benches (examiner-marked scripts, seeded scripts with truth by construction, truth-free consistency tests), not teacher-vs-model deltas.
- **Accountability** — parents pay a person who answers for outcomes. Parent-facing output carries his name. **Revised 8 Sep 2026 (Adrian: "can we automate the release of the marking and the practice again without my vetting?"):** the sign-off checkpoint sits AFTER release for marked hand-ins — every marked hand-in goes to the student at once (only a paper with nothing marked is refused); the accuracy signals (`lib/mark-triage.ts computeAutoHold`) are pinged to him as ⚠️ watch-outs, not holds; an override after release re-issues the copy; the switch is a Setting he can flip from the desk; the Monday `auto-release-report` counts what he changed and pauses the switch when it exceeds one in ten. Sheets go out on the 12-hour clock unless the paper is held. **Later on 8 Sep 2026 (Adrian: "only generate when they request"):** a Practice Again sheet exists only when asked for — Adrian's desk 📘 Queue (**not compulsory by default since 17 Sep 2026** — `release-with-sheet {required:true}` makes one compulsory, and only then `practice-again-reminders` nags the student day 3 / weekly / ×4) or the student's Request button in the app (goes out on its own once it clears the gate) → `docs/MARKING.md` §Practice Again on request.
- **Relationships** — trust with parents and students is the distribution channel. Agents draft; Adrian delivers in his own voice.
- **Novelty** — noticing the spec itself is wrong (new syllabus, new failure mode) is human work. Surface anomalies to him; never smooth them over.

## 📖 Readability — everything (Adrian, 29 Sep 2026)

Adrian: *"can solutions pdf have better readability? i keep asking for better readability, is
anyone following?"* … *"better readability has to apply to all solutions, and all annotations
… basically everything"*. He has asked more than once; treat it as a standing rule on EVERY
surface a student or Adrian reads — solutions PDFs, printed papers and answer keys, the red
pen, Practice Again sheets, notes, cards, the app's copy, Telegram messages, reports.

- **One idea per line.** Working is a chain, one step a line ([[solution-one-chain]]). No
  paragraph that carries three things.
- **The result stands out.** Every solution and every part ends with a bold **Answer:**
  line; a verdict on a marked page comes before the explanation.
- **Marker's material stays out of what a student reads.** Mark codes, "[M1 for …]", a
  "Mark scheme:" paragraph, examiner commentary belong to the scheme, not the solution —
  at most a small grey code. Alternatives go AFTER the working, set apart.
- **Asides and checks are quieter** (grey, smaller); the main line is not.
- **Short, plain words.** Say what went wrong, then what to do. Fewer words wins a tie.
- **Look at the rendered thing** (PDF, page, phone screen) before calling it done — not the
  source text. A page that is correct but hard to read is NOT done.
- **Fix at the source, keep the renderer's net.** Writers (gce-paper, the sheet worker, the
  marker, the notes miners) write clean content; the renderers also clean what reaches them
  (`lib/render-solutions-pdf.ts` `splitSolution` / `markNotesToCodes`, 29 Sep 2026), so old
  content reads well too. The daily page reader counts a hard-to-read note as a finding (bot
  `.claude/skills/marking-review/SKILL.md` §D).

## 🚫 No disclaimers, no model names on student screens (Adrian, 5 Oct 2026)

- **No disclaimers or plumbing notes** on student-facing screens ("AI-marked — not always perfect", "marking is off once you've seen the solution"). If behaviour needs explaining, make it just work (grey out, hide). The one exception is the Science Home "Dear students" notice.
- **Never name a model** — no student-facing page, push, Telegram line, PDF or test message names Claude / Opus / Sonnet / Haiku / Fable / Gemini / MiniMax / "AI model". Test messages say plain "test". Admin-only screens may name models.

## 🙊 The app never names Adrian (Adrian, 3 Oct 2026)

Adrian: *"don't mention me in the app. just say something generic"*. Every string a student
reads — pages under `/app`, login, the activation page, API error messages, push and Telegram
lines to students, download file names — says **"your tutor"** or **"we"**, never "Adrian"
("From your tutor", "We have been told", "Sending for marking…"). Admin-only lines, comments,
identifiers (`fromAdrian`, `notes=adrian`), e-mails he signs and the tuition site's brand name
are untouched. Older sections of this file still quote the old labels ("From Adrian").

## 🏢 The company — standing reminders (Adrian, 24 Sep 2026)

Adrian: *"put #5 into memory and remind me when anything about company comes up"* and *"the
credits part also put into memory"*.

**When a session touches anything about the company** — `SPEC-COMPANY.md` or the specs under
it (public launch, student app, tutor tools), pricing, passes, packs or credits, sign-up or
consent, the app stores, a brand or domain, orgs or entitlements — **remind Adrian of both
points below in the reply, briefly**, and check the work against them:

1. **Customer data belongs to the company from each user's first sign-up** (`SPEC-COMPANY.md`
   §14.5).
   - The company exists first and is the controller.
   - Its notice names it and says the data passes to a buyer.
   - Year of birth at sign-up; a parent confirms for anyone under 13.
   - An append-only `consent_records` table (one row per consent event, with the notice
     version and its hash, and the channel), not one JSON value per account.
   - Every row carries `org_id`. Tuition students stay with the tuition business, the company
     acting as its processor under a written agreement.
   - A DPIA, a named DPO and a breach runbook before launch.
2. **Credits** (`SPEC-COMPANY.md` §7.1).
   - One credit = one paper marked by morning; within the hour = 2.
   - Bought packs never expire; plan credits expire monthly, with one month's rollover.
   - One wallet across web, iOS and Android.
   - Ask is included with a daily cap, not charged in credits.
   - A wrong or failed marking gives the credit back.
   - An append-only credit ledger from day one: unspent credits are deferred revenue a buyer
     will ask about.

## 🚪 Student-facing switches — check before every promote (Adrian, 1 Oct 2026)

Every unfinished student surface is behind ONE constant in `src/lib/portal-beta.ts`, named `*_OPEN_TO_STUDENTS`. `false` = students never see it; Adrian's admin cookie and the preview student (`portal-teste@example.com`) always do. **Before a promote, list them (`grep -n "OPEN_TO_STUDENTS = " src/lib/portal-beta.ts`) and say in the report which are open.** The table of every switch and its state is [`docs/SWITCHES.md`](docs/SWITCHES.md) — add a row when you add a switch, update it in the same commit when Adrian opens one (the doc-sweep checks it against the code).

## Commands

- `npm run dev` / `next dev` — run locally
- `vercel --prod` — deploy to production (or auto-deploys from git push)
- `vercel env pull .env.local` — pull env vars for local dev

## Auto commit + push policy — dev-first, promote to prod on approval

Full detail (the seat-blocked CLI, docs-only builds, cloud sessions, hotfixes): [`docs/DEPLOY.md`](docs/DEPLOY.md).
- **`main` = production, `dev` = preview.** Work never lands on `main` without Adrian's explicit go-ahead.
- **On any turn that changed code, commit + push `dev` at the end of the turn** (no need to be asked). Only when files changed; "don't push" / "hold off" skips it. Run build/typecheck first; the pre-push hook runs the tests and blocks on failure. Real commit message + the `Co-Authored-By` trailer.
- A `dev` push auto-builds a preview (GitHub integration). When READY, re-point the stable alias: `vercel alias set <new-deployment-url> adrianmath-dev.vercel.app` and share **https://adrianmath-dev.vercel.app**. `vercel deploy` from the CLI is seat-blocked (sits BLOCKED) — push instead.
- **Docs-only pushes do NOT build** (`scripts/vercel-ignore-build.sh`: only `docs/`, `.claude/`, `.githooks/`, `.github/`, `scripts/`, `migrations/`, `reference/`, `_backups/`, `_old/`, `ios-shell/`, root `*.md` changed). `data/` ships. Don't wait for a deployment after one.
- **Promote** only on "promote" / "ship it" / "to prod" / "push to prod": `git checkout main && git merge --ff-only dev && git push origin main && git checkout dev`. If `--ff-only` fails, rebase `dev` onto `main` first. Hotfix: commit to `dev` and promote in the same turn, and say so. Rollback = `git revert` on `main` or promote a previous Vercel build.
- **Each session in its own clone** (second session → `~/dev/adrianmathtuition-website-2`). Edits you did not make in `git status` = a shared checkout: commit by pathspec, never stash/reset others' work, say so (`docs/FANOUT.md` §7).
- **Cloud session**: you CAN push and deploy — push your `claude/…` branch / open a PR into `dev`, and ask Adrian for "push to dev" / "promote" / "merge #N". Never say you cannot. → `docs/CLOUD.md`

## ⏱ After a push that deploys — do not wait by default (Adrian, 2 Oct 2026)

Adrian: *"is it always good to wait for the production build?"* … *"let's have a more
efficient way of doing things"*. Applies to BOTH repos (a website promote or `dev` push that
builds; a bot or worker push to `main`).

1. **Say "deploying" / "promoted" and carry on** with the rest of the turn.
2. **Check ONCE, at the end of the turn** (bot: `gh run list -R adrianfzh/adrianmath-telegram-bot`;
   website: the deployment's status). Finished → report it in the recap. Still building → say
   it is **not confirmed yet**, and check first thing next turn.
3. **No background watcher just to confirm a green build.** A watcher wakes the session when
   it ends, and every wake-up is a full turn that re-reads the whole conversation.
4. **Wait only when the next step needs the new version running**: probing a page, route or
   cron the push adds; a Fly secret that must land on the new image; a re-mark that needs the
   fix; a hotfix Adrian is watching. Do other work while waiting.
5. **A docs-only push builds nothing** — nothing to check, do not wait.
6. **A red check or a failed build is always reported**, with the failing step — never
   smoothed over, and never left for "next turn" once seen.

The preview alias still moves after a `dev` build is READY — do it in the end-of-turn check.

While long work runs, say in a few words what is happening; never block on something the next step does not need (`docs/DEPLOY.md` §Do not keep Adrian waiting).

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

## Testing & monitoring (2026-07-16) — definition of done

Money and date logic lives as pure functions in `src/lib/` with a sibling `.test.ts` (`billing-math.ts`, `invoice-month.ts`, `invoice-payments.ts`, `additional-lessons.ts` — reuse them, never re-implement a weekday/proration loop); a fixed money bug gets a named regression test. Any new parent/student-facing surface adds a `timed('name', …)` check to `/api/health-check` in the same PR; scheduled jobs stamp `job_runs` + a `JOB_RHYTHMS` line (`docs/OPS.md`). No browser E2E. Full text: `docs/PATTERNS.md` §Testing & monitoring policy.

## Auth Patterns

- **Admin pages:** Cookie-based auth (30-day expiry, `ADMIN_PASSWORD`)
- **Admin API routes:** `Authorization: Bearer ADMIN_PASSWORD` header; verified via `verifyAdminAuth(req)` in `lib/schedule-helpers.ts`
- **Scoped agent tokens (17 Sep 2026):** `AGENT_TOKEN_RELEASE|SHEETS|REINSTATE|SWITCHES|PAPERS|ASSIGN` — one per action family, accepted only by that family's routes beside the admin check (`lib/agent-auth.ts verifyAgentAuth`), every use logged to `agent_actions`; how a cloud session acts without the admin password → `docs/CLOUD.md` §Step 2
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

## Patterns that bite on any task (detail → [`docs/PATTERNS.md`](docs/PATTERNS.md))

- `airtableRequestAll()` for any "list all" (100-record pages); `verifyAdminAuth(req)` from `lib/schedule-helpers.ts`.
- **Singapore time = `lib/sgt.ts`** — never hand-roll `Date.now() + 8 * 3600_000` or `new Date().getDate()`.
- **Teaching knowledge = `lib/teaching-knowledge.ts`** (the `teaching_knowledge()` function) — never query `method_templates` / `pitfalls` / `formula_ref` directly; add a new surface to the list in `docs/PATTERNS.md`.
- **Figures**: check the bot's figure library (`lib/figures/`, verify-then-render, fails closed) before hand-writing SVG.
- **Student files = `lib/student-files.ts`** — private `student-files` bucket, served via `/api/files/<key>`; read with `fetchOurFile`, render with `fileHref`. Never `put()` a student file to Vercel Blob or Dropbox.
- **Canonical topics** = `lib/canonical-topics.ts`. Invoice `Line Items` are JSON strings — `JSON.parse()`.
- Puppeteer: reuse `getBrowser()`, `closeBrowser()` after batches; maths via `lib/katex-inline.ts`; Puppeteer routes want `memory: 3008`.
- All admin web UI actions are silent (no Telegram).

## Gotchas that bite on any task (full list → [`docs/PATTERNS.md`](docs/PATTERNS.md) §Gotchas)

- **`~/Desktop/AdrianMath` is RETIRED** (5 Oct 2026) — never read, write or `find` there. The toolkit is the bot repo's `extraction/`; papers are in the `paper-library` bucket.
- **Script against `https://www.adrianmathtuition.com`, never the apex** (the 307 drops cookies/auth). `vercel env pull` shows `[SENSITIVE]` for masked vars — not evidence a var is unset.
- **Airtable**: date upper bound is exclusive (`{Date}<'dayAfterEnd'`); linked-record fields can't be filtered by record id (not even `ARRAYJOIN`) — fetch and match in JS; single-record GET ignores `fields[]`.
- **Contact info is lazy-loaded** (`/api/admin-schedule/student-contact`), never returned eagerly.
- **Vercel caps request bodies at 4.5 MB** — chunk, client-token upload, or reference by id.
- `src/lib/latex-repair.ts` reads as binary to grep — use `grep -a`.
- **" 2" duplicate files** (old iCloud copies): stale — delete on sight, never commit or edit one.

## Pending Tasks → [`IDEAS.md`](IDEAS.md)

**The consolidated build queue lives in [`IDEAS.md`](IDEAS.md)** (its top section "📅 Shipped 4–5 Oct 2026" lists what those days changed and what is still open for Adrian) (repo root, 2026-08-29) —
statuses per idea, updated by whichever session ships or designs one. Read it before
proposing new builds; add agreed ideas THERE, not here (session memory is per-account;
the repo travels).

## ☁️ Cloud sessions → [`docs/CLOUD.md`](docs/CLOUD.md)

Everything committed here travels to any account; the only per-account step is the secrets bootstrap. Posture: the cloud agent holds triggers, not power. A cloud session CAN push and deploy (see the push policy above).

## Environment variables

`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`, `SIGNUP_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RECEIPT_API_TOKEN`, `RENDER_MARKING_SECRET`, `GOOGLE_API_KEY`, `SUPABASE_SECRET_KEY`, `MARK_INBOX_TOKEN`, `KIOSK_WA_NUMBER`, `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`/`DROPBOX_REFRESH_TOKEN`, `MINIMAX_API_KEY`, `BOT_BASE_URL` + `BOT_INTERNAL_SECRET` (Preview scope too). Prefer `SUPABASE_SECRET_KEY` (falls back to `SUPABASE_SERVICE_ROLE_KEY`). `vercel env pull` output is dotenv-escaped and prod values carry a trailing newline — parse with `dotenv`, trim before re-adding (`docs/PATTERNS.md` §Environment Variables).
