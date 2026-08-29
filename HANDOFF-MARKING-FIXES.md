# HANDOFF — Marking fixes after Alessi re-mark #2 (2026-08-29)

> **For the next session (any account/machine).** Adrian reviewed re-mark #2 and approved
> this fix list; decisions below are his, verbatim where quoted. Read
> [`docs/MARKING.md`](docs/MARKING.md) first. Bot repo: `~/Desktop/adrianmath-telegram-math-bot`
> (Fly.io, `npm run deploy` manual, **node test runner not vitest**). Website repo: this one.
>
> ⚠ **Student data**: Alessi Tay's page images, marking JSONs, annotated PNGs and any
> remark-response JSON are student data — scratchpad only, never stage/commit/publish.
> Evidence is re-derivable from the run row (below), not from any prior session's files.

## Context

- Run **`48b098aa-70ee-4b84-b578-20581e00a345`** (Supabase `paper_marking_runs`, project
  `nempslbewxtlikfzachi`): Alessi Tay, paper_name **"2021 OLevel Amath Paper 1"**, 49/84,
  `max_source:'counted'`, **unreleased**. This is re-mark #2, made after the accuracy
  bundle (bot `d03a032` = Fly v1745, site `027976a`) shipped. Older runs: `b7cf61ba…`
  (38/66, **RELEASED — leave until Adrian's release-with-note**), `508a48c3…` (41/64,
  superseded). **Never release or delete any run; his tap is the gate.** `AUTO_RELEASE_PAUSED`
  stays `true` in `src/app/api/admin/mark-triage/route.ts`.
- The run's `result_json` holds the evidence for everything below: `page_classification`
  (photo 0 mixed Q1–7, photo 1 mixed Q8–10, photo 2 question_paper Q11–14, 3–10 working),
  `reconciliation.superseded_results/_parts` (the printed-page 0-mark reads), and
  `annotated_photos` (photos 1–2 show the stray-ink bug).
- True paper total is **90** (2021 O-Level AMath P1). The missing 6 = **Q12(b) [4]** and
  **Q13(a)(i) [2]**: wholly-unattempted parts produce no result rows, and the totals
  registry didn't match the paper name (see F1).

## Adrian's decisions (2026-08-29 night)

1. `/90` fix — both layers below (F1 + F2); he asked for a plain explanation, got it,
   default is BOTH unless he counter-orders.
2. Question-paper handling — the A-backbone (F3 + F4) is **queued for this session to
   build**. The optional separate question-paper upload slot in `/app/submit` + bot
   `/handin` is **NOT approved — parked; ask him before building it**.
3. Totals stamp: **"keep the grounded-only gate"** (`shouldStampPaperTotal`,
   `src/lib/marked-pdf-layout.ts:30` — registry/override only). Do not stamp counted totals.
4. **"for exam paper there should be an overall score for the whole paper (just not every
   page has an overall score)"** — i.e. current design is right: one paper total on the
   photos-PDF front page (grounded runs), per-part boxes on pages, NO per-page totals
   (the do-not-resurrect comment in `ai/annotate.js` ~line 599 stands). F1/F2 make this
   run grounded, which brings the front-page 49/90 back with no extra build.
5. **"side annotations in blue also seems messy (the fonts are of different sizes?), can
   make it neat?"** + one blank line between part notes → F5.

## Fixes (all in the bot repo unless said otherwise)

### F1 — registry name matcher misses real O-Level papers  · small
`ai/paper-totals.js` → `officialTotalFor()`. It requires a prelim/practice/tys context
word AND a paper/set marker; **"2021 olevel amath paper 1" fails** because
`olevel` isn't a context word — so the most official /90 paper stayed `counted`.
Add O-Level past-paper context (`olevel`, `o level`, `gce`; stay conservative — keep
requiring the paper marker). Named regression in `test/paper-totals.test.js` with the
exact Alessi name (pattern: the Kassandra "tys" fix, 28 Aug, same file).

