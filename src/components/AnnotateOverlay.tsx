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
import type { Stroke, ToolKind } from '@/lib/annotate/types';
import { fitStroke, shapeToPolyline } from '@/lib/annotate/shape-fit';
import { outlineToPath, strokeOutline } from '@/lib/annotate/ink-outline';
import { hitStrokes } from '@/lib/annotate/hit-test';
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

type Op = { t: 'add'; stroke: Stroke } | { t: 'remove'; items: { index: number; stroke: Stroke }[] };
type PageDim = { w: number; h: number } | null;
type DisplayBitmap = { src: CanvasImageSource; w: number };

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
  const penDownRef = useRef(false);
  const lastPenUpRef = useRef(0);
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    kind: 'maybe' | 'pan' | 'pinch';
    startT: number; maxTouches: number; moved: number;
    lastX: number; lastY: number;
    samples: { t: number; x: number; y: number }[];
    pinch?: { d0: number; zoom0: number; cx0: number; cy0: number; docX: number; docY: number };
  } | null>(null);
  const momentumRef = useRef<number | null>(null);
  const cursorRef = useRef<{ x: number; y: number; mode: 'dot' | 'ring' } | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneAtRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const renderQueuedRef = useRef(false);
  const liveQueuedRef = useRef(false);
  const pageNoRef = useRef(1);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseAllowed = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mouse'),
    [],
  );

  // ── UI state ────────────────────────────────────────────────────────────────
  const [tool, setTool] = useState<ToolKind | 'eraser'>('pen');
  const lastInkToolRef = useRef<ToolKind>('pen');
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [penWidthPt, setPenWidthPt] = useState(PEN_WIDTHS_PT[1]);
  const [hlColor, setHlColor] = useState(HL_COLORS[0]);
  const [pageNo, setPageNo] = useState(1);
  const [inkTick, setInkTick] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreOffer, setRestoreOffer] = useState<{ savedAt: number; wasDone: boolean } | null>(null);
  const [dimsTick, setDimsTick] = useState(0);
  const busyRef = useRef(false);
  busyRef.current = !!busy;

  const setToolRemember = useCallback((t: ToolKind | 'eraser') => {
    setTool(t);
    if (t !== 'eraser') lastInkToolRef.current = t;
  }, []);

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
        drawStrokes(ctx, strokesRef.current[i], 'hl');
        drawStrokes(ctx, strokesRef.current[i], 'pen');
      }
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

  const scheduleBase = useCallback(() => {
    if (renderQueuedRef.current) return;
    renderQueuedRef.current = true;
    requestAnimationFrame(() => {
      renderQueuedRef.current = false;
      renderBase();
      renderLive();
    });
  }, [renderBase, renderLive]);

  const scheduleLive = useCallback(() => {
    if (liveQueuedRef.current) return;
    liveQueuedRef.current = true;
    requestAnimationFrame(() => {
      liveQueuedRef.current = false;
      renderLive();
    });
  }, [renderLive]);

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
    } else {
      for (let j = op.items.length - 1; j >= 0; j--) {
        const it = op.items[j];
        strokes.splice(Math.min(it.index, strokes.length), 0, it.stroke);
      }
    }
    redoRef.current[pageIdx].push(op);
    bumpInk(); scheduleBase();
  }, [bumpInk, scheduleBase]);

  const redo = useCallback((pageIdx: number) => {
    const op = redoRef.current[pageIdx].pop();
    if (!op) return;
    const strokes = strokesRef.current[pageIdx];
    if (op.t === 'add') strokes.push(op.stroke);
    else {
      for (const it of op.items) {
        const i = strokes.indexOf(it.stroke);
        if (i >= 0) strokes.splice(i, 1);
      }
    }
    undoRef.current[pageIdx].push(op);
    bumpInk(); scheduleBase();
  }, [bumpInk, scheduleBase]);

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
      cur.stroke.points = shapeToPolyline(fit);
      cur.stroke.snapped = fit.kind;
      cur.snapLocked = true;
      pathCache.current.delete(cur.stroke);
      scheduleLive();
    }
  }, [scheduleLive]);

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

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const cssPos = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (busyRef.current) return;
      if (isPenLike(e)) {
        e.preventDefault();
        stopMomentum();
        gestureRef.current = null;          // pen wins over any finger gesture
        el.setPointerCapture(e.pointerId);
        penDownRef.current = true;
        const { x, y } = cssPos(e);
        cursorRef.current = { x, y, mode: tool === 'eraser' ? 'ring' : 'dot' };
        if (tool === 'eraser') {
          erasePageRef.current = -1;
          eraseOpsRef.current = [];
          eraseAt(x, y);
          scheduleLive();
          return;
        }
        const pt = toImage(x, y);
        if (!pt) { penDownRef.current = false; return; }   // page not loaded yet
        const d = dimsRef.current[pt.pageIdx]!;
        const ptPerImg = d.w / PDF_PAGE_W;                  // 1 pt at page scale, in image px
        const widthPt = tool === 'highlighter' ? HL_WIDTH_PT : penWidthPt;
        currentRef.current = {
          stroke: {
            tool: tool as ToolKind,
            color: tool === 'highlighter' ? hlColor : penColor,
            width: widthPt * ptPerImg,
            points: [{ x: pt.x, y: pt.y, p: e.pressure > 0 ? e.pressure : 0.5 }],
          },
          pageIdx: pt.pageIdx,
          snapLocked: false,
          lastMoveT: Date.now(),
          lastStable: { x, y },
          fitAttemptAt: 0,
        };
        armHoldTimer();
        scheduleLive();
        return;
      }
      if (e.pointerType !== 'touch') return;
      // Fingers: never draw. Ignore entirely while the pen is down or just lifted
      // (that's the resting palm), otherwise start a scroll/pinch/tap gesture.
      if (penDownRef.current || Date.now() - lastPenUpRef.current < 500) return;
      touchesRef.current.set(e.pointerId, cssPos(e));
      stopMomentum();
      const pts = [...touchesRef.current.values()];
      if (pts.length === 1) {
        gestureRef.current = {
          kind: 'maybe', startT: Date.now(), maxTouches: 1, moved: 0,
          lastX: pts[0].x, lastY: pts[0].y, samples: [{ t: Date.now(), x: pts[0].x, y: pts[0].y }],
        };
      } else {
        // A second/third finger — join (or start) the gesture and switch to pinch.
        if (!gestureRef.current) {
          gestureRef.current = {
            kind: 'maybe', startT: Date.now(), maxTouches: pts.length, moved: 0,
            lastX: pts[0].x, lastY: pts[0].y, samples: [],
          };
        }
        const g = gestureRef.current;
        g.maxTouches = Math.max(g.maxTouches, pts.length);
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
          const events = e.getCoalescedEvents?.() ?? [e];
          for (const ce of events) eraseAt(cssPos(ce).x, cssPos(ce).y);
          scheduleLive();
          return;
        }
        const cur = currentRef.current;
        if (!cur || cur.snapLocked) return;
        const events = e.getCoalescedEvents?.() ?? [e];
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
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (tool === 'eraser') {
        if (eraseOpsRef.current.length && erasePageRef.current >= 0) {
          pushUndo(erasePageRef.current, { t: 'remove', items: eraseOpsRef.current });
          bumpInk();
        }
        eraseOpsRef.current = [];
        erasePageRef.current = -1;
        scheduleLive();
        return;
      }
      const cur = currentRef.current;
      currentRef.current = null;
      if (cur && cur.stroke.points.length) {
        strokesRef.current[cur.pageIdx].push(cur.stroke);
        pushUndo(cur.pageIdx, { t: 'add', stroke: cur.stroke });
        bumpInk();
      }
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
      if (dur < 320 && g.moved < 12 && g.maxTouches >= 2) {
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

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', swallow);
    // Safari's proprietary pinch events would zoom the page itself.
    el.addEventListener('gesturestart', swallow as EventListener);
    el.addEventListener('gesturechange', swallow as EventListener);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', swallow);
      el.removeEventListener('gesturestart', swallow as EventListener);
      el.removeEventListener('gesturechange', swallow as EventListener);
    };
  }, [armHoldTimer, bumpInk, clampView, eraseAt, hlColor, isPenLike, penColor, penWidthPt, pushUndo, redo, scheduleBase, scheduleLive, stopMomentum, toImage, tool, undo]);

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
        tool: tool === 'eraser' ? lastInkToolRef.current : tool,
        penColor, penWidthPt, hlColor,
      }));
    } catch { /* best-effort */ }
  }, [tool, penColor, penWidthPt, hlColor]);

  const hasInk = () => strokesRef.current.some((s) => s.length > 0);
  const inkedCount = strokesRef.current.filter((s) => s.length > 0).length;
  void inkTick; // ink mutations re-render through this

  const jumpToPage = useCallback((idx: number) => {
    const i = clamp(idx, 0, n - 1);
    viewRef.current.oy = -(layoutRef.current.tops[i] * kFactor()) + 8;
    clampView();
    scheduleBase();
  }, [clampView, n, scheduleBase]);

  // ── Done: flatten inked pages → upload → assemble → link ───────────────────
  const runDone = useCallback(async () => {
    if (!hasInk() || busyRef.current) return;
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
  }, [drawStrokes, onDone, pages, runId, saveDraft, student, totals]);

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
      else if (e.key === 'Escape') requestClose();
    };
    const onDoubleTap = () => toggleEraser();
    window.addEventListener('keydown', onKey);
    window.addEventListener('annotate-pencil-doubletap', onDoubleTap);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('annotate-pencil-doubletap', onDoubleTap);
    };
  }, [tool, undo, redo, requestClose, setToolRemember]);

  // ── UI ──────────────────────────────────────────────────────────────────────
  const btn: React.CSSProperties = {
    minWidth: 44, height: 44, borderRadius: 10, border: '1px solid #d1d5db',
    background: '#fff', fontSize: 18, cursor: 'pointer', padding: '0 10px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const activeBtn: React.CSSProperties = { ...btn, background: '#111827', color: '#fff', borderColor: '#111827' };
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
          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 52, textAlign: 'center' }}>{pageNo} / {n}</span>
          <button style={btn} onClick={() => jumpToPage(currentPageIdx + 1)} disabled={pageNo >= n} aria-label="Next page">›</button>
        </div>

        <div style={{ width: 1, alignSelf: 'stretch', background: '#e5e7eb' }} />

        <button style={tool === 'pen' ? activeBtn : btn} onClick={() => setToolRemember('pen')} aria-label="Pen" title="Pen"><IconPen /></button>
        <button style={tool === 'highlighter' ? activeBtn : btn} onClick={() => setToolRemember('highlighter')} aria-label="Highlighter" title="Highlighter"><IconHighlighter /></button>
        <button style={tool === 'eraser' ? activeBtn : btn} onClick={() => setToolRemember('eraser')} aria-label="Eraser" title="Eraser (removes a whole stroke)"><IconEraser /></button>

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
            borderColor: 'transparent', fontWeight: 700, fontSize: 15, padding: '0 18px',
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
      </div>

      {/* cancel confirm */}
      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, maxWidth: 380, width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Leave annotating?</div>
            <div style={{ fontSize: 13, color: '#4b5563' }}>Your ink hasn&rsquo;t been baked into a PDF yet.</div>
            <button style={{ ...btn, height: 46, fontWeight: 700 }} onClick={() => { setConfirmOpen(false); saveDraft(); onClose(); }}>💾 Keep as draft &amp; close</button>
            <button style={{ ...btn, height: 46, color: '#b91c1c', borderColor: '#fca5a5' }} onClick={() => { setConfirmOpen(false); discardAndClose(); }}>🗑 Discard ink &amp; close</button>
            <button style={{ ...btn, height: 46 }} onClick={() => setConfirmOpen(false)}>Keep annotating</button>
          </div>
        </div>
      )}
    </div>
  );
}
