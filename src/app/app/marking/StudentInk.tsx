'use client';
// ✍️ Write-anywhere notes on the marked pages (18 Sep 2026, Adrian: "write on my
// paper is hard to use … click on their paper, and a pdf shows up and they are able
// to annotate on the pdf directly"). The paper opens as one continuous scroll of
// pages, like a PDF. The Pencil writes wherever it touches; a finger only scrolls.
// There is no writing mode to enter and no Save button: ink saves itself a moment
// after each stroke (student → /api/portal/marking/ink, Adrian → his own layer at
// /api/admin/marking/teacher-ink). The marked copy underneath is never changed.
//
// Two things here are hard-won and deliberate (AnnotateOverlay, 4 Aug 2026):
//  · The pages are drawn on <canvas>, never <img>. iPadOS Live Text finds the
//    printed text in an <img> and the SYSTEM swallows Pencil strokes over it —
//    the page never gets an event. A canvas has no text to find.
//  · The Pencil is read from BOTH of Safari's streams at once (see the input effect):
//    dense pointer events while they flow, the stylus TOUCH stream whenever Safari
//    drops them. preventDefault on a stylus touch is what keeps the page from
//    scrolling under the Pencil while a finger still scrolls it natively.
// The full-screen overlay (zoom, typed notes, shapes) is still one tap away.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { fileHref } from '@/lib/student-files-url';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import { strokesToSvg } from '@/lib/annotate/layer';
import { inkIsEmpty, inkStrokes, type InkPages } from '@/lib/student-ink';
import {
  addStroke, hitStrokes, isAccident, removeStrokes, toImagePoint, toolWidth, type InkTool, type Nat,
  PEN_COLORS, HL_COLORS, PEN_COLOR_DEFAULT, HL_COLOR_DEFAULT, paletteColor,
  HOLD_SNAP_MS, snapHeldStroke, heldStill, isDoubleTap,
  emptyHistory, pushHistory, undoInk, redoInk, type InkHistory,
} from '@/lib/inline-ink';
import type { Stroke, StrokePoint } from '@/lib/annotate/types';

// The overlay is ~2.5k lines of pen code — loaded only when they ask for full screen.
const AnnotateOverlay = dynamic(() => import('@/components/AnnotateOverlay'), { ssr: false });

export type InkPageInput = { index: number; url: string; overflow?: true };

/** The other side's layer, shown read-only under a label: the student sees "From Adrian", Adrian sees "<name>'s notes". */
export type OtherInk = { pages: InkPages | null; label: string };

