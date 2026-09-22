# Cloud sessions (claude.ai/code) — per-account bootstrap & posture

> **Why this file exists**: claude.ai cloud environments and skill libraries are
> **per-account**. Everything committed in this repo — CLAUDE.md, `docs/*`,
> `.claude/skills/*`, and the `env` block in `.claude/settings.json` — travels to
> every session on every account and machine automatically, because they all clone
> the same repo. This file holds the only part that *can't* be committed: the
> per-account secrets bootstrap. It is a **one-time ~5-minute step per account**,
> not recurring config. First set up + verified 7/7 on the main account 2026-08-27.

## What the repo already carries (zero per-account config)

- All skills (`.claude/skills/*`), the doctrine + area maps (`CLAUDE.md`), runbooks (`docs/*`)
- Public Supabase config via `.claude/settings.json` → `env`: `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`. The anon key is public-by-design (it ships in client
  bundles); all anon reads are RLS-gated. Committing it adds no exposure — it is
  already committed verbatim in the AdrianMath repo's CLAUDE.md.

## STATUS — the cloud is fully set up (17 Sep 2026, 22:40 SGT)

**Any session on any Claude account may use the cloud for everything below without
asking Adrian to set anything up.** Done and verified on the `ablnon@gmail.com` account
(the second account, `adrianmathtuition@gmail.com`, repeats the same per-account steps
— the Vercel token and the six agent tokens are shared values, so only the pasting is
repeated; Adrian holds the values, no session ever sees one):

