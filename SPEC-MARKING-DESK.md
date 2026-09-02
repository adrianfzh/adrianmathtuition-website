# SPEC — The Marking Desk (`/admin/desk`)

> Adrian, 2 Sep 2026: *"now i have 3 places to look at for marking — mark paper,
> triage, and papers, it's complicated and not user friendly. the flow should just
> be a marked paper appears (with analysis and total marks on the first page) and
> self learning sheet auto generates, i vet the marked copy and the self learning
> sheet, approve, then release."* Go-ahead given the same night.

## The idea in one line

One page, one queue of papers moving through four states, one detail view where
Adrian vets the script and the sheet side by side and presses **Approve & release**.
The three existing pages keep working (nothing is deleted); the desk is the new
front door, and the admin hub's marking tile points at it.

## States (derived, never stored)

Every `paper_marking_runs` row with `result_json.results` and no `archived_at`
lands in exactly one lane, computed server-side in a pure, tested function
(`src/lib/desk-state.ts`):

| lane | rule | what Adrian does there |
|---|---|---|
| **Needs a student** | `student_id` is null | tag it (inline picker, same as `/admin/papers`) — nothing else can happen until then |
| **Marked, sheet on the way** | tagged, not released, no `sheet_jobs` row with status `done` for this run (queued / claimed / failed / none) | wait; shows the sheet stage (`queued` · `drafting` · `verifying` · `failed: <reason>` with a **Retry** button) |
| **Ready to vet** | tagged, not released, a `done` sheet job exists | open the detail view, vet, approve |
| **Released** | `released_at` set | read-only; search + the folder link |

Auto-queue: a sheet job is created **the moment marking finishes** for a tagged run
(website: where `/api/admin/mark-paper` persists results with a `student_id`;
bot hand-ins: `deliverQueuedRun` already calls the website after marking —
add the sheet-jobs POST there, same auth it uses for `mark-paper-pdf`). Untagged
runs queue the sheet automatically the moment they get tagged. Duplicate guard
already exists in `/api/admin/sheet-jobs` (409 while one is in flight).

## The page

`src/app/admin/desk/page.tsx` (client component, admin cookie auth, PWA
`layout.tsx` like the other admin pages, mobile-first because he vets on the
iPad).

**Queue strip** at the top: four lanes as tabs with counts. Default tab = *Ready to
vet* when it is non-empty, else *Marked, sheet on the way*. Rows show student ·
paper · total (`74/90`) · marked-on date · sheet stage · ⚠ flags
(`pdf_stale`, sheet failed, amended copy newer than attached). Tap a row → detail.

**Detail view** (`?run=<id>`), two panes on wide screens, stacked on the iPad in
portrait:

- **Left — the marked script.** Every annotated page image in order
  (`result_json.annotated_photos[].url`; use `url_with_solutions` when present),
  with the questions on that page listed beneath it: `Q11 · 1/5`, the marker's
  per-part `error_summary`, and **Agree / Override** on EVERY question (not only
  flagged ones) — both call the existing `mark-triage` actions with
  `questionIdx`. A question already reviewed shows ✓. The cover page (rendered
  from `/api/admin/paper-analysis?runId=`) sits above page 1 so vetting starts
  from "where the marks went".
- **Right — the sheet.** The `Practice Again.pdf` from the paper's Dropbox folder
  (temporary link via the existing `sheet-open` route pattern) in an
  `<iframe>`/`<object>`; a **Re-queue sheet** button with an optional focus box
  (POST `/api/admin/sheet-jobs {runId, focus}`); the sheet's diagnosis list
  (`result_json.diagnosis.skills`) as a compact ranked list so he can compare
  it with the cover.
- **Header bar**: student (link to `/admin/students/[id]`), paper, total with the
  override tally, 📂 folder link (`dropboxWebUrl` from `lib/paper-folder.ts`),
  **My copy**: `Marked (Adrian).pdf` found / not found / newer than attached, with
  an **Attach my copy** button (`mark-triage {action:'attach-amended-from-dropbox'}`),
  **Rebuild PDFs** (POST `/api/admin/sheet-jobs`-style rebuild — reuse
  `lib/rebuild-run-pdfs.ts` through a small admin route `/api/admin/desk/rebuild`),
  and the one big button: **Approve & release** → POST
  `/api/admin/release-with-sheet {runId}` (it already attaches the amended copy by
  name, assigns the sheet, releases, notifies). Disabled with the reason shown
  while: pending reviews > 0 · no `done` sheet · `pdf_stale` without an amended
  copy · untagged. A secondary **Release without sheet** exists but is behind a
  confirm.

**Data**: one GET `/api/admin/desk?lane=&days=60` returning the lane rows (joins
`paper_marking_runs` + latest `sheet_jobs` per run + `portal_assignments` count),
and GET `/api/admin/desk/run?runId=` for the detail (run row, results, annotated
photos, diagnosis, sheet job, folder listing → amended-copy status, pending count
from `lib/mark-triage.ts`). Both read with the service key, admin-auth gated.
No new writes: every mutation goes through the existing routes listed above.

## Rules

- Nothing here deletes or renames files, and nothing releases without the click.
- Pure logic in `lib/` with tests: lane derivation, "approve is allowed" reasons,
  amended-copy-newer check (reuse `paper-folder.ts`).
- Health check: the new GET must appear in `/api/health-check` (401 probe).
- Hub: the 🖊 marking tile on `/admin` points at `/admin/desk`; the old three
  stay reachable from a small "Other views" row on the desk.
- `docs/MARKING.md` gets a section "The marking desk" and `SPEC-TEACHING-CYCLE.md`
  step table gets one line saying the desk is where steps 2–7 now happen.