/** Adrian's ink starts green so the two layers read apart; a student's starts blue. Both can pick from the palette (22 Sep 2026). */
const PEN_DEFAULT = { student: PEN_COLOR_DEFAULT, adrian: '#047857' } as const;
const A4: Nat = { w: 1000, h: 1414 };
const pathOf = (pts: StrokePoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');

type SurfaceProps = {
  page: InkPageInput; mine?: InkPages[number]; other?: InkPages[number];
  tool: InkTool; color: string; hlColor: string; canWrite: boolean; fingerWrites: boolean;
  onStroke: (index: number, stroke: Stroke, nat: Nat) => void;
  onErase: (index: number, x: number, y: number, radius: number) => void;
  /** Two quick Pencil taps on the page: pen ↔ eraser (22 Sep 2026). */
  onDoubleTap: () => void;
};

/** One page: its bitmap on a canvas (lazily, near the viewport), both ink layers, the live stroke, and the input. */
function PageSurface({ page, mine, other, tool, color, hlColor, canWrite, fingerWrites, onStroke, onErase, onDoubleTap }: SurfaceProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bmpRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<SVGPathElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<Nat | null>(null);
  const [failed, setFailed] = useState(false);
  const natRef = useRef<Nat | null>(null);
  const writable = canWrite && Number.isInteger(page.index);
  // Latest props for the listeners below, which are attached once.
  const live = useRef({ tool, color, hlColor, fingerWrites, onStroke, onErase, onDoubleTap });
  useEffect(() => { live.current = { tool, color, hlColor, fingerWrites, onStroke, onErase, onDoubleTap }; });

  // ── the page bitmap: draw when near the viewport, free it when far ──────────
  useEffect(() => {
    const wrap = wrapRef.current, canvas = bmpRef.current;
    if (!wrap || !canvas) return;
    let near = false;
    const paint = () => {
      const img = imgRef.current;
      if (!near || !img || !img.naturalWidth) return;
      const cssW = wrap.clientWidth || 800;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.min(img.naturalWidth, Math.round(cssW * dpr));
      const h = Math.round(w * img.naturalHeight / img.naturalWidth);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
    };
    const load = () => {
      if (imgRef.current) { paint(); return; }
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { imgRef.current = img; const n = { w: img.naturalWidth, h: img.naturalHeight }; natRef.current = n; setNat(n); paint(); };
      img.onerror = () => setFailed(true);
      img.src = fileHref(page.url);
    };
    const io = new IntersectionObserver(entries => {
      near = entries.some(e => e.isIntersecting);
      if (near) load();
      else if (canvas.width) { canvas.width = 0; canvas.height = 0; }   // a 16-page paper must not hold 16 bitmaps
    }, { rootMargin: '1400px 0px' });
    io.observe(wrap);
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrap);
    return () => { io.disconnect(); ro.disconnect(); };
  }, [page.url]);

  // ── input ────────────────────────────────────────────────────────────────────
  // ONE stroke, fed by TWO streams (19 Sep 2026, Adrian on the iPad: "some strokes will
  // be missed and i have to keep rewriting"). Safari gives the Pencil two event streams:
  // pointer events — dense (getCoalescedEvents, ~240 Hz) but Safari drops them, sometimes
  // for a whole stroke — and touch events (touchType 'stylus') — sparse (~60 Hz) but
  // they always arrive. Whichever speaks first starts the stroke; pointer points are
  // used while they flow, touch points fill in the moment they stop; whichever ends
  // first ends it. And a Pencil stroke is NEVER thrown away as an accident: a palm is a
  // finger touch, so everything the Pencil does is meant — a decimal point, the dot of
  // an i, a short minus sign (the first version dropped anything under ~3 px).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !writable) return;
    let pts: StrokePoint[] = [];
    let active = false;
    let byPencil = false;
    let touchId: number | null = null;
    let pointerId: number | null = null;
    let lastPointerAt = 0;
    // Draw-and-hold → shape (22 Sep 2026, the overlay's rule brought to the page):
    // when the pen stops moving for HOLD_SNAP_MS the stroke becomes a clean line,
    // rectangle or ellipse; moving on again un-snaps it. `snapped` is what end() files.
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let holdFrom = -1;
    let snapped: { points: StrokePoint[]; snapped: NonNullable<Stroke['snapped']> } | null = null;
    // Double-tap with the Pencil: the first tap's dot waits DOUBLE_TAP_MS for a second
    // tap before it is filed, so a real dot still lands and a double-tap files nothing.
    let lastTap: { x: number; y: number; at: number } | null = null;
    let pendingDot: { timer: ReturnType<typeof setTimeout>; stroke: Stroke; nat: Nat } | null = null;
    const armHold = () => {
      if (holdTimer) clearTimeout(holdTimer);
      holdFrom = pts.length - 1;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        const n = natRef.current;
        if (!active || !n || live.current.tool === 'er' || !heldStill(pts, holdFrom, n)) return;
        const fit = snapHeldStroke(pts, n);
        if (!fit) return;
        snapped = fit;
        liveRef.current?.setAttribute('d', pathOf(fit.points));
      }, HOLD_SNAP_MS);
    };

    const at = (cx: number, cy: number, force: number) => {
      const n = natRef.current; if (!n) return null;
      return toImagePoint(cx, cy, el.getBoundingClientRect(), n, force);
    };
    const erase = (p: StrokePoint) => {
      const n = natRef.current; if (!n) return;
      const r = el.getBoundingClientRect();
      live.current.onErase(page.index, p.x, p.y, 14 * (n.w / Math.max(1, r.width)));
    };
    const paint = () => liveRef.current?.setAttribute('d', pts.length === 1 ? `M${pts[0].x} ${pts[0].y}l0.1 0` : pathOf(pts));
    const begin = (p: StrokePoint | null, pencil: boolean) => {
      if (!p || active) return;
      active = true; byPencil = pencil; pts = [p]; snapped = null;
      if (live.current.tool === 'er') { erase(p); return; }
      const n = natRef.current!;
      const hl = live.current.tool === 'hl';
      const lp = liveRef.current;
      if (lp) {
        lp.setAttribute('stroke', hl ? live.current.hlColor : live.current.color);
        lp.setAttribute('stroke-width', String(toolWidth(live.current.tool, n)));
        lp.setAttribute('stroke-opacity', hl ? '0.38' : '1');
      }
      paint();
    };
    const extend = (p: StrokePoint | null) => {
      if (!p || !active) return;
      if (live.current.tool === 'er') { erase(p); return; }
      const last = pts[pts.length - 1];
      if (last && last.x === p.x && last.y === p.y) return;
      pts.push(p);
      const n = natRef.current;
      // Moved on after a snap → back to freehand; still → keep the shape on screen.
      if (snapped && n && !heldStill(pts, holdFrom, n)) snapped = null;
      if (snapped) return;
      paint();
      if (n && !heldStill(pts, holdFrom, n)) armHold();
    };
    const end = () => {
      if (!active) return;
      const n = natRef.current;
      const pencil = byPencil;
      const fit = snapped;
      active = false; touchId = null; pointerId = null; snapped = null;
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      liveRef.current?.setAttribute('d', '');
      const mine = pts; pts = [];
      if (!n || !mine.length) return;
      const now = performance.now();
      const tap = pencil && isAccident(mine, n);
      if (tap && isDoubleTap(lastTap, mine[0], now, n)) {
        // The second tap of a double-tap: forget the first tap's dot, switch tool.
        if (pendingDot) { clearTimeout(pendingDot.timer); pendingDot = null; }
        lastTap = null;
        live.current.onDoubleTap();
        return;
      }
      if (live.current.tool === 'er') { if (tap) lastTap = { x: mine[0].x, y: mine[0].y, at: now }; return; }
      if (!pencil && isAccident(mine, n)) return;        // a mouse click or a stray finger; never the Pencil
      const hl = live.current.tool === 'hl';
      const stroke: Stroke = fit
        ? { tool: hl ? 'highlighter' : 'pen', color: hl ? live.current.hlColor : live.current.color, width: toolWidth(live.current.tool, n), points: fit.points, snapped: fit.snapped }
        : { tool: hl ? 'highlighter' : 'pen', color: hl ? live.current.hlColor : live.current.color, width: toolWidth(live.current.tool, n), points: mine.length === 1 ? [mine[0], { ...mine[0], x: mine[0].x + 0.1 }] : mine };
      if (tap) {
        // A Pencil dot: file it unless a second tap follows within the double-tap window.
        lastTap = { x: mine[0].x, y: mine[0].y, at: now };
        if (pendingDot) { clearTimeout(pendingDot.timer); const d = pendingDot; pendingDot = null; live.current.onStroke(page.index, d.stroke, d.nat); }
        pendingDot = { stroke, nat: n, timer: setTimeout(() => { const d = pendingDot; pendingDot = null; if (d) live.current.onStroke(page.index, d.stroke, d.nat); }, 360) };
        return;
      }
      lastTap = null;
      live.current.onStroke(page.index, stroke, n);
    };

    type T = Touch & { touchType?: string };
    const writingTouch = (e: TouchEvent): T | null => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i] as T;
        if (touchId !== null ? t.identifier === touchId : (t.touchType === 'stylus' || (live.current.fingerWrites && e.touches.length === 1))) return t;
      }
      return null;
    };
    const ts = (e: TouchEvent) => {
      const t = writingTouch(e); if (!t) return;          // a finger: leave it to the browser — it scrolls
      e.preventDefault();                                 // the Pencil must never scroll the page
      touchId = t.identifier;
      begin(at(t.clientX, t.clientY, t.force), t.touchType === 'stylus');   // no-op when the pointer stream began it
      if (active) armHold();
    };
    const tm = (e: TouchEvent) => {
      if (!active) return;
      const t = writingTouch(e); if (!t) return;
      e.preventDefault();
      if (performance.now() - lastPointerAt > 40) extend(at(t.clientX, t.clientY, t.force));   // the pointer stream has gone quiet
    };
    const te = (e: TouchEvent) => { if (active && writingTouch(e)) end(); };

    const pd = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;              // fingers scroll (Finger writes goes through the touch stream)
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (active) { if (pointerId === null) pointerId = e.pointerId; return; }
      pointerId = e.pointerId; lastPointerAt = performance.now();
      try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      begin(at(e.clientX, e.clientY, e.pressure), e.pointerType === 'pen');
      if (active) armHold();
    };
    const pm = (e: PointerEvent) => {
      if (!active || e.pointerType === 'touch' || (pointerId !== null && e.pointerId !== pointerId)) return;
      lastPointerAt = performance.now();
      const list = e.getCoalescedEvents?.() ?? [];
      if (list.length) for (const c of list) extend(at(c.clientX, c.clientY, c.pressure)); else extend(at(e.clientX, e.clientY, e.pressure));
    };
    const pu = (e: PointerEvent) => { if (active && e.pointerType !== 'touch' && (pointerId === null || e.pointerId === pointerId)) end(); };

    el.addEventListener('touchstart', ts, { passive: false });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', te); el.addEventListener('touchcancel', te);
    el.addEventListener('pointerdown', pd); el.addEventListener('pointermove', pm);
    el.addEventListener('pointerup', pu);
    // A cancelled pointer is Safari dropping ITS stream, not the Pencil lifting: while the
    // stylus touch is still down the stroke carries on from the touch stream.
    const pc = (e: PointerEvent) => { if (touchId !== null) { pointerId = null; lastPointerAt = 0; return; } pu(e); };
    el.addEventListener('pointercancel', pc);
    return () => {
      if (holdTimer) clearTimeout(holdTimer);
      if (pendingDot) { clearTimeout(pendingDot.timer); const d = pendingDot; pendingDot = null; live.current.onStroke(page.index, d.stroke, d.nat); }
      el.removeEventListener('touchstart', ts); el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', te); el.removeEventListener('touchcancel', te);
      el.removeEventListener('pointerdown', pd); el.removeEventListener('pointermove', pm);
      el.removeEventListener('pointerup', pu); el.removeEventListener('pointercancel', pc);
    };
  }, [page.index, writable]);

  const box = nat ?? (mine ? { w: mine.w, h: mine.h } : other ? { w: other.w, h: other.h } : A4);
  const label = page.overflow ? `Worked solution after page ${Math.floor(page.index) + 1}` : `Page ${page.index + 1}`;
  return (
    <div ref={wrapRef} id={Number.isInteger(page.index) ? `page-${page.index}` : undefined}
      className="relative w-full overflow-hidden rounded-2xl border border-black/5 bg-white select-none"
      style={{ aspectRatio: `${box.w} / ${box.h}`, touchAction: 'pan-y pinch-zoom', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', cursor: writable ? 'crosshair' : 'default' }}>
      <canvas ref={bmpRef} role="img" aria-label={label} className="absolute inset-0 w-full h-full block" />
      {failed && <p className="absolute inset-0 grid place-items-center text-xs text-gray-400">{label} could not be loaded</p>}
      {other && other.strokes.length > 0 && (
        <svg viewBox={`0 0 ${other.w} ${other.h}`} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden
          dangerouslySetInnerHTML={{ __html: strokesToSvg(other.strokes) }} />
      )}
      {mine && mine.strokes.length > 0 && (
        <svg viewBox={`0 0 ${mine.w} ${mine.h}`} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden
          dangerouslySetInnerHTML={{ __html: strokesToSvg(mine.strokes) }} />
      )}
      <svg viewBox={`0 0 ${box.w} ${box.h}`} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
        <path ref={liveRef} d="" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ mixBlendMode: tool === 'hl' ? 'multiply' : 'normal' }} />
      </svg>
    </div>
  );
}

