# Portal data retention — inventory + recommended policy

> Written 2026-08-28 (Phase G hardening audit), now that the portal takes real
> money from outside customers. **Nothing here deletes anything yet** — this is
> the inventory and the recommendation; Adrian decides, then the cron sketch at
> the bottom becomes one small addition to the existing `/api/cron/retention`.

## What already runs (do not duplicate)

| Job | Where | Covers |
|---|---|---|
| Monthly retention cron (2nd, 03:00 SGT) | `/api/cron/retention` + `lib/retention.ts` | Per-student purge after **12 months of inactivity** (latest attempt OR portal login): `student_attempts` rows + their `answer_image_url` / `marking_pdf_url` blobs, `weakness_tags`. Blobs delete before rows; `?dry=1` previews; Telegram only when something purged. |
| Daily pg_cron `pdpa_retention_purge` (20:15 SGT, in-DB) | `migrations/pdpa_retention_purge.sql` | `conversation_history` 12m, `student_question_requests` 12m, `student_attempts` 24m hard cap, `portal_invite_tokens` 3m after consumed/expired, `weakness_tags` 12m fade. |
| PDPA erasure (user-initiated) | `/api/portal/delete-account` | Everything portal-owned for that account, at once (widened 2026-08-28 — see the route header for the list and for what is deliberately retained). |

## What accumulates with NO expiry today

| # | Class | Where it lives | Growth driver | Contains | Natural expiry? |
|---|---|---|---|---|---|
| 1 | **Hand-in photos** | Blob `mark-paper/portal/<identity>/<uuid>.jpg` (≤25MB/photo, ≤20/paper) | Every `/app/submit` + bot `/handin` — 1–3/day/student | Student handwriting, name on script | None. The run row references them (`result_json.source.photos`), but nothing ever deletes them. **Biggest byte-growth item.** |
| 2 | **Marking runs** | Supabase `paper_marking_runs` (+ `annotated_pdf_url` / `pdf_url` blobs under the run) | Same | Marks, per-question comments, the marked PDF | None. Also Adrian's own business/teaching record and the paid-marking dispute evidence — retention must be a policy choice, not a side effect. |
| 3 | **Clippings** | Blob `portal-notes/<identity>/<uuid>.png` + `portal_notes` rows | Student-driven, braked at 500 rows/student | Crops of their marked papers | The 500-row brake bounds count, not age. Rows/files of deleted accounts do go (erasure). |
| 4 | **Generated papers** | `portal_generated_papers` rows (no PDF stored — rendered on demand) | ≤ `WEEKLY_PRINT_CAP` (2)/student/week | Question-id lists, titles | None, but rows are tiny. Needed while `status='open'` (submit pre-registration reads them). |
| 5 | **Finder ledger** | `portal_generation_log` | ≤ `DAILY_FIND_CAP` (25)/student/day | kind/hit/generated flags only | None. Powers the daily caps (needs ~1 day) and `/admin` analytics (wants months). |
| 6 | **Push subscriptions** | `portal_push_subscriptions` | 1 row/device; re-subscribes upsert in place | Endpoint URLs + keys | Dead endpoints linger only if the send path never prunes on 404/410 — `lib/portal-push.ts` **already deletes gone endpoints on send failure**, so this is self-cleaning in practice. |
| 7 | **Notebook entries** | `notebook_entries` | One per losing question on a released paper | Question prompts, attempts, confidence | Archived ("conquered") entries keep forever; that IS the product (revision history). |
| 8 | **Requests** | `portal_requests` | ≤2/student/day | Free-text asks + admin notes | None; tiny. |
| 9 | **Passes** | `portal_passes` | One row per purchase/trial/referral grant | Entitlement state (Stripe holds the payment record of record) | Expired rows stay; `getCurrentPass` scans all of an account's rows (fine at this scale). |
| 10 | **Assignment PDFs** | Blob `assignments/<uuid>.pdf` (copied from Dropbox at assign time) + `portal_assignments` rows | Adrian-driven | Worksheets (content, not PII) | None. Revoked/marked assignments keep their Blob copy forever. |

## Recommended policy (per class — Adrian to approve/amend)

The unifying principle: **student-inactivity-based, mirroring the existing
12-month attempts rule** — one clock, easy to state in the privacy policy:
*"we keep your portal data while you're active and for 12 months after."*

| Class | Recommendation | Why |
|---|---|---|
| 1 Hand-in photos | **Delete photo blobs 12 months after the run's `created_at`**, keeping the run row and marked PDF. Photos are the raw input; the marked PDF is the keepsake. | Cuts the biggest storage line without touching the teaching record. |
| 2 Marking runs | **Keep rows + marked PDFs 24 months**, then fold into the per-student inactivity purge (same trigger as attempts). Never age out runs of currently-active students. | Business record + calibration ground truth; 24m ≈ one full O-level cycle. |
| 3 Clippings | Fold into the **12-month inactivity purge** (rows + blobs). Active students keep everything (the 500 brake already bounds size). | It's their notebook; deleting while active would destroy value. |
| 4 Generated papers | Delete rows with `status='open'` after **60 days** (paper never handed in — stale pre-registration); submitted ones follow their run (class 2). | Open rows are the only ones with a live behavioural meaning. |
| 5 Finder ledger | Delete rows older than **12 months** (keep enough for year-over-year analytics; caps only need today). Simple `created_at` cutoff — add to the pg_cron function. | Tiny rows; no PII beyond the identity key. |
| 6 Push subscriptions | No cron needed (self-pruning on send). Optional belt: delete rows untouched in 18 months if a `last_seen`/`updated_at` column exists. | Already handled at send time. |
| 7 Notebook entries | Fold into the **12-month inactivity purge**. No age-out while active. | Same reasoning as clippings. |
| 8 Requests | Delete `status != 'queued'` rows after **12 months** (keep queued forever — an unanswered ask should never silently vanish). | Tiny; the queue must stay honest. |
| 9 Passes | Keep **24 months after `expires_at`** then delete (Stripe keeps the money record). Verify the `account_id` FK first: prefer **ON DELETE CASCADE** so account erasure can never 500 on a paying stranger. | Entitlement disputes have a natural statute of limitations. |
| 10 Assignment PDFs | When an assignment is **revoked**, delete its Blob copy at revoke time (code change in the PATCH handler, not a cron). Marked/expired ones follow class 2's clock. | The copy exists only to serve the assignment. |

## Cron sketch (build only after Adrian signs off)

Extend the existing monthly `/api/cron/retention` (keep ONE job, one Telegram
summary, one `job_runs` stamp — per `docs/OPS.md`):

1. Per inactive student (the loop already exists): additionally purge
   `notebook_entries`, `portal_notes` (+ blobs), and runs per class 2's clock —
   blobs before rows, skip student on blob failure (the existing retry rule).
2. Add date-cutoff deletes (no per-student loop needed): photo blobs of runs
   older than 12 months (class 1 — walk `result_json.source.photos`),
   `portal_generated_papers` open>60d, `portal_generation_log` >12m,
   `portal_requests` decided>12m, `portal_passes` expired>24m.
3. `?dry=1` must preview every new class before the first real run.
4. The pg_cron function takes the pure-SQL cutoffs (finder ledger, requests,
   passes) if keeping them in-DB is preferred — but don't split one class
   across both jobs.

**Decisions Adrian owes this doc**: the class 1/2 clocks (12/24 months?),
whether marked PDFs are forever-keepsakes instead, and the passes FK check.