### F2 — emit "not attempted 0/n" rows for printed parts absent from the hand-in  · the real fix
The classification pre-pass (item 7: `classifyPagesForContext` + `buildQuestionContext`
feeding the marking calls in `ai/paper-marker.js`) already hands the marker the printed
questions **including `[n]` mark allocations**. Use that to surface parts that exist in
the printed paper but were never attempted anywhere: a result/part row with 0/n and
not-attempted status (item 5's not-attempted chips + notes then render it for free).
Counted max becomes 90 by arithmetic AND the student sees exactly which parts she
skipped — that visibility is the point, per Adrian's overall-score note above.
Guard rails: only when the pre-pass actually found question_paper/mixed pages; a
deterministic check that emitted maxes never push counted past the registry total.
Prefer marker-emitted rows with a code-side sanity check over pure text parsing.
⚠ This touches the marking prompt → **doctrine checkpoint: Adrian eyeballs the next
marked paper before release** (standing rule).

### F3 — redraw must fully scrub pages whose every result was superseded  · bug
Evidence: on run 48b098aa, photos 1–2 (printed question pages with tiny student ink —
diagram labels) were marked, produced 0-mark reads, and reconcile superseded **all** of
them (kept reads live on photos 5/6/8–10; totals were never corrupted). The
post-reconcile redraw cleaned chips/notes/part-tied lines but **loose ticks/crosses not
tied to a part survived** — stray ticks by the Q8 diagram / "80m" / (0,8) / (4,0) on
photo 1; a tick at (0,v) and a cross at (14,0) on photo 2. Rule: a photo whose every
result row ended superseded is redrawn with **zero** annotations (or reverts to the
clean original, method `'clean'`); part-untied line annotations inherit the page's
superseded status. Redraw path: reconcile→perPhoto redraw in `ai/paper-marker.js` /
`ai/photo-overlay.js` (the same machinery that stamps `reconciliation.redraws` receipts).

### F4 — classification gates marking (as a PRIOR, never a lone gate)  · design
Today the pre-pass classification feeds context only; the marking calls still mark
every inked page, which is where the printed-page coaching reads came from.
1. Inject the per-photo prior into the marking call: "photo N is believed to be the
   printed question paper — return no results for it unless it carries substantive
   handwritten working" (kills 0-mark coaching reads for label-only pages).
2. Skip the marking call entirely **only when both classifiers agree**: pre-pass says
   `question_paper`/`answer_key` AND the marking-time ink check finds no handwriting
   (photo-0 style). Pure cost saving, zero risk.
3. **Never hard-skip on the pre-pass alone** — on this very run it classified photo 2
   as `question_paper` even though the page has student ink. A misclassified working
   page must degrade to "marked then reconciled", never to "silently unmarked".
⚠ Prompt change → same doctrine checkpoint as F2.

### F5 — neat blue side-rail + part spacing  · Adrian-visible polish
`ai/annotate.js` side strip (~1596–1668) and footer (~1695+). Two defects, one surface:
- **Mixed font sizes**: `wrapPenLine(…, minFontSize: 14)` shrinks only the line that
  overflows (wide `$\frac{…}{…}$`/`$\int$` spans in the ~26%-width strip), so one line
  in a note lands at 14 while its neighbours stay at `printFs` (~20). Fix: compute ONE
  fitted size per note (min of the per-line fits), re-wrap every line of that note at
  it — a note is then internally uniform. Consider compact math (`\tfrac`) in strip
  notes only (keep display `\frac` in the footer "Correct solution" blocks, where
  clarity beats compactness).
- **Part spacing** (Adrian: "between each part should have a one line space"): strip
  inter-note `gap` is `stripLineH * 0.8` → make it a full blank line (≥1.3×), and
  verify the footer's `footer.push(null)` between solutions renders as a real blank
  line too. `lib/pen-math.js` + `test/pen-math.test.js` cover the wrap/measure layer.

### Explicitly NOT in scope
- Counted-total stamping (decision 3: gate stays grounded-only).
- Per-page totals (removed 20 Aug on Adrian's word; `annotate.js` comment says do not resurrect).
- Separate question-paper upload slot (parked — ask Adrian).
- `AUTO_RELEASE_PAUSED` flip, any run release, any run-row deletion.

## Ship + verify sequence

1. Bot suite green (`npm test`, node runner; ~1297 tests as of `d03a032`).
2. **Queue empty before any bot deploy**: `paper_marking_runs` rows with `result_json`
   null must be 0.
3. Deploy: `FORCE=1 npm run deploy` with `FLY_ACCESS_TOKEN` exported inline from
   `~/.fly/config.yml` (`awk '/^access_token:/ {print $2}'` — **never print it**).
   FORCE=1 is needed because of the hook-synced schema.json; `.dockerignore` covers `.env*`.
4. Re-mark Alessi (#3): POST `{"phase":"remark","id":"48b098aa-70ee-4b84-b578-20581e00a345"}`
   to `https://www.adrianmathtuition.com/api/admin/mark-paper`, `Authorization: Bearer
   ADMIN_PASSWORD` (website `.env.local`, strip the quotes; **www, never the apex**).
   ~140–220s; creates a NEW row; interactive remarks never auto-release.
5. Expect: total ≈ 49/**90** with explicit Q12(b) + Q13(a)(i) not-attempted rows;
   front page of the photos PDF stamps the paper total (mode `photos` — Adrian's
   preferred copy); printed pages carry **zero** marking ink; side-rail notes uniform
   size with a blank line between parts.
6. Adrian eyeballs (doctrine checkpoint) → **he** releases with a why-re-marked note;
   released `b7cf61ba` stays live until that moment.
7. Website lockstep: if any release-gate reason string changes, mirror it in
   `src/lib/mark-triage.ts` `computeAutoHold` (+ tests) — same strings, both repos.
