# The nightly builder

Adrian, 5 Oct 2026: **"yes to all 3"** — to this description: *the system takes ideas you
have approved from the build queue, builds them on a separate copy of the code, runs every
test, puts the result on the preview, and messages you in plain words "Built X. Here's what
it looks like. Ship?"*

It is the building doctrine's recipe applied to building itself: the agent does everything
reversible (a branch, tests, a preview), Adrian approves the outward step (ship), and going
live on the site stays his separate word ("promote").

## 1. What it builds — only what Adrian approved

The input is ONE table at the top of [`IDEAS.md`](../IDEAS.md), **🌙 Nightly builder —
approved to build**:

| slug | repo | what to build | approved | allow | status |
|---|---|---|---|---|---|
| example-slug | website | (an example — the real rows live in IDEAS.md) One plain line of what to build, with a spec link if there is one. | 2026-10-06 Adrian | — | approved |

- **slug** — lowercase words joined by hyphens, at least one hyphen, at most 48 characters (`notes-search-hint`).
  It becomes the branch and the word Adrian types to ship.
- **repo** — `website` or `bot`.
- **what to build** — one line in plain words; link a spec (`SPEC-…md §n`) or a review's
  proposal paragraph (`bot docs/PROPOSALS.md, <slug>`) when there is one. The build
  session reads the link.
- **approved** — the date and `Adrian`. A row with no date here is never built.
- **allow** — `—`, or a comma list naming the guarded areas this item may touch:
  `billing`, `parents`, `switches`, `deletion`, `marking` (§5).
- **status** — the builder takes a row only while it says exactly `approved`. It writes
  the rest: `building <date>` → `built <date>` or `blocked <date>: <why>`; the ship flow
  writes `shipped <date>` / `dropped <date>`.

How a row gets there: Adrian says "approve <idea> for the builder" (or "build X tonight")
to any session, and the session adds the row with his date — a session never adds a row
on its own judgement. A review's proposal that was written up but **left for a session**
(the bot-review's "no gate here can prove it" paragraphs) is approved the same way, with
the paragraph linked.

**Proposals the reviews already built** need no row: they already sit on a branch. The
reviews' WEBSITE proposals (`proposal/<date>-<slug>` in the website repo — e.g.
`chat-escaped-dollar`, 4 Oct 2026) used to have no Ship button; the ship flow below now
takes them too.

## 2. Where it runs — the Fly worker, at night, on the plan

`adrianmath-worker` already has both repos (`/data/website` with every dependency,
`/data/bot`), the Claude plan logins (the login pool + the ⏻ switches), `gh` and git
push rights to both repos, and a Chromium that runs (the website's `@sparticuz/chromium`,
checked 5 Oct 2026). The Mac has the same, but sleeps and is shared with Adrian's sessions.

- **01:30 SGT** — `nightly-builder` (bot `worker/fly/builder.sh`, sourced by `jobs.sh`
  like `learn.sh`; the bot wakes the machine at 01:25). Night = the plan pool is idle and
  marking is quiet.