export default function StudentInk({ runId, pages, initial, readOnly = false, other = null, editor = 'student' }: {
  runId: string; pages: InkPageInput[]; initial: InkPages | null; readOnly?: boolean; other?: OtherInk | null;
  /** Who is drawing the editable layer: the student (their notes, /api/portal) or Adrian (his notes on their paper, /api/admin — 18 Sep 2026). */
  editor?: 'student' | 'adrian';
}) {
  const isAdrian = editor === 'adrian';
  const saveUrl = isAdrian ? '/api/admin/marking/teacher-ink' : '/api/portal/marking/ink';
  const draftKey = `annotate-draft:v1:${isAdrian ? 'adrian' : 'student'}:${runId}`;
  const mineLabel = 'my notes';
  const [ink, setInk] = useState<InkPages>(initial ?? {});
  const [history, setHistory] = useState<InkHistory>(emptyHistory);
  const histRef = useRef<InkHistory>(history);   // undo/redo read and write this, never a state updater (StrictMode runs those twice)
  const [tool, setTool] = useState<InkTool>('pen');
  // Colours (22 Sep 2026): one per tool, remembered on this device per editor.
  const colorKey = (t: 'pen' | 'hl') => `ink-color:${isAdrian ? 'adrian' : 'student'}:${t}`;
  const [penColor, setPenColor] = useState<string>(PEN_DEFAULT[editor]);
  const [hlColor, setHlColor] = useState<string>(HL_COLOR_DEFAULT);
  const [palette, setPalette] = useState<'pen' | 'hl' | null>(null);
  useEffect(() => {
    try {
      const p = window.localStorage.getItem(colorKey('pen')); if (p) setPenColor(paletteColor('pen', p) === p ? p : PEN_DEFAULT[editor]);
      const h = window.localStorage.getItem(colorKey('hl')); if (h) setHlColor(paletteColor('hl', h));
    } catch { /* private mode: defaults */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once on mount
  }, []);
  const pickColor = (t: 'pen' | 'hl', hex: string) => {
    if (t === 'pen') setPenColor(hex); else setHlColor(hex);
    try { window.localStorage.setItem(colorKey(t), hex); } catch { /* fine */ }
    setPalette(null);
  };
  const [lastDrawTool, setLastDrawTool] = useState<'pen' | 'hl'>('pen');
  const chooseTool = (t: InkTool) => {
    if (t === 'pen' || t === 'hl') { setLastDrawTool(t); setPalette(tool === t && palette !== t ? t : null); }
    else setPalette(null);
    setTool(t);
  };
  /** Two Pencil taps on the page: eraser ↔ the last drawing tool. */
  const onDoubleTap = useCallback(() => { setPalette(null); setTool(cur => (cur === 'er' ? lastDrawTool : 'er')); }, [lastDrawTool]);
  const [fingerWrites, setFingerWrites] = useState(false);
  const [show, setShow] = useState(true);
  const [showOther, setShowOther] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const inkRef = useRef(ink);   // every mutator below writes it together with the state, so a save never reads a stale layer
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Is any marked page on screen (the tool bar shows only then), and WHICH page is under the
  // middle of the screen — that is where Full screen opens, not page 1.
  const sectionRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = sectionRef.current; if (!el) return;
    const io = new IntersectionObserver(es => setInView(es.some(e => e.isIntersecting)), { rootMargin: '-80px 0px -80px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const pageInView = useCallback((): number | null => {
    const mid = window.innerHeight / 2;
    let best: { idx: number; d: number } | null = null;
    for (const node of Array.from(sectionRef.current?.querySelectorAll<HTMLElement>('[id^="page-"]') ?? [])) {
      const r = node.getBoundingClientRect();
      const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      const idx = Number(node.id.slice(5));
      if (Number.isInteger(idx) && (!best || d < best.d)) best = { idx, d };
    }
    return best ? best.idx : null;
  }, []);
  const [openAt, setOpenAt] = useState<number | null>(null);
  const hasInk = !inkIsEmpty(ink);
  const otherHas = !!other && !inkIsEmpty(other.pages);

  // ── save: a moment after the last stroke, and at once when the page is left ──
  const flush = useCallback(async (keepalive = false) => {
    if (!dirty.current) return;
    dirty.current = false;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setStatus('saving'); setErr(null);
    try {
      await portalFetch(saveUrl, { json: { runId, pages: inkRef.current }, fallback: 'save your notes', ...(keepalive ? { keepalive: true } : {}) });
      try { localStorage.removeItem(draftKey); } catch { /* the full-screen overlay's old draft must not come back over this */ }
      setStatus(dirty.current ? 'saving' : 'saved');
    } catch (e) { dirty.current = true; setStatus('error'); setErr(portalMessage(e)); }
  }, [draftKey, runId, saveUrl]);
  const touch = useCallback(() => {
    dirty.current = true; setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 1200);
  }, [flush]);
  useEffect(() => {
    const leave = () => { if (document.visibilityState === 'hidden') void flush(true); };
    document.addEventListener('visibilitychange', leave);
    window.addEventListener('pagehide', leave);
    return () => { document.removeEventListener('visibilitychange', leave); window.removeEventListener('pagehide', leave); void flush(true); };
  }, [flush]);

  const change = useCallback((next: (cur: InkPages) => InkPages) => {
    const cur = inkRef.current; const out = next(cur);
    if (out === cur) return;
    histRef.current = pushHistory(histRef.current, cur); setHistory(histRef.current);
    inkRef.current = out; setInk(out); touch();
  }, [touch]);
  const onStroke = useCallback((index: number, stroke: Stroke, nat: Nat) => change(cur => addStroke(cur, index, stroke, nat)), [change]);
  const onErase = useCallback((index: number, x: number, y: number, radius: number) =>
    change(cur => removeStrokes(cur, index, hitStrokes(cur[index]?.strokes ?? [], x, y, radius))), [change]);
  const undo = () => {
    const r = undoInk(histRef.current, inkRef.current); if (!r) return;
    histRef.current = r.history; setHistory(r.history);
    inkRef.current = r.ink; setInk(r.ink); touch();
  };
  const redo = () => {
    const r = redoInk(histRef.current, inkRef.current); if (!r) return;
    histRef.current = r.history; setHistory(r.history);
    inkRef.current = r.ink; setInk(r.ink); touch();
  };
  const clear = () => {
    if (!window.confirm('Clear your notes on every page of this paper? The marked copy stays as it is.')) return;
    change(() => ({}));
  };

  // The full-screen overlay (zoom, typed notes, shapes) edits the same layer.
  const inkable = useMemo(() => pages.filter(p => Number.isInteger(p.index)), [pages]);
  const overlayPages = useMemo(() => inkable.map(p => ({ photoIndex: p.index, url: fileHref(p.url) })), [inkable]);
  const overlaySave = useCallback(async (next: Record<number, { strokes: Stroke[]; w: number; h: number }>) => {
    await portalFetch(saveUrl, { json: { runId, pages: next }, fallback: 'save your notes' });
    inkRef.current = next; setInk(next); histRef.current = emptyHistory(); setHistory(histRef.current); setStatus('saved');
  }, [runId, saveUrl]);
  const closeOverlay = useCallback(() => setFullScreen(false), []);

  const btn = (on: boolean) => `text-xs font-semibold rounded-xl px-3 py-1.5 border ${on ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-navy/20'}`;
  // 22 Sep 2026 (Adrian: "select the different colours … allow for redo (undo and redo button
  // can be a little larger) … snap to shapes … double tap to erase … do a good interface"):
  // three tools with a colour dot, a palette strip that opens on a second tap of the active
  // tool, 44 px undo/redo, and the two gestures (draw-and-hold, Pencil double-tap) explained
  // once in the status line.
  const toolBtn = (t: InkTool, label: string, glyph: string, dot?: string) => (
    <button type="button" onClick={() => chooseTool(t)} aria-pressed={tool === t} data-tool={t}
      title={t === 'er' ? 'Rub out a stroke — or double-tap the page with the Pencil to switch' : `${label} — tap again for colours`}
      className={`relative min-h-[44px] rounded-xl px-3 text-[13px] font-semibold border flex items-center gap-1.5 ${tool === t ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-navy/20'}`}>
      <span aria-hidden>{glyph}</span>{label}
      {dot && <span aria-hidden className="w-3.5 h-3.5 rounded-full border border-white/70 shadow-sm" style={{ background: dot }} />}
    </button>
  );
  const sizedBtn = (on: boolean) => `min-h-[44px] min-w-[44px] rounded-xl text-lg font-semibold border flex items-center justify-center ${on ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-navy/20'} disabled:opacity-35`;
  return (
    <section ref={sectionRef} aria-label="Marked pages" className="space-y-3" data-student-ink>
      {!readOnly && inView && (
        // FIXED to the screen, not sticky (19 Sep 2026, Adrian: "i scroll down the marked pages, then i
        // want to use the pen, but i have to scroll all the way up") — it is there on page 1 and on page
        // 16 alike, for as long as any marked page is on screen. Above the phone's bottom tab bar.
        <div className="fixed left-1/2 -translate-x-1/2 z-40 bottom-[calc(env(safe-area-inset-bottom)+76px)] md:bottom-5 max-w-[calc(100vw-16px)] rounded-2xl border border-black/10 bg-white/95 backdrop-blur shadow-lg px-2 py-1.5 flex flex-col items-center gap-1.5" data-ink-toolbar>
          {palette && (
            <div className="flex items-center gap-2 px-1 py-1" role="group" aria-label={palette === 'pen' ? 'Pen colour' : 'Highlighter colour'} data-palette={palette}>
              {(palette === 'pen' ? PEN_COLORS : HL_COLORS).map(c => {
                const on = (palette === 'pen' ? penColor : hlColor) === c.hex;
                return (
                  <button key={c.hex} type="button" onClick={() => pickColor(palette, c.hex)} aria-label={c.name} aria-pressed={on} title={c.name}
                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center ${on ? 'border-navy scale-110' : 'border-black/10'}`}
                    style={{ background: palette === 'hl' ? `${c.hex}99` : c.hex }}>
                    {on && <span aria-hidden className={`text-sm font-bold ${palette === 'hl' ? 'text-navy' : 'text-white'}`}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {toolBtn('pen', 'Pen', '✏️', penColor)}
            {toolBtn('hl', 'Highlight', '🖍', hlColor)}
            {toolBtn('er', 'Erase', '🧽')}
            <span className="w-px h-7 bg-black/10 mx-0.5" aria-hidden />
            <button type="button" onClick={undo} disabled={!history.past.length} className={sizedBtn(false)} aria-label="Undo" title="Undo">↶</button>
            <button type="button" onClick={redo} disabled={!history.future.length} className={sizedBtn(false)} aria-label="Redo" title="Redo">↷</button>
            <span className="w-px h-7 bg-black/10 mx-0.5" aria-hidden />
            <button type="button" onClick={() => setFingerWrites(f => !f)} className={btn(fingerWrites)} aria-pressed={fingerWrites}
              title="No Pencil? Turn this on to write with one finger; two fingers still scroll.">☝️ Finger</button>
            <button type="button" onClick={() => { setOpenAt(pageInView()); void flush().then(() => setFullScreen(true)); }} className={sizedBtn(false)}
              aria-label="Full screen" title="Zoom in, type a note — opens at the page you are on">⤢</button>
          </div>
          <span className="text-center text-[11px] text-gray-500" aria-live="polite">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : status === 'error' ? '⚠ Not saved yet'
              : tool === 'er' ? 'Rub across a stroke · double-tap the page to go back to the pen'
              : fingerWrites ? 'One finger writes · two fingers scroll · hold still at the end of a line to make it straight'
              : 'Pencil writes · hold still at the end of a stroke to snap a line, box or circle · double-tap to erase'}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mr-auto">{isAdrian ? 'Their marked pages' : 'Your marked pages'}</h2>
        {otherHas && other && (
          <button type="button" onClick={() => setShowOther(s => !s)} className="text-xs font-semibold text-emerald-800 border border-emerald-700/30 bg-white rounded-xl px-3 py-1.5">
            {showOther ? `Hide ${other.label}` : `Show ${other.label}`}
          </button>
        )}
        {hasInk && (
          <button type="button" onClick={() => setShow(s => !s)} className="text-xs font-semibold text-navy border border-navy/20 bg-white rounded-xl px-3 py-1.5">
            {show ? `Hide ${mineLabel}` : `Show ${mineLabel}`}
          </button>
        )}
        {hasInk && !readOnly && <button type="button" onClick={clear} className="text-xs font-semibold text-gray-500 underline underline-offset-2">Clear {mineLabel}</button>}
      </div>
      {otherHas && other && showOther && (
        <p className="text-[12px] text-emerald-800"><span className="font-semibold">{other.label}</span> are drawn on the pages below in their own ink{isAdrian ? '' : ' — they stay until Adrian clears them'}.</p>
      )}
      {err && <p className="text-[12px] text-rose-700">{err} — keep this page open; it tries again with your next stroke.</p>}
      {pages.map(p => (
        <PageSurface key={p.index} page={p}
          mine={show ? ink[p.index] : undefined}
          other={showOther && other?.pages ? other.pages[p.index] : undefined}
          tool={tool} color={penColor} hlColor={hlColor} canWrite={!readOnly && show} fingerWrites={fingerWrites}
          onStroke={onStroke} onErase={onErase} onDoubleTap={onDoubleTap} />
      ))}
      {fullScreen && (
        <AnnotateOverlay
          runId={runId} pages={overlayPages} student={{ name: '', level: '' }} totals={null}
          mode="student" initialPage={openAt} draftScope={isAdrian ? 'adrian' : 'student'} initialInk={inkStrokes(ink)} onSaveInk={overlaySave} onDone={closeOverlay} onClose={closeOverlay}
        />
      )}
    </section>
  );
}
