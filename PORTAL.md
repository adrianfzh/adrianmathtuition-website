# Student Portal v1 — Build Spec

> **Purpose**: Locked spec for building the AdrianMath student-facing portal. Read this first when starting a Claude Code session for portal work. Migrations are already applied; file scaffolding is in place under `src/app/(portal)/` with `TODO` markers.

## Strategic context

The portal is the keystone build. Without it, every existing AdrianMath feature (Telegram /similar, marking pipeline, KB content, question bank) is a stranded one-off. The portal is the substrate where every interaction has a home, a history, and a path to compounding value.

## Locked decisions (do not re-litigate)

| Decision | Locked value | Rationale |
|---|---|---|
| URL structure | `/app/*` for the app; `/login`, `/signup`, `/reset-password`, `/verify-email` at root | Modern SaaS convention (Notion/Linear/Vercel). Subdomain overkill at one-person scale. |
| Tech placement | Inside this Next.js app | Same deploy pipeline, same env vars, smooth marketing→app handoff |
| Auth library | Supabase Auth | Already in stack, free at scale, OAuth + email/password + verification + reset all built-in |
| Auth methods (v1) | Email/password + Google OAuth | Apple OAuth deferred unless Adrian has Developer account ($99/yr). **CONFIRM WITH ADRIAN ON DAY 1.** |
| Email verification | Required before first login | Standard SaaS practice |
| Password reset | Standard email flow via Resend | Already in stack |
| Session | JWT cookie, httpOnly, sameSite=lax, 30-day expiry | Supabase default |
| Account creation v1 | Invite-only via admin "Send portal invite" button | Adrian's ~50 students; control matters. v2 (auto-trigger on Airtable enrollment) deferred. |
| Parent access | **NOT in v1.** Parents stay on Telegram | Privacy + scope; if requested later, build a periodic Telegram digest, not a portal |
| Telegram linkage | Optional field at signup, settings page after | Joins bot's /similar history + marking submissions to portal account |
| 2FA | Skip v1 | Add later if requested |
| Per-user data isolation | Postgres RLS via `auth.uid()` | Standard Supabase pattern |
| Mobile | Mobile-first PWA | Manifest + service worker for offline shell. No native app store. |
| v1 pages | **Dashboard + Practice + Notes/KB** | Marking gallery + Lessons calendar = post-launch additions |

## Database split (do not port to Supabase)

| Data type | Where | Why |
|---|---|---|
| Students, Lessons, Invoices, Slots, Enrollments | **Airtable** (no change) | Adrian's admin UI lives here |
| Marking submissions, Notes content | **Airtable** (no change) | Lesson-recap flows depend on it |
| Question bank, KB entries, sub-groups | **Supabase** (no change) | Already there |
| `portal_accounts` (sessions, prefs) | **Supabase** (NEW — applied 2026-05-05) | Sessions belong in a real DB |
| `student_question_requests` | **Supabase** (already there) | Append-heavy event log |
| `student_attempts` | **Supabase** (NEW — applied 2026-05-05) | Append-heavy event log |

The portal queries BOTH Airtable and Supabase, joining at the application layer via `airtable_student_id` (the `recXXX` ID) stored in every Supabase portal table.

**Realistic full-port effort: 4-6 weeks.** Don't do it now.

## Three-stage prototype-first rollout

| Stage | Audience | Public visibility | Duration |
|---|---|---|---|
| **1. Internal alpha** | Just Adrian | Nothing — no homepage button | 2-3 days |
| **2. Closed beta** | Adrian + 2-3 willing students invited manually | Still nothing public; URL shared via WhatsApp/Telegram | 1-2 weeks |
| **3. Public launch** | All registered students | Login button appears on homepage | Stage 2 is solid |

Gate the homepage "Log in" button visibility behind `NEXT_PUBLIC_PORTAL_ENABLED=true`. Default `false`. Flip to `true` on launch day, no redeploy needed.

> **Beta scope (2026-08-21, Adrian):** the beta is **marking-only** — a student
> sees exactly two functions: hand a paper in (`/app/submit`) and view their
> marked papers (`/app/marking`), which auto-release when the bot's queue finishes
> marking. Practice / Learn / Notes / Reference stay built but hidden and
> route-gated behind `MARKING_ONLY_BETA` in `src/lib/portal-beta.ts` (admin cookie
> sees all). Flip that one flag to reopen the full portal. Details: `docs/MARKING.md`.

## v1 build order

