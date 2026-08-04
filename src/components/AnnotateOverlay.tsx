'use client';

// ✏️ Annotate — in-browser Apple Pencil annotation over a marked paper's pages
// (SPEC-ANNOTATE.md, full "Notability-feel" package agreed 1 Aug 2026).
//
// The rules that make it feel right on an iPad:
//  · Only the Pencil draws (pointerType 'pen'). Fingers NEVER draw — that IS the
//    palm rejection. One finger scrolls (with momentum), two fingers pinch-zoom,
//    2-finger tap = undo, 3-finger tap = redo. Mouse draws only behind ?mouse=1.
//  · Ink is vector until Done: strokes live in PAGE-IMAGE pixel coordinates, so
//    zoom is a pure view transform and flattening is exact.
//  · Rendering is viewport-based: two viewport-sized canvases (base = pages +
//    committed ink, live = the in-flight stroke), pages as downscaled bitmaps
//    kept only near the viewport. Crisp at 4× zoom without 10 full-res canvases.
//  · Freehand ink renders as pressure-tapered filled outlines (perfect-freehand);
//    highlighter is a uniform translucent ribbon drawn UNDER pen ink.
//  · Draw-and-hold ≥500ms at the end of a stroke snaps it to a clean line/rect/
//    ellipse (lib/annotate/shape-fit). Lift early to keep freehand.
//  · Drafts autosave to localStorage per run (tab-eviction insurance) and are
//    KEPT after Done — reopening offers "restore previous ink" for re-editing.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { put } from '@vercel/blob/client';
import type { Stroke, StrokePoint, ToolKind } from '@/lib/annotate/types';
import { fitStroke, shapeToPolyline } from '@/lib/annotate/shape-fit';
import { outlineToPath, strokeOutline } from '@/lib/annotate/ink-outline';
import { hitStrokes, strokeHit } from '@/lib/annotate/hit-test';
import { splitStrokeAtCircle } from '@/lib/annotate/stroke-split';
import { lassoSelect, strokesBBox } from '@/lib/annotate/lasso';
import { planFlatten } from '@/lib/annotate/flatten-plan';
import {
  draftIsEmpty, draftKey, makeDraft, parseDraft, serializeDraft,
} from '@/lib/annotate/draft-store';

export type AnnotatePageInput = { photoIndex: number; url: string };

type Props = {
  runId: string;
  pages: AnnotatePageInput[];
  student: { name: string; level: string };
  totals: { awarded: number; max: number } | null;
  /** Called after the annotated PDF is built + linked; parent closes + updates its list. */
  onDone: (r: { url: string; linked: boolean }) => void;
  onClose: () => void;
};

// ── constants ────────────────────────────────────────────────────────────────
const DOC_W = 1000;                 // layout units: every page is DOC_W wide
const PAGE_GAP = 14;                // doc units between pages
const PDF_PAGE_W = 595;             // pt — matches lib/marked-pdf-layout PAGE_W
// XS added + default dropped to 2pt after the first live papers — 3.5pt reads chunky
// on a 1280px-wide marked photo (Adrian, 2 Aug 2026: "allow for thinner lines").
const PEN_WIDTHS_PT = [1.2, 2, 3.5, 6];
const HL_WIDTH_PT = 13;
const PEN_COLORS = ['#dc2626', '#2563eb', '#111827'];
const HL_COLORS = ['#facc15', '#4ade80'];
const MAX_ZOOM = 4;
const DISPLAY_BITMAP_MAX_W = 2600;  // px cap for on-screen page bitmaps (memory)
const UNDO_CAP = 100;
const HOLD_MS = 500;                // draw-and-hold time to trigger shape snap
const HOLD_MOVE_PX = 6;             // css px of movement that resets the hold
const SNAP_MIN_CSS = 24;            // stroke length below this never snaps
const ERASER_TOL_CSS = 8;
const TOOLS_KEY = 'annotate-tools:v1';

type Op =
  | { t: 'add'; stroke: Stroke }
  | { t: 'remove'; items: { index: number; stroke: Stroke }[] }
  // Whole-page snapshot — partial-eraser drags and lasso move/delete touch many
  // strokes at once; restoring the exact array is simpler and safer than replaying.
  | { t: 'page'; before: Stroke[]; after: Stroke[] };
type PageDim = { w: number; h: number } | null;
type DisplayBitmap = { src: CanvasImageSource; w: number };
type ToolSel = ToolKind | 'eraser' | 'lasso';
type EraserMode = 'stroke' | 'partial';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Proper tool icons (Notability-style recognisability) — the emoji set read as
// mystery glyphs on the toolbar (Adrian, 2 Aug 2026). Inherit currentColor so the
// active (dark) button state inverts them for free.
const iconProps = {
  width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none' as const,
  stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};
const IconPen = () => (
  <svg {...iconProps}>
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    <path d="M14.5 5.5l4 4" />
  </svg>
);
const IconHighlighter = () => (
  <svg {...iconProps}>
    <path d="M9 11.5l-5.5 5.5v3h8.5l2.5-2.5" />
    <path d="M21.5 11.5L17 16a2 2 0 0 1-2.8 0L9 10.8a2 2 0 0 1 0-2.8L13.5 3.5l8 8z" />
  </svg>
);
const IconEraser = () => (
  <svg {...iconProps}>
    <path d="M7 21l-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13.5 21" />
    <path d="M22 21H7" />
    <path d="M5.5 11l7.5 7.5" />
  </svg>
);
const IconUndo = () => (
  <svg {...iconProps}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);
const IconRedo = () => (
  <svg {...iconProps}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
);
const IconLasso = () => (
  <svg {...iconProps}>
    <ellipse cx="12" cy="9.5" rx="8.5" ry="6" strokeDasharray="3.4 2.6" />
    <path d="M7.5 14.5c-1.8 1.4-2.3 3.3-1 5.2" />
    <circle cx="6" cy="20.5" r="1.4" />
  </svg>
);

