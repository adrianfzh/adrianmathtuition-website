# PLAN — Portal v1 + Solo Practice (Math), combined build

> **Status:** PLAN (approved scope, not started). Written 2026-07-04.
> **How to use this doc:** execute phases in order. Each phase has numbered steps and a
> **Verify** block — do not move to the next phase until every Verify item passes.
> If blocked or a decision is missing, add it to §7 Open Questions and STOP — do not improvise
> around a locked decision. Read `CLAUDE.md`, `PORTAL.md`, `PRIVACY.md` before Phase A.

## 0. Objective & success criteria

Ship the student portal (`/app/*`) with Solo's Math practice loop as its Practice page.

- **Alpha** (Adrian only) by **end-July 2026**.
- **Closed beta** (2–3 students) by **mid-August 2026** — before prelims peak.
- **Public launch decision** late September (flip `NEXT_PUBLIC_PORTAL_ENABLED=true`).

Success = Adrian's account works end-to-end; each beta student completes ≥1 full
practice loop (submit → grade → revise → re-grade); **zero cross-student data access**;
a parent-consent record exists for every account; grading calibrated to ±1 mark on the exemplar set.

## 1. Ground truth (verified 2026-07-04 — do NOT rediscover)

- Supabase migration `student_portal_v1_schema` applied 2026-05-05: `portal_accounts`,
  `portal_invite_tokens`, `student_attempts` + RLS. `student_question_requests` pre-exists.
- **`weakness_tags` does NOT exist yet** (SELF-LEARN §7 lists it, but it was not in the applied
  migration). Phase E adds it. Confirm with Supabase `list_tables` first.
- Scaffolding stubs exist (27 `// TODO PORTAL` markers, each file 30–50 lines): `src/app/login/`,
  `reset-password/`, `verify-email/`, `src/app/app/{layout,page,practice,notes,settings}`,
  `src/app/api/portal/{invite,dashboard,practice-history}/route.ts`,
  `src/lib/{supabase-client,supabase-server,portal-auth}.ts`.
- `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` only.
  **`SUPABASE_SECRET_KEY` is missing** — Phase A adds it (local + Vercel). Convention
  (2026-07-06): the env var is `SUPABASE_SECRET_KEY` holding a new-style `sb_secret_...`
  key; all code falls back to legacy `SUPABASE_SERVICE_ROLE_KEY` if that's what exists.
- **Stale spec reference:** RUBRIC-SPEC's `src/lib/learn/prompts.ts` does not exist in this repo.
  The English grader lives with the bot's `/essay` flow. Irrelevant here — English is out of scope.
- Reusable grading assets: `src/lib/marking-pipeline.ts` (Claude marking prompt for photos),
  the bot's `/similar` pipeline (question generation model), `scripts/eval/` (dataset.json,
  prompt.md, run-eval.mjs — the calibration harness), Supabase question bank.
- Locked decisions in `PORTAL.md` stand: `/app/*` URLs, Supabase Auth, invite-only accounts,
  email/password + Google OAuth, no parent access, JWT cookie 30-day, RLS via `auth.uid()`,
  mobile-first PWA, homepage login button gated behind `NEXT_PUBLIC_PORTAL_ENABLED`.

## 2. Scope

**In:** auth pages, admin invite flow, parental consent, app shell, Dashboard, Practice
(Solo Math, **typed input only**), Notes, Settings (incl. data export + account deletion),
PWA manifest, feature flag, calibration eval.

**Out (contractual — editing this list requires editing this doc first):**
English/essay mode; rubrics-as-data; photo input for Practice (v2 — reuses mark-batch later);
AI-generated questions (v2 — QB pull first); parent portal; marking gallery; lessons calendar;
2FA; Apple OAuth (unless §7 Q1 answered yes); anonymous mode (see D3 decision); Airtable→Supabase port.

## 3. Phases

### Phase A — Foundations: auth plumbing (2–4 days)

1. **Env/config:** mint an `sb_secret_...` key in the Supabase dashboard → `.env.local` + Vercel env as `SUPABASE_SECRET_KEY`.
   Configure Supabase Auth: site URL `https://www.adrianmathtuition.com`, redirect URLs for
   local + prod; set SMTP to Resend (decision D2) so verification/reset emails come from the
   real domain; create Google OAuth client (consent screen + redirect URI) and add to Supabase.