1. ✅ **Schema** — `portal_accounts`, `student_attempts`, `portal_invite_tokens`, RLS policies (DONE 2026-05-05)
2. **Auth pages** — `/login`, `/signup` (extend existing route to handle portal invite flow), `/reset-password`, `/verify-email`
3. **Admin invite flow** — "Send portal invite" button on `/admin/students` page; generates invite token, sends email via Resend
4. **App shell** — `/app` layout with top nav (Dashboard / Practice / Notes / Account ▾), responsive mobile-first
5. **Dashboard page** — `/app` (greeting + next lesson card + week stats + quick actions + recent activity)
6. **Practice page** — `/app/practice` (Find practice question form + history list + click-through to past attempts)
7. **Notes page** — `/app/notes` (topic list filtered by student level + click-through to KB entry display)
8. **Settings page** — `/app/settings` (change password, link Telegram chat ID)
9. **PWA manifest + service worker** — for "Add to Home Screen"
10. **Stage 1 alpha test** — Adrian creates own account, walks the flows
11. **Stage 2 beta** — invite 2-3 students, gather feedback
12. **Stage 3 public launch** — flip `NEXT_PUBLIC_PORTAL_ENABLED=true`

## File scaffolding

Stubbed by Cowork session 2026-05-05. Search `// TODO PORTAL` to find unfinished work:

```
src/app/
├── login/page.tsx              ← TODO: email + password form + "Continue with Google"
├── signup/page.tsx             ← KEEP existing student-signup; ADD a /signup?token=xxx&portal=1 branch
├── reset-password/page.tsx     ← TODO
├── verify-email/page.tsx       ← TODO
└── app/
    ├── layout.tsx              ← TODO: top nav + auth check + redirect to /login if no session
    ├── page.tsx                ← TODO: dashboard
    ├── practice/page.tsx       ← TODO
    ├── notes/page.tsx          ← TODO
    └── settings/page.tsx       ← TODO

src/lib/
├── supabase-server.ts          ← TODO: server-side Supabase client with service-role key
├── supabase-client.ts          ← TODO: browser client (anon key) for auth + realtime
└── portal-auth.ts              ← TODO: middleware helpers (requireAuth, currentStudent, etc.)

src/app/api/portal/
├── invite/route.ts             ← TODO: admin "Send portal invite" handler
├── dashboard/route.ts          ← TODO: aggregations for Dashboard (Airtable + Supabase)
└── practice-history/route.ts   ← TODO: list of past /similar requests for current student
```

## Open question — confirm with Adrian on Day 1

**Does Adrian have an Apple Developer account ($99/yr)?**
- Yes → Add Apple OAuth alongside Google in `/login` and `/signup`
- No → Google + email/password only for v1; add Apple later

## Reference materials

- Spec walkthrough with sketches: see Cowork conversation transcript 2026-05-05 (dashboard / practice / notes mockups)
- Cowork memory file mirrored at `~/Library/Application Support/Claude/.../memory/project_student_portal.md`
- Existing routes that interact with portal data:
  - `/api/learn` — chat tutor (reads Airtable Notes by slug)
  - `/api/notes` — admin notes CRUD (RNB Publish writes here)
  - `/api/render-marking` — typeset PNG renderer (will be reused by portal)
- Telegram bot's `/similar` flow is the model for the Practice page (same Opus pipeline)

## Things NOT to build in v1

- ~~Parent portal~~ (Telegram digest only, post-launch)
- ~~Marking gallery~~ (deferred)
- ~~Lessons calendar~~ (deferred)
- ~~2FA~~ (deferred)
- ~~Apple OAuth~~ unless Adrian has Developer account
- ~~Migrating Airtable to Supabase~~ (different project entirely)

## Schema reference (already applied)

See migration `student_portal_v1_schema` for full DDL. Tables created:

- `portal_accounts` — one row per student, links Supabase `auth.uid()` to Airtable `recXXX`
- `portal_invite_tokens` — single-use tokens emailed by admin invite flow
- `student_attempts` — student answer attempts on /similar variants

RLS policies: students can only `SELECT` their own rows from each table. Service-role bypass for the admin invite flow + cron jobs.

## Practice pool — which questions a topic serves (2026-08-22)

The portal practice draw (`/api/portal/practice/{next,overview,topics}`, plus
`practice_candidates` for "From Adrian" picks and `practice_exemplars` for Learn)
reads the Supabase RPC **`practice_pool(p_level, p_topic)`** — the single
definition of "which bank questions belong to this `/revise` tree topic":

- **filed** — the question sits in a sub-group of that (level, topic) via
  `question_subgroups → subgroups`. Unchanged behaviour.
- **tagged** — the question's `questions.topics[]` tag names the tree topic,
  its bank level belongs to the tree (`practice_qlevels`: JC = JC1+JC2,
  AM = AM+S3_AM, EM = EM+S3_EM, S1, S2), and it is NOT already filed under
  *that* topic. The exclusion is **per topic**, not per tree (second migration
  `practice_pool_tag_per_topic`): a question filed under Indices and tagged
  Indices+Numbers serves Numbers through its tag. ~25% of JC questions carry two
  tags, so the first cut ("not filed anywhere in the tree") silently dropped
  every such question from its second topic the moment the backfill filed it
  under the first — ~750 already-filed questions gained their second topic back.

