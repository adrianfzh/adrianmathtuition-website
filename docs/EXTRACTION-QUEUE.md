# The extraction queue — papers in a bucket, work in a table

Built 8 Sep 2026 (Adrian: *"go ahead, build the watcher and queue"*), after the
figure-repair round showed a quarter of the extraction fleet's law was scar tissue
from claiming papers by **renaming files in an iCloud folder** — stale-claim
timeouts, `.claims/` marker files, launchd-heartbeat detection, "owner died
mid-run" close-outs and a *resurrection* pre-check for files iCloud re-creates.
A rename on a synced folder is not a lock. A row update is.

**The shape now:** the Dropbox folder is a *door*, the bucket is the *source of
truth*, and `paper_library` is the *queue*. Nothing about extraction itself
changes — the fleet law's filename conventions, duplicate guard, fitness checks
and write rules all still apply. Only *where the file comes from* and *how a
worker says "mine"* change.

## 1. The door — `/Extraction Inbox`

Drop a `.docx` or `.pdf` into **`Dropbox/Apps/AdrianMathNotes/Extraction Inbox/`**
(the app-folder root, beside `/Scans`; the website's Dropbox token cannot see
outside the app folder). Name it the way the fleet already expects —
`AM PRELIM 2025 Bedok South.pdf`, `JC2 MY 2012 SAJC.docx`,
`EM S4 PRELIM (NA) 2024 Pierce.pdf` — because the watcher files it by that name.

`GET /api/cron/extraction-inbox` runs every 10 minutes (Vercel cron; `?dry=1`
lists the plan). For each file that has sat unchanged for 90 s (≤ 5 per tick):

| the watcher finds | it does | the file goes to |
|---|---|---|
| bytes nobody has seen, name it can file | uploads to `paper-library/sources/<level>/<year>/<school>/<name>`, inserts a `paper_library` row `kind='source' status='queued'` | `Extraction Inbox/queued/` |
| bytes nobody has seen, name it **cannot** file | uploads under `sources/_unfiled/`, inserts the row as `status='flagged'` with the reason — nothing dropped in the inbox is ever lost | `Extraction Inbox/rejected/` |
| bytes already known (a queued/done source, **or a PDF already in the marker's library** — i.e. extracted long ago) | appends a note to the existing row, enqueues nothing | `Extraction Inbox/rejected/` |
| bytes it uploaded from this very path on an earlier tick that died before the move | finishes the move only | `Extraction Inbox/queued/` |

Same name, different bytes → kept as a new version (`key` gets `-<sha8>`), never
an overwrite. Every step is idempotent: a crash between upload, insert and move
is repaired by the next tick, never repeated. The tick stamps `job_runs`
`extraction-inbox`; `JOB_RHYTHMS` alarms by absence.

## 2. The queue — `paper_library`, `kind='source'`

The table the marker's exam library already lived in, extended (migration
`paper_library_extraction_queue`). Existing library rows keep `status='library'`
and are untouched; source rows move through:

```
queued ──claim──▶ claimed ──finish──▶ done | skipped | flagged | failed
   ▲                 │
   └──── requeue ────┘         (a claim older than its lease is reclaimable)
```

Columns added: `status`, `claimed_by`, `claimed_at`, `finished_at`, `inbox_path`,
`exam_type`, `notes`. Two functions:

- `claim_extraction_paper(p_runner text, p_lease_hours int = 3)` — one queued
  source, oldest first, `FOR UPDATE SKIP LOCKED`; a `claimed` row whose lease has
  expired is fair game again (the note records the reclaim). **This one call
  replaces every stale-claim heuristic in the fleet law.**
- `finish_extraction_paper(p_id, p_runner, p_status, p_notes = null)` — only the
  claimant may finish; anyone may hand a row back to `queued`.

## 3. The worker contract — `/api/admin/extraction-queue`

A worker on **any** machine needs only the admin bearer and `curl`. No service
key, no bucket credential, no iCloud folder.

```bash
# claim (204 = queue empty)
curl -s -X POST https://www.adrianmathtuition.com/api/admin/extraction-queue \
  -H "Authorization: Bearer $ADMIN_PASSWORD" -H 'Content-Type: application/json' \
  -d '{"action":"claim","runner":"PDF-Pipeline-CC1"}'
# → { row: {...}, downloadUrl: "<signed, 1 hour>" }

curl -sL -o paper.docx "$downloadUrl"        # then extract exactly as the law says

# finish — done | skipped | flagged | failed; notes are appended to the row
curl -s -X POST …/api/admin/extraction-queue -H "Authorization: Bearer $ADMIN_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"action":"finish","id":"<row id>","runner":"PDF-Pipeline-CC1","status":"done","notes":"42 questions, V11/V12 pass"}'
```

Also `{"action":"download","id"}` for a fresh URL mid-run, `{"action":"requeue","id"}`
to hand a row back, and `GET ?status=queued|claimed|done|flagged|all` to see the
queue (with per-status counts). Direct-DB workers (psql on `$PGURL`) may call the
two functions themselves and download by `storage_path` with a signed URL from
`download`.

Rows carry what the watcher parsed from the name — `level`, `year`, `school`
(spelled exactly as staged: **RI stays RI**), `exam_type`, `paper` (`p1`/`p2`, or
`all` for a bundled docx). The worker still runs the duplicate guard and the alias
pre-guard; those are about the *bank*, not the file.

## 4. What is deliberately NOT done yet — the fleet cutover

The workers still read the iCloud folder. Switching them is one edit to the fleet
law (`extraction_worker_prompt`, id `exam-extraction`): replace "claim a file in
`papers/`" with the three `curl` calls above, and delete §"Recover stale claims",
the `.claims/` marker rules and the resurrection pre-check. That edit is
mechanical but it changes how six autonomous workers behave on every paper, so it
is a deliberate step with a dry run, not a side-effect of this build. Until then
both lanes can coexist: the folder still works, and anything dropped in the inbox
simply waits in `queued`.

The side files — `papers/processing_log.txt`, `pending_images_*.txt`,
`SCHOOL_ALIASES.md` — also still live on iCloud. `notes` on the row is where a
worker's per-paper log belongs once cut over; the alias list wants its own small
table. Backfilling `processed/` history into the library is optional and separate.

## 5. Rollback

Nothing here removes anything. The migration is additive (new columns default
`'library'`, new `kind` value, two functions). Dropping the cron line in
`vercel.json` stops the watcher; rows and objects stay. The iCloud folder was
never touched.

## 6. Verifying it (what was run on 8 Sep)

1. `vitest run src/lib/extraction-inbox.test.ts` — the filename parser against
   the fleet's real names, the level precedence, the idempotent decision table.
2. Preview deploy → `GET /api/cron/extraction-inbox?dry=1` with the admin bearer
   → `{ ok, folder, results:[] }` and the folder created in Dropbox.
3. A real paper dropped in → next tick → row `queued`, object present, file in
   `queued/`; `POST claim` → signed URL downloads the same bytes (sha256 equal);
   `POST finish done` → row `done`, `finished_at` set.
4. Health-check `extraction-queue` probe = 401 without a bearer.