2. **Libs:** implement `supabase-client.ts` (browser, anon key), `supabase-server.ts`
   (server client bound to request cookies + a separate service-role client, server-only),
   `portal-auth.ts` (`requireAuth()` → session or redirect `/login`; `currentStudent()` →
   `portal_accounts` row incl. `airtable_student_id`). Use **`@supabase/ssr`** and follow its
   one canonical Next.js App Router cookie pattern — do not hand-roll session handling.
3. **Pages:** `/login` (email/password + "Continue with Google"), `/reset-password`,
   `/verify-email`. Plain forms, mobile-first, no design system needed beyond existing Tailwind.
4. **Gating:** `src/app/app/layout.tsx` calls `requireAuth()`; unauthenticated → `/login`.
   Homepage login button rendered only when `NEXT_PUBLIC_PORTAL_ENABLED==='true'`.

**Verify:** create a throwaway account via Supabase dashboard; log in/out; password reset email
arrives and works; Google OAuth round-trips locally; `/app` redirects when logged out;
`npm run build` passes.

### Phase B — Invite + consent (2–3 days) — PDPA load-bearing

1. `/api/portal/invite` (POST, `verifyAdminAuth`): body `{ studentId }` → fetch student's
   **Parent Email** from Airtable → create `portal_invite_tokens` row (single-use, 7-day expiry)
   → Resend email **to the parent** with the invite link + consent summary. Add a
   "Send portal invite" button on `/admin/students/[id]`.
2. `/signup?token=…&portal=1` branch on the existing signup page: validates token (service role),
   shows the consent text, **parent ticks consent**, then sets the student's email + password
   (creates Supabase Auth user), writes `portal_accounts` row with `airtable_student_id` from the
   token and `consent_record { parent_email, policy_version, ts }`, marks token used.
   Flow per PRIVACY §4: invite goes to the parent; the parent consents; the student uses the account.
3. `/privacy` page: policy from PRIVACY.md §2 (what/why/retention/processors: Anthropic,
   Supabase, Vercel, Resend). Version it (`v1`); the consent record stores the version.

**Verify:** full invite → parent email → consent → account → login round-trip against a test
student record; token single-use enforced (second use rejected); expired token rejected;
`portal_accounts.consent_record` populated; **no attempt-storage path exists yet that skips consent**.

### Phase C — App shell + Dashboard (2–3 days)

1. `/app` layout: top nav Dashboard / Practice / Notes / Account▾ (settings, logout), responsive.
2. `/api/portal/dashboard`: for `currentStudent()` — next lesson + this-week lessons from
   Airtable Lessons (⚠ obey CLAUDE.md gotchas: linked-record match in JS, exclusive upper date
   bound), recent activity from `student_attempts`/`student_question_requests`.
   Cache per student 60 s (in-route Map is fine at 50 students) — Airtable is 5 rps.
3. `/app/page.tsx`: greeting, next-lesson card, week stats, quick actions, recent activity.

**Verify:** dashboard renders for a portal account linked to a real student (use Adrian's alpha
account linked to a test Airtable student); a second account **cannot** fetch the first's data
(hit the API with account B's cookie and assert 403/empty — this two-account leak test repeats
in every later phase).

### Phase D — Notes + Settings (2 days)

1. `/app/notes`: topic list from Supabase KB filtered by the student's Level (from Airtable via
   `currentStudent()`), click-through to KB entry rendered with KaTeX (reuse existing renderers).
2. `/app/settings`: change password (Supabase), link Telegram chat ID (writes `portal_accounts`),
   **Download my data** (all attempts+feedback as JSON), **Delete my account** (purges
   `student_attempts`, `weakness_tags` when it exists, `portal_accounts`, then the Auth user —
   service role, confirm dialog, irreversible). PDPA §2.4 — do not defer these two.
3. Decision D3 applied: portal is **login-only**; no anonymous mode. (SELF-LEARN's
   anonymous-first was for a standalone `/solo`; combined build makes accounts the point, and
   consent-before-storage falls out for free.)

**Verify:** export returns the account's rows only; delete leaves zero rows (check all three
tables + Auth user gone); two-account leak test on notes/settings APIs.

### Phase E — Solo Practice, Math typed (4–6 days) — the quality-critical phase

