# SPEC — Paper match at hand-in: ground every marking on the real paper

Adrian, 3 Sep 2026, after Kassandra's TYS 2021 P1 had to be re-queued by hand with the
2021 questions and solutions attached:

> "are we able to automate this? when students drop an exam paper, search the database
> for the exam → if there is, marker can refer the questions and answers and solutions →
> if there is none, marker will just do its normal job (of course, students need to
> upload the questions as well if their workings are not together with the questions),
> and also extract the paper/questions/images/solutions to the question bank" — "build it"

Status: **SPEC AGREED 3 Sep 2026, build in phases below.** Follows the 5-step recipe in
CLAUDE.md §Building doctrine. Owner of the standard: Adrian, at the desk.

## What exists today (do not rebuild)

The bot's marker (`ai/paper-marker.js` + `handlers/webchat.js remarkRun`) already grounds
in a ladder, fail-soft at every rung:

| Rung | Source | When | Where |
|---|---|---|---|
| 1 | **Attached scheme** — `result_json.source.scheme_source` (`{pdf_url}` or `{pages:[{url}]}`) | before marking | `remarkRun` → `lib/scheme-grounding.js fetchSchemeGroundTruth` |
| 2 | **Stored scheme by paper KEY** — `paper_schemes` row whose `paper_key` = the run's paper name with the student's name tokens stripped | before marking | `lib/scheme-store.js paperKey` |
| 3 | **Stored scheme by FINGERPRINT** — verbatim openings of the printed questions the pre-pass reads off the pages, ≥3 shared and ≥50 % of the smaller set (`MIN_SHARED`, `MIN_SHARE`, `isMatch`) | after the page pre-pass | `scheme-store.js findSchemeByFingerprint` |
| 4 | **Bank** — **science only** (`lib/science-grounding.js`) | after the pre-pass | `paper-marker.js` ~L1235 |
| 5 | Rules alone | — | — |

Facts that shape the design (measured 3 Sep 2026):
- `paper_schemes` has **0 rows** — it only fills when Adrian attaches a scheme by hand, so rungs 2–3 have never fired for anyone. Kassandra's re-queued 2021 P1 will be the first row.
- The bank (`questions`) holds **812 distinct math papers**, including **every GCE O-Level AM and EM paper 2002–2024** and A-Level H2 2008–2025 (`school='GCE'`, `year`, `level`, `paper`), with `parts[].answer` on most rows and a worked `solution` on 3,504 of 12,497 math rows. **Math grounding never reads it.** That is the biggest gap and the cheapest win.
- Adrian's Dropbox library has the PDFs the bank was built from: `/1 ONLINE LESSONS/3 Exam Papers/<Level folder>/…` (e.g. `AM S4/AM Prelim 2021/AM PRELIM 2021 Monfort (SA2).docx`) and `/1 ONLINE LESSONS/3 Exam Papers/Ten Year Series/3 tys O-Level AM/O Level AM TYS 2021 (Questions|Solutions).pdf`. Same naming family as `questions.source_file`.
- A portal hand-in (`/api/portal/submit`) requires the student to TYPE the paper name ("Xinmin 2021 Prelim P2"), then `save-paper` (photos only) → `set-student` → `enqueue`. Adrian's own uploads on `/admin/mark-paper` can attach a question-paper PDF and scheme files; students cannot.
- The extraction inbox is a FOLDER, not a table: `~/Desktop/AdrianMath/papers/` on the Macs, with the claim protocol in `AdrianMath/CLAUDE.md` (rename to `.processing`, `processed/`, `processing_log.txt`). The cc1–cc6 fleet that drains it is currently paused.

## The flow to build

```
hand-in / upload / re-queue
   │
   ▼
① IDENTIFY  paper name (typed) + first printed page (pre-pass)  →  canonical key
   │            e.g. "kassandra am tys 2021 p1" + "4049/01 · October/November 2021"
   │                 →  { exam:'GCE', level:'AM', year:2021, paper:1, school:null }
   ▼
② LOOK UP  in this order, first hit wins, every miss logged:
   │   a. paper_schemes         (rung 2/3 as today)
   │   b. question bank         NEW for math: rows for that key → a scheme block
   │   c. Dropbox library       NEW: the (Questions) PDF + the (Solutions|Answers) file
   │                            for that key → attached as paper_pdf_url + scheme_source
   ▼
③ GUARD    a candidate is TRUSTED only if the printed-question fingerprint from the
   │        student's pages overlaps the candidate's questions by the existing rule
   │        (≥3 shared openings AND ≥50 % of the smaller set). Below that: no grounding,
   │        marking proceeds on rules, and the run says so. Never a "probable" match.
   ▼
④ MARK     exactly as today, with groundTruth set; result_json.paper_match stamps what
   │        happened (key, source, overlap, what was attached, or why nothing was).
   ▼
⑤ NO HIT   → the student's PRINTED question-paper pages (only pages the pre-pass classed
            as question paper, never their working) + any attached scheme are copied to
            the extraction inbox with a manifest line, so the bank gains the paper.
            The desk shows "not in the bank — sent for extraction".
```

