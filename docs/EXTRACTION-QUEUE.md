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
**Science papers take the same door since 26 Sep 2026** — `BIO PRELIM 2018 West Spring P1.pdf`,
`CHEM MYE 2022 SASS P2.pdf`, `PHY PRELIM 2024 ACSI P1.pdf`, `S3 BIO EOY 2020 SJI P1.pdf`,
`S2 SCI EOY 2023 Hua Yi.pdf`; a **mark scheme** is `… P1 MS.pdf` (or `… MS.pdf` for a
P1+P2 scheme) and is kept for pairing, never queued → §4a.

`GET /api/cron/extraction-inbox` runs every 10 minutes (Vercel cron; `?dry=1`
lists the plan). For each file that has sat unchanged for 90 s (≤ 5 per tick):

| the watcher finds | it does | the file goes to |
|---|---|---|
| bytes nobody has seen, name it can file | uploads to `paper-library/sources/<level>/<year>/<school>/<name>`, inserts a `paper_library` row `kind='source' status='queued'` | `Extraction Inbox/queued/` |
| bytes nobody has seen, name it **cannot** file | uploads under `sources/_unfiled/`, inserts the row as `status='flagged'` with the reason — nothing dropped in the inbox is ever lost | `Extraction Inbox/rejected/` |
| bytes already known (a queued/done source, **or a PDF already in the marker's library** — i.e. extracted long ago) | appends a note to the existing row, enqueues nothing | `Extraction Inbox/rejected/` |
| bytes it uploaded from this very path on an earlier tick that died before the move | finishes the move only | `Extraction Inbox/queued/` |
| a PDF whose name gives **no paper number** (`O Level AM TYS 2025 (Questions).pdf`) | reads its cover pages first — §1c: two or more covers → the book is **cut** and each paper goes through this table as a file of its own; one cover → the file takes that paper number; none → queued whole | `Extraction Inbox/split/` (a cut book) or `queued/` |

Same name, different bytes → kept as a new version (`key` gets `-<sha8>`), never
an overwrite. Every step is idempotent: a crash between upload, insert and move
is repaired by the next tick, never repeated. The tick stamps `job_runs`
`extraction-inbox`; `JOB_RHYTHMS` alarms by absence.

## 1b. The same door fills the MARKER's library (10 Sep 2026)

Adrian, on Isabelle's `TYS AM 2025 P2` and Joey's `em tys 2025 p1`: *"moving
forward, what does the system do if there are no questions or mark scheme
available? — we should have a robust solution."* Both papers were marked blind —
every allocation a guess, `68/90` on the cover — while the PDFs that would have
grounded them sat in **this folder**, filed as `kind='source'` and nothing else.
The extraction row is for the fleet; the marker reads a different row, and only
`scripts/paper-library/index.mjs` (a Mac script, run by hand) ever wrote one.

So the same tick now does both jobs over one storage object:

| the file names | the marker row | what follows |
|---|---|---|
| ONE paper (`AM GCE 2025 Paper 2.pdf`, `EM PRELIM 2025 Catholic High P1.pdf`) | upsert `paper_library` `kind='questions'`, `status='library'`, key `am 2025 p2 gce` | every recent run marked without it is re-marked (below) |
| ONE paper's scheme (`… (Solutions).pdf`, `… ANS.pdf`, `… MS.pdf`) | the same, `kind='solutions'` | the same |
| a whole book (`O Level AM TYS 2025 (Questions).pdf`, paper `all`) | the book is cut at its covers first (§1c) and each part is filed as ONE paper above; only a book whose covers could not be read stays whole | a whole book stays **queued** for the fleet (the bytes are wanted), with the reason and a note: split it into one file per paper, named `AM GCE 2025 Paper 1.pdf` |

Two spellings of the same paper meet here and must not be confused: the marker's
own key is `gce 2025 am p2` (exam first, bot `lib/paper-key.js`) and the library's
is `am 2025 p2 gce` (level first, `bankFilterFor` + the indexer's `keyOf`). The
sweep therefore matches on the four FIELDS — school, year, level, paper — and the
bot's ungrounded stamp carries `filter` for exactly that (`runPaperFields` in
`lib/extraction-inbox.ts`). Two more spelling rules live in `markerSchool`: a
national paper is filed under school **GCE** however the file spells it (GCE /
TYS / O Level / Specimen), and a real school's brackets are kept — "Chung Cheng
High (Yishun)" is how the bank spells it — while a bracket holding only
"(Solutions)" comes off, or the scheme would be filed under a key nothing looks up.

**Then the loop closes.** Every `paper_marking_runs` row of the last 30 days that
names this paper and was marked with nothing to check it against — the bot's
`paper_match.ungrounded` stamp, or an ungrounded run whose questions were never
found — is re-queued through the bot (`POST $BOT_BASE_URL/api/mark-paper`,
`{phase:'enqueue', remark:true, model:'opus', style:'teacher'}`), at most **10 per
arriving file**, with one Telegram line each to the marking topic:

> 📥 GCE 2025 AM P2 is in — re-marking Isabelle's paper against it; the changed parts will be purple.

Idempotency is `paper_match.regrounded_key`, written **before** the enqueue and
rolled back if it fails: a duplicate marking costs real money, so the safe failure
is "not re-marked", never "re-marked twice". Runs with no stored photos, and runs
still sitting unmarked in the queue (they attach from the library on their way
through anyway), are left alone. The counts ride the tick's `job_runs`
`extraction-inbox` summary ("2 queued, 2 filed for the marker, 3 re-marked against
it"); anything over the cap gets its own Telegram line so it can be re-marked from
the desk. The pure halves — `libraryKindOf`, `libraryKeyOf`, `libraryRowFor`,
`libraryLabel`, `runPaperFields`, `runsToReground`, `regroundNotice` — are in
`src/lib/extraction-inbox.ts` and tested in its sibling `.test.ts`.

The full story of what the marker does while the paper is missing (the hand-in
Telegram, the review note, the honest cover) is `docs/MARKING.md` § *When the
paper is missing*.

## 1c. A whole book is cut at its covers (10 Sep 2026)

Adrian, on the 2025 Ten-Year-Series scans: *"model should be smart enough to
differentiate between paper 1 and paper 2 in the pdf, should not have to split
myself."* A TYS book — and many school PDFs — carries Paper 1 and Paper 2 back
to back in one file. The marker looks a paper up by (school, year, level,
paper) and the fleet banks one paper per claim, so a book was useless to both
until it had been cut by hand with `pdfseparate`/`pdfunite`.

Now a PDF whose name gives **no paper number** is read for its covers **before**
anything is filed. The whole PDF (or ≤100-page, ≤20 MB slices of it — these
scans have no text layer and Vercel has no rasteriser, so the API renders the
pages) goes to `claude-sonnet-5` (`BOOK_COVER_MODEL`) as a document block with
one question: *list every cover page* — the first page of a paper, printing the
subject, the syllabus code (4049/01, 4052/02, 9758/01), "Paper 1"/"Paper 2" and
the year. One call per slice, a few dozen tokens back (a 34-page book: one call,
~15 s).

The plan is pure and tested (`src/lib/paper-book-split.ts` `planSplit`):

- **two or more covers** → one part per cover, each running to the page before
  the next cover; pages before the first cover (a contents page) ride with the
  first paper, pages after the last (a formula sheet) with the last. A second
  "cover" closer than 4 pages to the one before is the same cover seen twice
  and is dropped. Every cover must print a paper number and no (year, paper)
  pair may repeat, or the book is left whole with the reason on its row.
- **one cover** → the file is a single paper; its number comes off the cover and
  the row (and the marker key) get it — a `Paper 1` the name forgot.
- **none** → filed whole, exactly as before.

A cut book is stored for provenance and its own row closed as `skipped`
(nothing extracts a book); it moves to `Extraction Inbox/split/`. Each part is
named by the fleet's own convention (`partFileName`: `AM GCE 2025 Paper 1.pdf`,
`JC2 GCE 2025 Paper 2.pdf`, `EM PRELIM 2024 Pierce Paper 1.pdf` — a national
paper's cover year wins, so a decade book yields one file per year and paper),
uploaded under `sources/<level>/<year>/<school>/`, queued as its own `source`
row (unless the queue already knows that paper — then the existing row is left
alone and the report says so), and filed for the marker + re-marked against
exactly as a single file would be (§1b). Adrian gets one Telegram line:

> 📚 "O Level AM TYS 2025 (Questions).pdf" was cut at its covers into AM GCE 2025 Paper 1 + AM GCE 2025 Paper 2 (Paper 1 (2025) pp. 1–16, Paper 2 (2025) pp. 17–34); each is queued for extraction and filed for the marker.

Two name rules landed with it in `parseSourceFilename`: a Ten-Year-Series / O
Level / A Level name **is** the national paper (exam `GCE`, school `GCE` — until
then such a book queued as school "O Level TYS (Questions)", exam null, and the
fleet would have staged it as a PRELIM), and `H2`/`H1` name the JC subject
(`A Level H2 Math TYS 2025 (Questions).pdf` → level `JC2`).

Verified 10 Sep 2026 on the three 2025 books (`scripts/paper-book-split-check.ts`
dry-runs the splitter on local PDFs, writing the parts to a folder): the AM
book cut 16 + 18 pages and the EM book 20 + 22 — page-identical to the split
done by hand that morning — and the A-Level book 8 + 8. A model or API failure
throws, the tick says `covers not read: …` on the item and the book is queued
whole; the next drop tries again.

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
`exam_type`, `notes` — and **`subject`** since 26 Sep 2026 (`math` · `biology` ·
`chemistry` · `physics` · `science`, parsed from the name's first token). Two functions:

- `claim_extraction_paper(p_runner text, p_lease_hours int = 3, p_subject text = null)` —
  one queued source, oldest first, `FOR UPDATE SKIP LOCKED`; a `claimed` row whose
  lease has expired is fair game again (the note records the reclaim); `p_subject`
  narrows the claim to one subject (the Fly lane starts `claude` against that
  subject's bank project, so it must not be handed a row of another subject).
  **This one call replaces every stale-claim heuristic in the fleet law.**
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
# → { row: {...}, downloadUrl: "<signed, 1 hour>" }   (add "subject":"biology" to claim one subject only)

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

Rows carry what the watcher parsed from the name — `subject`, `level`, `year`, `school`
(spelled exactly as staged: **RI stays RI**), `exam_type`, `paper` (`p1`/`p2`, or
`all` for a bundled docx). The worker still runs the duplicate guard and the alias
pre-guard; those are about the *bank*, not the file.

## 4. Who runs the queue — the cutover (10 Sep 2026) and the Fly lane (25 Sep 2026)

**The cutover happened on 10 Sep 2026:** the fleet law (`extraction_worker_prompt`,
id `exam-extraction`) has a step 0 that claims from this queue through the three
`curl` calls above before it looks at the iCloud folder, and a QUEUE-ONLY shim
stops on a 204. The Mac fleet (`inbox-extract` on the Pro, the `exam-extraction-cc1..3`
launchd shims) ran that way for a fortnight.

**Since 25 Sep 2026 the queue is drained by the Fly worker** (`adrianmath-worker`,
bot repo `worker/fly/extract.sh` + `EXTRACT_PROMPT.md`), so extraction runs with
both Macs closed — Adrian: "build it".

- `worker/fly/jobs.sh` reads `GET /api/admin/extraction-queue?status=queued&limit=1`
  every 15 min (one curl); a queued row starts `extract.sh`.
- **Budget:** the marking slots come first. Outside 00:00–06:59 SGT a run starts only
  when the marking queue is empty (the supervisor's `external-peek`). The bot wakes the
  machine at 00:02 for the night window; with the queue non-empty the machine stays up
  (`extract` is in jobs.sh's hold list) and claims one row every 15 min until it is dry.
- **The run:** `claude -p` on a pooled CLI login (never the API key), in a clone of the
  AdrianMath repo at `/data/bank` (`~/Desktop/AdrianMath` is a symlink to it, so the
  law's paths read true), runner `PDF-Pipeline-Fly-<ddHHMM>`. The prompt fetches the
  law fresh from Supabase and follows it with overrides for the box: REST only
  (`scripts/bank_insert.py` reads `SUPABASE_URL` + `SUPABASE_SECRET_KEY` from env;
  reads are PostgREST GETs), the Bearer is `$ADMIN_PASSWORD` from env, no Mac-fleet
  housekeeping (`.claims/`, sweeps, iCloud), `.auto-memory` absent, `.upload_secret`
  written at boot from the Fly secret `BANK_UPLOAD_SECRET` (missing → the paper is
  banked and finished `flagged` with `FLAGGED-IMAGES`, never abandoned), a second cover
  inside an `all` PDF goes back to the inbox via `scripts/dropbox-put.mjs`.
- **Guard:** 2.5 h TERM-then-KILL under the 3-hour lease; a run that dies holding a row
  is finished `failed` by the wrapper with the reason, so a poison paper never loops.
  The wrapper learns WHICH row it holds from the queue (`claimed_by` = its runner name),
  never from the model's output — `claude -p` prints only the final message, so a marker
  printed at claim time never reaches it (the first dry run, 25 Sep 2026).
- **Logbook:** every run that claimed a row stamps `job_runs` `pdf-extract` through
  `POST /api/job-log` (`ok` = done/skipped); an empty-queue tick stamps nothing.
- **The row's `notes`** carries the law's DONE / SKIPPED / SPARSE / FLAGGED line — the
  box's `papers/processing_log.txt` is local and disposable.

The Mac tasks are redundant now; coexistence is harmless (the claim RPC is atomic and
a lease is a lease), so Adrian removes them when convenient. `SCHOOL_ALIASES.md` and
the `pending_images_*.txt` side files still live on the Macs; the alias list wants its
own small table when it next matters.

### 4a. Science through the one inbox (26 Sep 2026)

Adrian: *"the 16 waiting biology PDFs go through the inbox like any maths paper, and
the Bio extract card can go with the other seven."* The four pieces:

1. **The name.** The watcher's first token now includes the sciences
   (`lib/extraction-inbox.ts`): `BIO` / `CHEM` / `PHY` → level `BIO` / `CHEM` / `PHYS`
   (6093 / 6092 / 6091, subject `biology` / `chemistry` / `physics`); `S3 BIO|CHEM|PHY`
   → `S3_BIO` / `S3_CHEM` / `S3_PHYS`; `S1 SCI` / `S2 SCI` → `S1` / `S2`, subject
   `science`. Exam type and school follow the maths rule; `P1` / `P2` as before.
   A file whose name carries **`MS`, `ANS` or `Answers`** is a mark scheme: the
   watcher uploads it and files the row `status='skipped'` ("a mark scheme — kept
   for pairing"), never queues it, and never runs `splitBook` on it. The worker
   finds it later by subject + level + year + school (+ paper, else `all`).
2. **The row.** `paper_library.subject` (above); the claim takes an optional
   `subject` and the RPC's `p_subject` honours it.
3. **The lane** (bot `worker/fly/extract.sh`): every tick **peeks the oldest queued
   row's subject** (`GET ?status=queued&limit=1`), claims with that subject, and for
   a science row swaps the Supabase pair to the science project
   (`SUPABASE_URL_SCIENCE` / `SUPABASE_SERVICE_KEY_SCIENCE` become `$SUPABASE_URL` /
   `$SUPABASE_SECRET_KEY` for the run, so `bank_insert.py insert|verify` works
   unchanged) while the law, the queue, `job_runs` and the scheme lookup stay on the
   math project as `$SUPABASE_URL_MAIN` / `$SUPABASE_SECRET_KEY_MAIN`; it passes
   `EXTRACT_SUBJECT`, picks the model (Opus 5.5 high; **biology → Opus 5**) and stamps
   `job_runs pdf-extract` meta `subject` + `model`. A run that finds itself holding a
   row of another subject requeues it ("claimed by a <subject> run — wrong subject")
   and stops.
4. **The law.** The live `extraction_worker_prompt` row (`exam-extraction`,
   `v2026-09-26-science`; archive `exam-extraction-2026-09-26-science`) carries a
   pointer under *Claim a file* and a **§Science papers** section at the end that
   REPLACES §Level / school / duplicate guard and §Process for a science run:
   `level` = the staged token, `exam_type` as printed (Title Case), `paper` `'1'` MCQ
   / `'2'` structured (Sec 3 and S1/S2 combined papers → `'1'`), topics only from the
   science bank's `bank_topics` view for that level (+ `canonical_topics_bio.json` for
   biology), MCQ = stem + four options + a top-level `solution` (V11), structured =
   `parts[]` with one scheme point per mark, **the key wins** (only arithmetic slips
   corrected, disagreements flagged), the paired scheme → `solution_source`
   `mark_scheme` else `expanded_from_answer`, figures as
   `<bio|chem|phy|sci>_{school}_{year}_p{paper}_q{n}_{8-hex}.png` POSTed straight
   into the science bucket `question_images`, the 40-MCQ / 80-mark minimums, and the
   log line's ` | Subject: … | MS: …` suffix. Maths runs never read it.

What is NOT built: the automatic hand-off of a student's uploaded scheme from
`paper_schemes` into this inbox (`SPEC-SCIENCE-MARKING.md` Phase 2) — a scheme still
has to be dropped in by name. The science bank's `bank_topics` is a view over the live
rows, so a level with no rows yet (`S3_*`) has no list: the section says to use the
Sec 4 list for it.

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