1. **Migration:** add `weakness_tags (student_id, tag, count, last_seen)` + RLS (select own rows;
   writes via service role only). Also add `feedback` columns/table per SELF-LEARN §7 if
   `student_attempts` doesn't already hold `feedback_jsonb` — check the live schema first.
2. **Question source (decision D4):** pull from the Supabase question bank filtered by the
   student's level/topic — deterministic mark schemes. AI-generated questions are v2.
3. `/api/portal/practice/grade` (POST, auth required): body `{ questionId, workingText, attemptId? }`.
   Calls Claude (model per D5) with the Math rubric prompt; response MUST match the SELF-LEARN §4
   JSON contract **with one amendment — see Risk R7:** annotations reference **numbered lines** of
   the student's working (`"line": 3`), not quoted substrings. Validate with Zod; on parse failure
   retry once, then return a graceful error. Persist attempt + feedback; upsert `weakness_tags`
   from `annotations[].tag`. Never send the student's name to the model (PRIVACY §3.6);
   never log submission text (PRIVACY §3.7).
4. **UI** `/app/practice`: pick topic → question renders (KaTeX) → numbered-line working editor →
   submit → split view (working with highlighted lines ↔ feedback panel: per-line comments,
   marks breakdown, next steps) → **Revise** edits in place → re-grade shows delta vs last attempt.
   History list from `/api/portal/practice-history`.
5. **Memory loop:** inject the student's top-3 `weakness_tags` into the grading prompt
   ("watch for: sign-error, missing-step…").
6. **Calibration gate (launch blocker):** assemble 10–15 exemplar attempts (real student working
   from marked papers Adrian has, with known mark allocations). Point `scripts/eval/` at them;
   iterate the rubric prompt until scores are within **±1 mark on ≥80%** of exemplars.
   Record the result in this doc before beta.

**Verify:** full loop on 3 different questions; malformed-JSON path exercised; weakness_tags
accumulate and appear in the next grading prompt; two-account leak test on attempts/history;
calibration gate met and recorded.

### Phase F — PWA + alpha (1–2 days)

1. Manifest + icons + service worker (offline shell only) for `/app` — copy the existing admin
   PWA pattern.
2. **Stage 1 alpha:** Adrian creates his own account via a real invite, walks every flow on
   mobile, files issues. Fix before Phase G.

### Phase G — Beta + hardening (1–2 calendar weeks, low code)