### ① The canonical key — `lib/paper-key` (pure, tested, shared by site + bot)

Input: the typed paper name, optional student name (to strip), optional first-page text.
Output: `{ exam: 'GCE'|'PRELIM'|'SA1'|'SA2'|'WA'|'TYS'|null, level: 'AM'|'EM'|'H2'|'H1'|…, year, paper: 1|2|null, school: string|null, key: string }`.

Rules, in order:
- SEAB codes on the first page beat everything: `4049/01`→AM P1, `4049/02`→AM P2, `4048/0x`→EM, `9758/0x`→H2; the session line ("October/November 2021") gives the year. "TYS" in the name + a year = GCE of that year.
- Otherwise parse the name: level tokens (am/em/h2/h1/a math/e math), a 4-digit year, `p1|p2|paper 1|paper 2`, exam tokens (prelim/sa1/sa2/wa/mye/eoy), and the rest is the school. School aliases live in one table (`hua yi`, `huayi`, `hyss` → `Hua Yi`) seeded from `questions.school` distinct values.
- `key` = `${exam} ${year} ${level} P${paper}` + (` ${school}` when not GCE), lower-cased — the same shape `scheme-store.paperKey` produces today, so rung 2 keeps working unchanged.
- Ambiguity → `null` fields and a `reasons[]` list. A key with no year or no level never matches anything.

### ② b. Bank grounding for math — `lib/bank-grounding.js` (bot)

- Query `questions` by `(school, year, level, paper)` from the key (GCE: `school='GCE'`). Order by `question_number`.
- Render a scheme block from the rows through the SAME renderer the attached scheme uses (`renderSchemeBlock`): per question, `parts[].label/marks/answer`, `answer`, and `solution` when present. Marks come from `parts[].marks`/`total_marks`; when a row has no marks, that question is listed as "answer only" so the marker never invents a mark split.
- Fingerprint for the guard = the bank rows' `question_text` openings, computed the way `fingerprintOf` does.
- On a trusted match: `groundingSource = 'bank'`, and the rendered scheme is SAVED into `paper_schemes` (source `bank`, `origin_run_id`) so the next hand-in of the same paper is rung 2/3 with no bank query.

### ② c. Library search — `lib/paper-library.ts` (site) + one bot call

- Dropbox app-folder tokens cannot see `/1 ONLINE LESSONS`, so the library index is built ONCE by a Mac job (`scripts/paper-library/index.mjs`, run by hand or by launchd weekly) into Supabase `paper_library` (`key, kind: 'questions'|'solutions'|'answers'|'combined', dropbox_path, size, indexed_at`) using the SAME `lib/paper-key` parser on file names. The marker never lists Dropbox at marking time.
- A hit copies the file(s) to Blob under `mark-paper/papers/<uuid>-<key>-<kind>.pdf` (the buildRunSource blob-store-only rule) and sets `source.paper_pdf_url` (questions) and `source.scheme_source = {pdf_url}` (solutions/answers) on the run BEFORE enqueue — exactly what was done by hand for Kassandra on 3 Sep 2026.
- `.docx` sources are rendered to PDF by the Mac job at index time (Word export, never LibreOffice — see memory `sheet-worker-toolchain`), stored beside the original.

### ③ The guard is not optional

The existing rule (`scheme-store.isMatch`) is the one rule, in one place. Bank and library candidates go through it with the fingerprint of the STUDENT'S printed pages. Two consequences:
- A hand-in that is working-only (no printed questions on the pages) can never be grounded by lookup, only by an attached scheme — so the portal's Submit page tells the student: *"If your working is on separate paper, photograph the question paper too"* (copy in `app/submit`). This is Adrian's "students need to upload the questions as well".
- A typed name that is wrong ("2021" for a 2022 paper) is caught by the fingerprint, not trusted.

### ④ What the run records — `result_json.paper_match`

