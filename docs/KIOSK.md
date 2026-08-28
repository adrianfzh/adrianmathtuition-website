# Kiosk & Printable Notes — detailed docs

> Split out of `CLAUDE.md` on 2026-08-04. **MANDATORY reading before touching
> `/kiosk`, `/api/kiosk/*`, `/admin/notes`, or the Dropbox notes plumbing.**
> Root policies: [`../CLAUDE.md`](../CLAUDE.md).

## Kiosk (`/kiosk`) — iPad print station with WhatsApp QR sign-in

Self-service iPad kiosk at the centre: students print notes, revision worksheets and practice.
Device authorised once (admin password → 180-day `kiosk_session` cookie); open/closed gate =
`kiosk_config` mode (closed/open/scheduled) + opening hours in `lib/kiosk-hours.ts`; admin
control at `/admin/kiosk`.

**Student identity (Phase 1, 2026-07-16): WhatsApp reverse-QR pairing — students are HARD-LOCKED
to their own level.** No anonymous browsing.

1. Idle kiosk shows a QR encoding `wa.me/<KIOSK_WA_NUMBER>?text=KIOSK-<6-digit-code>` (3-min TTL,
   auto-regenerates; code from POST `/api/kiosk/pair {action:'create'}`).
2. Student scans → WhatsApp opens prefilled → sends. Bot (`handlers/whatsapp.js` `kioskSignIn`)
   resolves the phone via `identify()` and claims the pairing: POST `/api/kiosk/pair` with
   `x-render-secret` + `{code, studentId, studentName, level, subjects}`.
3. Kiosk polls GET `/api/kiosk/pair?code=` (2.5s) → one-shot `{student, token}` (signed HMAC
   student token, 30 min, `lib/kiosk-student.ts`). UI greets by name, shows only entitled levels,
   5-min idle reset ("Done ✓" button ends session).
3b. **Three-button home screen (2026-08-11)** — a signed-in student lands on 📘 **Learn** /
   📝 **Revise** / ✏️ **Practice**, one big tile each (`KioskClient.tsx`, `HOME_TILES`), with a
   `← Back` on every sub-screen. Learn → `Notes/<LEVEL>` PDFs, Revise → `Revision/<LEVEL>` PDFs,
   Practice → a two-tile choice: 🖨️ **Printed sheets** (`Practice/<LEVEL>` PDFs) or ⚡ **Make me
   one** (the seeded question-bank generator, 5–5d below). The PDF browser is one shared component
   — the button only picks the `kind` passed to `/api/kiosk/notes`. Tiles self-hide when a student
   has nothing behind them (`canPdf` = any entitled notes level, `canGenerate` = any entitled
   practice level); Practice skips its sub-choice when only one side is available.
