# PRIVACY.md — Student data & PDPA (Solo self-learning product)

> Practical engineering spec for handling student personal data under Singapore's
> PDPA, built for long-term scale. **Not legal advice** — confirm against the
> PDPC guidelines / a lawyer before public launch. This pairs with finishing the
> Student Portal auth (`PORTAL.md`): accounts + this spec ship together.

## 0. Where we are now (important)
The `/solo` MVP is **anonymous** — no login, nothing stored per student. So today
there is **no personal data at rest** and "delete my account" is moot. PDPA
obligations below kick in the moment we add **accounts + saved attempts** (the
memory loop). Sequence: ship anonymous → add this when we add login.

## 1. Data inventory (what we will collect, once accounts exist)
| Data | Sensitivity | Why | Where |
|---|---|---|---|
| Student name, level | PII | identify the learner | Supabase `portal_accounts` |
| **Parent email + consent record** | PII | **parental consent (minors)** | Supabase `portal_accounts` |
| Student email (login) | PII | auth | Supabase Auth |
| **Essays / working submitted** | **sensitive** (free text — can reveal a lot about a child) | grading | Supabase `student_attempts` |
| Feedback, scores, error tags | performance data | the learning loop | Supabase `student_attempts` |
| Weakness profile | performance data | personalisation | Supabase `weakness_tags` |

**Minors:** PSLE/O-Level students are <18. Their *name, email, written work,
and performance* are all personal data of a minor → **parental/guardian consent
is required to collect and process any of it.**

## 2. The non-negotiables (before public launch)
1. **Parental consent for minors.** Signup captures parent email + an explicit
   consent action; store a consent record (timestamp, version of policy). No
   collection of a minor's work without it.
2. **Privacy policy + consent at signup.** State *what* (essays, attempts,
   results), *why* (grading + personalised feedback), *how long* (retention,
   §5), *who it's shared with* (Anthropic = grading processor; Supabase =
   storage; Vercel = hosting). Purpose limitation: use it only for that.
3. **Row-Level Security on every student-data table.** Supabase RLS keyed on
   `auth.uid()` so a student can only ever read/write their own rows — enforced
   at the database, not the app. This is the single biggest protection at scale.
4. **Access, export & delete (self-service).** Settings → "Download my data"
   (all attempts + feedback as JSON/PDF) and "Delete my account" that actually
   purges every row + Auth user. PDPA gives the right to access & correct; build
   it in, don't retrofit.

## 3. Build-for-scale items
5. **Data minimisation + PII separation.** Identifiers (name, email, parent) in
   `portal_accounts`; *content* (`student_attempts`) referenced by an opaque id
   only. Then content can be analysed/anonymised without touching PII.
6. **Anthropic (the grading processor).** The Claude API does **not train on API
   data by default**. For minors' work, also confirm/enable the strongest data
   setting your org supports (zero-data-retention if eligible) so essays aren't
   retained downstream. Document this in the policy. Never send the student's
   name with the essay — grade the *text* only.
7. **Don't log PII.** Essays/names must never land in Vercel logs, error
   traces, or analytics. Scrub before `console.error`. Encryption at rest
   (Supabase AES-256) + TLS in transit are on by default.
8. **No PII in URLs / client storage.** Reference attempts by uuid, not by name.

## 4. Consent & minors — the flow
```
Signup (parent-initiated):
  parent email → parent verifies → parent ticks consent (policy vN) →
  student profile created with consent_record { parent_email, policy_version, ts }
No consent record ⇒ no saved attempts (anonymous grading only).
```

## 5. Retention & deletion
- **Retention window:** purge `student_attempts` after **N months of inactivity**
  (config), and immediately on account deletion. Less data = less liability.
- **Cron purge:** a scheduled job (Vercel cron / Supabase) enforces it.
- **Deletion:** "Delete my account" → delete attempts, weakness_tags,
  portal_accounts row, and the Supabase Auth user. Confirm + irreversible.

## 6. Breach & governance
- **DPO:** appoint one (can be the founder) — name + contact in the policy.
- **Breach plan (1-pager):** detect → assess → if significant, notify PDPC +
  affected individuals (PDPA mandatory breach notification). Keep an incident log.
- **Processor list:** maintain a short register (Anthropic, Supabase, Vercel,
  Resend) with what each touches.

## 7. Supabase vs Airtable (settled)
- **Student/product data → Supabase** (Postgres + Auth + RLS): accounts,
  attempts, weakness profile. The right tool for per-user data at scale.
- **Your ops data → Airtable** (invoices, schedule, payments): unchanged.
- Joined at the app layer via `airtable_student_id` (the `recXXX`), per `PORTAL.md`.

## 8. Build order (pairs with Portal auth)
1. Finish Supabase Auth (`PORTAL.md`) — accounts + sessions + RLS.
2. Consent capture (parent email + record) at signup.
3. `student_attempts` table + RLS; wire `/solo` to save when logged in.
4. Settings → export + delete account.
5. Retention cron.
6. Privacy policy page + processor register + DPO + breach 1-pager.

Until step 1, `/solo` stays anonymous and stores nothing — which is the safest
possible default while we iterate.