- Both repos connected with push rights; `github.com` / `api.github.com` allowed.
  → promote (`git push origin origin/dev:main`) and bot deploys (push to the bot's `main`)
  work from a cloud session.
- `VERCEL_TOKEN` (project-scoped to the website, 90 days from 17 Sep 2026) → `vercel ls`
  and re-pointing `adrianmath-dev.vercel.app` work from a cloud session.
- All six `AGENT_TOKEN_*` families set in Vercel (Production + Preview) and in the cloud
  environment; each probed from a cloud session on 17 Sep 2026 (papers 400 · sheets 200 ·
  assign 400 · switches 200 · reinstate 400 · release 200 via mark-triage), fourteen
  `agent_actions` rows confirm the logging.

**What a cloud session STILL cannot do** (Mac-only; do not try, say so instead):
Xcode / TestFlight / the AdrianMarker re-sign, the iPad, screenshots as a student
(puppeteer on the Mac), Telegram / Resend sends from a cloud SESSION (no `TELEGRAM_*` /
`RESEND_*` in the cloud environment — deliberately; the bot and the worker send their own),
anything needing `ADMIN_PASSWORD` or the Supabase secret key from a cloud session
(privileged reads/writes outside the six families — ask Adrian or leave a note).
**Polling (19 Sep 2026):** slots on one machine share ONE read of the account switches (45 s) and ONE work poll (marking 20 s, sheets 100 s) through `~/.adrianmath_gate` (`shared_fetch` in both `run.sh` files) — every slot used to make both calls on every tick, ~30 website calls a minute from the Mac alone (~1.3 M Vercel function calls a month). Marking's claim / lease calls go straight to the bot's `/api/slot` (admin token, those phases only) when `MARKER_BOT_BASE` is set — set on the Fly worker and in the Mac slots' `env` files; the website stays the fallback. **One call answers both questions (19 Sep, evening):** the bot's work poll carries `off` (the switched-off accounts, bot `lib/slot-accounts.js`), and the sheet queue has `GET /api/admin/sheet-jobs?peek=1` → `{waiting, off}` (`countWaiting`, pickNextJob's rule) instead of the ≈255 KB list; each runner falls back to the old two calls when the other side is older (the slots talk to PRODUCTION, so `?peek=1` starts saving only once promoted). Admin pages (desk, mark-paper, mark, batch, ops) ask nothing while their tab is hidden. Still through Vercel: the sheet poll (one small call per machine per 100 s), a marking session's heartbeats, and hand-backs.
**Since 18 Sep 2026 the Fly worker (`adrianmath-worker`, bot `worker/fly/`) runs everything
the Mac's launchd used to**: the marking slots, the sheet slots (PDFs through Word in the
cloud — `scripts/sheet-worker/ms_graph_pdf.py`, LibreOffice failed the comparison), the
day-review 05:00/17:00, find-review 05:30, bot-review Mon 08:00, subject-retag 04:10 and the
worksheet worker (`worker/fly/jobs.sh`; the bot wakes the machine before each). The Mac's
launchd jobs for those are UNLOADED (18 Sep 2026); `launchctl load` the plists to hand them
back. The old extraction-fleet jobs (`pdfpipelinecc.*`, dead since 20 Aug) are unloaded too.
Step 3 (moving marking/sheets off the Mac) is BUILT (§Step 3 below) and goes live on Adrian's first deploy.

## Per-account one-time bootstrap (~5 min)

**Where the UI is**: claude.ai/code **composer row** — the cloud icon above the
message box → hover the environment → gear. It is NOT under Settings. Changes
apply to **new sessions only**.

1. **Environment variables** (.env format):
   - `CRON_SECRET` — copy from the Mac's `.env.local` (dotenv-parse it, and
     **trim** — trailing whitespace or a quote = 401, because the health-check
     route does exact-string bearer comparison). Sanity check without revealing
     it: length **29**, `printf '%s' "$CRON_SECRET" | shasum -a 256 | cut -c1-12`
     → `dd90741ba5d5`.
   - `AIRTABLE_TOKEN_RO` — mint a **fresh read-only token per account** at
     airtable.com/create/tokens: scopes `data.records:read` +
     `schema.bases:read`, restricted to the one tuition base. Per-account tokens
     mean per-account revocation.
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY` come from the repo's settings file;
     duplicating them here is harmless.
2. **Network access = Custom**. Add to the default allowlist:
   `api.airtable.com`, `*.supabase.co`, `www.adrianmathtuition.com`.
   **Deliberately absent**: `api.telegram.org`, `api.resend.com` — send channels
   stay behind Adrian's sign-off; the proxy-level block (CONNECT 403) is the
   exfiltration chokepoint.

## NEVER in a cloud environment (crown jewels)

`ADMIN_PASSWORD`, `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY` (cloud sessions bill the plan), `TELEGRAM_*`, `RESEND_*`,
`BLOB_READ_WRITE_TOKEN`, `DROPBOX_*`. Never add one without Adrian's explicit
say-so.

**Posture: the cloud agent holds triggers, not power.** Privileged writes go
through narrow authed website routes with dedicated revocable tokens
(building-doctrine step 3 — checkpoints).

## Verify a freshly configured account

Paste into a **new** cloud session on that account:

```
Verify this cloud environment — secret-free, never print an env value:
1. For CRON_SECRET SUPABASE_URL SUPABASE_ANON_KEY AIRTABLE_TOKEN_RO: report SET/UNSET only.
2. curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $CRON_SECRET" https://www.adrianmathtuition.com/api/health-check  → expect 200.
3. GET https://api.airtable.com/v0/meta/bases with the Airtable token → expect exactly 1 base.
4. List 1 record from the Slots table → expect 200.
5. Write MUST fail: DELETE .../Slots/recAAAAAAAAAAAAAA → expect 403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND (a write-capable token would 404 instead — that means the token is over-scoped, replace it).
6. GET $SUPABASE_URL/rest/v1/content_snippets?select=id&limit=1 with apikey $SUPABASE_ANON_KEY → expect 200.
7. curl https://api.telegram.org and https://api.resend.com → BOTH must fail (proxy CONNECT 403).
Report PASS/FAIL per probe.
```

## Gotchas (learned 2026-08-27)

- `Agent {isolation:"remote"}` launched from a desktop session runs on the
  **local Mac**, not the cloud sandbox — verify cloud config only from a real
  claude.ai/code session.
- A 401 on probe 2 with everything else passing = mis-pasted `CRON_SECRET`
  (quotes, trailing space, truncation). Use the length/sha check above; re-paste;
  open a **new** session.
- Scripting against prod: always `https://www.adrianmathtuition.com`, never the
  apex (307 redirect drops the Authorization header — see CLAUDE.md Gotchas).


## Step 1 — promote, bot deploy and previews from the cloud (17 Sep 2026)

Both are git pushes; nothing on the Mac is involved once the cloud session can push.

1. **Repos with push rights.** In the claude.ai/code environment, add BOTH repos
   (`adrianfzh/adrianmathtuition-website`, `adrianfzh/adrianmath-telegram-bot`) through
   the GitHub app with write access. Add `github.com` and `api.github.com` to the network
   allowlist.
   - Promote = `git push origin origin/dev:main` in the website repo (the pre-push hook runs
     the suite — Node is in the cloud image). Vercel builds production from `main`.
   - Bot deploy = a push to the bot's `main`; `.github/workflows/fly-deploy.yml` runs the
     checks and deploys. `gh run list -R adrianfzh/adrianmath-telegram-bot` shows it.
