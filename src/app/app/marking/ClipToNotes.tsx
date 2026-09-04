'use client';

// ✂️ Save to My Notebook — the clipper on a marked paper (Adrian, 2026-08-27:
// "on the output marked pdf -> able for students to save parts of it as notes
// -> for reference later").
//
// A client island inside the server-rendered /app/marking page: tapping the
// button opens a full-screen overlay showing the annotated page images
// (StudentPaper.pages ← result_json.annotated_photos), the student drags a
// rectangle over the page — pointer events + `touch-none`, so a finger drag
// draws instead of scrolling — and the crop happens client-side on a canvas.
//
// Cross-origin note: the page images are public Vercel Blob JPEGs served with
// `access-control-allow-origin: *` (verified 2026-08-28), so loading them with
// crossOrigin="anonymous" keeps the canvas untainted and toDataURL legal. No
// same-origin proxy needed; the try/catch below is the belt-and-braces if a
// browser still refuses.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PortalFetchError, portalFetch } from '@/lib/portal-fetch';

import { fileHref } from '@/lib/student-files-url';
interface Page {
  index: number;
  url: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Pan/zoom transform applied to the inner wrapper around the image + box.
// `rect` itself always stays in untransformed surface coordinates (see
// pos()/clientToSurface() below) — this is purely a display concern, so the
// existing crop math in save() never needs to know about it.
interface View {
  scale: number;
  tx: number;
  ty: number;
}

const IDENTITY_VIEW: View = { scale: 1, tx: 0, ty: 0 };

// Client-side guards against the platform's 4.5MB body cap: crops render at
// most this many pixels on the long edge, and a PNG that still encodes huge
// (dense photographic regions) gets one shrink-and-retry before we give up.
const MAX_EDGE = 1600;
const MAX_DATA_URL = 3_600_000;
const MIN_DRAG_PX = 12;

// Corner-handle touch target: generous vs. the ~14px visible dot so a finger
// can grab a corner without precision aim (Adrian's phone walkthrough).
const HANDLE_HIT_PX = 28;

// Pinch-zoom bounds, in multiples of the page's natural (untransformed)
// display size. 4x is plenty to read fine red-pen writing; we never zoom
// OUT past "fit to screen".
const MIN_SCALE = 1;
const MAX_SCALE = 4;

// Pan clamp: keeps at least this fraction of the (untransformed) viewport
// covered by content on each axis, so a pinch can never fling the page fully
// off-screen. Not true rubber-banding (no bounce-back animation) — a hard
// stop is enough here.
const MIN_VISIBLE_FRACTION = 0.25;

interface Point { x: number; y: number }
type Corner = 'nw' | 'ne' | 'sw' | 'se';

// What the current pointer gesture does to the box, decided once at
// pointerdown by hit-testing against the box that already existed. 'move'
// and 'resize' only ever start from a real box, so they carry a non-null
// startRect; 'draw' carries whatever box preceded it (or null) purely so a
// gesture that collapses back to a tap can restore it instead of erasing it.
type DragState =
  | { mode: 'draw'; startPoint: Point; startRect: Rect | null }
  | { mode: 'move'; startPoint: Point; startRect: Rect }
  | { mode: 'resize'; corner: Corner; startPoint: Point; startRect: Rect };

// Two-finger gesture state, captured once when the second pointer lands.
// `anchor` is the untransformed content-space point sitting under the pinch
// midpoint at that instant; every subsequent move solves the (tx, ty) that
// keeps that same content point under the (moving) midpoint — the standard
// zoom-toward-pinch-center formula, see onPointerMove. `startDistance` is
// floored at 1 so two pointers landing on the same pixel can't divide by 0.
interface PinchState {
  startDistance: number;
  startScale: number;
  anchor: Point;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function insideRect(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Nearest corner within the hit radius, not just the first in listed order —
// on a box near MIN_DRAG_PX the four hit-circles overlap each other. `hitPx`
// is in the SAME (untransformed) space as `r`/`p`; when zoomed, callers pass
// HANDLE_HIT_PX / scale so the finger-size target stays constant on screen
// instead of shrinking as untransformed coordinates get magnified.
function hitCorner(r: Rect, p: Point, hitPx: number): Corner | null {
  const corners: [Corner, number, number][] = [
    ['nw', r.x, r.y],
    ['ne', r.x + r.w, r.y],
    ['sw', r.x, r.y + r.h],
    ['se', r.x + r.w, r.y + r.h],
  ];
  let best: Corner | null = null;
  let bestDist = hitPx;
  for (const [corner, cx, cy] of corners) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d <= bestDist) { best = corner; bestDist = d; }
  }
  return best;
}

function oppositeCorner(r: Rect, corner: Corner): Point {
  return {
    x: corner === 'nw' || corner === 'sw' ? r.x + r.w : r.x,
    y: corner === 'nw' || corner === 'ne' ? r.y + r.h : r.y,
  };
}

// Pushes `free` at least `min` away from `anchor`, preferring whichever side
// `free` is already on; flips to the other side if the anchor has no room
// left on that side (it sits within `min` of the surface edge).
function enforceMin(free: number, anchor: number, min: number, boundMax: number): number {
  const positive = free >= anchor;
  let result = positive ? Math.max(free, anchor + min) : Math.min(free, anchor - min);
  if (result < 0 || result > boundMax) {
    result = positive ? anchor - min : anchor + min;
  }
  return clamp(result, 0, boundMax);
}

// One axis of the pinch pan clamp — see MIN_VISIBLE_FRACTION.
function clampPan(t: number, scale: number, viewportSize: number): number {
  const max = (1 - MIN_VISIBLE_FRACTION) * viewportSize;
  const min = (MIN_VISIBLE_FRACTION - scale) * viewportSize;
  return clamp(t, min, max);
}

export default function ClipToNotes({ runId, paperName, pages }: {
  runId: string;
  paperName: string;
  pages: Page[];
}) {
  const [open, setOpen] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(IDENTITY_VIEW);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // Live pointers by id, in client (screen) coordinates. A Map preserves
  // insertion order, so "the first two entries" is a stable answer for which
  // two fingers own an in-progress pinch even if a stray third finger lands.
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<PinchState | null>(null);

  // The page behind the overlay must not scroll under a finger that is
  // drawing a rectangle.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const reset = useCallback((toPage?: number) => {
    setRect(null);
    setError(null);
    setSaved(false);
    setView(IDENTITY_VIEW);
    dragRef.current = null;
    pinchRef.current = null;
    pointersRef.current.clear();
    if (typeof toPage === 'number') setPageIdx(toPage);
  }, []);

  if (pages.length === 0) return null;
  const page = pages[Math.min(pageIdx, pages.length - 1)];

  // Maps a client-space point into untransformed surface coordinates — the
  // space `rect` lives in — via the WRAPPER's bounding box. getBoundingClientRect()
  // already bakes in the current pan/zoom transform (bounds.left/top move with
  // pan; bounds.width/height grow with scale), so dividing by scale is all
  // that's left to undo the zoom.
  function clientToSurface(clientX: number, clientY: number): Point {
    const r = wrapperRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / view.scale, y: (clientY - r.top) / view.scale };
  }

  function pos(e: React.PointerEvent): Point {
    const { width, height } = surfaceSize();
    const p = clientToSurface(e.clientX, e.clientY);
    return { x: clamp(p.x, 0, width), y: clamp(p.y, 0, height) };
  }

  function surfaceSize(): { width: number; height: number } {
    // The OUTER surface div's own layout box never changes with zoom (CSS
    // transform doesn't affect layout — only the inner wrapper's painted
    // position/size), so this stays a stable untransformed reference frame
    // regardless of the current scale.
    const r = surfaceRef.current?.getBoundingClientRect();
    return { width: r?.width ?? 0, height: r?.height ?? 0 };
  }

  // Undoes whatever the interrupted one-finger gesture had done so far —
  // 'draw' may already have grown a box from nothing, 'move'/'resize' may
  // already have displaced/resized one. `startRect` is exactly the box the
  // gesture began from in both cases, so restoring it undoes either cleanly.
  function cancelDragNonDestructively() {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setRect(drag.startRect);
  }

  function startPinch() {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;
    const [p1, p2] = pts;
    const mid = midpoint(p1, p2);
    pinchRef.current = {
      startDistance: Math.max(distance(p1, p2), 1),
      startScale: view.scale,
      anchor: clientToSurface(mid.x, mid.y),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (saving) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2) {
      // A second finger landing mid-gesture hands off to pinch navigation —
      // one-finger draw/move/resize never keeps running underneath it. A
      // stray third+ finger is ignored; the pinch keeps using its original
      // two (see startPinch/onPointerMove — Map insertion order is stable).
      if (pointersRef.current.size === 2) {
        cancelDragNonDestructively();
        startPinch();
      }
      return;
    }

    const p = pos(e);
    setSaved(false);
    setError(null);

    if (rect) {
      const corner = hitCorner(rect, p, HANDLE_HIT_PX / view.scale);
      if (corner) {
        dragRef.current = { mode: 'resize', corner, startPoint: p, startRect: rect };
        return;
      }
      if (insideRect(rect, p)) {
        dragRef.current = { mode: 'move', startPoint: p, startRect: rect };
        return;
      }
    }
    // Outside the box (or no box yet) — draw fresh, but remember the old box
    // so a gesture that never turns into a real drag can restore it below.
    dragRef.current = { mode: 'draw', startPoint: p, startRect: rect };
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Two (or more) fingers down and a pinch in progress: navigation, not
    // drawing. One finger still draws — that's deliberate, matching the
    // admin ✏️ Annotate overlay's gesture language (two fingers navigate).
    if (pinchRef.current && pointersRef.current.size >= 2) {
      e.preventDefault();
      const pinch = pinchRef.current;
      const [p1, p2] = [...pointersRef.current.values()];
      const surfaceRect = surfaceRef.current?.getBoundingClientRect();
      if (!surfaceRect) return;
      const mid = midpoint(p1, p2);
      const scale = clamp(
        pinch.startScale * (distance(p1, p2) / pinch.startDistance),
        MIN_SCALE,
        MAX_SCALE,
      );
      let tx = 0;
      let ty = 0;
      if (scale > MIN_SCALE) {
        // Solve the translation that keeps `anchor` (content-space point
        // under the pinch midpoint at gesture start) under the CURRENT
        // midpoint at the new scale — the standard zoom-toward-center
        // formula. surfaceRect is the stable, untransformed base; wrapperRect
        // would already reflect the transform we're about to overwrite.
        const { width, height } = surfaceSize();
        tx = clampPan((mid.x - surfaceRect.left) - scale * pinch.anchor.x, scale, width);
        ty = clampPan((mid.y - surfaceRect.top) - scale * pinch.anchor.y, scale, height);
      }
      // At MIN_SCALE there's nothing to pan — collapse back to identity
      // rather than sitting at scale 1 with a stale offset.
      setView({ scale, tx, ty });
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    e.preventDefault();
    const p = pos(e);

    if (drag.mode === 'draw') {
      setRect({
        x: Math.min(drag.startPoint.x, p.x),
        y: Math.min(drag.startPoint.y, p.y),
        w: Math.abs(p.x - drag.startPoint.x),
        h: Math.abs(p.y - drag.startPoint.y),
      });
      return;
    }

    const { width, height } = surfaceSize();

    if (drag.mode === 'move') {
      const { startRect: start, startPoint } = drag;
      setRect({
        x: clamp(start.x + (p.x - startPoint.x), 0, Math.max(0, width - start.w)),
        y: clamp(start.y + (p.y - startPoint.y), 0, Math.max(0, height - start.h)),
        w: start.w,
        h: start.h,
      });
      return;
    }

    // resize: the opposite corner is the fixed anchor; the dragged corner
    // follows the pointer, clamped to the surface and to MIN_DRAG_PX.
    const anchor = oppositeCorner(drag.startRect, drag.corner);
    const px = enforceMin(p.x, anchor.x, MIN_DRAG_PX, width);
    const py = enforceMin(p.y, anchor.y, MIN_DRAG_PX, height);
    setRect({
      x: Math.min(anchor.x, px),
      y: Math.min(anchor.y, py),
      w: Math.abs(px - anchor.x),
      h: Math.abs(py - anchor.y),
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size < 2) {
      // Ends the moment we drop below two fingers — a lone survivor must not
      // inherit the gesture; draw/move/resize only ever starts from a fresh
      // pointerdown (enforced below: no drag can be active during a pinch,
      // so there's nothing to fall through into).
      pinchRef.current = null;
    }
    if (pointersRef.current.size > 0) return;

    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    // Only a fresh draw can collapse to nothing (a tap outside the box) — in
    // that case restore whatever box was there before, rather than wiping it.
    if (drag.mode === 'draw') {
      setRect(r => (r && r.w >= MIN_DRAG_PX && r.h >= MIN_DRAG_PX ? r : drag.startRect));
    }
  }

  function clearBox() {
    dragRef.current = null;
    setRect(null);
    setError(null);
    setSaved(false);
  }

  async function save() {
    const img = imgRef.current;
    if (!img || !rect || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Displayed-pixel rectangle → natural-pixel crop.
      const scaleX = img.naturalWidth / img.clientWidth;
      const scaleY = img.naturalHeight / img.clientHeight;
      const sx = rect.x * scaleX;
      const sy = rect.y * scaleY;
      const sw = Math.max(1, rect.w * scaleX);
      const sh = Math.max(1, rect.h * scaleY);

      const render = (outScale: number): string => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sw * outScale));
        canvas.height = Math.max(1, Math.round(sh * outScale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas context');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        // Throws a SecurityError if the image somehow tainted the canvas.
        return canvas.toDataURL('image/png');
      };

      let scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
      let dataUrl = render(scale);
      if (dataUrl.length > MAX_DATA_URL) {
        // PNG of a dense photo region can still be huge — shrink once.
        scale *= Math.sqrt(MAX_DATA_URL / dataUrl.length) * 0.9;
        dataUrl = render(scale);
      }
      if (dataUrl.length > MAX_DATA_URL) {
        throw new Error('That selection is too large to save — try a smaller box.');
      }

      await portalFetch('/api/portal/my-notes', {
        json: { runId, sourceLabel: paperName, note: note.trim(), image: dataUrl },
        fallback: 'Couldn’t save that clipping — try again.',
      });

      setRect(null);
      setNote('');
      setSaved(true);
    } catch (e) {
      if (e instanceof PortalFetchError) {
        setError(e.message);
      } else {
        // Locally-thrown messages (too-large selection, canvas SecurityError)
        // land here, already worded for the student.
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          /security|tainted/i.test(msg)
            ? "Couldn't read the page image on this device — try the PDF instead."
            : msg,
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(0); setOpen(true); }}
        className="inline-block text-sm font-semibold text-navy border border-navy/20 rounded-xl px-4 py-2 hover:bg-navy/5 transition-colors"
      >
        ✂️ Save to My Notebook
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col" role="dialog" aria-label="Save part of this paper to My Notebook">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white shrink-0">
            <p className="text-sm font-semibold truncate">✂️ {paperName}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 text-2xl leading-none px-2 py-1 text-white/80 hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Page area */}
          <div className="flex-1 min-h-0 overflow-auto px-3 pb-2 flex items-center justify-center">
            <div
              ref={surfaceRef}
              className="relative inline-block touch-none select-none cursor-crosshair"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* Pinch/pan-transformed wrapper — img + box overlay move as one
                  rigid unit. `rect`'s left/top/width/height are untransformed
                  surface coordinates, so the box scales with the page for
                  free; nothing here multiplies by view.scale. */}
              <div
                ref={wrapperRef}
                className="relative"
                style={{
                  transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
                  transformOrigin: '0 0',
                  willChange: 'transform',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary-size Blob image drawn to a canvas; next/image would re-proxy and break the CORS crop */}
                <img
                  ref={imgRef}
                  src={fileHref(page.url)}
                  crossOrigin="anonymous"
                  alt={`Marked page ${pageIdx + 1}`}
                  draggable={false}
                  className="block max-w-full max-h-[64vh] w-auto h-auto rounded-lg bg-white pointer-events-none"
                  onError={() => setError("Couldn't load this page image.")}
                />
                {rect && (
                  <div
                    className="absolute border-2 border-amber-400 bg-amber-300/15 rounded-sm pointer-events-none"
                    style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
                  >
                    {/* Visual dots only — hit-testing happens in the surface's pointer handlers at a larger radius, not on these elements. */}
                    {(['nw', 'ne', 'sw', 'se'] as const).map(corner => (
                      <span
                        key={corner}
                        className="absolute w-3.5 h-3.5 rounded-full border-2 border-amber-400 bg-amber-300 shadow-sm pointer-events-none"
                        style={{
                          left: corner === 'nw' || corner === 'sw' ? 0 : '100%',
                          top: corner === 'nw' || corner === 'ne' ? 0 : '100%',
                          transform: 'translate(-50%, -50%)',
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pager */}
          {pages.length > 1 && (
            <div className="flex items-center justify-center gap-4 pb-2 text-white/90 text-sm shrink-0">
              <button
                type="button"
                onClick={() => reset(Math.max(0, pageIdx - 1))}
                disabled={pageIdx === 0}
                className="px-3 py-1.5 rounded-lg bg-white/10 disabled:opacity-30"
                aria-label="Previous page"
              >
                ‹
              </button>
              <span>Page {pageIdx + 1} of {pages.length}</span>
              <button
                type="button"
                onClick={() => reset(Math.min(pages.length - 1, pageIdx + 1))}
                disabled={pageIdx === pages.length - 1}
                className="px-3 py-1.5 rounded-lg bg-white/10 disabled:opacity-30"
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          )}

          {/* Footer: hint → save bar → saved */}
          <div className="shrink-0 bg-white rounded-t-2xl p-4 space-y-2.5" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {error && <p className="text-sm text-rose-700">{error}</p>}
            {saved ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-emerald-700">✅ Saved to My Notebook</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => reset()}
                    className="text-sm font-semibold text-navy border border-navy/20 rounded-xl px-3.5 py-2 hover:bg-navy/5"
                  >
                    ✂️ Clip another
                  </button>
                  <Link
                    href="/app/my-notes"
                    className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-3.5 py-2 hover:opacity-90"
                  >
                    View My Notebook ›
                  </Link>
                </div>
              </div>
            ) : rect ? (
              <>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  maxLength={300}
                  placeholder="Add a note (optional)"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-400">Drag the box to move it, pull a corner to resize — or drag anywhere else to draw a new box.</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={clearBox}
                      className="text-sm font-semibold text-gray-500 hover:text-gray-700 px-3 py-2"
                    >
                      ✕ Clear
                    </button>
                    <button
                      type="button"
                      onClick={save}
                      disabled={saving}
                      className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : '💾 Save selection'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600">
                Drag a box around the part you want to keep — a worked correction, a red-pen
                comment, anything worth coming back to. Pinch with two fingers to zoom in for
                a closer look.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
