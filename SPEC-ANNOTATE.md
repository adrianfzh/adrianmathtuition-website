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
- No fit → keep the freehand stroke unchanged. Never snap without the hold.

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

1. **`shape-fit.ts`** — `fitStroke(points): { kind:'line'|'rect'|'ellipse', ... } | null`
   with the thresholds of §4. Tests: a hand-wobbly line snaps; a deliberate curve does
   NOT; a 4-corner-ish loop → rect (axis-aligned and rotated cases); a round-ish loop →
   ellipse; an open C-shape → null; thresholds pinned with named fixtures.
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

- [ ] Palm on screen while writing → no marks from the palm, ink unbroken.
- [ ] Finger cannot draw; two-finger pinch zooms; writing while zoomed lands ink at the
      right spot (coordinate transform correct).
- [ ] Pressure visibly varies width; fast scribble has no polygon corners (coalesced
      events working).
- [ ] Draw-and-hold: line snaps straight; box snaps; circle snaps; the same shapes
      drawn WITHOUT holding stay freehand.
- [ ] Eraser removes exactly the touched stroke; undo restores it; redo re-removes.
- [ ] 10-page paper: no crash, page switch < 1 s, Done → PDF in < 20 s on iPad.
- [ ] Done → send row shows `✍️ Annotated PDF` first; ⬇ Download filename correct;
      history row shows `✍️ Annotated ↗`. Reload the run → annotated copy persists.
- [ ] Cancel with ink → confirm dialog; confirm discards, nothing uploaded.
- [ ] Un-inked pages in the final PDF are byte-identical quality (no double JPEG).

## 9. Traps, known from this codebase

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
- **Ink is pressure-tapered outline polygons** (`perfect-freehand`, wrapped + tested in
  `lib/annotate/ink-outline.ts`), not the constant-width smoothed polylines of §4. The
  §4 width formula is approximated by size/thinning params, not reproduced exactly.
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
- Known limitation, NOT an overlay bug: marked pages look soft when zoomed because
  working photos are downscaled to ≤1280px client-side before marking (cost/latency
  trade-off) and the bot composes its red-pen overlay onto THAT copy. Sharpening
  means bot-side compositing onto the original-resolution photo — future work.
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