```json
{ "key": "gce 2021 am p1", "parsed": { "exam": "GCE", "level": "AM", "year": 2021, "paper": 1, "school": null },
  "source": "bank" | "stored" | "library" | "attached" | "none",
  "overlap": { "shared": 9, "share": 0.75 }, "trusted": true,
  "attached": { "paper_pdf_url": "…", "scheme_pdf_url": "…" } | null,
  "extraction": { "sent": true, "manifest": "papers/_INBOX/2026-09-03 xinmin 2021 prelim p2.md" } | null,
  "reasons": [] }
```
The desk's detail view shows one chip from this: **"Grounded on: GCE 2021 AM P1 (bank, 9 questions matched)"**, or **"Not grounded — paper not found; sent for extraction"**, or **"Not grounded — pages carry no printed questions"**. Telegram's landing line gets the same phrase.

### ⑤ Extraction hand-off

- Only when `source === 'none'` AND the pre-pass classed ≥1 page as question paper (`pageClassification[].kind`).
- The bot writes the question-paper page images (and an attached scheme, if any) as ONE PDF to Blob, then the site's `/api/admin/extraction-inbox` (new, `verifyAdminAuth`/bot secret) downloads it into `AdrianMath/papers/` on the Mac that runs the inbox — via the existing Dropbox app folder `/Inbox/papers/` (the Mac job syncs it into `papers/`), since Vercel cannot write to a Mac. Manifest line: key, student-free file name (`<key>.pdf` — never the student's name), run id, what was attached.
- The fleet's resurrection pre-check (`AdrianMath/CLAUDE.md` step 0) already prevents double extraction; the manifest carries the key so the check can use it.
- Student privacy: working pages are never sent. Only printed question pages.

## Checkpoints (what stays human)

- Adrian vets the marking at the desk exactly as now; the chip tells him what it was grounded on, and **Detach** on the chip re-queues the run with `paper_match.source='none'` forced (one click, reversible).
- Extraction output is vetted by the existing fleet rules; nothing enters serving without them.
- The library index job is read-only over Dropbox.

## Triggers and logging

- Fires on every path that creates a run: portal submit, `/admin/mark-paper` ▶/🌙, the bot's `/handin`, and `enqueue` of a saved run. One function, `matchPaperForRun(runId)`, called before the queue pick.
- `job_runs` slug `paper-library-index` (weekly) with a `JOB_RHYTHMS` line in `docs/OPS.md`; missed = amber on `/admin/ops`.
- Per-run: `paper_match` stamp + one console line `[paper-match] <key> → <source> (<shared>/<share>)`. Health-check probes the new site route's 401.

## Phases

1. **Bank grounding for math + the key parser + the stamp + the desk chip** (bot + site). No new tables. Kassandra-class TYS papers and every GCE paper are covered on day one. *Verify through a real marking landing via `remarkRun` (memory `verify-marking-through-remarkrun`), never a probe.*
2. **Library index + auto-attach** (Mac job + `paper_library` table + Blob copy). Covers school prelims the bank has but whose solutions are only in Dropbox, and papers the bank lacks but Dropbox has.
3. **Extraction hand-off + the Submit-page copy** (bot + site + Mac sync). Turn on only after the fleet is un-paused; until then the manifest is written and the desk chip says "queued for extraction".

## Worked examples

1. **"kassandra am tys 2021 p1"**, three pages of working with question numbers only (no printed questions). Key = `gce 2021 am p1`. Bank has 27 rows. Fingerprint from her pages is EMPTY (no printed openings) → guard fails → `source:'none'`, reason `no-printed-questions`. Desk chip: "Not grounded — pages carry no printed questions." (Today's manual fix, attaching the 2021 PDFs, is rung 1 and stays valid.) With Phase 2, the library hit still attaches the 2021 questions + solutions because attachment does not need the fingerprint — the MARKER then reads the printed questions from the attached paper PDF, and the guard is re-run against that.
2. **"Xinmin 2021 Prelim P2"** photographed with the printed booklet. Key = `prelim 2021 am p2 xinmin`. Bank has `AM PRELIM 2021 Xinmin` rows → fingerprint overlap 8/11 → trusted → `source:'bank'` → scheme saved to `paper_schemes` for the next Xinmin 2021 P2.
3. **"Sec 3 WA2 2026 Hua Yi"**, booklet photographed. Bank: nothing for 2026. Library: nothing. → `source:'none'`, question pages → extraction inbox as `wa2 2026 em p1 hua yi.pdf`, chip "sent for extraction". After the fleet extracts it, the NEXT student's hand-in of the same paper is a bank hit.

## Red lines

- Never mark on an untrusted match; never lower `MIN_SHARED`/`MIN_SHARE` per surface.
- Never block or delay marking on a lookup failure — every rung is fail-soft, as today.
- Never send a student's working to the bank or the inbox; never put a student's name in an inbox file name.
- `main` moves only on Adrian's "promote"; bot deploys wait for no marking in flight.