- **07:30 SGT** — `builder-morning` sends the message the night wrote (wake at 07:25).
- The builder works in **its own clones** (`~/.adrianmath_builder/{website,bot}`,
  `node_modules` linked to the worker's checkouts) — never `/data/website`, which the sheet
  slots and twins use. A branch that changes `package.json` gets its own `npm ci`.
- Switch: **🌙 Nightly builder** on `/admin/switches` (`nightly-builder`). OFF = no build
  starts; a run in flight finishes.

## 3. One night, step by step (`bot scripts/nightly-builder.js`)

1. Read the switch; read `IDEAS.md` from `origin/dev`; take the oldest-approved
   `approved` rows — **at most 1 a night** (`BUILDER_MAX_ITEMS`, ceiling 2).
2. **Guard check on the words** (§5). A row that names a guarded area without `allow` is
   marked `blocked: needs allow …` and costs nothing.
3. Mark the row `building <date>` (a docs-only push to `dev` — Vercel builds nothing).
4. Branch: website `builder/<slug>` off `dev`; bot `proposal/<date>-<slug>` off `main`
   (the reviews' own shape, so the existing ship flow takes it unchanged).
5. **The build session** — one headless Claude Code run on a pooled plan login, Opus 5.5
   at high effort (FANOUT §9: a mechanical build against a written spec; the tests are the
   proof), capped at 90 min (`BUILDER_SESSION_MIN`). Its brief: read CLAUDE.md and the
   linked spec; the smallest change that does the line; tests beside it (money and date
   logic pure in `lib/` with a test); never touch the guarded areas, the builder itself,
   deploy config or switches; commit, never push; write a result file
   `{done, summary, look_at[], changed_lines[], blocked_reason}`.
6. **The gate, run by the script itself** in the clone — website
   `npx tsc --noEmit && npm test`; bot `npm test`, plus the pen bench
   (`node scripts/golden-pen.cjs`) when the diff touches the pen. 60 min cap.
7. **The guard check on the diff** (§5) — the files changed and the lines added.
8. Green and clean → push the branch. Anything else → nothing is pushed, the row says
   `blocked <date>: <why>`. **A half-built item is never pushed, never shipped.**
9. Website: wait for the branch's own Vercel preview (GitHub deployment status, ≤ 15 min),
   then screenshot the page(s) the session named, at phone width, signed in as admin.
   Bot: add the row to `docs/PROPOSALS.md` (gate as above) so Ship works the reviews' way.
10. Write the morning message; stamp `job_runs` `nightly-builder`; set the row `built`.

Caps: 1 item a night (2 at most), 90 min a session, 60 min a gate, no new item after
04:30 (the reviews start at 05:00), no build while every login is full. A night with
nothing approved is one file read and a `job_runs` stamp — $0.

## 4. The morning message, and shipping

Plain words, one idea per line, in the Ops topic, with the ✅ Ship / ✏️ Change / 🗑 Drop
buttons the reviews' proposals already use:

```
🌙 Built overnight: the notes search box now says what it can find.
Tests pass: 2,914 website tests, and the types check.
Preview: https://adrianmathtuition-website-git-builder-notes-search-hint-….vercel.app/notes
(Admin pages ask for your password once on this link.)
Say "ship notes-search-hint" or tap Ship to put it on the preview site (dev).
Going live on the real site is still your word: "promote".
Or tell me what to change.
```

plus the screenshot. A failure reads:

```
🌙 Tried overnight: the notes search box hint. Not built.
What stopped it: the website tests failed (3 of 2,914).
Nothing was shipped. The row in the build list says blocked.
```

**Shipping is the existing proposal flow, not a second one** (bot `lib/proposals.js`,
`scripts/proposal-ship.js`, `docs/PROPOSALS.md`): the bot records the request, the Fly
worker acts. Since 5 Oct 2026 it also:

- accepts the short phrases **`ship <slug>`**, **`drop <slug>`**, **`change <slug>: <note>`**
  (slug with a hyphen; "ship proposal <slug>" still works);
- when the bot repo has no branch for the slug, looks in the WEBSITE repo for
  `builder/<slug>` or `proposal/<date>-<slug>`: **Ship** merges it into `dev` (never
  `main`), runs the website gate, pushes `dev` (Vercel builds the preview) and answers with
  the preview link; **Change** has a session edit the branch with his note and re-runs the
  gate; **Drop** deletes the branch. The `IDEAS.md` row follows (`shipped` / `dropped`).
- **Promote to production stays a separate word to a session**, as before.

## 5. Guardrails

Never touched without an explicit `allow` on the row:

| allow word | what it covers |
|---|---|
| `billing` | invoices, payments, passes, credits, billing maths (website `api/*invoice*`, `api/payments`, `lib/billing-math`, `lib/invoice-*`, `lib/year-end-billing`, `lib/portal-passes`…; bot invoice/billing code) |
| `parents` | anything that sends to a parent: digests, invoice/receipt emails, Resend (website `api/progress-digest`, `api/send-*`, `lib/report-facts`…; bot parent messages) |
| `switches` | a student-facing switch (`*_OPEN_TO_STUDENTS`, `lib/portal-beta.ts`, the marking switches) |
| `deletion` | deleting data: delete-account, retention, any SQL `DROP` / `DELETE FROM` / `TRUNCATE` |
| `marking` | the marking rules (`ai/paper-marker.js`, `ai/marker-reconcile.js`) — FANOUT §9 keeps rule wording on Fable with the golden bench; the builder runs Opus, so it takes these only when told |

Never touched at all: the builder and ship code themselves, `worker/fly/**`, `fly*.toml`,
`.github/`, `.githooks/`, `vercel.json`, any `.env*`. The check runs twice — on the row's
words before any plan usage, and on the finished diff (paths and added lines) before
anything is pushed. The pure rules: bot `lib/nightly-builder.js` (tested).

## 6. Log + alarm

`job_runs` `nightly-builder` every night (also when nothing was approved), `JOB_RHYTHMS`
36 h — silence means the builder is dead. The morning send stamps `builder-morning`.

## 7. Files

- bot `lib/nightly-builder.js` (pure: the table, the guards, the brief, the messages) +
  `test/nightly-builder.test.js`
- bot `scripts/nightly-builder.js` (the night) — `--peek`, `--dry-run`, `--item`, `--morning`
- bot `worker/fly/builder.sh` (sourced by `jobs.sh`), wake times in `lib/fly-worker.js`
- bot `lib/proposals-web.js` + `scripts/proposal-ship.js` (website branches in the ship flow)
- website `scripts/nightly-builder/screenshot.mjs` (the phone-width picture)
- website `IDEAS.md` (the table), `src/lib/worker-jobs.ts` (the switch),
  `src/lib/job-health.ts` (the rhythm)

Run by hand (a session, the Mac): `node scripts/nightly-builder.js --dry-run --item
'<slug>|website|<what>'` in the bot repo builds and gates one item, pushes its branch for
the preview, prints the message, and ships nothing, sends nothing, writes no status.