export default function AnnotateOverlay({ runId, pages: pagesIn, student, totals, onDone, onClose }: Props) {
  // Pages sorted by photo_index — array index is the working page index throughout.
  const pages = useMemo(() => [...pagesIn].sort((a, b) => a.photoIndex - b.photoIndex), [pagesIn]);
  const n = pages.length;

  // ── mutable cores (refs — canvas work never goes through React state) ──────
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const viewRef = useRef({ zoom: 1, ox: 0, oy: 0 });
  const dimsRef = useRef<PageDim[]>(pages.map(() => null));
  const imgsRef = useRef<(HTMLImageElement | null)[]>(pages.map(() => null));
  const imgErrRef = useRef<boolean[]>(pages.map(() => false));
  const bitmapsRef = useRef<(DisplayBitmap | null)[]>(pages.map(() => null));
  const bitmapBusyRef = useRef<boolean[]>(pages.map(() => false));
  const strokesRef = useRef<Stroke[][]>(pages.map(() => []));
  const undoRef = useRef<Op[][]>(pages.map(() => []));
  const redoRef = useRef<Op[][]>(pages.map(() => []));
  const pathCache = useRef(new WeakMap<Stroke, Path2D>());
  const currentRef = useRef<{
    stroke: Stroke; pageIdx: number; snapLocked: boolean;
    lastMoveT: number; lastStable: { x: number; y: number }; fitAttemptAt: number;
  } | null>(null);
  const eraseOpsRef = useRef<{ index: number; stroke: Stroke }[]>([]);
  const erasePageRef = useRef(-1);
  const eraseBeforeRef = useRef<Stroke[] | null>(null);   // partial mode: page snapshot at pen-down
  const eraseChangedRef = useRef(false);
  // Lasso state: current loop being drawn, the active selection, and an in-flight
  // move (offset in image px; strokes untouched until commit — the renderer just
  // draws the selected set translated, so dragging costs no outline recomputes).
  const lassoPathRef = useRef<{ pageIdx: number; points: StrokePoint[] } | null>(null);
  const selRef = useRef<{ pageIdx: number; set: Set<Stroke> } | null>(null);
  const moveSelRef = useRef<{ startX: number; startY: number; dx: number; dy: number } | null>(null);
  const chipPosRef = useRef<{ x: number; y: number } | null>(null);
  const penDownRef = useRef(false);
  const lastPenUpRef = useRef(0);
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    kind: 'maybe' | 'pan' | 'pinch';
    startT: number; maxTouches: number; moved: number;
    // Largest touch-contact dimension seen this gesture (css px). A fingertip
    // reports ~10–25; a resting PALM reports ~35–100 — the discriminator that
    // keeps a palm replant from reading as a 2-finger tap (= undo) and silently
    // deleting the previous stroke ("annotating misses a stroke", 3 Aug 2026).
    maxContact: number;
    lastX: number; lastY: number;
    samples: { t: number; x: number; y: number }[];
    pinch?: { d0: number; zoom0: number; cx0: number; cy0: number; docX: number; docY: number };
  } | null>(null);
  const momentumRef = useRef<number | null>(null);
  // ── ink event log ──────────────────────────────────────────────────────────
  // Always-on ring buffer of pointer/gesture/commit events, for chasing "my
  // stroke went missing" reports on the real iPad (3 Aug 2026 — palm-undo fix
  // didn't end them). Triple-tap the page counter to copy it; also persisted to
  // localStorage on every pen lift so a closed overlay still has the trail.
  const inkLogRef = useRef<Record<string, unknown>[]>([]);
  const inkT0Ref = useRef(Date.now());
  const chipTapsRef = useRef<number[]>([]);
  const cursorRef = useRef<{ x: number; y: number; mode: 'dot' | 'ring' } | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneAtRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const renderQueuedRef = useRef(false);
  const liveQueuedRef = useRef(false);
  const baseWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStallLogRef = useRef(0);
  // Missing-strokes endgame (4 Aug 2026): the screenshot + log finally aligned —
  // ~22 strokes written, exactly 14 pen-downs logged, all 14 committed AND
  // painted. The eaten strokes never produced ANY events: iPadOS 26 Safari
  // intermittently drops the Pencil's pointer events outright. Mitigation: the
  // parallel WebKit TOUCH event stream (touchType 'stylus') is synthesized
  // separately and survives these dropouts — a fallback below draws from it
  // whenever the pointer path stays silent. strokeSrc arbitrates the two.
  const strokeSrcRef = useRef<null | 'pointer' | 'touch'>(null);
  const touchStrokeIdRef = useRef<number | null>(null);
  const winPdRef = useRef(0);
  const pageNoRef = useRef(1);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseAllowed = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mouse'),
    [],
  );

  // ── UI state ────────────────────────────────────────────────────────────────
  const [tool, setTool] = useState<ToolSel>('pen');
  const lastInkToolRef = useRef<ToolKind>('pen');
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [penWidthPt, setPenWidthPt] = useState(PEN_WIDTHS_PT[1]);
  const [hlColor, setHlColor] = useState(HL_COLORS[0]);
  const [eraserMode, setEraserMode] = useState<EraserMode>('stroke');
  const [selChip, setSelChip] = useState<{ x: number; y: number } | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [inkTick, setInkTick] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreOffer, setRestoreOffer] = useState<{ savedAt: number; wasDone: boolean } | null>(null);
  const [dimsTick, setDimsTick] = useState(0);
  const busyRef = useRef(false);
  busyRef.current = !!busy;

  const clearSelection = useCallback(() => {
    selRef.current = null;
    moveSelRef.current = null;
    lassoPathRef.current = null;
    chipPosRef.current = null;
    setSelChip(null);
  }, []);

  const setToolRemember = useCallback((t: ToolSel) => {
    setTool(t);
    if (t !== 'eraser' && t !== 'lasso') lastInkToolRef.current = t;
    if (t !== 'lasso') clearSelection();
  }, [clearSelection]);

  // ── layout (doc units) ──────────────────────────────────────────────────────
  const layout = useMemo(() => {
    const tops: number[] = []; const heights: number[] = [];
    let y = 0;
    for (let i = 0; i < n; i++) {
      const d = dimsRef.current[i];
      const h = DOC_W * (d ? d.h / d.w : Math.SQRT2);   // A4-ish until the real dims land
      tops.push(y); heights.push(h);
      y += h + PAGE_GAP;
    }
    return { tops, heights, totalH: y - PAGE_GAP };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, dimsTick]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const kFactor = () => (sizeRef.current.w / DOC_W) * viewRef.current.zoom;

  const clampView = useCallback(() => {
    const { w, h } = sizeRef.current;
    const v = viewRef.current;
    const k = kFactor();
    const contentW = DOC_W * k;
    const contentH = (layoutRef.current.totalH + 24) * k;
    v.ox = contentW <= w ? (w - contentW) / 2 : clamp(v.ox, w - contentW, 0);
    v.oy = contentH <= h ? 0 : clamp(v.oy, h - contentH, 12);
  }, []);

  // css px → (pageIdx, image px). Returns null before that page's dims are known.
  const toImage = useCallback((cssX: number, cssY: number, pinPage = -1) => {
    const k = kFactor();
    const { tops } = layoutRef.current;
    const docX = (cssX - viewRef.current.ox) / k;
    const docY = (cssY - viewRef.current.oy) / k;
    let idx = pinPage;
    if (idx < 0) {
      idx = 0;
      for (let i = 0; i < n; i++) {
        if (docY >= tops[i] - PAGE_GAP / 2) idx = i;
      }
    }
    const d = dimsRef.current[idx];
    if (!d) return null;
    const s = d.w / DOC_W; // doc unit → image px
    return {
      pageIdx: idx,
      x: clamp(docX * s, 0, d.w),
      y: clamp((docY - tops[idx]) * s, 0, d.h),
    };
  }, [n]);

  // ── rendering ───────────────────────────────────────────────────────────────
  const drawStrokes = useCallback((ctx: CanvasRenderingContext2D, strokes: Stroke[], pass: 'hl' | 'pen') => {
    for (const s of strokes) {
      if ((s.tool === 'highlighter') !== (pass === 'hl')) continue;
      if (s.tool === 'highlighter') {
        ctx.globalAlpha = 0.38;
        ctx.globalCompositeOperation = 'multiply';
      } else {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (s.snapped) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      } else {
        let path = pathCache.current.get(s);
        if (!path) {
          path = new Path2D(outlineToPath(strokeOutline(s.points, s.width, s.tool)));
          pathCache.current.set(s, path);
        }
        ctx.fillStyle = s.color;
        ctx.fill(path);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  const visibleRange = useCallback(() => {
    const k = kFactor();
    const { tops, heights } = layoutRef.current;
    const { h } = sizeRef.current;
    const top = (0 - viewRef.current.oy) / k;
    const bot = (h - viewRef.current.oy) / k;
    let first = n, last = -1;
    for (let i = 0; i < n; i++) {
      if (tops[i] + heights[i] >= top && tops[i] <= bot) { first = Math.min(first, i); last = Math.max(last, i); }
    }
    if (last < 0) { first = 0; last = 0; }
    return { first, last };
  }, [n]);

  const ensureBitmaps = useCallback((first: number, last: number) => {
    for (let i = 0; i < n; i++) {
      const near = i >= first - 1 && i <= last + 1;
      const cur = bitmapsRef.current[i];
      if (!near && cur) {
        if (cur.src instanceof ImageBitmap) cur.src.close();
        bitmapsRef.current[i] = null;
      }
      if (near && !cur && !bitmapBusyRef.current[i]) {
        const img = imgsRef.current[i];
        if (!img || !img.complete || !img.naturalWidth) continue;
        bitmapBusyRef.current[i] = true;
        const targetW = Math.min(img.naturalWidth, DISPLAY_BITMAP_MAX_W);
        const targetH = Math.round(img.naturalHeight * (targetW / img.naturalWidth));
        createImageBitmap(img, { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: 'high' })
          .catch(() => {
            // Older Safari: no resize options — downscale via a canvas instead.
            const c = document.createElement('canvas');
            c.width = targetW; c.height = targetH;
            c.getContext('2d')!.drawImage(img, 0, 0, targetW, targetH);
            return c;
          })
          .then((src) => {
            bitmapsRef.current[i] = { src, w: targetW };
            bitmapBusyRef.current[i] = false;
            scheduleBase();
          })
          .catch(() => { bitmapBusyRef.current[i] = false; });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const renderBase = useCallback(() => {
    const canvas = baseRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { h, dpr } = sizeRef.current;
    const k = kFactor();
    const { tops, heights } = layoutRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#e8eaef';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const { first, last } = visibleRange();
    ensureBitmaps(first, last);

    for (let i = first; i <= last; i++) {
      const x = viewRef.current.ox, y = viewRef.current.oy + tops[i] * k;
      const pw = DOC_W * k, ph = heights[i] * k;
      // Paper under the image (placeholder until the bitmap lands).
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, pw, ph);
      const bm = bitmapsRef.current[i];
      if (bm) {
        const f = (DOC_W * k) / bm.w;
        ctx.setTransform(dpr * f, 0, 0, dpr * f, dpr * x, dpr * y);
        ctx.drawImage(bm.src, 0, 0);
      } else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = imgErrRef.current[i] ? '#b91c1c' : '#9ca3af';
        ctx.font = '14px system-ui, sans-serif';
        ctx.fillText(imgErrRef.current[i] ? `page ${i + 1} failed to load` : `loading page ${i + 1}…`, x + 14, y + 26);
      }
      const d = dimsRef.current[i];
      if (d) {
        const f2 = (DOC_W * k) / d.w;
        ctx.setTransform(dpr * f2, 0, 0, dpr * f2, dpr * x, dpr * y);
        const sel = selRef.current && selRef.current.pageIdx === i && selRef.current.set.size
          ? selRef.current.set : null;
        if (!sel) {
          drawStrokes(ctx, strokesRef.current[i], 'hl');
          drawStrokes(ctx, strokesRef.current[i], 'pen');
        } else {
          // Selected strokes draw translated by the in-flight move offset — the
          // strokes themselves stay untouched until the move commits on pen-up.
          const all = strokesRef.current[i];
          const rest = all.filter((s) => !sel.has(s));
          const chosen = all.filter((s) => sel.has(s));
          drawStrokes(ctx, rest, 'hl');
          drawStrokes(ctx, rest, 'pen');
          const mv = moveSelRef.current;
          ctx.save();
          if (mv) ctx.translate(mv.dx, mv.dy);
          drawStrokes(ctx, chosen, 'hl');
          drawStrokes(ctx, chosen, 'pen');
          ctx.restore();
          const bb = strokesBBox(chosen);
          if (bb) {
            const pad = 6 / f2;
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5 / f2;
            ctx.setLineDash([6 / f2, 4 / f2]);
            ctx.strokeRect(
              bb.minX - pad + (mv?.dx ?? 0), bb.minY - pad + (mv?.dy ?? 0),
              bb.maxX - bb.minX + pad * 2, bb.maxY - bb.minY + pad * 2,
            );
            ctx.setLineDash([]);
            // Anchor the Delete/Deselect chip just above the box (css coords).
            const cssX = x + (bb.minX - pad + (mv?.dx ?? 0)) * f2;
            const cssY = y + (bb.minY - pad + (mv?.dy ?? 0)) * f2;
            const next = { x: Math.max(8, cssX), y: Math.max(58, cssY - 44) };
            const prev = chipPosRef.current;
            if (!prev || Math.abs(prev.x - next.x) > 1 || Math.abs(prev.y - next.y) > 1) {
              chipPosRef.current = next;
              setSelChip(next);
            }
          }
        }
      }
    }
    if ((!selRef.current || !selRef.current.set.size) && chipPosRef.current) {
      chipPosRef.current = null;
      setSelChip(null);
    }

    // Track the page under the viewport centre for the n/N indicator.
    const centreDocY = (h / 2 - viewRef.current.oy) / k;
    let cur = 0;
    for (let i = 0; i < n; i++) if (centreDocY >= tops[i] - PAGE_GAP / 2) cur = i;
    if (pageNoRef.current !== cur + 1) {
      pageNoRef.current = cur + 1;
      setPageNo(cur + 1);
    }
  }, [drawStrokes, ensureBitmaps, n, visibleRange]);

  const renderLive = useCallback(() => {
    const canvas = liveRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { dpr } = sizeRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cur = currentRef.current;
    if (cur) {
      const d = dimsRef.current[cur.pageIdx];
      if (d) {
        const k = kFactor();
        const f = (DOC_W * k) / d.w;
        const x = viewRef.current.ox, y = viewRef.current.oy + layoutRef.current.tops[cur.pageIdx] * k;
        ctx.setTransform(dpr * f, 0, 0, dpr * f, dpr * x, dpr * y);
        drawStrokes(ctx, [cur.stroke], cur.stroke.tool === 'highlighter' ? 'hl' : 'pen');
      }
    }

    // In-progress lasso loop (dashed, with a faint chord back to the start).
    const lp = lassoPathRef.current;
    if (lp && lp.points.length > 1) {
      const d = dimsRef.current[lp.pageIdx];
      if (d) {
        const k = kFactor();
        const f = (DOC_W * k) / d.w;
        const x = viewRef.current.ox, y = viewRef.current.oy + layoutRef.current.tops[lp.pageIdx] * k;
        ctx.setTransform(dpr * f, 0, 0, dpr * f, dpr * x, dpr * y);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5 / f;
        ctx.setLineDash([6 / f, 4 / f]);
        ctx.beginPath();
        lp.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(lp.points[lp.points.length - 1].x, lp.points[lp.points.length - 1].y);
        ctx.lineTo(lp.points[0].x, lp.points[0].y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }
    }

    const c = cursorRef.current;
    if (c && (!penDownRef.current || tool === 'eraser')) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (tool === 'eraser') {
        ctx.strokeStyle = 'rgba(17,24,39,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, ERASER_TOL_CSS + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = tool === 'highlighter' ? hlColor : penColor;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [drawStrokes, hlColor, penColor, tool]);

  // Every scheduled render RACES a timer against requestAnimationFrame.
  // iPadOS Safari parks the rAF display-link right after Apple Pencil
  // interactions: queued frames simply don't fire until some other input wakes
  // the compositor. That was Adrian's "missing strokes" (4 Aug 2026, ink logs):
  // every stroke committed (input was never lost) but the live stroke and the
  // post-commit repaint sat in parked rAFs until the NEXT touch flushed them —
  // so his retry looked like it "made" the previous stroke appear. Timers keep
  // running while the link is parked, so the watchdog paints within ~35ms.
  // 'raf-stall' in the ink log (≤1/s) records each time the watchdog won.
  const logRafStall = useCallback((which: string) => {
    const now = Date.now();
    if (now - lastStallLogRef.current < 1000) return;
    lastStallLogRef.current = now;
    const a = inkLogRef.current;
    a.push({ t: now - inkT0Ref.current, k: 'raf-stall', which });
    if (a.length > 500) a.splice(0, a.length - 500);
  }, []);

  // The 4 Aug field log killed the parked-rAF theory alone: no raf-stall fired
  // during the strokes, yet ink still failed to appear. Next suspect is WebKit
  // skipping the canvas LAYER'S composite (backing store updated, GPU tile
  // not re-uploaded — a known iPadOS canvas failure). Opacity is a
  // composite-only property, so flipping it between two near-identical values
  // after every paint forces the compositor to refresh both canvas layers at
  // zero layout/paint cost.
  const nudgeFlipRef = useRef(false);
  const nudgeCompositor = useCallback(() => {
    // Real, distinct transform matrices — an opacity 1↔0.9999 flip proved
    // coalesce-able on iPadOS 26 (field-tested 4 Aug: still froze).
    nudgeFlipRef.current = !nudgeFlipRef.current;
    const t = nudgeFlipRef.current ? 'translateZ(0)' : 'translate(0px, 0px)';
    if (baseRef.current) baseRef.current.style.transform = t;
    if (liveRef.current) liveRef.current.style.transform = t;
  }, []);

  // The sledgehammer: destroy + recreate a canvas's backing surface. iPadOS 26
  // Safari kept presenting a STALE canvas surface for entire strokes (field
  // logs: points captured, backing store inked per commit-px, frames running,
  // glass blank from the first touch) — a frozen layer cannot survive surface
  // realloc, so the live canvas gets this at every pen-down and the base
  // canvas at every commit (renderBase fully repaints right after).
  const baseResetPendingRef = useRef(false);
  const resetSurface = useCallback((canvas: HTMLCanvasElement | null) => {
    if (canvas && canvas.width > 0) canvas.width = canvas.width; // eslint-disable-line no-self-assign
  }, []);

  const scheduleBase = useCallback(() => {
    if (renderQueuedRef.current) return;
    renderQueuedRef.current = true;
    const run = (fromWatchdog: boolean) => {
      if (!renderQueuedRef.current) return;
      renderQueuedRef.current = false;
      if (baseWatchdogRef.current) { clearTimeout(baseWatchdogRef.current); baseWatchdogRef.current = null; }
      if (fromWatchdog) logRafStall('base');
      if (baseResetPendingRef.current) {
        baseResetPendingRef.current = false;
        resetSurface(baseRef.current);
      }
      renderBase();
      renderLive();
      nudgeCompositor();
    };
    baseWatchdogRef.current = setTimeout(() => run(true), 35);
    requestAnimationFrame(() => run(false));
  }, [logRafStall, nudgeCompositor, renderBase, renderLive, resetSurface]);

  const scheduleLive = useCallback(() => {
    if (liveQueuedRef.current) return;
    liveQueuedRef.current = true;
    const run = (fromWatchdog: boolean) => {
      if (!liveQueuedRef.current) return;
      liveQueuedRef.current = false;
      if (liveWatchdogRef.current) { clearTimeout(liveWatchdogRef.current); liveWatchdogRef.current = null; }
      if (fromWatchdog) logRafStall('live');
      renderLive();
      nudgeCompositor();
    };
    liveWatchdogRef.current = setTimeout(() => run(true), 35);
    requestAnimationFrame(() => run(false));
  }, [logRafStall, nudgeCompositor, renderLive]);

  // ── ink mutations ───────────────────────────────────────────────────────────
  const pushUndo = useCallback((pageIdx: number, op: Op) => {
    const stack = undoRef.current[pageIdx];
    stack.push(op);
    if (stack.length > UNDO_CAP) stack.shift();
    redoRef.current[pageIdx] = [];
  }, []);

  const bumpInk = useCallback(() => {
    dirtyRef.current = true;
    // Fresh ink supersedes the restore offer — restoring now would eat the new stroke.
    setRestoreOffer(null);
    setInkTick((t) => t + 1);
  }, []);

  const undo = useCallback((pageIdx: number) => {
    const op = undoRef.current[pageIdx].pop();
    if (!op) return;
    const strokes = strokesRef.current[pageIdx];
    if (op.t === 'add') {
      const i = strokes.indexOf(op.stroke);
      if (i >= 0) strokes.splice(i, 1);
    } else if (op.t === 'remove') {
      for (let j = op.items.length - 1; j >= 0; j--) {
        const it = op.items[j];
        strokes.splice(Math.min(it.index, strokes.length), 0, it.stroke);
      }
    } else {
      strokesRef.current[pageIdx] = op.before.slice();
    }
    redoRef.current[pageIdx].push(op);
    clearSelection();   // selection may reference strokes that just changed identity
    bumpInk(); scheduleBase();
  }, [bumpInk, clearSelection, scheduleBase]);

  const redo = useCallback((pageIdx: number) => {
    const op = redoRef.current[pageIdx].pop();
    if (!op) return;
    const strokes = strokesRef.current[pageIdx];
    if (op.t === 'add') strokes.push(op.stroke);
    else if (op.t === 'remove') {
      for (const it of op.items) {
        const i = strokes.indexOf(it.stroke);
        if (i >= 0) strokes.splice(i, 1);
      }
    } else {
      strokesRef.current[pageIdx] = op.after.slice();
    }
    undoRef.current[pageIdx].push(op);
    clearSelection();
    bumpInk(); scheduleBase();
  }, [bumpInk, clearSelection, scheduleBase]);

  // ── draft persistence ───────────────────────────────────────────────────────
  const saveDraft = useCallback(() => {
    try {
      const rec: Record<number, Stroke[]> = {};
      pages.forEach((p, i) => { rec[p.photoIndex] = strokesRef.current[i]; });
      const draft = makeDraft(runId, rec, Date.now(), doneAtRef.current);
      if (draftIsEmpty(draft)) localStorage.removeItem(draftKey(runId));
      else localStorage.setItem(draftKey(runId), serializeDraft(draft));
    } catch { /* quota / private mode — drafts are best-effort insurance */ }
  }, [pages, runId]);

  useEffect(() => {
    if (!inkTick) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(saveDraft, 800);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [inkTick, saveDraft]);

  const applyDraft = useCallback(() => {
    const d = parseDraft(localStorage.getItem(draftKey(runId)));
    if (!d) return;
    pages.forEach((p, i) => {
      strokesRef.current[i] = (d.pages[p.photoIndex] || []).slice();
    });
    doneAtRef.current = d.doneAt;
    dirtyRef.current = false;
    setRestoreOffer(null);
    setInkTick((t) => t + 1);
    scheduleBase();
  }, [pages, runId, scheduleBase]);

  // ── pointer plumbing ────────────────────────────────────────────────────────
  const isPenLike = useCallback(
    (e: PointerEvent) => e.pointerType === 'pen' || (mouseAllowed && e.pointerType === 'mouse'),
    [mouseAllowed],
  );

  const logInk = useCallback((k: string, d?: Record<string, unknown>) => {
    const a = inkLogRef.current;
    a.push({ t: Date.now() - inkT0Ref.current, k, ...(d || {}) });
    if (a.length > 500) a.splice(0, a.length - 500);
  }, []);

  const copyInkLog = useCallback(() => {
    const now = Date.now();
    const taps = chipTapsRef.current.filter((t) => now - t < 800);
    taps.push(now);
    chipTapsRef.current = taps;
    if (taps.length < 3) return;
    chipTapsRef.current = [];
    const payload = JSON.stringify({ ua: navigator.userAgent, at: new Date().toISOString(), log: inkLogRef.current });
    navigator.clipboard?.writeText(payload)
      .then(() => alert('Ink log copied — paste it into the Claude chat.'))
      .catch(() => alert('Could not copy automatically — the log is also stored on this device.'));
  }, []);

  const stopMomentum = useCallback(() => {
    if (momentumRef.current !== null) {
      cancelAnimationFrame(momentumRef.current);
      momentumRef.current = null;
    }
  }, []);

  const attemptSnap = useCallback(() => {
    const cur = currentRef.current;
    if (!cur || cur.snapLocked || !penDownRef.current) return;
    if (Date.now() - cur.lastMoveT < HOLD_MS - 30) return;
    if (cur.stroke.points.length === cur.fitAttemptAt) return;   // nothing new since last try
    cur.fitAttemptAt = cur.stroke.points.length;
    const d = dimsRef.current[cur.pageIdx];
    if (!d) return;
    const cssPerImg = (kFactor() * DOC_W) / d.w;
    const fit = fitStroke(cur.stroke.points, { minLength: SNAP_MIN_CSS / cssPerImg });
    if (fit) {
      logInk('snap', { shape: fit.kind, nBefore: cur.fitAttemptAt, page: cur.pageIdx });
      cur.stroke.points = shapeToPolyline(fit);
      cur.stroke.snapped = fit.kind;
      cur.snapLocked = true;
      pathCache.current.delete(cur.stroke);
      scheduleLive();
    }
  }, [logInk, scheduleLive]);

  const armHoldTimer = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(attemptSnap, HOLD_MS + 20);
  }, [attemptSnap]);

  const eraseAt = useCallback((cssX: number, cssY: number) => {
    const pt = toImage(cssX, cssY, erasePageRef.current >= 0 ? erasePageRef.current : -1);
    if (!pt) return;
    if (erasePageRef.current < 0) erasePageRef.current = pt.pageIdx;
    const d = dimsRef.current[pt.pageIdx];
    if (!d) return;
    const cssPerImg = (kFactor() * DOC_W) / d.w;
    const hits = hitStrokes(strokesRef.current[pt.pageIdx], pt.x, pt.y, ERASER_TOL_CSS / cssPerImg);
    if (!hits.length) return;
    for (const idx of hits) {
      const [removed] = strokesRef.current[pt.pageIdx].splice(idx, 1);
      eraseOpsRef.current.push({ index: idx, stroke: removed });
    }
    scheduleBase();
  }, [scheduleBase, toImage]);

  // Partial mode: split strokes at the eraser circle instead of removing them whole.
  // Undo works on a page snapshot taken at pen-down — a drag may split the same
  // stroke's pieces again and again, and replaying that is not worth the fragility.
  const eraseAtPartial = useCallback((cssX: number, cssY: number) => {
    const pt = toImage(cssX, cssY, erasePageRef.current >= 0 ? erasePageRef.current : -1);
    if (!pt) return;
    if (erasePageRef.current < 0) {
      erasePageRef.current = pt.pageIdx;
      eraseBeforeRef.current = strokesRef.current[pt.pageIdx].slice();
      eraseChangedRef.current = false;
    }
    const d = dimsRef.current[pt.pageIdx];
    if (!d) return;
    const cssPerImg = (kFactor() * DOC_W) / d.w;
    const r = ERASER_TOL_CSS / cssPerImg;
    const strokes = strokesRef.current[pt.pageIdx];
    let changed = false;
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (!strokeHit(strokes[i], pt.x, pt.y, r)) continue;
      const pieces = splitStrokeAtCircle(strokes[i], pt.x, pt.y, r);
      if (!pieces) continue;
      strokes.splice(i, 1, ...pieces);
      changed = true;
    }
    if (changed) {
      eraseChangedRef.current = true;
      scheduleBase();
    }
  }, [scheduleBase, toImage]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const cssPos = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    // Start a pen/highlighter stroke at css coords — shared by the pointer path
    // and the stylus-touch fallback. Returns false if the page isn't ready.
    const beginPenStroke = (x: number, y: number, pressure: number): boolean => {
      const pt = toImage(x, y);
      if (!pt) { logInk('drop', { why: 'page-not-loaded' }); return false; }
      const d = dimsRef.current[pt.pageIdx]!;
      const ptPerImg = d.w / PDF_PAGE_W;                  // 1 pt at page scale, in image px
      const widthPt = tool === 'highlighter' ? HL_WIDTH_PT : penWidthPt;
      currentRef.current = {
        stroke: {
          tool: tool as ToolKind,
          color: tool === 'highlighter' ? hlColor : penColor,
          width: widthPt * ptPerImg,
          points: [{ x: pt.x, y: pt.y, p: pressure > 0 ? pressure : 0.5 }],
        },
        pageIdx: pt.pageIdx,
        snapLocked: false,
        lastMoveT: Date.now(),
        lastStable: { x, y },
        fitAttemptAt: 0,
      };
      armHoldTimer();
      scheduleLive();
      // Live-layer probe (missing-strokes hunt): 150ms into the stroke,
      // check whether the LIVE canvas backing store carries ink at the
      // newest point. ink:true + a blank tip on glass = the live layer's
      // surface is the one the compositor is freezing.
      const liveProbeStroke = currentRef.current;
      setTimeout(() => {
        try {
          const canvas = liveRef.current;
          const curNow = currentRef.current;
          if (!canvas || !curNow || curNow.stroke !== liveProbeStroke?.stroke) return;
          const d2 = dimsRef.current[curNow.pageIdx];
          if (!d2) return;
          // A few points back from the newest — the tip itself may be a frame
          // from being painted; 4 back is definitely in the drawn body.
          const last = curNow.stroke.points[Math.max(0, curNow.stroke.points.length - 5)];
          const { dpr } = sizeRef.current;
          const k = kFactor();
          const f2 = (DOC_W * k) / d2.w;
          const lx = Math.round(dpr * (viewRef.current.ox + last.x * f2));
          const ly = Math.round(dpr * (viewRef.current.oy + layoutRef.current.tops[curNow.pageIdx] * k + last.y * f2));
          if (lx < 2 || ly < 2 || lx >= canvas.width - 2 || ly >= canvas.height - 2) return;
          const data = canvas.getContext('2d')!.getImageData(lx - 2, ly - 2, 5, 5).data;
          let ink = false;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 0) { ink = true; break; }
          logInk('live-px', { ink, n: curNow.stroke.points.length });
        } catch { /* best-effort */ }
      }, 150);
      return true;
    };

    // Append to the in-flight stroke — used by the stylus-touch fallback (the
    // pointer path keeps its own coalesced-events loop below).
    const extendPenStroke = (x: number, y: number, pressure: number) => {
      const cur = currentRef.current;
      if (!cur || cur.snapLocked) return;
      const pt = toImage(x, y, cur.pageIdx);
      if (pt) cur.stroke.points.push({ x: pt.x, y: pt.y, p: pressure > 0 ? pressure : 0.5 });
      pathCache.current.delete(cur.stroke);
      if (Math.hypot(x - cur.lastStable.x, y - cur.lastStable.y) > HOLD_MOVE_PX) {
        cur.lastStable = { x, y };
        cur.lastMoveT = Date.now();
        armHoldTimer();
      }
      scheduleLive();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (busyRef.current) { logInk('drop', { why: 'busy', pt: e.pointerType }); return; }
      // The selection chip's buttons live inside this element — a pen tap on them
      // must click, not start a lasso (preventDefault on pointerdown kills clicks).
      if ((e.target as HTMLElement).closest?.('button')) { logInk('drop', { why: 'button', pt: e.pointerType }); return; }
      if (isPenLike(e)) {
        winPdRef.current = 0;               // pointer event reached us — not swallowed
        logInk('pen-down', { p: Math.round(e.pressure * 100) / 100, w: Math.round(e.width), h: Math.round(e.height), tool });
        e.preventDefault();
        stopMomentum();
        gestureRef.current = null;          // pen wins over any finger gesture
        // If the stylus-touch fallback engaged first (event-order surprise),
        // the pointer path wins: discard its 1-2 points and start clean.
        if (strokeSrcRef.current === 'touch') {
          logInk('adopt', { n: currentRef.current?.stroke.points.length ?? 0 });
          currentRef.current = null;
          touchStrokeIdRef.current = null;
        }
        strokeSrcRef.current = 'pointer';
        try { el.setPointerCapture(e.pointerId); } catch { /* pointer already inactive */ }
        penDownRef.current = true;
        // Fresh live surface per stroke — the frozen-layer symptom starts at
        // exactly this moment ("nothing under the tip even when writing").
        resetSurface(liveRef.current);
        const { x, y } = cssPos(e);
        cursorRef.current = { x, y, mode: tool === 'eraser' ? 'ring' : 'dot' };
        if (tool === 'eraser') {
          erasePageRef.current = -1;
          eraseOpsRef.current = [];
          eraseBeforeRef.current = null;
          eraseChangedRef.current = false;
          (eraserMode === 'partial' ? eraseAtPartial : eraseAt)(x, y);
          scheduleLive();
          return;
        }
        if (tool === 'lasso') {
          const pt = toImage(x, y);
          if (!pt) { penDownRef.current = false; return; }
          const sel = selRef.current;
          if (sel && sel.pageIdx === pt.pageIdx && sel.set.size) {
            const bb = strokesBBox([...sel.set]);
            const d = dimsRef.current[pt.pageIdx]!;
            const grab = 14 * (d.w / (kFactor() * DOC_W));   // 14 css px of grab slack
            if (bb && pt.x >= bb.minX - grab && pt.x <= bb.maxX + grab && pt.y >= bb.minY - grab && pt.y <= bb.maxY + grab) {
              moveSelRef.current = { startX: pt.x, startY: pt.y, dx: 0, dy: 0 };
              return;
            }
          }
          clearSelection();
          lassoPathRef.current = { pageIdx: pt.pageIdx, points: [{ x: pt.x, y: pt.y, p: 0.5 }] };
          scheduleBase();
          scheduleLive();
          return;
        }
        if (!beginPenStroke(x, y, e.pressure)) { penDownRef.current = false; strokeSrcRef.current = null; }
        return;
      }
      if (e.pointerType !== 'touch') return;
      // Fingers: never draw. Ignore entirely while the pen is down or just lifted
      // (that's the resting palm), otherwise start a scroll/pinch/tap gesture.
      if (penDownRef.current || Date.now() - lastPenUpRef.current < 500) { logInk('touch-blocked', { w: Math.round(e.width), h: Math.round(e.height) }); return; }
      logInk('touch-down', { w: Math.round(e.width), h: Math.round(e.height), n: touchesRef.current.size + 1 });
      touchesRef.current.set(e.pointerId, cssPos(e));
      stopMomentum();
      const pts = [...touchesRef.current.values()];
      const contact = Math.max(e.width || 0, e.height || 0);
      if (pts.length === 1) {
        gestureRef.current = {
          kind: 'maybe', startT: Date.now(), maxTouches: 1, moved: 0, maxContact: contact,
          lastX: pts[0].x, lastY: pts[0].y, samples: [{ t: Date.now(), x: pts[0].x, y: pts[0].y }],
        };
      } else {
        // A second/third finger — join (or start) the gesture and switch to pinch.
        if (!gestureRef.current) {
          gestureRef.current = {
            kind: 'maybe', startT: Date.now(), maxTouches: pts.length, moved: 0, maxContact: contact,
            lastX: pts[0].x, lastY: pts[0].y, samples: [],
          };
        }
        const g = gestureRef.current;
        g.maxTouches = Math.max(g.maxTouches, pts.length);
        g.maxContact = Math.max(g.maxContact, contact);
        if (pts.length === 2) {
          const [a, b] = pts;
          const k = kFactor();
          const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
          g.kind = 'pinch';
          g.pinch = {
            d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            zoom0: viewRef.current.zoom,
            cx0: cx, cy0: cy,
            docX: (cx - viewRef.current.ox) / k,
            docY: (cy - viewRef.current.oy) / k,
          };
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isPenLike(e)) {
        const { x, y } = cssPos(e);
        cursorRef.current = { x, y, mode: tool === 'eraser' ? 'ring' : 'dot' };
        if (!penDownRef.current) { scheduleLive(); return; }   // hover (M2 iPads / mouse)
        e.preventDefault();
        if (tool === 'eraser') {
          const fn = eraserMode === 'partial' ? eraseAtPartial : eraseAt;
          const list = e.getCoalescedEvents?.();
          const events = list && list.length ? list : [e];
          for (const ce of events) fn(cssPos(ce).x, cssPos(ce).y);
          scheduleLive();
          return;
        }
        if (tool === 'lasso') {
          if (moveSelRef.current && selRef.current) {
            const pt = toImage(x, y, selRef.current.pageIdx);
            if (pt) {
              moveSelRef.current.dx = pt.x - moveSelRef.current.startX;
              moveSelRef.current.dy = pt.y - moveSelRef.current.startY;
              scheduleBase();
            }
            return;
          }
          const lp = lassoPathRef.current;
          if (lp) {
            const list = e.getCoalescedEvents?.();
          const events = list && list.length ? list : [e];
            for (const ce of events) {
              const p2 = cssPos(ce);
              const pt2 = toImage(p2.x, p2.y, lp.pageIdx);
              if (pt2) lp.points.push({ x: pt2.x, y: pt2.y, p: 0.5 });
            }
            scheduleLive();
          }
          return;
        }
        const cur = currentRef.current;
        if (!cur) return;
        if (cur.snapLocked) {
          // A snapped LINE stays live: keep dragging to fine-tune its far endpoint
          // (Adrian, 2 Aug 2026). Other shapes commit as fitted.
          if (cur.stroke.snapped === 'line') {
            const pt2 = toImage(x, y, cur.pageIdx);
            if (pt2) {
              cur.stroke.points[1] = { x: pt2.x, y: pt2.y, p: cur.stroke.points[1].p };
              scheduleLive();
            }
          }
          return;
        }
        const list = e.getCoalescedEvents?.();
          const events = list && list.length ? list : [e];
        for (const ce of events) {
          const p = cssPos(ce);
          const pt = toImage(p.x, p.y, cur.pageIdx);
          if (pt) cur.stroke.points.push({ x: pt.x, y: pt.y, p: ce.pressure > 0 ? ce.pressure : 0.5 });
        }
        pathCache.current.delete(cur.stroke);
        // Hold-to-snap bookkeeping (screen-space stillness).
        if (Math.hypot(x - cur.lastStable.x, y - cur.lastStable.y) > HOLD_MOVE_PX) {
          cur.lastStable = { x, y };
          cur.lastMoveT = Date.now();
          armHoldTimer();
        }
        scheduleLive();
        return;
      }
      if (e.pointerType !== 'touch') return;
      if (!touchesRef.current.has(e.pointerId)) return;
      touchesRef.current.set(e.pointerId, cssPos(e));
      const g = gestureRef.current;
      if (!g) return;
      g.maxContact = Math.max(g.maxContact, e.width || 0, e.height || 0);
      const pts = [...touchesRef.current.values()];
      if (g.kind === 'pinch' && g.pinch && pts.length >= 2) {
        const [a, b] = pts;
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        viewRef.current.zoom = clamp(g.pinch.zoom0 * (d / g.pinch.d0), 1, MAX_ZOOM);
        const k = kFactor();
        viewRef.current.ox = cx - g.pinch.docX * k;
        viewRef.current.oy = cy - g.pinch.docY * k;
        clampView();
        g.moved = 999;
        scheduleBase();
        return;
      }
      const p = pts[0];
      const dx = p.x - g.lastX, dy = p.y - g.lastY;
      g.moved += Math.hypot(dx, dy);
      if (g.kind === 'maybe' && g.moved > 8) g.kind = 'pan';
      if (g.kind === 'pan') {
        viewRef.current.ox += dx;
        viewRef.current.oy += dy;
        clampView();
        scheduleBase();
      }
      g.lastX = p.x; g.lastY = p.y;
      g.samples.push({ t: Date.now(), x: p.x, y: p.y });
      if (g.samples.length > 6) g.samples.shift();
    };

    const finishPen = (e: PointerEvent) => {
      penDownRef.current = false;
      lastPenUpRef.current = Date.now();
      strokeSrcRef.current = null;
      touchStrokeIdRef.current = null;
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (tool === 'lasso') {
        const mv = moveSelRef.current;
        const sel = selRef.current;
        if (mv && sel) {
          // Commit the move: replace selected strokes with shifted clones, one op.
          if (Math.hypot(mv.dx, mv.dy) > 0.5) {
            const strokes = strokesRef.current[sel.pageIdx];
            const before = strokes.slice();
            const map = new Map<Stroke, Stroke>();
            for (const s of sel.set) {
              map.set(s, { ...s, points: s.points.map((p) => ({ x: p.x + mv.dx, y: p.y + mv.dy, p: p.p })) });
            }
            for (let i = 0; i < strokes.length; i++) {
              const m = map.get(strokes[i]);
              if (m) strokes[i] = m;
            }
            sel.set = new Set(map.values());
            pushUndo(sel.pageIdx, { t: 'page', before, after: strokes.slice() });
            bumpInk();
          }
          moveSelRef.current = null;
          scheduleBase();
          return;
        }
        const lp = lassoPathRef.current;
        lassoPathRef.current = null;
        if (lp && lp.points.length >= 3) {
          const idxs = lassoSelect(strokesRef.current[lp.pageIdx], lp.points);
          if (idxs.length) {
            selRef.current = { pageIdx: lp.pageIdx, set: new Set(idxs.map((i) => strokesRef.current[lp.pageIdx][i])) };
          } else {
            clearSelection();
          }
        } else {
          clearSelection();
        }
        scheduleBase();
        scheduleLive();
        return;
      }
      if (tool === 'eraser') {
        if (eraserMode === 'partial') {
          if (eraseChangedRef.current && erasePageRef.current >= 0 && eraseBeforeRef.current) {
            pushUndo(erasePageRef.current, {
              t: 'page', before: eraseBeforeRef.current,
              after: strokesRef.current[erasePageRef.current].slice(),
            });
            bumpInk();
          }
        } else if (eraseOpsRef.current.length && erasePageRef.current >= 0) {
          pushUndo(erasePageRef.current, { t: 'remove', items: eraseOpsRef.current });
          bumpInk();
        }
        eraseOpsRef.current = [];
        eraseBeforeRef.current = null;
        eraseChangedRef.current = false;
        erasePageRef.current = -1;
        scheduleLive();
        return;
      }
      const cur = currentRef.current;
      currentRef.current = null;
      if (cur && cur.stroke.points.length) {
        logInk('commit', { n: cur.stroke.points.length, page: cur.pageIdx, snapped: cur.stroke.snapped || '' });
        strokesRef.current[cur.pageIdx].push(cur.stroke);
        pushUndo(cur.pageIdx, { t: 'add', stroke: cur.stroke });
        baseResetPendingRef.current = true;   // fresh base surface under the commit repaint
        bumpInk();
        // Post-commit pixel probe (missing-strokes hunt, 4 Aug 2026): 120ms
        // after the commit repaint, read the base canvas back at the stroke's
        // midpoint and log whether its ink truly landed in the backing store.
        // ink:true in the log + still nothing on glass = compositor skip,
        // proven from the field. Best-effort; 5×5 readback per commit is cheap.
        const probe = { stroke: cur.stroke, pageIdx: cur.pageIdx };
        setTimeout(() => {
          try {
            const canvas = baseRef.current;
            const d = dimsRef.current[probe.pageIdx];
            if (!canvas || !d) return;
            const mid = probe.stroke.points[Math.floor(probe.stroke.points.length / 2)];
            const { dpr } = sizeRef.current;
            const k = kFactor();
            const f2 = (DOC_W * k) / d.w;
            const px = Math.round(dpr * (viewRef.current.ox + mid.x * f2));
            const py = Math.round(dpr * (viewRef.current.oy + layoutRef.current.tops[probe.pageIdx] * k + mid.y * f2));
            if (px < 2 || py < 2 || px >= canvas.width - 2 || py >= canvas.height - 2) { logInk('commit-px', { ink: 'offscreen' }); return; }
            const data = canvas.getContext('2d')!.getImageData(px - 2, py - 2, 5, 5).data;
            const hex = /^([0-9a-f]{6})$/i.exec(probe.stroke.color.replace('#', ''));
            let ink = false;
            if (hex) {
              const tr = parseInt(hex[1].slice(0, 2), 16), tg = parseInt(hex[1].slice(2, 4), 16), tb = parseInt(hex[1].slice(4, 6), 16);
              for (let i = 0; i < data.length; i += 4) {
                if (Math.abs(data[i] - tr) + Math.abs(data[i + 1] - tg) + Math.abs(data[i + 2] - tb) < 150) { ink = true; break; }
              }
            }
            logInk('commit-px', { ink, page: probe.pageIdx });
          } catch { /* probe is best-effort */ }
        }, 120);
      } else if (tool === 'pen' || tool === 'highlighter') {
        logInk('pen-up-empty', {});
      }
      try { localStorage.setItem('annotate-inklog:v1', JSON.stringify(inkLogRef.current.slice(-300))); } catch { /* full/blocked */ }
      scheduleBase();
      void e;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isPenLike(e)) {
        if (penDownRef.current) { e.preventDefault(); finishPen(e); }
        return;
      }
      if (e.pointerType !== 'touch') return;
      if (!touchesRef.current.delete(e.pointerId)) return;
      const g = gestureRef.current;
      if (!g) return;
      if (touchesRef.current.size === 1) {
        // Pinch → single-finger pan continues from the remaining finger.
        const p = [...touchesRef.current.values()][0];
        g.kind = 'pan';
        g.pinch = undefined;
        g.lastX = p.x; g.lastY = p.y;
        g.samples = [{ t: Date.now(), x: p.x, y: p.y }];
        return;
      }
      if (touchesRef.current.size > 0) return;
      // All fingers lifted — classify.
      const dur = Date.now() - g.startT;
      gestureRef.current = null;
      // Undo/redo taps must come from FINGERTIPS: a palm replanting between words
      // is also 2–3 brief, barely-moving contacts, and without the contact-size
      // gate it fired undo and silently deleted the previous stroke. Devices that
      // report no contact geometry (width 0) keep the old behaviour.
      const tapFires = dur < 320 && g.moved < 12 && g.maxTouches >= 2 && g.maxContact < 30;
      logInk('touch-lift', { dur, moved: Math.round(g.moved), maxT: g.maxTouches, maxC: Math.round(g.maxContact), fired: tapFires ? (g.maxTouches === 2 ? 'undo' : 'redo') : '' });
      if (tapFires) {
        const pageIdx = pageNoRef.current - 1;
        if (g.maxTouches === 2) undo(pageIdx);
        else redo(pageIdx);
        return;
      }
      if (g.kind === 'pan' && g.samples.length >= 2) {
        const a = g.samples[0], b = g.samples[g.samples.length - 1];
        const dt = Math.max(1, b.t - a.t);
        let vx = ((b.x - a.x) / dt) * 16, vy = ((b.y - a.y) / dt) * 16;   // px per frame
        const step = () => {
          vx *= 0.94; vy *= 0.94;
          if (Math.hypot(vx, vy) < 0.4) { momentumRef.current = null; return; }
          viewRef.current.ox += vx;
          viewRef.current.oy += vy;
          clampView();
          scheduleBase();
          momentumRef.current = requestAnimationFrame(step);
        };
        stopMomentum();
        momentumRef.current = requestAnimationFrame(step);
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      logInk('cancel', { pt: e.pointerType, penDown: penDownRef.current });
      if (isPenLike(e)) {
        // Keep what was drawn — losing ink to a system gesture is worse than a blot.
        if (penDownRef.current) finishPen(e);
        return;
      }
      touchesRef.current.delete(e.pointerId);
      if (!touchesRef.current.size) gestureRef.current = null;
    };

    const onPointerLeave = () => { cursorRef.current = null; scheduleLive(); };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        const k0 = kFactor();
        const docX = (cx - viewRef.current.ox) / k0;
        const docY = (cy - viewRef.current.oy) / k0;
        viewRef.current.zoom = clamp(viewRef.current.zoom * Math.exp(-e.deltaY * 0.01), 1, MAX_ZOOM);
        const k1 = kFactor();
        viewRef.current.ox = cx - docX * k1;
        viewRef.current.oy = cy - docY * k1;
      } else {
        viewRef.current.ox -= e.shiftKey ? e.deltaY : e.deltaX;
        viewRef.current.oy -= e.shiftKey ? 0 : e.deltaY;
      }
      clampView();
      scheduleBase();
    };

    const swallow = (e: Event) => e.preventDefault();

    // ── stylus-touch fallback ──────────────────────────────────────────────────
    // iPadOS 26 Safari intermittently drops the Pencil's POINTER events outright
    // (whole strokes, no events at all — proven by the 4 Aug field screenshot:
    // ~22 strokes written, 14 logged, all 14 fine). WebKit's parallel TOUCH
    // stream (touchType 'stylus') is synthesized separately and survives. These
    // handlers draw from it ONLY when the pointer path stayed silent; a healthy
    // stroke has penDownRef already true by touchstart and is ignored here.
    const stylusIn = (e: TouchEvent, id: number | null) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i] as Touch & { touchType?: string };
        if (id !== null ? t.identifier === id : t.touchType === 'stylus') return t;
      }
      return null;
    };
    const onTouchStartFallback = (e: TouchEvent) => {
      const t = stylusIn(e, null);
      if (!t) return;
      if (penDownRef.current || strokeSrcRef.current || currentRef.current) return;
      if (tool !== 'pen' && tool !== 'highlighter') return;
      if (busyRef.current) return;
      e.preventDefault();
      logInk('touch-pen-down', { p: Math.round((t.force || 0) * 100) / 100 });
      stopMomentum();
      gestureRef.current = null;
      strokeSrcRef.current = 'touch';
      touchStrokeIdRef.current = t.identifier;
      penDownRef.current = true;
      resetSurface(liveRef.current);
      const { x, y } = cssPos(t);
      cursorRef.current = { x, y, mode: 'dot' };
      if (!beginPenStroke(x, y, t.force || 0.5)) {
        penDownRef.current = false;
        strokeSrcRef.current = null;
        touchStrokeIdRef.current = null;
      }
    };
    const onTouchMoveFallback = (e: TouchEvent) => {
      if (strokeSrcRef.current !== 'touch') return;
      const t = stylusIn(e, touchStrokeIdRef.current);
      if (!t) return;
      e.preventDefault();
      const { x, y } = cssPos(t);
      cursorRef.current = { x, y, mode: 'dot' };
      extendPenStroke(x, y, t.force || 0.5);
    };
    const onTouchEndFallback = (e: TouchEvent) => {
      if (strokeSrcRef.current !== 'touch') return;
      const t = stylusIn(e, touchStrokeIdRef.current);
      if (!t) return;
      e.preventDefault();
      finishPen(e as unknown as PointerEvent);   // pen-tool tail: commit + probe + repaint
    };
    // Window-capture diagnostic: distinguishes "Safari never dispatched the
    // pointer event" (nothing logged anywhere) from "a DOM layer swallowed it
    // before our handler" (pd-swallowed).
    // Window-capture stylus TOUCH watcher — the last web-visible stream. If a
    // stroke is eaten with no pointer trace AND no win-touch trace, iPadOS
    // never delivered it to Safari's web layer at all (palm-rejection eating
    // the contact) — beyond any website's reach; that's what the native shell
    // is for. Engages the drawing fallback when the touch lands over the
    // stage but the pointer path stays silent.
    const onWinTouchStart = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i] as Touch & { touchType?: string };
        if (t.touchType !== 'stylus') continue;
        const tgt = e.target as HTMLElement | null;
        const inEl = !!(tgt && el.contains(tgt));
        if (!inEl) {
          const target = tgt ? `${tgt.tagName}${tgt.id ? '#' + tgt.id : ''}` : 'null';
          logInk('win-touch', { target });
          // A stylus touch OVER the stage that missed el and isn't aimed at a
          // real control: draw it anyway (drops must not eat ink).
          const r = el.getBoundingClientRect();
          const overStage = t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom;
          const onControl = !!tgt && !!tgt.closest?.('button, a, input, select, [role="button"]');
          if (overStage && !onControl && !penDownRef.current && !strokeSrcRef.current
              && (tool === 'pen' || tool === 'highlighter') && !busyRef.current) {
            onTouchStartFallback(e);
          }
        }
      }
    };
    const onWinPd = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      const seen = Date.now();
      winPdRef.current = seen;
      // Name the element that received the event — a toolbar BUTTON is a
      // legitimate miss; anything else covering the stage is the thief.
      const t = e.target as HTMLElement | null;
      const target = t
        ? `${t.tagName}${t.id ? '#' + t.id : ''}${t.className && typeof t.className === 'string' ? '.' + t.className.split(' ')[0].slice(0, 24) : ''}`
        : 'null';
      const inEl = !!(t && el.contains(t));
      setTimeout(() => { if (winPdRef.current === seen) logInk('pd-swallowed', { target, inEl }); }, 30);
    };
    window.addEventListener('pointerdown', onWinPd, true);
    window.addEventListener('touchstart', onWinTouchStart, { capture: true, passive: false });

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
    el.addEventListener('touchstart', onTouchStartFallback, { passive: false });
    // move/end at WINDOW capture: a stroke rescued from a mis-targeted
    // touchstart has its move/end events targeting that outside element too —
    // el-scoped listeners would strand it. The strokeSrc guard makes these
    // no-ops whenever the fallback doesn't own the stroke.
    window.addEventListener('touchmove', onTouchMoveFallback, { capture: true, passive: false });
    window.addEventListener('touchend', onTouchEndFallback, { capture: true, passive: false });
    window.addEventListener('touchcancel', onTouchEndFallback, { capture: true, passive: false });
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', swallow);
    // Safari's proprietary pinch events would zoom the page itself.
    el.addEventListener('gesturestart', swallow as EventListener);
    el.addEventListener('gesturechange', swallow as EventListener);
    return () => {
      window.removeEventListener('pointerdown', onWinPd, true);
      window.removeEventListener('touchstart', onWinTouchStart, true);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
      el.removeEventListener('touchstart', onTouchStartFallback);
      window.removeEventListener('touchmove', onTouchMoveFallback, true);
      window.removeEventListener('touchend', onTouchEndFallback, true);
      window.removeEventListener('touchcancel', onTouchEndFallback, true);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', swallow);
      el.removeEventListener('gesturestart', swallow as EventListener);
      el.removeEventListener('gesturechange', swallow as EventListener);
    };
  }, [armHoldTimer, bumpInk, clampView, clearSelection, eraseAt, eraseAtPartial, eraserMode, hlColor, isPenLike, logInk, penColor, penWidthPt, pushUndo, redo, scheduleBase, scheduleLive, stopMomentum, toImage, tool, undo]);

  // ── mount: sizing, images, draft, wake lock, tool memory, misc listeners ────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const resize = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      sizeRef.current = { w: r.width, h: r.height, dpr };
      for (const c of [baseRef.current, liveRef.current]) {
        if (!c) continue;
        c.width = Math.round(r.width * dpr);
        c.height = Math.round(r.height * dpr);
        c.style.width = `${r.width}px`;
        c.style.height = `${r.height}px`;
      }
      clampView();
      scheduleBase();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampView, scheduleBase]);

  useEffect(() => {
    // Natural dimensions first (layout), bitmaps lazily near the viewport.
    pages.forEach((p, i) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        dimsRef.current[i] = { w: img.naturalWidth, h: img.naturalHeight };
        setDimsTick((t) => t + 1);
        scheduleBase();
      };
      img.onerror = () => { imgErrRef.current[i] = true; scheduleBase(); };
      img.src = p.url;
      imgsRef.current[i] = img;
    });
    // Offer to restore a draft (crash recovery, or post-Done re-edit).
    const d = parseDraft(localStorage.getItem(draftKey(runId)));
    if (d && !draftIsEmpty(d)) setRestoreOffer({ savedAt: d.savedAt, wasDone: d.doneAt !== null });

    try {
      const t = JSON.parse(localStorage.getItem(TOOLS_KEY) || 'null');
      if (t) {
        if (t.tool === 'pen' || t.tool === 'highlighter') { setTool(t.tool); lastInkToolRef.current = t.tool; }
        if (PEN_COLORS.includes(t.penColor)) setPenColor(t.penColor);
        if (PEN_WIDTHS_PT.includes(t.penWidthPt)) setPenWidthPt(t.penWidthPt);
        if (HL_COLORS.includes(t.hlColor)) setHlColor(t.hlColor);
        if (t.eraserMode === 'stroke' || t.eraserMode === 'partial') setEraserMode(t.eraserMode);
      }
    } catch { /* defaults are fine */ }

    document.body.style.overflow = 'hidden';
    let lock: { release?: () => Promise<void> } | null = null;
    const requestLock = () => {
      (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release?: () => Promise<void> }> } })
        .wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    };
    requestLock();
    const onVis = () => { if (!document.hidden) requestLock(); };
    document.addEventListener('visibilitychange', onVis);
    const bitmaps = bitmapsRef.current;
    const imgs = imgsRef.current;
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.().catch(() => {});
      for (const b of bitmaps) if (b && b.src instanceof ImageBitmap) b.src.close();
      for (let i = 0; i < imgs.length; i++) imgs[i] = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toolsLoadedRef = useRef(false);
  useEffect(() => {
    // Don't let the defaults clobber the stored prefs before the loader applies them.
    if (!toolsLoadedRef.current) { toolsLoadedRef.current = true; return; }
    try {
      localStorage.setItem(TOOLS_KEY, JSON.stringify({
        tool: tool === 'eraser' || tool === 'lasso' ? lastInkToolRef.current : tool,
        penColor, penWidthPt, hlColor, eraserMode,
      }));
    } catch { /* best-effort */ }
  }, [tool, penColor, penWidthPt, hlColor, eraserMode]);

  const hasInk = () => strokesRef.current.some((s) => s.length > 0);
  const inkedCount = strokesRef.current.filter((s) => s.length > 0).length;
  void inkTick; // ink mutations re-render through this

  const jumpToPage = useCallback((idx: number) => {
    const i = clamp(idx, 0, n - 1);
    viewRef.current.oy = -(layoutRef.current.tops[i] * kFactor()) + 8;
    clearSelection();
    clampView();
    scheduleBase();
  }, [clampView, clearSelection, n, scheduleBase]);

  // Lasso selection actions (floating chip next to the dashed box).
  const deleteSelection = useCallback(() => {
    const sel = selRef.current;
    if (!sel || !sel.set.size) return;
    const strokes = strokesRef.current[sel.pageIdx];
    const before = strokes.slice();
    strokesRef.current[sel.pageIdx] = strokes.filter((s) => !sel.set.has(s));
    pushUndo(sel.pageIdx, { t: 'page', before, after: strokesRef.current[sel.pageIdx].slice() });
    clearSelection();
    bumpInk();
    scheduleBase();
  }, [bumpInk, clearSelection, pushUndo, scheduleBase]);

  // ── Done: flatten inked pages → upload → assemble → link ───────────────────
  const runDone = useCallback(async () => {
    if (!hasInk() || busyRef.current) return;
    clearSelection();
    setError('');
    try {
      const inkedPhotoIdx = pages.filter((_, i) => strokesRef.current[i].length > 0).map((p) => p.photoIndex);
      const plan = planFlatten(pages.map((p) => ({ photoIndex: p.photoIndex, url: p.url })), inkedPhotoIdx);
      const finalPages: { photo_index: number; url: string }[] = [];
      let done = 0;
      for (const entry of plan) {
        if (!entry.reencode) { finalPages.push({ photo_index: entry.photoIndex, url: entry.url }); continue; }
        done += 1;
        setBusy(`Flattening page ${done}/${inkedPhotoIdx.length}…`);
        const i = pages.findIndex((p) => p.photoIndex === entry.photoIndex);
        const img = imgsRef.current[i];
        const d = dimsRef.current[i];
        if (!img || !d) throw new Error(`page ${entry.photoIndex + 1} isn't loaded — scroll to it once, then Done again`);
        const bmp = await createImageBitmap(img);
        const canvas = document.createElement('canvas');
        canvas.width = d.w; canvas.height = d.h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0, d.w, d.h);
        bmp.close?.();
        drawStrokes(ctx, strokesRef.current[i], 'hl');
        drawStrokes(ctx, strokesRef.current[i], 'pen');
        const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
        if (!blob) throw new Error(`page ${entry.photoIndex + 1} could not be flattened (canvas tainted? reload and retry)`);
        setBusy(`Uploading page ${done}/${inkedPhotoIdx.length}…`);
        const tokenRes = await fetch(`/api/admin/mark-paper-annotated-token?runId=${encodeURIComponent(runId)}&type=page&filename=page-${entry.photoIndex}.jpg`);
        if (!tokenRes.ok) throw new Error('upload token failed');
        const { token, pathname } = await tokenRes.json();
        const up = await put(pathname, blob, {
          access: 'public', token, contentType: 'image/jpeg', multipart: blob.size > 5 * 1024 * 1024,
        });
        finalPages.push({ photo_index: entry.photoIndex, url: up.url });
      }
      setBusy('Assembling PDF…');
      const resp = await fetch('/api/admin/mark-paper-annotate-pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, pages: finalPages, totals, student }),
      });
      const dResp = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(dResp.error || `assemble failed (${resp.status})`);
      let linked = !!dResp.linked;
      if (!linked) {
        // Same fallback path uploadAnnotated uses — link through the bot proxy.
        try {
          const r = await fetch('/api/admin/mark-paper', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: 'link-pdf', id: runId, url: dResp.url, kind: 'annotated' }),
          });
          linked = r.ok;
        } catch { /* stays unlinked; parent shows the warning */ }
      }
      doneAtRef.current = Date.now();
      saveDraft();   // keep the strokes — reopening offers "edit your previous ink"
      setBusy('');
      onDone({ url: dResp.url, linked });
    } catch (e) {
      setBusy('');
      setError((e as Error).message);
    }
  }, [clearSelection, drawStrokes, onDone, pages, runId, saveDraft, student, totals]);

  const discardAndClose = useCallback(() => {
    try { localStorage.removeItem(draftKey(runId)); } catch { /* ignore */ }
    onClose();
  }, [onClose, runId]);

  const requestClose = useCallback(() => {
    if (busyRef.current) return;
    // Untouched this session → close WITHOUT touching the stored draft (closing the
    // restore banner unrestored must never delete the draft it offered).
    if (!dirtyRef.current) { onClose(); return; }
    // Dirty but empty (erased everything) → persist the emptiness and close.
    if (!hasInk()) { saveDraft(); onClose(); return; }
    setConfirmOpen(true);
  }, [onClose, saveDraft]);

  // Keyboard (desktop dev) + the native-shell hook for Pencil double-tap: a thin
  // WKWebView wrapper can dispatch this event to toggle pen⇄eraser (no web API).
  useEffect(() => {
    const toggleEraser = () => setToolRemember(tool === 'eraser' ? lastInkToolRef.current : 'eraser');
    const onKey = (e: KeyboardEvent) => {
      if (busyRef.current) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(pageNoRef.current - 1); else undo(pageNoRef.current - 1);
      } else if (e.key === 'e' && !e.metaKey && !e.ctrlKey) toggleEraser();
      else if (e.key === 'Escape') {
        if (selRef.current?.set.size) { clearSelection(); scheduleBase(); }
        else requestClose();
      }
    };
    const onDoubleTap = () => toggleEraser();
    window.addEventListener('keydown', onKey);
    window.addEventListener('annotate-pencil-doubletap', onDoubleTap);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('annotate-pencil-doubletap', onDoubleTap);
    };
  }, [tool, undo, redo, requestClose, setToolRemember, clearSelection, scheduleBase]);

  // ── UI ──────────────────────────────────────────────────────────────────────
  const btn: React.CSSProperties = {
    minWidth: 44, height: 44, borderRadius: 10, border: '1px solid #d1d5db',
    background: '#fff', fontSize: 18, cursor: 'pointer', padding: '0 10px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const activeBtn: React.CSSProperties = { ...btn, background: '#111827', color: '#fff', border: '1px solid #111827' };
  const currentPageIdx = pageNo - 1;
  const canUndo = (undoRef.current[currentPageIdx]?.length ?? 0) > 0;
  const canRedo = (redoRef.current[currentPageIdx]?.length ?? 0) > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000, background: '#e8eaef',
      display: 'flex', flexDirection: 'column', height: '100dvh',
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      {/* top bar */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px',
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <button style={btn} onClick={requestClose} aria-label="Close">✕</button>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <button style={btn} onClick={() => jumpToPage(currentPageIdx - 1)} disabled={pageNo <= 1} aria-label="Previous page">‹</button>
          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 52, textAlign: 'center' }} onClick={copyInkLog} title="Triple-tap to copy the ink debug log">{pageNo} / {n}</span>
          <button style={btn} onClick={() => jumpToPage(currentPageIdx + 1)} disabled={pageNo >= n} aria-label="Next page">›</button>
        </div>

        <div style={{ width: 1, alignSelf: 'stretch', background: '#e5e7eb' }} />

        <button style={tool === 'pen' ? activeBtn : btn} onClick={() => setToolRemember('pen')} aria-label="Pen" title="Pen"><IconPen /></button>
        <button style={tool === 'highlighter' ? activeBtn : btn} onClick={() => setToolRemember('highlighter')} aria-label="Highlighter" title="Highlighter"><IconHighlighter /></button>
        <button style={tool === 'eraser' ? activeBtn : btn} onClick={() => setToolRemember('eraser')} aria-label="Eraser" title="Eraser"><IconEraser /></button>
        <button style={tool === 'lasso' ? activeBtn : btn} onClick={() => setToolRemember('lasso')} aria-label="Lasso select" title="Lasso: circle strokes to select, then drag to move"><IconLasso /></button>

        {tool === 'eraser' && (
          <div style={{ display: 'inline-flex', gap: 4 }}>
            <button style={{ ...(eraserMode === 'stroke' ? activeBtn : btn), fontSize: 13, fontWeight: 700 }} onClick={() => setEraserMode('stroke')} title="Tap a stroke to remove it whole">Stroke</button>
            <button style={{ ...(eraserMode === 'partial' ? activeBtn : btn), fontSize: 13, fontWeight: 700 }} onClick={() => setEraserMode('partial')} title="Rub out only what you touch">Partial</button>
          </div>
        )}

        {tool === 'pen' && (
          <>
            <div style={{ display: 'inline-flex', gap: 4 }}>
              {PEN_WIDTHS_PT.map((w) => (
                <button key={w} style={penWidthPt === w ? activeBtn : btn} onClick={() => setPenWidthPt(w)} aria-label={`Width ${w}pt`}>
                  <span style={{
                    width: 5 + w * 2, height: 5 + w * 2, borderRadius: '50%',
                    background: penWidthPt === w ? '#fff' : '#374151', display: 'inline-block',
                  }} />
                </button>
              ))}
            </div>
            <div style={{ display: 'inline-flex', gap: 4 }}>
              {PEN_COLORS.map((c) => (
                <button key={c} style={{ ...btn, border: penColor === c ? '3px solid #111827' : '1px solid #d1d5db' }} onClick={() => setPenColor(c)} aria-label={`Colour ${c}`}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: c, display: 'inline-block' }} />
                </button>
              ))}
            </div>
          </>
        )}
        {tool === 'highlighter' && (
          <div style={{ display: 'inline-flex', gap: 4 }}>
            {HL_COLORS.map((c) => (
              <button key={c} style={{ ...btn, border: hlColor === c ? '3px solid #111827' : '1px solid #d1d5db' }} onClick={() => setHlColor(c)} aria-label={`Highlight ${c}`}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: c, display: 'inline-block' }} />
              </button>
            ))}
          </div>
        )}

        <button style={{ ...btn, opacity: canUndo ? 1 : 0.35 }} onClick={() => undo(currentPageIdx)} disabled={!canUndo} aria-label="Undo" title="Undo (2-finger tap)"><IconUndo /></button>
        <button style={{ ...btn, opacity: canRedo ? 1 : 0.35 }} onClick={() => redo(currentPageIdx)} disabled={!canRedo} aria-label="Redo" title="Redo (3-finger tap)"><IconRedo /></button>

        <div style={{ flex: 1 }} />
        <button
          style={{
            ...btn, background: hasInk() && !busy ? '#2563eb' : '#93c5fd', color: '#fff',
            border: '1px solid transparent', fontWeight: 700, fontSize: 15, padding: '0 18px',
          }}
          disabled={!hasInk() || !!busy}
          onClick={runDone}
        >
          {busy ? busy : 'Done ✓'}
        </button>
      </div>

      {/* banners */}
      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '8px 14px', fontSize: 13, borderBottom: '1px solid #fca5a5' }}>
          ✗ {error} <button style={{ marginLeft: 8, border: 'none', background: 'none', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }} onClick={() => setError('')}>dismiss</button>
        </div>
      )}
      {restoreOffer && (
        <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: '8px 14px', fontSize: 13, borderBottom: '1px solid #bfdbfe', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            {restoreOffer.wasDone ? '✍️ You annotated this run before —' : '💾 Unsaved ink from a previous session —'}
            {' '}saved {new Date(restoreOffer.savedAt).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
          <button style={{ ...btn, height: 32, fontSize: 13, fontWeight: 700 }} onClick={applyDraft}>Restore ink</button>
          <button style={{ ...btn, height: 32, fontSize: 13 }} onClick={() => { try { localStorage.removeItem(draftKey(runId)); } catch { /* ignore */ } setRestoreOffer(null); }}>Start fresh</button>
        </div>
      )}

      {/* canvas viewport */}
      <div
        ref={wrapRef}
        style={{
          position: 'relative', flex: 1, overflow: 'hidden', touchAction: 'none',
          WebkitTouchCallout: 'none', cursor: mouseAllowed ? 'crosshair' : 'default',
          overscrollBehavior: 'none',
        }}
      >
        <canvas ref={baseRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <canvas ref={liveRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        {inkedCount > 0 && (
          <div style={{
            position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)', left: 12,
            background: 'rgba(17,24,39,0.72)', color: '#fff', fontSize: 12, padding: '4px 10px', borderRadius: 999,
            pointerEvents: 'none',
          }}>
            ✏️ ink on {inkedCount} page{inkedCount > 1 ? 's' : ''}
          </div>
        )}
        {selChip && (
          <div style={{
            position: 'absolute', left: selChip.x, top: selChip.y,
            display: 'flex', gap: 6, background: '#fff', border: '1px solid #d1d5db',
            borderRadius: 10, padding: 5, boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
          }}>
            <button style={{ ...btn, height: 36, minWidth: 0, fontSize: 13, color: '#b91c1c', border: '1px solid #fca5a5' }} onClick={deleteSelection}>🗑 Delete</button>
            <button style={{ ...btn, height: 36, minWidth: 0, fontSize: 13 }} onClick={() => { clearSelection(); scheduleBase(); }}>Deselect</button>
          </div>
        )}
      </div>

      {/* cancel confirm */}
      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, maxWidth: 380, width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Leave annotating?</div>
            <div style={{ fontSize: 13, color: '#4b5563' }}>Your ink hasn&rsquo;t been baked into a PDF yet.</div>
            <button style={{ ...btn, height: 46, fontWeight: 700 }} onClick={() => { setConfirmOpen(false); saveDraft(); onClose(); }}>💾 Keep as draft &amp; close</button>
            <button style={{ ...btn, height: 46, color: '#b91c1c', border: '1px solid #fca5a5' }} onClick={() => { setConfirmOpen(false); discardAndClose(); }}>🗑 Discard ink &amp; close</button>
            <button style={{ ...btn, height: 46 }} onClick={() => setConfirmOpen(false)}>Keep annotating</button>
          </div>
        </div>
      )}
    </div>
  );
}
