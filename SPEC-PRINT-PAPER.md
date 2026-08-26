# SPEC — "Print a paper": student self-serve printable papers

> Status: **BUILT (v1) 2026-08-26** — website side complete on Adrian's go-ahead
> ("#4 → do it"): migration, `lib/print-paper.ts` (+tests), POST/GET
> `/api/portal/print-paper`, on-demand `…/pdf`, `/app/print` page, the
> practice-page entry card, `?paper=` submit linkage, health-check probe.
> Deviations from the first draft: PDFs are rendered **on demand** from the
> stored row (practice-pdf's nothing-stored reasoning), never kept in Blob;
> the papers list + allowance ship from GET /api/portal/print-paper. Still
> pending: the **bot-side grounding** (read `generated_question_ids` off the
> run and feed the stored solutions to the marker — separate bot-repo session)
> and a Home bento card (deliberately skipped; the bento identity system is
> its own change). Written after the grail.moe Practice teardown.

## Why (one paragraph)

Grail.moe now sells self-serve printable mock papers and topic sheets (S$15/mo,
~68k auto-extracted questions, no feedback loop). We already own every pipeline
they charge for — blueprint assembly, an eligibility-gated QB pool, two PDF
renderers — but only Adrian can drive them. This feature hands students the
button, and then does the thing Grail structurally cannot: **every generated
paper is pre-registered as an expected hand-in**, so when the student submits
their attempt, the marker already knows every question, mark scheme and solution
on it. Grail prints and forgets; we print and collect.

## The three presets

| Preset | What the student gets | Draws from |
|---|---|---|
| **Mock exam** | Full AM/EM P1 or P2, exam header, marks-scaled working space, answer key on the last page | `lib/prelim-builder.ts` slot walk over `data/paper-blueprints.json` (mined from 474 real papers) |
| **My topics** | Chosen topics + question count each, working space, answers gathered at the back | `lib/kiosk-pool.ts` (`fetchWorksheetPool`) + `lib/kiosk-draw.ts` |
| **Fix my weak spots** | Same sheet shape as My topics, but topics come weighted by the student's own dropped marks | mastery/notebook rollup (`lib/mastery.ts`, `lib/notebook.ts`, `paper_marking_runs`) → then the My-topics draw |

Weak spots is the differentiator (needs marking history no competitor has). If it
slips, ship Mock + My topics first — the preset enum leaves room.

## Reuse map (all existing, all tested — do NOT rebuild)

- **Blueprint walk**: `lib/prelim-builder.ts` (pure, `prelim-builder.test.ts`); candidate-fetch pattern in `/api/admin/prelim-builder/generate`.
- **Mock rendering**: `lib/render-prelim.ts` → `renderPrelimPDF` (already powers `/api/admin/prelim-builder/export`; Puppeteer singleton, 60s maxDuration proven on Vercel).
- **Worksheet rendering**: `lib/practice-pdf.ts` (print-first HTML, answers-at-back, KaTeX via `lib/math-inline`) — the same layout students already download from /app/marking.
- **Eligibility + draw**: `lib/kiosk-pool.ts` is THE gate (answer-present, not-deleted, watermark-clean/engine-drawn figures only, no school metadata, never solutions) shared by kiosk + bot; this feature becomes its third caller — never query the QB directly.
- **Hand-in linkage precedent**: SPEC-ASSIGN.md / `portal_assignments` — `/app/submit?assignment=` already locks a paper name and tags the run. Print-paper copies this exact shape.
- **Level resolution**: student's level/stream from the Airtable Students record via `currentStudent()` (same as practice picker).

## Locked decisions (defaults — change only via Adrian)

| # | Decision | Default | Why |
|---|---|---|---|
| D1 | Where it lives | `/app/print`, entered from a card on `/app/practice` + a Home bento card. **No new nav tab** | Nav is full; print is a practice verb |
| D2 | Rollout gate | Rides the full-portal switch (`MARKING_ONLY_BETA` off) OR a `PRINT_PAPER_STUDENTS` allowlist for a pilot, same pattern as `WORKSHEET_STUDENTS` | Beta stays marking-only |
| D3 | Generation allowance | **2 papers per SGT week** per student (const in `lib/portal-print-limit.ts`, tested) — allowance-framed copy like the daily hand-in slot | Cost brake (Puppeteer + figure bandwidth) and keeps papers meaningful |
| D4 | Pre-registration storage | **New table `portal_generated_papers`** (below), NOT a new `portal_assignments.kind` | Assignments are cap-EXEMPT and auto-release — self-generated papers must stay cap-COUNTED and manually released; overloading `kind` would fork every status rule |
| D5 | Hand-in cap | Submitting a generated paper **spends the normal daily slot** | Adrian-initiated work is exempt; self-initiated is not (same cost brake as today) |
| D6 | Release | Manual, via triage, like portal hand-ins today | The one-human-glance rule stands |
| D7 | Answers on the sheet | Mock: answer-key final page. Topics/weak-spots: answers-at-back page. **Never worked solutions** | Kiosk invariant; solutions arrive via marking or /solutions |
| D8 | Determinism | Mock: fresh draw per generation (it's a one-off artifact, stored). Topics: reuse the kiosk daily-draw seed | Shared-sheet promise stays intact for kiosk; a stored paper needs no seed |

## Schema — `portal_generated_papers` (Supabase, math project)

```sql
create table portal_generated_papers (
  id uuid primary key default gen_random_uuid(),
  airtable_student_id text not null,
  preset text not null check (preset in ('mock','topics','weakspots')),
  level text not null,            -- EM | AM | JC…, resolved server-side
  paper text,                     -- P1 | P2 (mock only)
  title text not null,            -- "AM Paper 1 — printed 26 Aug", editable never
  question_ids jsonb not null,    -- ordered [{id, pos, marks}] — the pre-registration
  total_marks int not null,
  status text not null default 'open' check (status in ('open','submitted')),
  run_id text,                    -- paper_marking_runs.id once handed in
  created_at timestamptz not null default now()
);
-- RLS: student SELECTs own rows (join portal_accounts on airtable_student_id);
-- all writes via service role. Same policy shape as portal_assignments.
```

No `expired` status in v1 — an open paper just sits; the weekly allowance is the
brake, not expiry.

## Routes

1. **`POST /api/portal/print-paper`** — session auth → resolve level → check
   weekly allowance → draw per preset → insert `portal_generated_papers` →
   render PDF (render-prelim for mock, practice-pdf layout for the others) →
   return `{ paperId, pdfUrl }` (Blob-stored PDF under the student's portal
   prefix, like submit photos). 60s maxDuration, `runtime: nodejs`.
2. **`GET /app/print`** — the page: three preset cards (copy tone = the practice
   picker), allowance chip ("2 paper prints left this week — renews Monday"),
   list of this student's generated papers with ⬇ PDF + "Hand this one in" →
   `/app/submit?paper=<id>`.
3. **`/app/submit?paper=<id>`** — mirrors `?assignment=`: ownership-check the
   paper row, lock the paper name to its title, POST carries `paperId`.
4. **`/api/portal/submit`** — when `paperId` present: verify ownership +
   `status='open'`, stamp `result_json.generated_paper_id` + the ordered
   `question_ids` onto the run, flip the row to `submitted` + `run_id`. Daily
   slot still spends (D5).

## Bot-side (separate repo, separate session — do NOT bundle)

When a queued run carries `generated_paper_id` question ids, the marker fetches
those QB rows (question text + parts + solutions) and grounds marking on them —
same grounding shape as assignment worksheets. Website ships first and degrades
gracefully: an unmodified bot just marks the photos as it does today.

## Build order

1. Migration + RLS (+ `list_tables` check first, per CLAUDE.md).
2. `lib/portal-print-limit.ts` (weekly allowance count, SGT week — pure + test).
3. `lib/portal-print-draw.ts` (preset → question list; pure where possible + test;
   weak-spots rollup isolated so it can ship last).
4. `POST /api/portal/print-paper` + Blob storage of the PDF.
5. `/app/print` page + practice-page card + Home card.
6. Submit linkage (`?paper=` + route stamping).
7. Health-check entry (`timed('print-paper', …)` — dry-run draw, no PDF) in the
   same PR (testing & monitoring policy).
8. Announcement: set `CURRENT_ANNOUNCEMENT` (lib/portal-announcement.ts) when it
   opens to students.

## Open questions for Adrian

1. D3 allowance size — 2/week right? (Grail free tier is 1 paper + 5 questions/wk.)
2. Does JC get Mock (no JC blueprint in paper-blueprints.json — topics-only for JC v1?).
3. Pilot allowlist or straight to full-portal flip?