3c. **📌 "For you today" card (2026-08-11)** — above the three tiles, a gold card showing the
   plan Adrian typed at the END of the student's last lesson (`Next Lesson Plan` on Airtable
   `Lessons`, written in the 📌 *Start next lesson with* box in `LessonModal`). Fetched from
   GET `/api/kiosk/plan` (kiosk device cookie + open-hours gate + signed student token), which
   windows Lessons over the last 28 days with an exclusive upper bound `{Date}<today`, excludes
   Cancelled/Rescheduled, sorts desc and matches `Student[0] === student.id` **in JS** (linked
   records can't be filtered in Airtable — see root CLAUDE.md). Purpose: the student starts work
   without asking Adrian what to do, which is the whole start-of-lesson bottleneck.
   ⚠ **Every failure path returns `{plan: null}`, never an error** — an empty card is invisible;
   an error banner over the three big buttons is a broken kiosk. The `Next Lesson Plan` field
   must exist in Airtable or the card is permanently blank (see `docs/SCHEDULE.md` — the API
   token can't create it, Adrian adds it by hand).
4. Entitlements from Level+Subjects (`deriveEntitlements`): Sec 3–5 E/A Math → EM/AM; IP Math →
   both; JC (H2/H1) → JC2; **Sec 1/2 → S1/S2 practice + notes** (enabled 2026-07-16 — unblocked by
   the sub-group backfill; the `practice_topics` RPC counts via sub-group joins, now also counts
   `parts[].answer`-only questions, AND applies the worksheet's figure gate so picker counts match
   what the sheet can actually serve — diagram-heavy topics show honest small counts until their
   figures are verified). Content routes (`topics`/`notes`/`worksheet`) 401 without the
   `x-kiosk-student` token and 403 on a non-entitled level — enforced server-side, admin bypasses.
5. **Print cap 4 GENERATED worksheets/day per student** (SGT day) via POST `/api/kiosk/print-log`
   (gates `window.print()`, logs to `kiosk_prints`). GET returns `{used, remaining}` for the "n/4"
   chip, which now renders only on the generator screen. **Dropbox PDFs are uncapped** (Adrian,
   2026-08-11) — a Learn/Revise/Practice tile opens the temporary link and the iPad's own print
   dialog does the rest, so there is no `window.print()` to gate and nothing is logged.
5b. **Deterministic daily draw** — the worksheet is seeded on `SGT-date|level|topic|tier`
   (seeded Fisher–Yates over an `.order('id')`-pinned pool; helpers in `lib/kiosk-draw.ts`,
   unit-tested incl. a pinned permutation), so students printing the same topic+tier the same
   day get the SAME sheet (they can discuss); reprints are identical; counts slice one shared
   order (print 8 then 15 → Q9–15 are new). Rotates at SGT midnight. The shuffle runs over the
   **FULL answer-gated pool** with the count slice LAST (fixed 2026-07-16: the old POOL_CAP=120
   applied *before* the shuffle permanently starved every row past position 120 in id order —
   69 of AM Trig (Graphs)' 189 rows could never print). Only the RPC's 400-row fetch cap bounds
   the pool now; any future cap must slice *after* the shuffle.
5c. **Pool is ANSWER-gated, not solution-gated** (fixed 2026-07-16): eligibility = has a
   printable answer (top-level `answer` OR any `parts[].answer`, checked in JS post-flatten)
   + not-deleted + text-only-or-verified-figure. The old `solution NOT NULL` filter was an
   AI-pool leftover that hid ~80% of the extracted bank. Fetch cap 400 → answer gate → seeded
   shuffle over the whole gated pool (no post-gate cap).
5c-iii. **Legacy-syllabus gate** (2026-08-28): `questions.legacy_syllabus = true` marks cut
   content — old-syllabus AM 4047 topics (Modulus Functions, Power Graphs) and, as workers
   extract TYS wave 2, 9740-only H2 material. The `kiosk_pool` RPC (and the practice family:
   `practice_pool`, `practice_next`, `practice_subgroups`) carries `and not q.legacy_syllabus`,
   so flagged rows stay in the bank for reference but never serve to students on any surface
   (kiosk, bot worksheets, portal practice). Extraction workers set the flag at write time
   (batch rule in the pipeline repo's CLAUDE.md); ~115 rows backfilled at launch.
5c-iv. **Open-figure-flag gate** (2026-08-29, DB-side): a question whose figure Adrian
   flagged in /admin/figures-bank (`figure_flags.status='open'`) must not serve until the
   figure is fixed. Enforced inside the SERVING RPCs themselves — `kiosk_pool`,
   `practice_next`, `practice_candidates` each carry
   `and not exists (select 1 from figure_flags ff where ff.question_id=q.id and ff.status='open')`
   (migration `open_flag_exclusion_serving_pools`; partial index `figure_flags_open_qid`).
   Every consumer (kiosk, bot worksheets, portal practice, assignment picks, print) inherits
   it, and flipping a flag to `'fixed'` auto-releases the question — no cache, no extra step.
5c-ii. **Figure crops resolve via `lib/kiosk-worksheet-images.ts`** (fixed 2026-07-16): the
   `questions.image_url` JSON array holds bare paths (`<file>.png` /
   `question_images/<file>.png`) **or `{url,pos}` objects** (the 2025 EM batch, ~270 rows —
   the old `String(entry)` printed `[object Object]` URLs for all of them). Part-level
   figures (`parts[].image_url` / `image_url_after`, relative or full URL) print inline as
   markdown images at their position — previously dropped, so figure-dependent questions
   (e.g. Mayflower 2024 AM Q10) printed without their graphs. Unit-tested; don't re-inline
   this logic in the route.
5d. **Type A revision worksheets** — "Worksheet type" toggle (✏️ Practice only / 📘 Notes +
   practice). `card=1` on `/api/kiosk/worksheet` attaches the topic's **`topic_cards`** row
   (math Supabase; one per kiosk-level+canonical-topic; `content_md` = markdown+KaTeX, 1-page
   budget; `draft`→`approved` workflow, drafts print with a DRAFT watermark). Card renders as
   page 1 (facts/techniques/traps, blockquotes = boxed formula panels), questions from page 2.
   Cards are authored by the Cowork notes session per `~/Desktop/AdrianMath/TOPIC_CARD_SPEC.md`;
   2 AM pilot drafts seeded (Coordinate Geometry, Circles). Types B (worked-example paired) and
   C (mixed-topic) planned — B needs the S1 sub-group backfill for example↔question matching.
6. **Answers always print inline** — one `[Ans: …]` line closing each question after the working
   space, right-aligned, orange `#843C0C`, KaTeX coloured too (STYLE.md house rule). No answers-at-
   back section, no toggle. Name line prefills the student's name.

7. **The pool query is SHARED with the bot** (2026-08-22) — `lib/kiosk-pool.ts` owns the
   `kiosk_pool` RPC call, the answer gate and the `SEED_LEVELS` map (kiosk token →
   `questions.level` values). `/api/kiosk/worksheet` and the bot's `/api/bot/worksheet` both go
   through it, so the two worksheet surfaces can never drift on what is servable — in
   particular on the never-worked-solutions / never-originating-school invariants. Behaviour
   for the kiosk is unchanged by the extraction. **Don't re-inline the query in a route.**

## Worksheet-on-demand for the bot — `POST /api/bot/worksheet`

A student or parent asks the Telegram/WhatsApp bot for practice on a topic; the bot POSTs here
and forwards the returned Blob URL. Auth is the bot↔website `x-render-secret` handshake (same as
`/api/explanations`), so this is NOT a student-facing route and carries no kiosk cookie/level lock.

- Body `{level, topic, tier?, count?, answers?}`. `level` is a **`questions.level`** value
  (`S3_AM`, `JC1`, `EM`, …) — `lib/bot-worksheet.ts` maps it onto the kiosk level token, and that
  alias map is unit-tested as the exact inverse of `SEED_LEVELS`. `topic` is matched
  case/punctuation-insensitively against the level's `practice_topics`; an unknown one 400s with
  the full `validTopics` list so the bot can offer a menu. `count` defaults to 8, hard cap **12**
  (a WhatsApp sheet is a sitting, not a paper — 12 × 17mm/mark is already ~12 pages).
- Same seeded daily draw as the kiosk (`drawSeedKey(levelKey, topic, tier)`), so a repeat request
  the same SGT day returns the same questions.
- `{dry:true, level, topic}` → `{ok, poolSize}` with no Puppeteer and no Blob write. That's the
  `bot-worksheet` health-check probe (S3_AM · Binomial Theorem), which fails on an EMPTY pool —
  a sheet with no questions is the one thing this must never send a parent.
- PDF: `lib/render-bot-worksheet.ts`, a straight port of the kiosk PRINT_CSS (Times New Roman
  9.5pt, navy caps brand over the orange rule, explicit question numbers, marks right-aligned,
  blank marks-proportional working space). **Two deliberate differences from the kiosk sheet:**
  answers are never inline — `answers=true` appends a final Answers page — and the stem-level
  marks read `[3 marks]`, injected inside the last `<p>` so the float lands on the question's
  last line instead of dropping to one of its own.
- Blob path carries a fingerprint of the drawn question ids. Vercel Blob serves an overwritten
  path from CDN cache for up to a month, so without it a mid-day pool change would hand the bot
  fresh `questionIds` alongside a cached PDF of the older draw.

Supabase (math project): `kiosk_pairings` (code pk, claim/consume timestamps, student fields),
`kiosk_prints` (print log). Both RLS-on, service-role only.

**Env: `KIOSK_WA_NUMBER`** (digits only, the Twilio WhatsApp business number) — REQUIRED in Vercel
for the QR to be scannable; without it the kiosk shows a manual "WhatsApp KIOSK-<code>" fallback.
SET (2026-07-16) to `6580164142` — Adrian's real SG WhatsApp Business sender — in Vercel
(Production + Preview dev) and `.env.local`. ⚠ NOT the Twilio sandbox `14155238886` (that sender
is OFFLINE; the bot's `TWILIO_WHATSAPP_FROM` fly secret was also updated to the SG number).

✅ **Bot side DEPLOYED** (2026-07-16, rebased as `d0cb2c0` after reconciling with Mac B's
commits) — the full sign-in loop is live end-to-end on the preview. Phase 2 (planned):
recommended-for-you topics from lesson progress, homework pickup, exam-season packs.
Phase 3: print → photograph → AI-mark loop.

## Printable PDFs — Dropbox drop-in folder (`/admin/notes`, kiosk Learn/Revise/Practice)

Adrian saves a DOCX → exports a PDF into his Dropbox app folder → it appears on the
website. **Nothing is copied or synced**: every page load lists Dropbox live, and each
click mints a fresh ~4h temporary link (`/api/admin-notes/dropbox-open`), so a listed
link is never stale. Auth: refresh-token OAuth (`DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET`
/ `DROPBOX_REFRESH_TOKEN`), app-folder scoped to `Dropbox/Apps/AdrianMathNotes/` — the
site can see nothing else in his Dropbox. Health-checked every 6h (see the probes below).

**Four kinds, one folder layout — encoded ONLY in `dropboxFolderFor()` (`lib/notes-list.ts`,
unit-tested). Never re-derive a folder path in a route:**

| Kind | Dropbox path | Surfaces | Legacy Airtable/Blob merge |
|---|---|---|---|
| `notes` | `/Notes/<LEVEL>` e.g. `/Notes/AM` | `/admin/notes/<level>` + kiosk 📘 **Learn** | yes (`PrintNotes` table) |
| `revision` | `/Revision/<LEVEL>` e.g. `/Revision/AM` | `/admin/notes/<level>` + kiosk 📝 **Revise** (opened to students 2026-08-11) — worksheets WITH worked examples | no — Dropbox only |
| `practice` | `/Practice/<LEVEL>` e.g. `/Practice/AM` | `/admin/notes/<level>` + kiosk ✏️ **Practice → Printed sheets** (both new 2026-08-11) — summary/formula page + questions, no worked solutions | no — Dropbox only |
| `prelim` | `/Prelim/<LEVEL>` e.g. `/Prelim/AM` | `/admin/notes/<level>` only (2026-07-30) — 🎯 Prelim segment; O-Level EM/AM + JC prelim practice sets (S1/S2 valid but unused) | no — Dropbox only |

`KIOSK_KINDS` (same file) is the student-visible subset — `notes`/`revision`/`practice`.
`/api/kiosk/notes` validates against it, so `prelim` 400s there and stays admin-only.
Entitlements are per-LEVEL, not per-kind: one `entitlements.notes` list gates all three
student kinds (`entitlements.practice` separately gates the question-bank generator).

- Levels are the same five slugs everywhere: `s1 s2 em am jc`.
- **Legacy-root fallback (transition shim, 2026-07-28)** — notes used to sit loose at the
  app-folder root (`/AM`). `legacyDropboxFolderFor()` makes an empty `Notes/<LEVEL>` fall
  back to `/<LEVEL>` so the deploy and the Dropbox move needn't be simultaneous. **Delete
  the fallback + its test once the root level folders are gone.**
- **Listing is non-recursive by design** — a PDF must sit loose in the level folder;
  `Notes/AM/Trig/foo.pdf` is invisible. A folder that doesn't exist yet lists as empty
  (Dropbox `not_found` is swallowed), so a typo'd path fails SILENTLY — hence the test.
- The site NEVER writes to Dropbox (`lib/dropbox.ts` = `listFolder` + `getTemporaryLink`
  only), so it can't create these folders — they're made by hand in Dropbox.
- **The `revision-worksheet` skill writes into these same folders**, and its `kind` decides
  the kiosk button: `worked` → `Revision/<folder>` (Revise), `notes` → `Practice/<folder>`
  (Practice, S3/S4 collapsed onto the subject folder). Both kinds landed in `Revision/`
  until 2026-08-11, which filed summary+questions sheets in the worked-examples pile —
  routing now lives in `out_folder()` (`.claude/skills/revision-worksheet/revision_lib.py`).
- Filename is the display title (`titleFromFilename`: strip `.pdf`, `-`/`_` → spaces).
- `/api/admin-notes?level=am&kind=notes|revision|practice|prelim` (400 on a bad kind);
  `/api/admin-notes/counts` returns `{counts, revisionCounts, practiceCounts, prelimCounts, total}`
  for the hub pills (📝 revision, ✏️ practice; each hidden at zero).
- **Health-checked every 6h**, one probe per student-facing folder: `dropbox-notes` and
  `dropbox-revision` go through `listPrintablesForLevel` on EM and FAIL at 0 files;
  `dropbox-practice` uses raw `listFolder` instead and treats 0 PDFs as OK — Practice/ is
  still filling up, but a *missing* folder must still alert, and `listPrintablesForLevel`
  would swallow that `not_found` as "no files". Flip it to fail-at-0 once Practice is stocked.
- Prelim practice sets stay **admin-only** (Adrian, 2026-07-30). Opening a new kind to
  students = add it to `KIOSK_KINDS` + a tile in `KioskClient` + a health-check entry.
- **New folders are made by hand in Dropbox** — the site can't create them. `Practice/`
  and its seven level folders were created 2026-08-11 (AM, AM G2, EM, EM G2, JC, S1, S2).
- The Blob-upload path (`upload-token`/`register`, rename/replace/delete in Edit mode) is
  the LEGACY notes source and stays notes-only; revision, practice and prelim have no
  upload UI — they're Dropbox drop-ins only.
