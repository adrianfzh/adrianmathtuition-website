# SPEC — Telegram worksheet menu (agreed 5 Sep 2026)

One `/make` menu in Adrian's Telegram, five kinds of worksheet behind it, two
lanes underneath. Adrian's words: *"give me 1–5 … allow me to select the
levels, allow me to key in the topics manually (I can write the difficulty
level + number of questions as well)."*

## The five kinds

| # | Kind | Skill that makes it | Lane | Lands in |
|---|---|---|---|---|
| 1 | Revision worksheet with worked examples | `revision-worksheet` | queued | `Revision/<folder>` (kiosk **Revise**) |
| 2 | Practice worksheet with notes/concepts at the front | `copy-revision-worksheet-with-different-practice --kind notes` | queued | `Practice/<folder>` (kiosk **Practice**) |
| 3 | Questions only, no notes | `POST /api/bot/worksheet` (already live) | **instant** | Vercel Blob → sent in-chat as PDF |
| 4 | Fresh practice bolted onto a sheet you already have | `copy-revision-worksheet-with-different-practice --kind worked` | queued | beside the original in `Revision/<folder>` |
| 5 | A full prelim paper to blueprint | `prelim-paper` | queued | `Prelim/` |

Not on the menu: `self-study-sheet` (needs a student's marked paper) and
`finish-practice-set` (needs an uploaded PDF).

## Why two lanes (Adrian asked for this simply)

Kind 3 is *picking*: the questions already exist, the server grabs some and lays
them out — about a second, so the bot hands back the PDF in the same tap.
Kinds 1, 2, 4, 5 are *writing*: choose which questions teach the topic, write the
worked solutions in Adrian's voice, check every number. Minutes, not
milliseconds, and a Telegram button times out at ~15 s. So those four **queue**:
tap → "🛠 on it" → a headless session builds it → the .docx arrives in the chat.
That wait is also where Adrian's sign-off lives — he amends the sheet before a
student sees it.

## The three flows behind one menu

```
/make
  → kind (5 buttons)
  → level (S1 · S2 · S3 EM · S3 AM · S4 EM · S4 AM · JC)      [kinds 1–4]
  → ⋯ then, by kind:
     1, 2, 3  topic (typed, fuzzy-matched to the level's canonical list; or the
              paged button list) → difficulty + count (typed or buttons) → confirm
     4        topic → the bot lists Adrian's existing sheets for that topic
              (usually 1–3; one match skips the pick) → count → confirm
     5        paper (AM-P1 · AM-P2 · EM-P1 · EM-P2 · JC-P1 · JC-P2, later S1/S2)
              → preset (standard · top-school-hard · …)
              → topics: PRESETS first ("all" / "no Sec 1 topics" / …), then a
                numbered list you reply to ("drop 3 5 9"), then typed names
                ("exclude circles, vectors") — never a 20-button toggle grid
              → confirm
```

Typed shortcuts everywhere: `/make 3 s3 am binomial theorem advanced 6` reuses
`lib/worksheet.js` `parseWorksheetArgs`. Kind 3 typed = the existing
`/worksheet` one-liner, unchanged.

**Difficulty** is banded on **marks**, not `questions.difficulty` — that column is
97–99 % "Standard" at every level (checked 5 Sep 2026) and discriminates
nothing. Bands are per-topic tertiles of `total_marks` over the eligible pool
(`lib/marks-band.ts`, pure, tested): *standard* = lowest third, *intermediate* =
middle, *advanced* = top; a "2/2/2" request draws from each. Kiosk tiers are
untouched — the band rides only the bot endpoint (`band` in the body, in the
Blob path so same-day sheets don't collide).

**Topic exclusion (kind 5)** feeds the *builder*, not a filter at the end: each
blueprint slot's `topic_pool` loses the excluded topics and re-normalises; a slot
whose pool empties falls back to the paper's overall pool. The worker reports
which slots fell back so the Telegram says so.

## Data

`worksheet_jobs` (Math project; DDL in the bot repo,
`supabase/migrations/0009_worksheet_jobs.sql` — the bot repo owns the schema):

```
id uuid pk · kind smallint (1|2|4|5) · level text · topic text null
params jsonb   -- {count, band, sheet, paper, preset, exclude:[…], requested_text}
requested_by bigint (Telegram chat id) · label text (what the Telegram card says)
status text 'queued'|'claimed'|'done'|'failed'|'cancelled' · claimed_by · claimed_at
heartbeat_at · stage text · attempts int · result jsonb · error text
created_at · completed_at
```

Same lease/heartbeat/attempts contract as `sheet_jobs` (`lib/sheet-jobs.ts`):
LEASE 40 min, MAX_ATTEMPTS 3, cancel is terminal.

## API — `/api/admin/worksheet-jobs` (admin bearer; the bot holds `ADMIN_PASSWORD`)

```
GET                                   → { jobs }            newest 30
POST { kind, level, topic?, params, requested_by, label } → { job }   queue
POST { action:'next', by }            → { job|null }        worker claims (lease)
POST { action:'beat', id, stage? }    → { ok } · 409 {cancelled:true, stop:true}
POST { action:'done', id, result:{docx_path, pdf_path?, summary, verified?, fallbacks?} }
                                      → { ok }              Telegrams Adrian + sends the files
POST { action:'fail', id, error }     → { ok, requeued }
POST { action:'cancel', id }          → { ok }
```

Pure logic in `lib/worksheet-jobs.ts` (tested): `pickNextJob`, `claimExpired`,
`sanitizeResult`, `completionMessage`, `cancelState`, `labelFor(job)`.

## Worker — `scripts/worksheet-worker/` (clone of `scripts/sheet-worker/`)

launchd `com.adrianmath.worksheetworker`, tick 900 s, PID lock, one peek curl,
headless `claude -p` with `WORKER_PROMPT.md`, Opus, effort high, 70 min cap.
The runbook dispatches on `job.kind`:

- 1 → `revision-worksheet` skill (`rw.py plan/practice/render`) — headless
  adaptation: choose the arc itself and REPORT it in `result.summary`.
- 2 → `revision_lib.py --kind notes --bank <bank> --topic … -n <count>`
- 4 → `revision_lib.py --kind worked --folder <folder> --topic … -n <count>`
  with `params.sheet` naming the base document.
- 5 → `prelim-paper` skill with `params.paper/preset/exclude`.

Then: file to Dropbox at the kind's home, `done` with the paths. Adrian's
checkpoint is the .docx he edits; nothing reaches a student from here.

## Doctrine fit

1. **Spec** — this file. 2. **Tools** — the queue route + the existing endpoint.
3. **Checkpoint** — every queued kind lands as a .docx for Adrian to amend;
   kind 3 is questions-only and already gated (no solutions, no school names).
4. **Trigger** — Adrian's tap (on-demand; the worker is the clock).
5. **Log + alarm** — `done`/`fail` stamp `job_runs` as `worksheet-worker`; **no
   `JOB_RHYTHMS` line** (on-demand workers get none — docs/OPS.md); the
   health-check probes the route's 401.

## Phases

1. Website: `lib/worksheet-jobs.ts` + tests, `/api/admin/worksheet-jobs`, health-check probe. *(this PR)*
2. Bot: migration `0009`, `/make` menu (`lib/make.js` pure + tests, `handlers/make.js`), `wk_*` callbacks, /help + command menu. *(this PR)*
3. Website: `lib/marks-band.ts` + tests; `band` on `/api/bot/worksheet`. *(this PR)*
4. Worker: `scripts/worksheet-worker/{run.sh, WORKER_PROMPT.md, install.sh, plist}`. *(this PR; Adrian runs install.sh)*
5. `prelim-paper`: honour `exclude` (slot pools re-normalised, fallbacks reported). *(this PR)*
6. Follow-on: derive S1/S2 EOY blueprints (97 S2-P1, 80 S2-P2, 107 S1-P1, 78 S1-P2 papers in the bank) → Sec 2 EOY appears in kind 5.
7. Later: Telegram Mini App on `/admin/worksheet-builder` for the topic form.

## Red lines

- Kind 3 stays model-free and deterministic; never leaks solutions or schools.
- The queued lanes never write to a student-facing surface; Dropbox only.
- No `never` in any sheet text (Adrian's style rule) — the skills already enforce it.
- `WEBSITE_BASE_URL` is the `www` host (apex 307 drops Authorization).
