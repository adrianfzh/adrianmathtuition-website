# SPEC — In-browser Apple Pencil annotation for marked papers ("Option A")

> **STATUS (2026-08-01): BUILT — pending the real-iPad checklist (§8).** Implemented in
> one session on Mac B with the "full Notability package" Adrian approved (see §11 for
> the deliberate deviations from this spec). Unit tests green, desktop-mouse pass done
> (`?mouse=1`), assemble route verified end-to-end against Blob. Do not mark IMPLEMENTED
> until §8 is ticked on a physical iPad + Pencil.

> **Audience:** a Claude Code session on another Mac, building this feature in this repo.
> Read `CLAUDE.md` first — its policies (pure logic in `src/lib/` + vitest, auto-push to
> `dev`, promote only on Adrian's word) apply to this work. This spec was written
> 2026-07-30 against commit `b104bad`+; verify file paths still hold before editing.

## 1. Goal

After a paper is AI-marked on `/admin/mark-paper`, Adrian reviews it **on his iPad in
Safari** and writes his own amendments with the Apple Pencil **directly on the marked
pages** — no Notability, no Dropbox, no file juggling. Tapping **Done** bakes his ink
into a PDF, attaches it to the run as the **annotated copy**, and the existing send row
(⬇ Download for WhatsApp / ✉️ Email PDF) then uses it automatically.

**The feature replaces the "Notability round trip"** (shipped 2026-07-30): today Adrian
taps the 🖼 Images PDF → opens in Notability → annotates → drags the export back onto
the send panel. Option A collapses that into one in-page screen. The round trip's
plumbing is the foundation — reuse it, don't duplicate it.

## 2. What already exists (build ON this)

| Piece | Where | Reuse for |
|---|---|---|
| Marked page images (the red-pen copies) | `annotated_photos[]` on the run's `result_json` — `{ photo_index, url, url_with_solutions, method }`, Blob URLs | The pages Adrian draws on |
| Which copy per document | `pickAnnotatedPhotoUrl()` in `src/lib/annotated-photo-source.ts` | Annotate the **`url_with_solutions ?? url`** copy — the output replaces the 🖼 images PDF, whose footer carries the worked solutions |
| Run linkage | POST `/api/admin/mark-paper` `{ phase:'link-pdf', id:runId, url, kind:'annotated' }` → bot writes `paper_marking_runs.annotated_pdf_url` | Attach the finished PDF |
| Client Blob upload (big files, no server transit) | `/api/admin/mark-paper-annotated-token` + `put()` from `@vercel/blob/client` (see `uploadAnnotated` in `src/app/admin/mark-paper/page.tsx`) | Upload flattened pages / final PDF |
| Send row preference | `sendPdf` in the same page: `✍️ annotated > 🖼 images > first` | Zero changes needed — attach and it wins |
| PDF assembly at uniform width | `/api/admin/mark-paper-pdf` (`PAGE_W = 595`, proportional height) | Mirror its layout rule; see §6 |
| URL guard | `isOurBlobUrl()` in `src/lib/blob-url.ts` | Any new route fetching a URL param |
| Auth | `verifyAdminAuth(req)` (`src/lib/schedule-helpers.ts`) on every API route; cookie session client-side via `ensureAdminSession` | All new routes |

## 3. Non-goals (v1)

- No text boxes, no typed comments, no stickers — **pen ink only**.
- No editing of a previously saved annotation layer (re-entering starts from the marked
  pages again; the old annotated PDF is simply replaced by the next Done).
- No Notability-style zoom-writing box. Pinch-zoom + write is enough.
- Not a general PDF annotator — it opens only from a marked run.

## 4. UX spec

**Entry:** a `✏️ Annotate` button in the send panel on `/admin/mark-paper`, visible when
`runId && annotatedPhotos.length` (same gating style as `✍️ Upload annotated`, which
stays — the two paths coexist; Notability remains the fallback).

**Screen:** full-viewport overlay (fixed, z-index above everything, `100dvh`), one page
at a time:

- Top bar: page `n / N` + ‹ › arrows (also swipe with one finger when the pen isn't
  down is NOT required — arrows suffice for v1), `Cancel` (confirm if any ink), `Done`.
- Tool bar: pen (3 widths: 2/3.5/6 pt at page scale), colours **red default**, blue,
  black; eraser (stroke-level: tapping/dragging over a stroke removes the whole
  stroke); undo / redo (per page, ≥50 steps).
- Canvas: the page image, fitted to viewport width, pinch-to-zoom (2-finger) and
  2-finger pan. Max zoom ~4×.

**Pencil behaviour — the part that makes or breaks it:**

- Draw **only** when `e.pointerType === 'pen'`. Fingers never draw: 1-finger touch does
  nothing (or pans when zoomed), 2-finger pinches/pans. This IS the palm rejection —
  a resting palm is `touch`, the Pencil is `pen`.
- `touch-action: none` on the canvas element; `preventDefault()` on pen pointer events.
- Use `e.getCoalescedEvents()` for ink smoothness (Safari supports it); fall back to
  the plain event where absent. Listen for `pointerrawupdate` where available.
- Width = base × (0.5 + pressure), clamped [0.4×, 1.6×]; `e.pressure` is 0.5 when the
  stylus reports none — that clamp keeps non-pressure styluses sane.
- Render strokes as smoothed polylines (quadratic midpoint smoothing — the standard
  `quadraticCurveTo((p1+p2)/2)` trick). No fancy brush texture.

**Shape snapping (Adrian asked for this explicitly):**

- Gesture: **draw-and-hold** — if the pen stays down and moves < 6 px for 500 ms at the
  end of a stroke, run shape fit on that stroke; if a shape fits, replace the stroke
  with the clean shape (animated swap not required). Lifting before the hold keeps
  freehand ink. This is Apple's own convention (Notes works this way).
- Shapes, in fit-priority order: **straight line** (max perpendicular deviation < 4% of
  stroke length), **rectangle** (RDP-simplify to ≤ 5 corners, angles within 20° of 90°,
  closed within 15% of perimeter — snap to the bounding box, axis-aligned if all edges
  within 10° of axes, else keep rotation), **ellipse/circle** (fit vs. best-fit ellipse,
  mean radial error < 6%; circle if axes within 12% of each other).
- **Arcs and curves (22 Sep 2026 — Adrian: "trace a curve, then the pen stroke snaps to
  the closest fitted curve, like how Notability does it"):** a stroke that is none of the
  above snaps anyway. An OPEN stroke whose ink sits on a circle (Kåsa least-squares
  circle, mean radial error < 6 % of the radius, sweep 25°–340°, radius < 4× the stroke
  length) becomes a clean **arc** that starts and ends where the hand did. Anything else
  — an S, a parabola sketch, a wavy underline, a closed blob that is no shape — becomes
  the **smoothed curve** the hand meant: the fewest cubic Béziers within 2 % of the
  stroke's length (2–12 image px) of every point (Schneider's fit, `lib/annotate/curve-fit`),
  so wobble goes and every real bend stays; a closed-ish blob is closed on itself. The
  stored stroke is still a polyline (`snapped: 'arc' | 'curve'`), so nothing downstream
  changes.
- Only a stroke under the minimum length keeps its freehand ink. Never snap without the hold.

## 5. Architecture

**All ink is vector state until Done.** Per page: `strokes: { tool, color, width,
points: [{x, y, p}] }[]` in **page-image pixel coordinates** (not screen), so zoom is
pure view transform and flattening is exact.

Rendering: one `<canvas>` per visible page, sized `min(imageWidth, 2 × cssWidth × dpr)`
— cap the backing store; a 10-page paper must not hold 10 full-res canvases. Keep
non-visible pages as stroke data only; re-render on page switch. Draw order: page image,
then strokes.

**Flatten on Done (client-side):** for each page **with ink**, draw image + strokes at
the image's native resolution into an offscreen canvas → `toBlob('image/jpeg', 0.9)`.
Pages without ink are NOT re-encoded — pass their original Blob URL through untouched
(no generational JPEG loss, no wasted upload).

**Assemble:** POST the flattened pages to a new route
`/api/admin/mark-paper-annotate-pdf`:

```
body: { runId, pages: [{ photo_index, url }] }   // url = flattened upload OR original
```

Client first uploads each flattened JPEG via the client-token flow (§2). The route
(auth + `isOurBlobUrl` on every url) fetches pages in order, embeds at `PAGE_W = 595`
proportional height — **mirror `mark-paper-pdf`'s layout exactly, including the paper
total strip on page 1** (`drawPaperTotal`; pass student/totals the same way the page
already holds them) — `put()` the PDF, call the bot `link-pdf` phase with
`kind:'annotated'`, return `{ url }`. The page then updates `marked` exactly as
`uploadAnnotated` does today.

Why server assembly: pdf-lib on a 10-page A4 set is heavy in Safari-on-iPad memory, and
the total-strip logic already lives server-side. Why client flattening: canvas work is
trivial there and avoids shipping stroke JSON.

## 6. Pure libs + tests (CLAUDE.md policy — these are the review gate)

Create in `src/lib/annotate/`, each with a sibling `.test.ts`:

1. **`shape-fit.ts`** — `fitStroke(points): { kind:'line'|'rect'|'ellipse'|'triangle'|'arc'|'curve', ... } | null`
   with the thresholds of §4. Tests: a hand-wobbly line snaps; a deliberate curve is
   never a line (an arc since 22 Sep 2026); a 4-corner-ish loop → rect (axis-aligned and
   rotated cases); a round-ish loop → ellipse; an open C-shape → a 270° arc; a wobbly S →
   a smoothed curve that follows the hand; thresholds pinned with named fixtures.
   `curve-fit.ts` = the Bézier fitter on its own.
2. **`stroke-geometry.ts`** — RDP simplification, perpendicular-deviation, smoothing
   points for render. Tests on fixtures.
3. **`hit-test.ts`** — `strokeHit(stroke, x, y, tolerance)` for the eraser (distance to
   polyline segments). Tests: hit on segment middle, miss outside tolerance, tolerance
   scales with stroke width.
4. **`flatten-plan.ts`** — `planFlatten(pages, inkedIndexes)` → which pages re-encode
   vs. pass through. Tests: no-ink page passes original URL; inked page flagged; empty
   run → error.

The canvas/pointer layer itself is a client component (`src/components/AnnotateOverlay.tsx`
or similar) — not unit-tested; the manual checklist below covers it.

## 7. Order of work

1. Pure libs + tests (§6) — green before any UI.
2. Overlay UI with pen/eraser/undo on a single page, desktop mouse first (pointerType
   'mouse' allowed **only** behind a `?mouse=1` dev flag — production stays pen-only).
3. Multi-page + zoom/pan.
4. Shape snapping (wire `shape-fit`).
5. Flatten + upload + assemble route + link.
6. iPad passes (checklist), then docs + CLAUDE.md update.

## 8. Manual iPad checklist (do on a real iPad + Pencil before calling it done)

> **Run emulated on the LAYERED pages, 8 Sep 2026** — `scripts/annotate/pencil-checklist.mjs`
> drives the desk's in-place pen on Gavin Woon's 19-page run with a CDP pen pointer
> (pressure via `force`) and emulated touch, and reads the autosaved draft + ink log.
> 16/16 logic checks passed (the one probe that first failed was reading the history
> rows, not the send row). What emulation cannot prove — real-glass palm feel, latency,
> coalesced-event smoothness of a fast scribble — is marked ⚠ and stays a real-iPad check.

- [x] Palm on screen while writing → no marks from the palm, ink unbroken. *(emulated: a
      90 px contact resting mid-stroke; 1 stroke, 41 points. ⚠ real-glass feel untested)*
- [x] Finger cannot draw; two-finger pinch zooms; writing while zoomed lands ink at the
      right spot (coordinate transform correct). *(emulated: zoom ×3.00, anchor drift 0.0 px)*
- [x] Pressure visibly varies width *(p 0.2…0.9 recorded per point)*; ⚠ fast scribble has
      no polygon corners (coalesced events) — hardware, real iPad only.
- [x] Draw-and-hold: line snaps straight; box snaps; circle snaps (`ellipse`); the same
      shapes drawn WITHOUT holding stay freehand.
- [x] Eraser removes exactly the touched stroke; undo restores; redo re-removes; 2-finger
      tap undoes, 3-finger tap redoes.
- [x] 19-page paper: no crash, page switch 207 ms, Done → PDF (one composed page) 7.1 s on a
      Mac. ⚠ iPad timing untested.
- [x] Done → send row shows `✍️ Annotated PDF` first; ⬇ Download filename correct
      ("Gavin Woon — … — annotated — 7 Sept 2026.pdf"); history row shows `✍️ Annotated ↗`.
      Reload the run → annotated copy persists.
- [x] Cancel with ink → confirm dialog; Discard closes, nothing uploaded, no draft kept.
- [x] Un-inked pages in the final PDF are byte-identical (same stored URL, no re-encode).

## 9. Traps, known from this codebase

- **Browser page zoom vs the fixed overlay (8 Sep 2026).** If the page is pinch-zoomed before
  the pen opens, the fixed toolbar sits outside the visual viewport and the overlay's own pinch
  cannot go below the browser's zoom — the user sees only the canvas at 2×. The overlay
  re-declares `<meta name=viewport>` with `maximum-scale=1` on mount (iOS snaps back to 1×)
  and restores the previous rule on unmount. Neither /admin/desk nor /admin/mark-paper locks
  zoom on its own, on purpose — Adrian reads pages by pinching.

- **Do not add a second `annotated` kind.** One column (`annotated_pdf_url`), one link
  phase; Done overwrites. The Notability upload path shares it — last write wins, which
  is correct (both are "Adrian's reviewed copy").
- **`annotated_photos[].url_with_solutions` may be null** (nothing wrong on the page, or
  a pre-2026-07-29 run) — always `?? url`. Use `pickAnnotatedPhotoUrl`, don't inline.
- Blob URLs are cross-origin: canvases need `crossOrigin='anonymous'` images or the
  canvas taints and `toBlob` throws. Vercel Blob serves permissive CORS; still handle
  the failure with a visible error, not a silent hang.
- Safari memory: cap canvas backing stores (§5) or a 10-page paper kills the tab.
- Body-size limits: flattened pages go through the **client token** upload, never a
  POST body (4.5 MB cap — the exact reason `uploadAnnotated` works the way it does).
- Every new parent/student-facing surface needs a health-check entry — **this feature
  is admin-only, so none is needed**; but if a send path is added later, revisit.
- End every commit with the `Co-Authored-By: Claude` trailer; push to `dev`; preview
  via `vercel deploy --yes` + re-alias `adrianmath-dev.vercel.app`; promote only when
  Adrian says so. (Full policy in CLAUDE.md.)

- **Identity-only prop churn (10 Sep 2026).** `/admin/mark-paper` re-renders every 15 s
  while any sheet is being written (its history poll), and the desk pane re-renders on
  every toast/busy flip. Each render used to hand the overlay a fresh `.map()` `pages`
  array and fresh `onClose`/`onDone` functions; the overlay's effects keyed on `pages`
  re-ran per tick — every page's editable layer rebuilt as a new blob image — and on
  the iPad that churn ended in Safari killing the tab and the URL-restore reopening it
  (Adrian: "the annotation page closes by itself after scrolling down … and reloads
  again?"). Now `AnnotateOverlay` keys its pages on `lib/annotate/pages-key.ts
  pagesSignature` (content, not identity; tested) and reads the callbacks through
  refs, and both parents memoise the props anyway. Rule: never key an overlay effect
  on a prop object's identity; if a new prop must re-run work, add it to the signature.

## 10. Definition of done

Pure libs tested (all green in the pre-push gate) · iPad checklist fully ticked ·
CLAUDE.md updated (mark-paper section: the ✏️ Annotate flow, the overlay component, the
new route, the shared `annotated` linkage) · this file updated with any spec deviations
and marked **IMPLEMENTED**.

## 11. As built (2026-08-01) — deviations from this spec, all approved by Adrian

Adrian asked for "better UX, like Notability" (1 Aug) and approved the full package:

- **Continuous vertical scroll**, not page-at-a-time (§4 said arrows suffice): all pages
  in one scrollable strip, 1-finger scroll with momentum, 2-finger pinch-zoom. Arrows +
  `n / N` remain as page jumps. Palm guard: touches are ignored while the pen is down
  and for 500ms after it lifts. If real-iPad testing shows palm-scroll jumps anyway, the
  fallback is dropping the 1-finger pan (`kind: 'maybe' → 'pan'` in AnnotateOverlay).
- **Ink is outline polygons** (`perfect-freehand`, wrapped + tested in
  `lib/annotate/ink-outline.ts`), not the constant-width smoothed polylines of §4.
  **Re-tuned near-uniform on 3 Aug 2026** (Adrian: "pen pressure affects the stroke…
  my writing now looks shaky"): thinning 0.6 → 0.15 (width now spans only 0.85–1.0 ×
  size — Notability-like, a whisper of pressure, not a taper), plus `smoothPoints()`
  — a zero-phase forward+backward EMA over the raw points, applied at RENDER time
  inside `strokeOutline` (stored points stay raw: old drafts smooth too, hit-test
  geometry untouched, endpoints anchored so the live stroke still ends exactly at
  the pen tip). perfect-freehand's `streamline` measurably does nothing for
  point-level jitter — don't try to re-tune smoothness with it.
- **Highlighter tool added** (yellow/green, uniform translucent ribbon, multiply blend,
  always rendered UNDER pen ink). Snappable like the pen (straight rule-offs).
- **Viewport rendering** instead of §5's per-page capped canvases: two viewport-sized
  canvases (base + live), page bitmaps kept only for visible ±1 pages (≤2600px wide),
  full-res fetched per page only during flatten. Crisp at 4× zoom, bounded memory.
- **Draft persistence** (§3 said none): strokes autosave to localStorage per run
  (`lib/annotate/draft-store.ts`, tested) — tab eviction can't lose ink, and the draft
  is KEPT after Done, so re-opening offers "Restore ink" = light re-editing of the last
  layer (device-local only). Cancel offers keep-draft / discard / stay.
- **Gestures**: 2-finger tap = undo, 3-finger tap = redo. `window` event
  `annotate-pencil-doubletap` toggles pen⇄eraser — the hook for a future native
  WKWebView shell (Pencil double-tap is not exposed to Safari; §2 discussion 1 Aug).
- **Tool memory**: last tool/colour/width restored per device (`annotate-tools:v1`).
- **Rect fit detail**: a stroke that starts mid-edge leaves a collinear RDP endpoint;
  `shape-fit` drops ≤1 such endpoint per end before demanding exactly 4 corners.
- **Files**: overlay = `src/components/AnnotateOverlay.tsx` (lazy-loaded); pure libs in
  `src/lib/annotate/` (`types`, `stroke-geometry`, `shape-fit`, `hit-test`,
  `flatten-plan`, `ink-outline`, `draft-store`, each with a sibling test); shared PDF
  layout extracted to `src/lib/marked-pdf-layout.ts` (mark-paper-pdf imports it too);
  token route gained `type=page` (JPEG); assemble route =
  `/api/admin/mark-paper-annotate-pdf` (server-side bot link, `linked` flag, client
  falls back to the proxy link like uploadAnnotated).

First live-paper feedback round (2 Aug 2026):
- Pen widths grew a 1.2pt XS and the default dropped to 2pt (3.5pt reads chunky on a
  1280px-wide marked photo). Tool buttons swapped emoji for inline-SVG icons
  (pen/highlighter/eraser/undo/redo, Notability-style recognisability).
- Second entry point: an ✏️ Annotate button on every history row (`annotateRun` =
  loadRun → auto-open overlay).
- ~~Known limitation~~ **FIXED 2 Aug 2026 — full-resolution marked pages.** Marked
  pages used to look soft when zoomed because working photos were downscaled to
  ≤1280px client-side before marking and the bot composed its red pen onto THAT copy.
  Now the page ALSO uploads each photo to Blob at ≤2600px (client token
  `type=original`, best-effort) and sends `originalUrl` per image in the 'direct'
  body; the bot (`ai/hires-original.js` + a viewBox-scaled composite in
  `ai/annotate.js`) re-renders the same overlay onto the big copy. Marking still
  reads the 1280px copies — model cost unchanged. New runs' pages are ~2600px wide
  (`DISPLAY_BITMAP_MAX_W` already matches); runs marked before the fix stay 1280.
- Pencil double-tap→eraser stays impossible in Safari (no web API); the overlay
  already listens for `annotate-pencil-doubletap` so the thin WKWebView shell remains
  the path — see §2 discussion. Wanted by Adrian, pending his call on the shell.

Second feature round (2 Aug 2026, evening) — Adrian's picks, all shipped:
- **Partial eraser**: eraser gained a Stroke/Partial mode toggle (persisted with tool
  memory). Partial splits strokes at the eraser circle via
  `lib/annotate/stroke-split.ts` (densify → point-classify → rim-interpolated cuts,
  tested); a partially-erased snapped shape becomes open freehand pieces. Undo for a
  partial drag is a whole-page snapshot op (`{t:'page', before, after}`) — replaying
  splits-of-splits is not worth the fragility.
- **Lasso select**: 4th tool. Loop strokes (≥50% of sampled length inside selects —
  `lib/annotate/lasso.ts`, tested), dashed bbox + floating 🗑 Delete/Deselect chip,
  drag inside the box to move (render-time translate while dragging; strokes replaced
  by shifted clones on commit, page-snapshot undo). Selection clears on tool switch,
  page jump, undo/redo, Done and Escape.
- **Snapped-line endpoint drag**: after a stroke snaps to a line, keeping the pen down
  and moving drags the line's far endpoint (rect/ellipse still commit as fitted).
- Hardening from the round: `getCoalescedEvents()` can legally return an empty list —
  fall back to the event itself; `setPointerCapture` wrapped (throws on already-lifted
  pointers); all btn style overrides use full `border` shorthand (React 19 warns on
  shorthand/longhand mixes).

## 12. The missing-strokes saga (2026-08-04) — rAF watchdog + ink log

Adrian kept losing strokes ("the stroke after a lift does nothing; my retry
draws"). Two instruments + one fix, all in `AnnotateOverlay.tsx`:

- **Ink event log**: always-on ring buffer (500 events) of pen/touch/commit/
  cancel events. Triple-tap the "1 / N" page counter to copy it as JSON;
  persisted to `localStorage 'annotate-inklog:v1'` on every pen lift.
- **The diagnosis** (from his real-iPad logs): every pen-down had a matching
  `commit` with healthy point counts — input was NEVER lost. iPadOS Safari
  parks the requestAnimationFrame display-link right after Pencil
  interactions, so the live stroke and the post-commit repaint sat in queued
  rAFs until the next touch woke the compositor — the retry "making" the
  previous stroke appear.
- **The fix**: `scheduleBase`/`scheduleLive` race a 35ms `setTimeout` watchdog
  against the rAF (timers keep firing while the link is parked); whichever
  runs first renders, idempotently. Each watchdog win logs `raf-stall`
  (rate-limited 1/s) — a later ink log showing `raf-stall` events is live
  confirmation of the mechanism.
- **The REAL diagnosis** (same day, after the watchdog + a compositor-nudge +
  surface-reset round all failed in the field): a screenshot finally aligned
  with a log — Adrian wrote ~22 strokes ("hello this is not working"), the log
  recorded exactly 14 pen-downs, all 14 committed AND painted (live-px /
  commit-px probes ink:true). The missing strokes never produced ANY events:
  **iPadOS 26 Safari intermittently drops the Pencil's pointer events
  outright.** Every earlier log looked "healthy" because eaten strokes are
  invisible to an event log.
- **The mitigation**: a stylus TOUCH-events fallback (`touchType 'stylus'` —
  WebKit's parallel input stream, synthesized separately from pointer events).
  It engages only when the pointer path stays silent at touchstart; a healthy
  stroke (pointerdown first) bypasses it, and if event order inverts the
  pointer path adopts (`adopt` log). Fallback engagements log
  `touch-pen-down` — those in a field log are dropped pointer events being
  caught. `pd-swallowed` (window-capture diagnostic) would instead mean a DOM
  layer ate the event. Belt-and-braces layers from the same hunt kept: rAF
  watchdog, transform-alternating compositor nudge, per-stroke live-canvas +
  per-commit base-canvas surface resets, live-px/commit-px probes.

## 13. Notability-style lasso (2026-08-04)

Selection upgrades on the lasso tool: **corner resize handles** (white/blue
squares on the dashed box; dragging one scales the whole selection uniformly
about the opposite corner, live-previewed via a canvas transform and committed
as one 'page' op on pen-up — points AND widths scale, clamp 0.15–6×),
**⧉ Duplicate** on the action chip (clones offset ~2% of page width, selection
moves to the clones), and drag-anywhere-inside-the-box moving (pre-existing).
Hit-test order on pen-down over a selection: corner handles → inside-box move
→ new lasso. All three ops are page-level undo entries.

### §12 resolution (2026-08-04, evening) — it was Live Text

Adrian's field observation broke it open: strokes died ON the page photo,
worked beside it. iPadOS **Live Text** detects printed text in the marked-page
images and the system intercepts Pencil strokes over those regions for
selection/Scribble — nothing is ever dispatched to the page, which is why every
watcher at every web layer saw nothing. **Fix: the AdrianMarker shell sets
`WKPreferences.isTextInteractionEnabled = false` — confirmed working on the
real iPad.** Safari has no equivalent switch; hiding the background `<img>`s
(the web-side guard, kept — it's free) was not sufficient, so **on-photo Pencil
annotation in Safari remains unreliable — annotate in the app.** All the
defence layers built during the hunt (rAF watchdog, compositor nudge, surface
resets, stylus-touch fallback, native pencil bridge, ink log + probes) stay in
place as instrumentation and defence in depth.

## 14. The editable marker layer (agreed 8 Sep 2026 — "can the drawing itself be editable, like strokes in Notability?")

**Why.** The marker draws every tick, cross, code, fix, verdict, score box, margin note,
solution block, diagram, side-strip item and footer as SVG, then flattens it onto the
photo and keeps only the JPEG. Adrian's own ink was already vector and Notability-like
(lasso, move, resize, delete, undo); the marker's ink was not in that layer. Now it is.

**What the bot stores (shipped, bot commit "editable layer", 8 Sep 2026).** Beside every
annotated page: `annotated_photos[].layer_url` → a standalone SVG document
(`runs/<id>/annotated/<label>-layer-<ts>.svg`, served as octet-stream), and
`annotated_photos[].layer` = `{ width, height, canvasW, totalH, panelH, stripW, font,
style }`. Coordinates are the **normalised page space** the marker drew in (`width ×
height` = the ≤1600px working copy; `canvasW = width + stripW`, `totalH = height +
panelH` when a side strip / footer was added). The hi-res JPEG was produced by scaling
this very SVG onto the full-resolution original via `viewBox`, so the layer is
resolution-independent. Every logical element is one group:

```
<g data-obj="mark|label|verdict|score|note|solution|diagram|banner|footer"
   data-id="mark-7" data-q="10" data-part="(b)" data-text="Q10(b) 2/3">…</g>
```

`data-text` is the element's printed text (the code beside a tick, a note's prose, a
score chip's caption). Fragments outside any group are static background and are
drawn but not editable. `reannotate-page` (the marks-driven redraw) stores a fresh
layer each time. **Papers marked before the layer shipped have no `layer_url`** and stay
flat — the overlay falls back to today's behaviour for them.

**What the overlay does with it (to build).** A page WITH a layer loads three layers on
top of the clean original photo (`source.photos[].original_url`, rotated by
`annotation_debug[].rot`, extended by `panelH`/`stripW` with the cream fill the bot
uses): (1) the marker's objects, parsed from the layer SVG (`DOMParser`, one object per
`<g data-obj>`; `getBBox()` gives its hit box after mounting in an inline `<svg>` with
the layer's `viewBox`); (2) Adrian's strokes as now; (3) typed text boxes (new).
A new **select** tool: tap selects an object (dashed bbox + chip: Delete · Duplicate ·
Edit text where the group has `<text>`); drag moves it (a `translate` on the group);
corner handles scale; lasso selects marker objects and pen strokes together. Ticks and
crosses can be swapped (the chip offers ✓⇄✗). Undo/redo covers all of it. Patrick Hand
is loaded from Google Fonts so text measures as the bot measured it.

**Done composes on the server, never in the browser.** The client sends, per edited
page, the edited layer SVG body (groups kept, moved groups wrapped in a `translate`,
deleted groups removed, retyped `<text>` contents replaced) and the stroke/text
layers as SVG, plus the untouched pages' URLs. A bot endpoint (`/api/compose-page`,
same drain rules as `reannotate-page`) fetches the hi-res original, extends it, and
composites the three SVG layers with `sharp` exactly as `createAnnotatedImage` does —
same fonts, same scaling — then stores the page as the run's annotated page
(`annotated_photos[].url` + a new `layer_url`, the marker's original kept as
`marker_url` the first time) and marks `pdf_stale`. The website then assembles
"Marked (Adrian).pdf" from the page URLs as `mark-paper-annotate-pdf` does today, and
Rebuild PDFs & release picks the same pages up. **The app's page images and the PDF
therefore never disagree.** Quality is equal or better than today: one encode from the
original instead of a re-encode per edit.

**The words are the record.** Retyping or deleting a `note`/`verdict`/`score` object
with `data-q` + `data-part` writes back to `results[].marking.parts[]`
(`error_summary`, `verdict_line`) so the cover and the sheet say the same words. Ticks
and crosses are ink only; marks change through the per-part editor (§ desk). Adrian's
own strokes and typed text are ink only, saved as a layer so they stay editable on
every visit until release.

**Order of work — all six built 8 Sep 2026.** ① bot layer (d345619) → ② overlay Select
tool: move / delete / retype with undo (website a81a3ac0) → ③ bot `compose-page` + website
Done path (bot e9a8800) → ④ **Type text** tool (`adrian-text` objects, movable / retypeable /
composed like the marker's), ✓⇄✗ on the chip (`swapMark` regenerates the other glyph at
the same anchor and radius, code kept; marks carry `data-type` from bot 9738ea8, older
layers fall back to the path count), strokes reloaded from `ink_url` → ⑤ record write-back:
Done sends `recordEdits` (`recordEditsFor`: retyped / deleted `note` / `verdict` objects
with a question and part) and the bot's `applyRecordEdits` sets `error_summary` /
`verdict_line` on both marking lists, breadcrumb `result_json.record_edits[]` → ⑥ the desk's
page headers carry **✏️ Annotate this page** (`?page=<photoIndex>` → overlay `initialPage`).
**Desk round 3 (8 Sep 2026):** the pen opens in place when a desk page is tapped; Done clears
the flags of edited pages (`editedPhotoIndexes` → `triage_reviewed_via:'annotate'`); a swapped
✓/✗ is sent as `markSwaps` (centre in layer space) and the bot's `inkHintsFor` matches it to the
part region → `result_json.ink_hints[]` → the desk's one-tap Set button. Verified end-to-end
headlessly the same day after two fixes: `LayerObj.swapped` makes a swap-only edit dirty (Done
was disabled), and the proxy's body is now `lib/annotate/compose-forward.ts` (it had dropped
`markSwaps`). The initial-page jump re-settles until every page above is sized.
The §8 checklist was run EMULATED on the layered pages on 8 Sep 2026 (16/16 logic checks; the three hardware feels stay a real-iPad check).


## 15. Done on a released paper, score chips as marks, the font (20 Sep 2026)

Adrian, on the iPad: "annotations does not save, my work is gone … if i change the
marks, will it recalculate? … will it change to red? … math expressions should be
proper … annotations at side column seems cut off too".

- **Done on a released paper works.** The desk has opened the pen on released papers
  since 10 Sep, but the bot's `compose-page` refused every layered page of a released
  run ("already released — the student has that copy"), so Done failed after the ink
  was drawn. It now follows the desk redraw's one rule: the overlay sends
  `allowReleased: true` (the desk passes `released`; `/admin/mark-paper` reads the
  run), the website forwards it only as a literal true (`compose-forward.ts`), the
  bot composes and stamps `reinked_after_release` on the page, and the desk's Done
  handler then calls `mark-triage {action:'reissue'}` so the student's copy is
  replaced, as a redrawn page's is. From `/admin/mark-paper` the note says the
  student still holds the old copy.
- **A retyped score chip IS a mark change.** `recordEditsFor` reports a score object
  whose "a/b" changed (`kind:'score'`); the compose-page route writes it FIRST through
  the desk editor's own path (`applyOverride` with parts → the question total is the
  parts' sum → `recomputeTotals` → `pdf_stale`), then forwards; the bot repaints the
  chip (`repaintScoreChips`: figures + the `_marginScore` palette, solid green/white
  for full marks, outlined red for less; a purple re-marked chip keeps its ink) and
  the overlay repaints it the same way while editing (`applyScoreText`). Ticks and
  crosses stay ink (the ✓⇄✗ hint rule is unchanged). Pure pieces + tests:
  `lib/annotate/score-edits.ts`, `layer.ts`.
- **The font.** The overlay embedded the FIRST woff2 Google's CSS listed — the
  Vietnamese subset — so Latin text never had the face and was measured in a wider
  fallback: every side note ran off the strip on screen (the composed page was
  fine). The Latin subset now ships in `public/fonts/` and loads first; Google's
  `/* latin */` block is the fallback.
- **Plain-typed maths in notes is typeset** — bot `ai/pen-math.js autoTexProse`, see
  SPEC-RED-PEN.md (20 Sep 2026).
- **Missed strokes ("pen will miss strokes").** The overlay's stylus-touch fallback only
  ever caught a stroke whose FIRST pointer event was dropped; a stroke Safari cut
  mid-way was committed short, and a stroke the touch stream began was thrown away
  when the pointer stream "adopted" it. Now one stroke is fed by both streams, as
  StudentInk has been since 19 Sep: whichever speaks first starts it (touch-begun
  points are KEPT), pointer points are used while they flow, the shadowing stylus
  touch fills in once the pointer stream has been quiet 40 ms, a cancelled pointer
  hands over to the touch stream instead of ending the stroke, and the stylus lift
  ends it when the pointer-up never comes. Ink-log events: `adopt {kept:true}`,
  `touch-shadow`, `cancel-handover`, `touch-end-pointer-stroke`. Live Text over the
  page photo remains the one cause no web code can reach — the AdrianMarker shell
  turns it off.

## 16. Four shortcuts on Edit marking (22 Sep 2026)

Adrian: "right now i have to click to delete the tick marks or the cross marks (and
perhaps replace it) and change the marks by clicking onto the marks, then deleting the
mark, and typing it -> any possible shortcuts?" — "build 1 to 4". Admin mode only; the
student's overlay is untouched. All four live in `components/AnnotateOverlay.tsx` over
the pure helpers in `lib/annotate/layer.ts` (`addMarkObject`, `markGlyph`,
`setScoreAwarded`; tested).

1. **A score chip's number row.** Selecting a score chip shows the buttons 0…max
   (when max ≤ 12) above "✏️ Edit text"; one tap sets the awarded mark
   (`setScoreAwarded` rewrites only the numerator, clamped to max). It is a
   `textOverride`, so Done records it as the mark change of §15.
2. **Quick tap flips a ✓/✗.** With the Marks tool, pen-down → up under 350 ms with
   no movement on a tick or cross swaps it (`swapLayerMark`, ink only as in §14).
   A hold or a drag still selects and moves it and shows the chip.
3. **The eraser rubs out the marker's objects too.** When an eraser stroke hits none
   of Adrian's ink, it looks for a tick, cross, note, verdict or box under it
   (`hitLayerObject`) and marks it `deleted`; one layer undo step per drag.
4. **✓ and ✗ stamp tools.** Two red buttons on the toolbar plant a mark in the
   marker's own hand at the tap (`addMarkObject` — the bot's tick/cross paths at the
   bot's size, `fontSize = max(24, width/44) × 0.95`, a `<g data-obj="mark">` like
   any the bot drew, so it flips, erases and moves like one). Stamps and typed text
   set `added`, so `layerDirty` enables Done for them (a typed text alone never
   enabled Done before this).

Not built, by agreement: item 5, changing the mark when a ✓ is swapped to a ✗ — a
swap stays ink only.


## 17. Live drag, resize, the marks badge, the palette — and the save bug (1 Oct 2026)

Adrian on the iPad, after annotating Beryl's EM P2: "when i update the marks, the marks
need to redraw? any ways to indicate that change?"; "when i move the annotations, the
annotation does not follow, only upon release"; "the annotations is tied together with the
ticks sometimes? able to separate?"; "able to change the size of the red circle drawn?";
"allow for the complete colour palette (instead of just 3 colours)"; and "most importantly,
i can't save my work after annotating".

**The save bug (website `1499cf44`, bot `008c6aa7`).** A retyped score chip is repainted
red/green by rewriting its `<rect>`. Both `lib/annotate/layer.ts restyleScoreInner` and the
bot's `ai/compose-page.js repaintScoreChips` matched `<rect …/>` with the self-closing slash
inside the captured attributes and appended the new paint AFTER it — `<rect … / fill="…">` —
which librsvg refuses ("XML parse error … Couldn't find end of Start Tag rect"), so Done
failed on every page where a chip's marks had been changed. Annotation without a mark
change saved fine, which is why it looked random. Both now strip the slash and put it back
last; both tests assert a well-formed rect. **The two are twins: change both or neither.**

**Live drag + resize (website `58aec702`, `b4426604`).** While an object is selected the
page's layer bitmap is rebuilt WITHOUT it (`rebuildLayerImage(i, hideId)`) and the object is
rasterised on its own (`rasteriseSelObj`), so the render loop draws it under the in-flight
translate / scale every frame; Deselect rebuilds the page. A bottom-right handle on the
selection box scales the object about its box's top-left (`LayerObj.scale` + `anchor`;
`objectTransform` wraps the group in `translate(dx dy) translate(ax ay) scale(s)
translate(-ax -ay)`; `layerDirty` counts it; one undo step; tested). An edit to a lifted
object (a chip's number row, retyped text, ✓⇄✗) re-rasterises the lifted copy, so the chip
shows its new number while still selected. The whole object scales — a circled line grows
with its circle; splitting a circle from its note is bot-side, like the tick/note split.

**The smallest object under the finger wins** (`hitLayerObject`): a note's long leader
arrow spans most of a line and used to swallow the tick beside it — that was "tied together
with the ticks". The bot's groups were never merged; the hit test picked the top-most box.

**The marks badge.** `scoreChange(o)` (lib, tested) names a retyped chip's before and after;
the render loop draws a purple "was 3/3" pill beside the chip and the toolbar shows "N marks
changed" beside Done. Purple = the re-mark colour the student will see. Done is still what
writes the marks (`scoreEdits` → `applyOverride`) and repaints the paper; nothing is
written before it.

**The palette.** `PEN_COLORS` = ten (red, orange, amber, green, teal, blue, indigo, purple,
pink, black); the remembered colour must be one of them.

**Checking it headlessly.** Behind `?mouse=1` (the gate that lets a mouse draw) the overlay
exposes `window.__annotate = { toCss(i, lx, ly), objects(i), sel() }` — layer coords →
viewport css, every object's box, the selection's box. The check that proved this round
(`scratchpad/annotate-check-final.js` in the 1 Oct 2026 session: open `/admin/mark-paper?run=
<id>&mouse=1` with the admin cookie on the PREVIEW — the local dev server has no bot, so the
run never loads — press-hold-release a tick, drag mid-way, drag the handle, set a chip to 0,
count swatches) ran on Charlotte's unreleased Maclaurin paper WITHOUT pressing Done. A real
Done with a resized object is still the proof of the compose path for `scale` — the bot
renders the wrapper as plain SVG, as it does for moves.

**Filed, not fixed here (docs/MARKING-DEFECTS.md F50, F51):** the note's arrow landing on
the ✗ row instead of the line the slip is on; a second independent slip on the same line
going unnamed. "2pi(6)(15)" as words was F42, fixed forward before her paper was marked.

## 18. Reloads mid-marking, lasso colour, line vs arc (6 Oct 2026)

Adrian, after annotating Gavin's 20-page S3 EM paper: "sometimes halfway marking pages will
go back to mark pages page, then go back to the annotations again"; "the ink is not perfect
- strokes are not full"; "the lasso > should have style? (color)"; "hold and get a straight
line, sometimes i get little arcs instead".

**What the log said.** `annotate_ink_log` for that run: `shell: false, standalone: true` —
he was in the Home-screen web app, not AdrianMarker — and the pen opened four times in 18
minutes (10:16, 10:24, 10:28, 10:34). So (a) the patchy ink is §12's Live Text again (only
the shell turns it off), and (b) the page was being killed and reloaded about every five
minutes. The overlay now shows an amber line when an iPad opens it outside the shell.

**Memory.** Every layered page decodes the full-size original and draws it into a
double-size canvas (≈ 25 MB); a 20-page paper did all twenty at once on open. Now two at a
time, nearest the opened page first, and the working canvas is zeroed as soon as its JPEG
is out. NOT proven to be the whole cause — the per-stroke surface resets (§12's defence
layers, two full-screen reallocations a stroke) are the other suspect and were left alone
because they cannot be judged without the iPad.

**Evidence next time.** While the pen is open `localStorage 'annotate-alive:v1'` holds
{pages, layered, strokes, points, zoom, shell, openedAt, at} (refreshed every 15 s, removed
on a clean close). Finding one at the next open posts `diedMidMarking` to
`annotate_ink_log` — `select payload from annotate_ink_log where payload ? 'diedMidMarking'`.

**Lasso colour.** The selection chip carries the five pen favourites and 🎨 (the full
palette in `'sel'` mode); `recolourSelection` swaps in new stroke objects (one undo step).

**Line vs arc.** `shape-fit` `LINE_MAX_DEVIATION` 0.04 → 0.07 and `ARC_MIN_SWEEP` 25° → 32°:
a hand line that bows up to ~32° is a line; the gap where a faint bend became a shallow
curve is closed. Tested both ways.
