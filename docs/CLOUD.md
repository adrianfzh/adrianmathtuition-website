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
the marking and sheet slots (plan-billed Claude Code on the Mac), the nightly / weekly
reviews (launchd), the worksheet and extraction workers, Word-based sheet rendering,
Xcode / TestFlight / the AdrianMarker re-sign, the iPad, screenshots as a student
(puppeteer on the Mac), Telegram / Resend sends (no `TELEGRAM_*` / `RESEND_*` in the
cloud — deliberately), anything needing `ADMIN_PASSWORD` or the Supabase secret key
(privileged reads/writes outside the six families — ask Adrian or leave a note).
Step 3 (moving marking/sheets off the Mac) is future work, not set up.

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
| `AGENT_TOKEN_SWITCHES` | `/api/admin/marking-settings`, `/api/admin/slot-accounts` | Mac plan only · Science tab · slot accounts |
| `AGENT_TOKEN_PAPERS` | `/api/admin/papers`, `/api/admin/desk/rebuild` | tag · rename · looked-at · rebuild the copy |
| `AGENT_TOKEN_ASSIGN` | `/api/admin/assignments` | Send work |

Mint each as 32+ random characters (`openssl rand -hex 24`), set it in Vercel (Production
+ Preview), and give the cloud environment only the ones it needs. A token you have not
set opens nothing (the check fails closed under 24 chars). Rotate one family without
touching the others. The admin password never leaves this Mac and the bot.
Reading what agents did: `select * from agent_actions order by created_at desc`.