2. **A project-scoped Vercel token** (Vercel → Account → Tokens, scope = this project,
   expiry 90 days) as `VERCEL_TOKEN`, plus `api.vercel.com` on the allowlist. Unlocks
   `vercel ls` and `vercel alias set <deploy> adrianmath-dev.vercel.app` after a `dev` push.
   Rotate it from the same page; nothing else depends on it.

Still Mac-only after this: the marking/sheet slots, the nightly + weekly reviews, the
workers, Xcode/TestFlight, the iPad, and screenshots as a student.

## Step 2 — acting on student data without the admin password (17 Sep 2026)

Six narrow tokens, one per action family, accepted ONLY by that family's routes beside
the admin cookie/password (`lib/agent-auth.ts`), every use logged to Supabase
`agent_actions` (scope · route · action · ip · time):

| Env var (Vercel, all scopes) | Routes | What it can do |
|---|---|---|
| `AGENT_TOKEN_RELEASE` | `/api/admin/mark-triage`, `/api/admin/release-with-sheet` | agree · override · release · re-mark · subject · the desk's one-tap release with the sheet (added 17 Sep 2026 evening after the first cloud probe found it missing) |
| `AGENT_TOKEN_SHEETS` | `/api/admin/sheet-jobs` | queue / revise / cancel a Practice Again sheet |
| `AGENT_TOKEN_REINSTATE` | `/api/admin/student-reinstate` | undo a Discontinue |
| `AGENT_TOKEN_SWITCHES` | `/api/admin/marking-settings`, `/api/admin/slot-accounts` | Mac plan only · Science tab · slot accounts (+ the pickers' `{usage}` posts, 22 Sep 2026) |
| `AGENT_TOKEN_PAPERS` | `/api/admin/papers`, `/api/admin/desk/rebuild` | tag · rename · looked-at · rebuild the copy |
| `AGENT_TOKEN_ASSIGN` | `/api/admin/assignments` | Send work |

Mint each as 32+ random characters (`openssl rand -hex 24`), set it in Vercel (Production
+ Preview), and give the cloud environment only the ones it needs. A token you have not
set opens nothing (the check fails closed under 24 chars). Rotate one family without
touching the others. The admin password never leaves this Mac and the bot.
Reading what agents did: `select * from agent_actions order by created_at desc`.

## Step 3 — the plan loops off the Mac: the Fly worker (18 Sep 2026, built, awaiting first deploy)

One Linux machine, `adrianmath-worker` (bot repo `worker/fly/`, README there), runs the
Mac's slot loops: marking (`worker/plan-marking/run.sh`, 3 slots × up to 3 Claude
accounts, dirs named as on the Mac) and — once `SHEET_SLOTS_ON='1'` after the LibreOffice
PDF comparison — the sheet worker (`scripts/sheet-worker/run.sh` in a checkout of this
repo at `/data/website`). Accounts are secrets `CLAUDE_TOKEN_n` + `CLAUDE_ACCOUNT_n`; the
per-account switch and limit files work unchanged.

**Night one (18 Sep 2026) and what it changed.** Nine slots started sessions on one tick
when all three accounts were switched on, and Gemini was rate-limited for fourteen minutes
so every claim was refused while the peek still said "4 claimable" — nine Claude sessions
every 30 s for nothing, on all three accounts. Fixes, all in the bot repo: the peek runs
the same vision preflight the claim runs (answers 0 + `blocked` during an outage); a slot
offered nothing parks 5 min (`NONE_BACKOFF_SEC`) and reports `external-idle` (one Telegram
line per account per hour after five wasted sessions); heartbeat every 2 min and stop at
once on a lost claim; the worker starts a session only under `MAX_SESSIONS` (6) AND with
`MIN_FREE_MB` (500) free; machine 2x / 4 GB; **it stops itself after 10 idle minutes and
the bot wakes it on every enqueue** (`lib/fly-worker.js`, secret `FLY_WORKER_TOKEN` on both
apps — `worker/fly/set-secrets.sh` mints it), so the bill is running minutes, not the month.
Account two (`ablnon@gmail.com`) is the account Adrian chats on — keep it switched OFF for the
workers unless he wants his own sessions to share the limit. Overlap plan: Fly slots on, Mac slots
still on (the claim guard makes a double claim safe), Mac slots off after a few papers
land. ~US$12/month. Deploy: **a push to the bot's `main` touching `worker/**` or `fly.worker.toml`** (GitHub Action
`fly-worker-deploy.yml`, since 18 Sep 2026 — so a cloud session deploys it with the Mac off);
`fly deploy -c fly.worker.toml -a adrianmath-worker --remote-only` is the manual fallback.