1. Invite 2–3 students (see §7 Q2 — prefer Sec 3/JC1 so testers don't graduate out in Nov).
2. Hardening checklist: RLS audit (attempt raw Supabase REST reads with account B's JWT against
   every table); grep prod logs for PII; rate-limit the grade endpoint (e.g. 20/day/student —
   it's Opus money); Telegram-alert Adrian on every graded attempt during beta so he can spot-check
   grades (the trust backstop).
3. Retention cron (purge attempts after N months inactivity, §7 Q4) — build if time allows,
   otherwise ticket it as a pre-public-launch blocker, not a beta blocker.
4. Late-September: review beta usage + grade-accuracy spot-checks → flip
   `NEXT_PUBLIC_PORTAL_ENABLED=true` or iterate.

## 4. Key decisions (D#) — defaults chosen, change only via Adrian

| # | Decision | Default | Why |
|---|---|---|---|
| D1 | Apple OAuth | **No** (pending §7 Q1) | $99/yr + review friction; Google+email covers everyone |
| D2 | Auth email sender | **Supabase Auth SMTP → Resend**, from adrianmathtuition.com | Deliverability + one brand; Resend already in stack |
| D3 | Anonymous practice mode | **No — login-only** | Consent-before-storage falls out for free; portal accounts are the point |
| D4 | Practice question source | **Question bank pull**; AI-gen is v2 | Deterministic mark schemes make grading calibratable |
| D5 | Grading model | **claude-opus-4-8 with thinking** to start; measure cost/latency in beta before considering Sonnet | Grade trust is the make-or-break (R2); optimize cost only after trust |
| D6 | Consent actor | **Parent** (invite email goes to Parent Email; parent ticks consent; student uses account) | PDPA minors requirement; PRIVACY §4 |
| D7 | Session pattern | **`@supabase/ssr`** canonical App Router pattern | Hand-rolled Supabase cookies in App Router is a known foot-gun |

## 5. Risks — ranked; ⚠☠ = could sink the project

- **R1 ⚠☠ Cross-student data leak.** One child's work visible to another ends the product and
  damages the tuition business. Mitigations: RLS on every table; anon-key-only from the client;
  service role never leaves the server; the **two-account leak test is mandatory in every phase's
  Verify**; attempts referenced by uuid, never by name (PRIVACY §3.8).
- **R2 ⚠☠ Grading below trust threshold.** A confidently wrong mark shown to a paying parent
  poisons trust in *all* of Adrian's AI. Mitigations: calibration gate E6 is a hard launch
  blocker; beta-only Telegram alert per grade for spot-checking; UI framing "AI feedback —
  Adrian reviews during beta".
- **R3 ⚠☠ Consent gap.** Storing a minor's work without parental consent = PDPA exposure.
  Mitigation: architecture makes it impossible — no storage path exists before Phase B's consent
  flow, and D3 removes anonymous storage entirely.
- **R4 ⚠ Calendar slip past exam season.** Beta testers (and Adrian's spare time) evaporate
  after October. Mitigation: **hard gate — if beta hasn't started by Aug 22, cut Phase E and ship
  portal (dashboard+notes+settings) alone**; Practice follows in September. A–D are mechanical;
  do not let E's fun pull it forward.
- **R5 ⚠ Scope creep back to cut features.** The specs actively invite English mode, rubrics,
  photo input. Mitigation: §2's Out list is contractual.
- **R6 Supabase-Auth-in-App-Router foot-guns** (stale sessions in server components, middleware
  cookie handling). Mitigation: D7 — one library, one pattern, no cleverness.
- **R7 Snippet anchoring fails for math.** SELF-LEARN §4's `quote` string-match contract is
  essay-shaped; models paraphrase math working and the highlight silently breaks. Mitigation
  (adopted in E3): the editor numbers lines; the model returns line numbers. Do not implement
  quote-matching for Math.
- **R8 Airtable latency/limits on dashboard** (5 rps, ~300–800 ms). Mitigation: per-student 60 s
  cache; fetch only needed fields; never fan out per-lesson requests.
- **R9 Opus grading cost.** ~50 students × unlimited retries could sting. Mitigation: per-student
  daily cap (G2); cost line in the existing model-pricing tracking.

## 6. Milestones

| Date | Milestone |
|---|---|
| ~Jul 18 | Phases A–B done (auth + invite + consent) |
| ~Jul 25 | Phases C–D done (shell, dashboard, notes, settings) |
| end-Jul | Phase F alpha — Adrian on his own account |
| ~Aug 8 | Phase E done + calibration gate recorded |
| ~Aug 15 | Beta invites out (hard gate Aug 22 → R4 fallback) |
| late Sep | Public-launch decision |

## 7. Open questions for Adrian (answer before the phase that needs them)

1. **Apple Developer account?** (Phase A; default no → Google+email only.)
2. **Which 2–3 beta students?** Recommend Sec 3 + JC1 mix (they survive past November). (Phase G.)
3. **Auth email From address** — e.g. `portal@adrianmathtuition.com` via Resend? (Phase A.)
4. **Retention window** for attempts — 12 months of inactivity? (Phase G cron.)
5. **Name for the practice feature** — "Practice" in-nav is fine; "Solo" branding decision can wait. (Phase E UI copy.)
6. **Consent/privacy policy text** — plan: Claude drafts from PRIVACY.md, Adrian reviews before Phase B ships. Confirm.
7. **Marked exemplar papers** for the calibration set — Adrian to pick 10–15 questions with real student working + known marks. (Needed by E6; can be photos.)

## 8. Standing execution rules (for whichever model executes)

- Read `CLAUDE.md` gotchas before any Airtable code; run the live schema query before writing
  against any table (mandatory per CLAUDE.md).
- Commit per phase with descriptive messages; build must pass before every push (auto-deploy!).
- All new portal API routes take the session cookie, NOT `ADMIN_PASSWORD` — admin auth patterns
  do not apply under `/api/portal/*` (except `invite`, which is admin-called).
- `NEXT_PUBLIC_PORTAL_ENABLED` stays `false`/unset in Vercel until Stage 3 — deploying mid-build
  is safe because nothing links to `/login`.
- When a Verify item fails, fix it before proceeding — do not stack phases on a broken base.
- Update this doc's checkboxes/results (calibration numbers, decisions taken) as you go; it is
  the single source of truth for this build.