Rule of thumb: **filed under the topic → the filing decides; tagged but not
filed under that topic → the tag serves.** A two-tag question belongs to both.

### Sub-group AUDIENCE (2026-09-02)

Three live columns decide who may see a sub-group — `subgroups.visibility`
(`'all' | 'ip' | 'hidden'`, default `'all'`), `subgroups.ip_extra_level` (a
tree level the row is ALSO lent to for IP students, e.g. S2-461 "Special
factorisation forms" → `'S1'`) and `portal_accounts.is_ip` (Airtable Students
`Subject Level = 'IP'`, set at activation via `lib/portal-ip.ts` and refreshed
by the monthly `deactivate-inactive` sweep). **The rule** (`lib/subgroup-visibility.ts`
`subgroupVisibleTo`, mirrored in SQL as `public.subgroup_visible`): a student
sees a sub-group iff `visibility='all'` and the level matches; or `'ip'`, the
account is IP and the level matches; or `ip_extra_level` = the student's level
and the account is IP. `'hidden'` → admin only (badged "hidden" / "IP only").

Consequences, all data-driven — no ids are special-cased in code:
- `practice_pool` (and so `practice_topics` / `practice_overview` /
  `practice_next` / `practice_subgroups` / `kiosk_pool`, all with
  `p_is_ip` + `p_admin` params, `migrations/subgroup_audience.sql`) serves only
  VISIBLE filings; a question filed ONLY under sub-groups the audience cannot
  see is excluded from the topic-tag path too; **a topic exists for an
  audience only while it has ≥ 1 visible sub-group** — so "Modulus Functions"
  (809–814, `'ip'`) is absent from a non-IP A-Math picker, mix, timed set,
  worksheet and mock, and present for an IP account. **Legacy × IP:** all 60
  Modulus questions are `legacy_syllabus = true` (the 28 Aug "cut content"
  leg), so a legacy question serves ONLY through a filing under a visible
  `'ip'` sub-group — legacy questions filed under `'all'` sub-groups or unfiled
  stay blocked for everyone, as before.
- `/app/practice?qid=` and the mock-paper slot draw resolve questions by id,
  so they gate with `questionServableTo` (the filings vs the account's trees):
  a blocked deep link says "not part of your syllabus".
- `/notes` applies the same rule per viewer (`lib/notes-viewer.ts`); the public
  `/revise` decks have no account and show only `'all'`. The printed-sheet
  surfaces that identify a student without a session — the kiosk (scan token →
  Airtable id: `/api/kiosk/topics` + `/api/kiosk/worksheet`) and the bot
  (`studentId` / `isIp` in the `/api/bot/worksheet` body) — resolve the flag
  through `lib/worksheet-audience.ts` (active portal account first, Airtable
  `Subject Level` second, ordinary on any doubt, never admin — docs/KIOSK.md
  §7b); a caller with no student at all draws as an ordinary student.
- `practice_candidates` (From-Adrian picks) and `practice_exemplars`
  (generation context) read the pool as admin — the whole bank, as before.
- Adrian sets the verdicts in the cards editor (`/admin/edit-cards` → pick a
  sub-group → **Audience**), which PATCHes `/api/admin/cards/subgroups/[id]`.

Why: until 2026-08-22 the draw was filing-only, and ~7,300 eligible questions
(all of JC1, most of JC2, half of S3_AM, a third of S1/S2) had never been filed
— students saw JC Vectors as 165 questions when the bank holds ~720. The kiosk
worksheet pool (`kiosk_pool`) had always done tag ∪ sub-group; the portal was
the odd one out.

**Per-question-type draws stay filing-only** (`practice_next` with `p_subgroup`,
`practice_subgroups`): a tag knows the topic, not the type. So on the topic
sheet the type counts can sum to less than the "Start (mix)" total — that gap
is exactly the unfiled backlog, which the plan-billed filing backfill works
down nightly (`cc_backfill` rows in `question_subgroups`; bot repo
`scripts/file-subgroups.js` + `.claude/skills/file-subgroups/SKILL.md`, driven
by the `file-subgroups-nightly` Claude Code scheduled task at 4:15am, after the
3:30 topup — it only ever ADDS links, holds confidence < 0.6, and a wrong link
is removed by hand). First batch 2026-08-22: JC Vectors, 28 filed / 2 held.

Guard: `/api/health-check` `practice-picker` fails if the JC pool drops below
4,000 topic-rows (a redefined RPC that forgot the pool would do that).
