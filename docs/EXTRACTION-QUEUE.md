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

## 1d. Papers students hand in (5 Oct 2026)

Adrian: *"build that. and start to extract papers previously uploaded that we don't already
have in the question bank too"*, then *"do the safer middle way"*. A marked hand-in of a paper
no index line holds is a second door into the queue — same row shape,
`source_folder='hand-in'`, no Dropbox file.

- **What goes.** Clean printed pages when there are enough (pre-pass `question_paper` AND the
  page's own read agreed; ≥ 3 and ≥ half the printed pages). Otherwise — students write on the
  paper — **the safer middle way**: every printed question page (`question_paper` + `mixed`,
  the student's working included, ≥ 3 pages) as a PRIVATE source, column
  `contains_student_work = true` and notes beginning `CONTAINS STUDENT WORK`. Never a cover
  (a written name), never a page of plain working or an answer page. An attached
  question-paper PDF goes whole.
- **The law for those rows** (`exam-extraction` §Hand-in sources that contain student work,
  archive `exam-extraction-2026-10-05h`, rule `xr-handin-student-work`): transcribe ONLY the
  printed question text; never crop a figure — redraw it, or bank the question without it,
  flagged; store no page image; keep no copy.
- **Deleted when finished.** The extraction-inbox tick deletes a student-work source from the
  bucket once its row is `done` / `skipped` / `flagged`, blanks `storage_path` (`''`) and notes
  "source deleted (contained student work)" (`deleteFinishedStudentWorkSources`) — the website
  does it, so it never depends on a worker remembering. A `failed` row keeps its file for the retry.
- **Which paper.** Typed name first (maths: the bot's `paper_match.parsed`; gaps from the name or
  `paper_subject`). When it lacks something, ONE model read of the cover + first printed pages
  (`readPrintedPages`, `claude-sonnet-5`, headers/footers/syllabus code, handwriting ignored);
  print beats a clashing typed value, the name fills gaps. Schools: the alias table (Adrian's
  short forms SJC = CHIJ St Joseph's Convent, SJI, TKGS, XMS, GES, PLMGS, SCSS/SCGS — in the bot's
  `lib/paper-key.js` too), the families of spellings (each bank's own spelling for new rows),
  then the initials guesser — an unknown short form is the ONE bank school whose initials fit,
  else Adrian gets one batched Telegram line ("🏫 Which schools are these?"), once per short form
  (`extraction_handoff.asked_school`). A typed word is never Title-Cased into a school, so a
  student's name can never become a file name; the name must read back through
  `parseSourceFilename`. A run whose printed questions the marking already matched to the bank is
  held, whatever its name.
- **When:** the extraction-inbox tick: runs created in the last 7 days, ≤ 2 papers and ≤ 3 reads
  a tick; every run stamped `result_json.extraction_handoff` (the reading kept in it).
- **Code:** `src/lib/handin-extraction.ts` (pure, tested) · `src/lib/handin-extraction-store.ts`
  · backfill `npx tsx scripts/handin-extraction-backfill.ts [--go] [--stamp] [--json]` (readings
  cached in the OS temp folder between a dry run and `--go`).
- **Runs marked before the page pre-pass** (no `page_classification`, mid-August and older):
  ONE read of ALL the photos says which are printed question pages (and names the paper from any
  page); those always go as private student-work sources.
- **Adrian's answer to 🏫** (bot `lib/school-asks.js` + `handlers/school-asks.js`): a reply to the
  line, OR a plain message within 6 hours that names a school (its initials fit the open short
  form, or it carries a school word — an ordinary message is never swallowed); several open →
  "NVSS = North Vista; XYZ: …". The bot writes an active `extraction_rules` alias row
  (`"NVSS" = "North Vista Secondary School"`), marks the asked runs `answered_school`, and the
  next tick re-reads them however old they are. The website loads every active alias row as a
  family of spellings before each sweep (`setLearnedFamilies`).
- **Backfill (5 Oct 2026), all 399 runs:** **15 papers queued (16 with NVSS) — 14 private student-work sources
  (deleted after extraction) and 1 attached question-paper PDF**, plus 4 student schemes beside
  them as `… MS.pdf`: CHEM PRELIM 2026 Queenstown P2 · CS CHEM PRELIM 2026 Gan Eng Seng P3 ·
  CS CHEM PRELIM 2026 Paya Lebar Methodist Girls P3 · CS BIO PRELIM 2026 Swiss Cottage P4 ·
  EM PRELIM 2025 Zhonghua P2 · EM (NA) PRELIM 2025 St Gabriel P1 + P2 · AM PRELIM 2024 / 2025 CHIJ
  St Joseph P1 · EM PRELIM 2023 / 2024 / 2025 CHIJ St Joseph P1 · AM PRELIM 2025 North Vista P1 ·
  AM PRELIM 2025 CHIJ St Theresa Convent P1 + P2. Of the 89 the first pass could not name, 46 are
  named now, 9 were our own "O REV" sheets and 34 are still unknown (no school, year or exam
  printed or typed — "A Math 2025 P1", "Handed in 22 Aug"); 93 printed-page reads in all.
  **NVSS** (Chloe's AM P2, 13 Aug): Adrian answered North Vista 2025 — set as the run's
  `extraction_handoff.override` (his word beats the print and the typed name) and queued:
  `AM PRELIM 2025 North Vista Paper 2.pdf`, 17 printed pages with working, private. 16 papers in
  all. **SCSS = Swiss Cottage** (Adrian, 5 Oct 2026; Singapore Chinese Girls' is SCGS) — fixed in
  both short-form tables; the printed cover had already filed it as Swiss Cottage.

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
`chemistry` · `physics` · `science`, and since 5 Oct 2026 `history` · `geography` ·
`social_studies`, parsed from the name). Two functions:

- `claim_extraction_paper(p_runner text, p_lease_hours int = 3, p_subject text = null)` —
  one queued source, oldest first, `FOR UPDATE SKIP LOCKED`; a `claimed` row whose
  lease has expired is fair game again (the note records the reclaim); `p_subject`
  narrows the claim to one subject (the Fly lane starts `claude` against that
  subject's bank project, so it must not be handed a row of another subject).
  **This one call replaces every stale-claim heuristic in the fleet law.**
- `finish_extraction_paper(p_id, p_runner, p_status, p_notes = null)` — only the
  claimant may finish; anyone may hand a row back to `queued`.

### 2a. On hold — the `held` status (2 Oct 2026)

Adrian: *"we should prioritise recent years first - 2023 to 2025 for A Math E Math JC H1 and
the sciences … the rest put on hold first"*.

- `held` is a seventh status. The claim RPC only takes `queued`, so a held row waits untouched;
  nothing in the worker changed.
- On 2 Oct 2026, 561 queued rows were held and 233 stayed queued: years 2023–2025 at levels
  `AM`, `EM`, `JC2_H1`, `PHYS`, `CHEM`, `BIO`, `CS_PHYS`, `CS_CHEM`, `CS_BIO` and their `_NA`
  twins. Held: everything older, the 2026 papers, and the Sec 2 / Sec 3 / N(A) / N(T) maths.
  Each held row's `notes` ends with `ON HOLD 2 Oct 2026: …`.
- **A paper dropped in the inbox still arrives `queued`**, whatever its year — the hold was a
  one-off sweep, not a rule in the watcher.
- Release: `update paper_library set status='queued' where kind='source' and status='held'`
  plus whatever narrows it (a year, a level). `GET /api/admin/extraction-queue?status=held`
  lists them. Migration `migrations/paper_library_held_status.sql`.

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
- **The run:** `claude -p` on a pooled CLI login (never the API key), in **the extraction
  folder** `/data/extract` — a copy of the BOT repo's `extraction/` (house rules, the
  `question-processing` skill, `scripts/bank_insert.py`, topic lists, `science/`) that
  jobs.sh `sync_extract` refreshes from `/data/bot` before every run (until 5 Oct 2026 a
  clone of the AdrianMath repo at `/data/bank` — see "The AdrianMath folder is retired"
  below), runner `PDF-Pipeline-Fly-<ddHHMM>`. The prompt fetches the
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
a lease is a lease), so Adrian removes them when convenient. School spellings live in
`extraction_rules` (`type='alias'`, the learner's table); the old `SCHOOL_ALIASES.md`
notes moved with the worker's `papers/` into `/data/extract/papers/`.

**The AdrianMath folder is retired (5 Oct 2026, Adrian: "retire adrianmath > yes").**
Everything lives in the two repos + the database:

| was in `~/Desktop/AdrianMath` (GitHub `adrianfzh/AdrianMath`) | now |
|---|---|
| `CLAUDE.md` + `CLAUDE-ARCHIVE.md` (the house rules), `.claude/skills/question-processing/`, `scripts/bank_insert.py`, `canonical_topics.json`, `canonical_topics_bio.json`, `DIFFICULTY_SHAPES.md` | bot repo `extraction/` (same relative paths) |
| `mac_b_science_tasks/` storage convention, science solution styles, `SPEC-SCIENCE-MERGE.md`, `canonical_topics_s1sci.json` | bot repo `extraction/science/` |
| skills `create-teaching-notes`, `correct-math-notes`, `generate-similar-questions`, `prelim-practice-sets`, `reproduce-exam-paper` | this repo `.claude/skills/` |
| `papers/` — every PDF / DOCX the Mac fleet processed (`processed/`, flagged, `needs_review/`, science staging) | the private `paper-library` bucket: rows the library already held by sha256 were left alone, the rest uploaded by `scripts/paper-library/archive-bank-folder.ts` as `kind='source'`, `status='library'` (in the library, never queued), notes `ARCHIVED 5 Oct 2026 from …`. **Result:** 2,217 source files found (1,254 PDF, 963 DOCX); 524 already in the library by bytes; **1,677 uploaded** (3.35 GB); 8 were iCloud dup/evicted markers of papers the library holds and 1 an empty race artifact. **6 were over the per-file upload limit (56–77 MB) and were then split (Adrian: "yes split them"), 19 parts uploaded, `source_folder = 'AdrianMath/papers (split 5 Oct 2026)'`:** the two 2025 chemistry files by paper — `CHEM PRELIM 2025 Cedar Girls` → P1 / P2 / MS; `… Nan Hua High` (it also held Maris Stella's P1 answers and all of Nan Chiau High) → Maris Stella P1 MS, Nan Chiau P1 / P2 / MS, Nan Hua P1 / P2 / MS — with Cedar P1 and Nan Chiau P1 QUEUED (not in the bank), Nan Hua P1 queued as `COMPLETE PARTIAL` (2 of 40 MCQs banked), the P2s `library` (banked), the schemes `skipped` (pairing); the four Combined Science 12-school books by page range (`… part 1/2[/3]`, `library`, not queued — their schools are already in the library as per-school or `Compilation Set A/B` rows, several on hold by the round rule). The iCloud originals are untouched |
| `teaching_style/`, `GCE Sets`, `School Papers`, `Twins`, worksheets | `docs/teaching-style/`, `~/Dropbox/AdrianMath Work/` (30 Sep 2026) |
| one-off batch scripts, FLAG notes, viewers, old Mac fleet setups | left in the archived repo (read-only on GitHub, history intact) |

The law (`extraction_worker_prompt` `exam-extraction`; archived copy
`exam-extraction-2026-10-05-preretire`) calls the root "the extraction folder" = the run's
working directory. On a Mac, run it from `~/dev/adrianmath-telegram-math-bot/extraction`
(copy `.upload_secret` in; it is gitignored). The Mac B launchd fleet
(`com.adrianmath.pdfpipelinecc.1–6`, failing with TCC since the Desktop move) was booted out
and its plists moved to `~/Library/LaunchAgents/retired-2026-10-05/`. Mac A's fleet last
beat on 2 Sep 2026. The iCloud folder itself stays as cold storage until Adrian says.

### 3a. Lower-sec N(A) (28 Sep 2026)

Adrian: "are there sec 1 g2 (NA) papers in the question bank?" — there were none (every Sec 1
row was Express or IP), and the name rule filed a bare `(NA)` as Sec 4. The watcher now files
`S1 (NA)` / `S1 G2` → `S1_NA` and `S2 (NA)` / `S2 G2` → `S2_NA` (before the bare-`(NA)` rule),
strips `G1`/`G2`/`G3` from the school, **the fleet LAW knows them too** (Supabase `extraction_worker_prompt` `exam-extraction`, v2026-09-28-s1na; the previous text is archived as `exam-extraction-2026-09-28` — the first two claims, Chung Cheng High 2023 and Broadrick 2023, had flagged themselves with "level needs a ruling" because the law's level list stopped at `EM_NA`; they were requeued once the law carried `S1_NA`/`S2_NA` as valid bank levels with the Sec 1 / Sec 2 topic lists), and the app knows the two levels (`qb-levels`,
`canonical-topics` → Sec 1 / Sec 2 topics, `portal-find` → the Sec 1 / Sec 2 family). The
first drop is the Dropbox `EM S1 (G2)` 2023 + 2025 SA2 folders, one file per school, named
`EM S1 SA2 (NA) <year> <School>.<ext>`; the `(With Answers)` copies and the practice sets stay
out. **Which login runs a run:** `job_extract` goes through `with_pool_login`, i.e. the same
`scripts/claude-pick.sh` the marking slots use — the login with the emptiest 7-day meter,
the site's ⏻ switches and the per-account limit files honoured — so extraction already
spreads across the accounts like marking (Adrian asked for this on 28 Sep 2026; nothing to change).

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

### 4b. Humanities through the one inbox (5 Oct 2026)

Adrian: *"why don't bank the questions? we can bank them and still use it for background
material for the marker … build this"*. History, Geography and Social Studies take the same
door, the same queue and the same Fly lane; only the destination differs.

1. **The name** (`parseSourceFilename`, tested). The split Ten-Year-Series files are named
   right already — drop them in AS THEY ARE:
   `Social Studies GCE 2025 Paper 1.pdf` → `SS`, `History GCE 2024 Paper 2.pdf` → `HIST`,
   `History Elective GCE 2016 Paper 3.pdf` → `HIST_E`, `Geography GCE 2019 Paper 1.pdf` →
   `GEOG`, `Geography Elective GCE 2025 Paper 2.pdf` → `GEOG_E`; subject `social_studies` /
   `history` / `geography`; school `GCE`, exam `GCE`. The answers file `… Paper 1 Solutions.pdf`
   (or `… MS.pdf`) is the scheme: kept for pairing, `status='skipped'`, never queued.
   - A subject word anywhere decides it. The short codes `SS`, `HIST`, `GEOG` (and `HIST E`,
     `GEOG E`) count only as the FIRST token, so a maths school ending in "SS" stays maths.
   - Elective = the word Elective, "Combined Humanities", or an elective syllabus code
     (2204, 2260–2265, 2267, 2272, 2273). Pure codes: 2174 History; 2236 / 2279 Geography.
   - Refused with the reason: two subjects in one name; a Sec 1–3 humanities name (no level).
   - A split book's parts are named `History GCE 2025 Paper 1.pdf` etc. (`levelNameTokens`,
     round-trip tested).
2. **The lane** (bot `worker/fly/extract.sh`): `history` / `geography` / `social_studies` are
   claimable subjects; the run keeps the MAIN project's keys (no science swap), and the model
   rule is unchanged (Sonnet 5.5 when a scheme file covers the paper — every TYS paper has its
   Solutions file).
3. **The destination**: `humanities_questions` + `humanities_source_sets` in the MAIN project,
   images in the private bucket `humanities_images`, written only through
   `bank_insert_humanities_paper` and checked by `verify_humanities_paper` → `SPEC-HUMANITIES.md`
   §4b.
4. **The law**: `exam-extraction` v2026-10-05-humanities (archive `exam-extraction-2026-10-05`)
   has a pointer under *Claim a file* and a **§Humanities papers** section that replaces the
   level / duplicate guard / process / images / verify sections for these subjects: what a row
   is per subject, sources (text transcribed; pictures cropped AND their words transcribed;
   provenance kept apart), the scheme verbatim as `publisher_tys`, the closed skill and topic
   lists, either/or counting for the marks total, readability, and the finish line.

**Test, 5 Oct 2026:** Social Studies 2025 P1 + its Solutions were filed by hand in the exact
shape the watcher writes (the parser change was not on production yet), claimed through the
production queue route with `subject:social_studies`, banked under the law by hand and
finished `done`: 7 rows, 50 / 50 marks, 2 source sets (Sources A–F; Extracts 1–3), 2 images,
`verify_humanities_paper` pass. The other 69 papers wait for the promote: once the parser is
on production, drop the folders' files into the inbox as they are named.

## 4b. The rules in plain words + the extraction learner (5 Oct 2026)

Adrian, 5 Oct 2026: *"do extraction learning from its own flags too"*, then *"are standing rules
fixed?"* → *"yes do that"*.

**Two copies of the rules, one job each.**
- **The law** — `extraction_worker_prompt` id `exam-extraction` — is what every worker READS, in
  full, each run. It stays the source of truth for the worker.
- **The table** — `extraction_rules` (main project, service key only) — is the READABLE INDEX: one
  row per rule a person cares about, in plain words (`plain_words`), with `why`, `added_at`,
  `source` (`existing` · `adrian-ruling` · `learned`), `kind` (`filing` = changes how a paper is
  filed · `safe` = helps the worker), `status` (`proposed` · `active` · `redraft` · `retired` ·
  `dropped`) and `law_text` = the exact text in the law (or the Fly brief,
  bot `worker/fly/EXTRACT_PROMPT.md`, where `law_section` says so).
- **`/admin/extraction-rules`** (hub tile 📜) lists them: waiting-for-you on top, then *How papers
  are filed*, *What the worker does*, *Known spellings of a school*, retired/dropped folded.
  "Change this" copies `Change rule <slug>: ` for Adrian to finish and hand to a session.
  Pure grouping/words in `src/lib/extraction-rules.ts` (tested). Server-rendered, no API route.

**Keeping them in step.** Whoever changes the law changes the row in the same sitting:
- the learner and Adrian's Ship do it themselves (below);
- a SESSION editing the law by hand: archive first (a new dated id, `exam-extraction-YYYY-MM-DD`,
  then `b`, `c` …), edit the law, then insert / update the `extraction_rules` row (a replaced rule →
  `status='retired'`, `replaced_by=<new slug>`). A rule only in the law is invisible to Adrian; a
  row whose `law_text` is no longer in the law is wrong. The 26 rows seeded on 5 Oct 2026 took
  their `law_text` verbatim from the law of that day.

**The learner** (bot `scripts/extraction-learn.js` + `lib/extraction-learn.js` (pure, tested) +
`lib/extraction-rules-store.js`; Fly worker daily **06:50 SGT** via `worker/fly/extraction-learn.sh`;
switch `extraction-learn` on `/admin/switches`; `job_runs` `extraction-learn`, rhythm 36 h):
1. reads the finish notes of the papers finished in the last 26 h, the new `papers/FLAG_*.md` files
   and `papers/SCHOOL_ALIASES.md` on the worker, and groups the notes by kind (old 5076–5078 code,
   cover names another school, cover code vs level, inner tags, practical paper, bank short,
   duplicate under another spelling, damaged source …);
2. **spellings** — folds the workers' "same school, other spelling" findings into families, keeps
   out pairs that must never join (RI / Raffles Girls, ACS Barker Road / ACS Independent …) and
   files that held another school's paper, checks a name is in the bank, and adds each family as
   an active `type='alias'` row. Safe: the law's §Learned from the flags tells the worker to read
   them as candidates and still confirm with one stem; the stored school never changes;
3. **rules** — a kind that recurs (≥ 2) or blocked a paper, a general ruling of Adrian's found in
   the notes, or a proposal he asked to change → one plan-billed `claude -p` (Opus) drafts rules.
   Code decides safe vs filing (`ruleKind`: only alias / key-location / known-broken-source /
   procedure / complete-partial are safe, and filing words in the law text make it filing).
   **Safe** → appended to the law's **§Learned from the flags** (archived first), row `active`,
   the papers it unblocks requeued. **Filing** → row `proposed`, one plain Telegram message to
   the ops topic with ✅ Ship / ✏️ Change / 🗑 Drop;
4. one summary message, one `job_runs` stamp.

**Adrian's answer** rides the proposals door (bot docs/PROPOSALS.md): the buttons or
`ship|drop proposal xr-<slug>` / `change proposal xr-<slug>: <note>` → `proposal_requests` → the
worker's `scripts/proposal-ship.js`, which hands `xr-` slugs to `extraction-rules-store decide()`:
Ship = archive + append to the law + requeue + `active`; Change = `redraft` with his note (the next
morning's run rewrites it and asks again); Drop = `dropped`.

**First run (5 Oct 2026, a session, two weeks of notes):** 798 finished papers, 208 with something
to learn, 277 FLAG files. Applied (safe): 17 spelling families; `xr-short-duplicate-completes`
(a paper banked short of its printed total is completed, not skipped) — law archived as
`exam-extraction-2026-10-05b`, AM Juying 2024 P2 requeued as `COMPLETE PARTIAL` (85 of 90).
Proposed (waiting for Adrian, not sent by Telegram — the session reported them): school science
papers printing 5076–5078 are banked (96 papers would requeue), the cover's syllabus code decides
the level, practical papers are Paper 3, no-cover files tagged with another school, a file holding
another school's paper banked under the cover's school (22 papers would requeue).

## 4c. The index — what is extracted and what is not (5 Oct 2026)

Adrian: *"organize pdfs that were extracted so we know what's being extracted at a
glance … keep a list or an index?"*, then *"the index for extraction just build for
your own use - don't have to let me see"*. So it is a tool for sessions and agents:
**before extracting, staging, re-sending or hunting for a paper, ask the index what
the banks already have.**

```
npx tsx scripts/library-index.ts --summary                        # counts per subject
npx tsx scripts/library-index.ts --subject "E Math" --from 2023   # one line per paper
npx tsx scripts/library-index.ts --q "bedok south 2024" --notes   # with the workers' notes
npx tsx scripts/library-index.ts --status decision                # what is stuck
npx tsx scripts/library-index.ts --subject Physics --json         # for a script
```

One line per PAPER, grouped Subject → Level → Year: its status in plain words
(Banked · Banked (older) · In the queue · Being extracted · Needs a decision (flagged
or failed) · On hold · Skipped, each with a short why), how many questions the bank
holds for it, where the answers came from (the scheme / worked out from the answer
key / worked out with no scheme), figures missing, and whether the paper's file and
its scheme are kept in the `paper-library` bucket. Built from `paper_library`
(`kind='source'` = the inbox; questions / solutions / combined = the marker's
library) and `library_bank_papers()` — one row per paper, in BOTH the maths project
(maths + `humanities_questions`) and the science project (`migrations/library_bank_papers.sql`).
A bank paper that never came through the inbox is listed as **Banked (older)**, so the
list is complete. Mark schemes and books the watcher cut into papers are not lines of
their own (a scheme hangs on its paper). Re-sent versions of one paper merge into one
line showing the most advanced status.

Matching is on (subject family, level, school with punctuation and case ignored, year,
paper; exam type only when both sides have one) — so a paper banked under another
spelling of the school shows as "Banked — no questions found in the bank under this
name" beside a separate "Banked (older)" line. That is a spelling to fix, not a lost paper.

Pure logic + tests: `src/lib/paper-index.ts`; reads (5-minute cache):
`src/lib/paper-index-store.ts`. The same list is on `/admin/library` (admin cookie,
**no hub tile on purpose**; `GET /api/admin/library`, `?notes=<ids>` for one paper's
notes, health-check `admin-library` probes the 401). There is no Dropbox copy of the
papers — the bucket is where the files live.

## 4d. Which model reads a paper, and the figure rule (5 Oct 2026)

All three live in the bot repo's Fly worker (`worker/fly/extract.sh`, `EXTRACT_PROMPT.md`).

- **Opus for a paper with no mark scheme, Sonnet when a scheme covers it** (Adrian: *"switch
  to opus for those without mark scheme"*; bot e96c9d9f). Before a run the wrapper looks in
  `paper_library` for a scheme filed for the same level, year and school (MS / Mark Scheme /
  Answers / Solutions, or a marker `solutions` row). A practical paper (pure science P3,
  Combined Science P5) counts as covered only by a scheme for THAT paper. A failed look counts
  as "has a scheme" (Sonnet). `EXTRACT_MODEL` still overrides both. The model and the scheme
  flag are on the run's START log line.
- **Every figure is stored before the insert — fix it, do not just flag it** (Adrian: *"why
  not just fix it rather than flagged?"*; bot d1ea97e5, 1f757d34). The worker lists every
  figure each question needs and checks each is in a stored crop; a missing one is cropped
  there and then. A figure absent from the PDF or on a broken page is **redrawn** from what
  the question states — a table retyped as text, a diagram drawn with the bot's figure library
  (`verify()` fails closed), the figure engine where no family fits. Never invent a value.
  Flag only when a figure can neither be cropped nor redrawn (photo, map, cartoon, micrograph,
  numbers unreadable), and say what would fix it.
- **The nightly missing-figure sweep** (bot `scripts/missing-figures-sweep.js`, 03:00 SGT,
  switch `missing-figures`, `job_runs` `missing-figures`; bot 571b8e22). A bank question whose
  text names a figure it does not store (after a Sonnet look at the stored images) sends its
  paper back to `queued` with notes starting `COMPLETE PARTIAL: FIGURES ONLY` — the worker then
  crops or redraws the missing figures and never re-inserts questions. At most 20 papers and 80
  looks a night. Found on Hua Yi CHEM 2024 P2 and Seng Kang CS CHEM 2024 P4.

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
