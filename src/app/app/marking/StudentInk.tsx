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
import { addStroke, hitStrokes, isAccident, removeStrokes, toImagePoint, toolWidth, type InkTool, type Nat } from '@/lib/inline-ink';
import type { Stroke, StrokePoint } from '@/lib/annotate/types';

// The overlay is ~2.5k lines of pen code — loaded only when they ask for full screen.
const AnnotateOverlay = dynamic(() => import('@/components/AnnotateOverlay'), { ssr: false });

export type InkPageInput = { index: number; url: string; overflow?: true };

/** The other side's layer, shown read-only under a label: the student sees "From Adrian", Adrian sees "<name>'s notes". */
export type OtherInk = { pages: InkPages | null; label: string };

const PEN_COLOR = { student: '#2563eb', adrian: '#047857' } as const;
const HL_COLOR = '#facc15';
const A4: Nat = { w: 1000, h: 1414 };
const pathOf = (pts: StrokePoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');

type SurfaceProps = {
  page: InkPageInput; mine?: InkPages[number]; other?: InkPages[number];
  tool: InkTool; color: string; canWrite: boolean; fingerWrites: boolean;
  onStroke: (index: number, stroke: Stroke, nat: Nat) => void;
  onErase: (index: number, x: number, y: number, radius: number) => void;
};

/** One page: its bitmap on a canvas (lazily, near the viewport), both ink layers, the live stroke, and the input. */
function PageSurface({ page, mine, other, tool, color, canWrite, fingerWrites, onStroke, onErase }: SurfaceProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bmpRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<SVGPathElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<Nat | null>(null);
  const [failed, setFailed] = useState(false);
  const natRef = useRef<Nat | null>(null);
  const writable = canWrite && Number.isInteger(page.index);
  // Latest props for the listeners below, which are attached once.
  const live = useRef({ tool, color, fingerWrites, onStroke, onErase });
  useEffect(() => { live.current = { tool, color, fingerWrites, onStroke, onErase }; });

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
      active = true; byPencil = pencil; pts = [p];
      if (live.current.tool === 'er') { erase(p); return; }
      const n = natRef.current!;
      const hl = live.current.tool === 'hl';
      const lp = liveRef.current;
      if (lp) {
        lp.setAttribute('stroke', hl ? HL_COLOR : live.current.color);
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
      pts.push(p); paint();
    };
    const end = () => {
      if (!active) return;
      const n = natRef.current;
      const pencil = byPencil;
      active = false; touchId = null; pointerId = null;
      liveRef.current?.setAttribute('d', '');
      const mine = pts; pts = [];
      if (!n || live.current.tool === 'er' || !mine.length) return;
      if (!pencil && isAccident(mine, n)) return;        // a mouse click or a stray finger; never the Pencil
      if (mine.length === 1) mine.push({ ...mine[0], x: mine[0].x + 0.1 });   // a dot: round caps draw it
      const hl = live.current.tool === 'hl';
      live.current.onStroke(page.index, { tool: hl ? 'highlighter' : 'pen', color: hl ? HL_COLOR : live.current.color, width: toolWidth(live.current.tool, n), points: mine }, n);
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
  const [history, setHistory] = useState<InkPages[]>([]);
  const [tool, setTool] = useState<InkTool>('pen');
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
    setHistory(h => [...h.slice(-39), cur]);
    inkRef.current = out; setInk(out); touch();
  }, [touch]);
  const onStroke = useCallback((index: number, stroke: Stroke, nat: Nat) => change(cur => addStroke(cur, index, stroke, nat)), [change]);
  const onErase = useCallback((index: number, x: number, y: number, radius: number) =>
    change(cur => removeStrokes(cur, index, hitStrokes(cur[index]?.strokes ?? [], x, y, radius))), [change]);
  const undo = () => setHistory(h => {
    if (!h.length) return h;
    const prev = h[h.length - 1]; inkRef.current = prev; setInk(prev); touch();
    return h.slice(0, -1);
  });
  const clear = () => {
    if (!window.confirm('Clear your notes on every page of this paper? The marked copy stays as it is.')) return;
    change(() => ({}));
  };

  // The full-screen overlay (zoom, typed notes, shapes) edits the same layer.
  const inkable = useMemo(() => pages.filter(p => Number.isInteger(p.index)), [pages]);
  const overlayPages = useMemo(() => inkable.map(p => ({ photoIndex: p.index, url: fileHref(p.url) })), [inkable]);
  const overlaySave = useCallback(async (next: Record<number, { strokes: Stroke[]; w: number; h: number }>) => {
    await portalFetch(saveUrl, { json: { runId, pages: next }, fallback: 'save your notes' });
    inkRef.current = next; setInk(next); setHistory([]); setStatus('saved');
  }, [runId, saveUrl]);
  const closeOverlay = useCallback(() => setFullScreen(false), []);

  const btn = (on: boolean) => `text-xs font-semibold rounded-xl px-3 py-1.5 border ${on ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-navy/20'}`;
  return (
    <section ref={sectionRef} aria-label="Marked pages" className="space-y-3" data-student-ink>
      {!readOnly && inView && (
        // FIXED to the screen, not sticky (19 Sep 2026, Adrian: "i scroll down the marked pages, then i
        // want to use the pen, but i have to scroll all the way up") — it is there on page 1 and on page
        // 16 alike, for as long as any marked page is on screen. Above the phone's bottom tab bar.
        <div className="fixed left-1/2 -translate-x-1/2 z-40 bottom-[calc(env(safe-area-inset-bottom)+76px)] md:bottom-5 max-w-[calc(100vw-16px)] rounded-2xl border border-black/10 bg-white/95 backdrop-blur shadow-lg px-2 py-1.5 flex flex-wrap items-center justify-center gap-1.5" data-ink-toolbar>
          <button type="button" onClick={() => setTool('pen')} className={btn(tool === 'pen')} aria-pressed={tool === 'pen'}>✏️ Pen</button>
          <button type="button" onClick={() => setTool('hl')} className={btn(tool === 'hl')} aria-pressed={tool === 'hl'}>🖍 Highlight</button>
          <button type="button" onClick={() => setTool('er')} className={btn(tool === 'er')} aria-pressed={tool === 'er'}>🧽 Erase</button>
          <button type="button" onClick={undo} disabled={!history.length} className={`${btn(false)} disabled:opacity-40`} aria-label="Undo">↩︎</button>
          <button type="button" onClick={() => setFingerWrites(f => !f)} className={btn(fingerWrites)} aria-pressed={fingerWrites}
            title="No Pencil? Turn this on to write with one finger; two fingers still scroll.">☝️ Finger writes</button>
          <button type="button" onClick={() => { setOpenAt(pageInView()); void flush().then(() => setFullScreen(true)); }} className={btn(false)}
            title="Zoom in, type a note, draw straight lines and shapes — opens at the page you are on">⤢</button>
          <span className="basis-full sm:basis-auto text-center text-[11px] text-gray-500" aria-live="polite">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : status === 'error' ? '⚠ Not saved yet' : fingerWrites ? 'One finger writes · two fingers scroll' : 'Pencil writes · your finger scrolls'}
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
          tool={tool} color={PEN_COLOR[editor]} canWrite={!readOnly && show} fingerWrites={fingerWrites}
          onStroke={onStroke} onErase={onErase} />
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
