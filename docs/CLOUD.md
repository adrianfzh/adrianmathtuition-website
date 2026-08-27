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
