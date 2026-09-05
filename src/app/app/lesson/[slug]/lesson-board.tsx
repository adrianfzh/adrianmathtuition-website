'use client';

// The board layer of the lesson player — the pen that leads (beat scenes).
//
// A beat scene's views render declaratively from a BoardState
// (lib/lesson-beats.ts): every addressable element carries `data-key` and the
// classes `lsn-el` (+ `on` once shown, + `w` when it arrived by `write`). This
// layer wraps a view and OWNS the motion those states imply, by diffing the
// DOM against what it animated last time:
//
//   · draw-on      a newly-on `.w` element sweeps in left→right behind a
//                  moving pen tip (Web Animations on clip-path — started in
//                  the layout effect, so the first painted frame is already
//                  clipped: no flash). Prose blocks wipe line by line; while
//                  the teacher's cursor is walking their sentences the cursor
//                  is the writer and the wipe stands down.
//                  ON THE BOARD THEMES (2026-09-05) the sweep is not what
//                  happens: WORDS ARE WRITTEN and MATHS APPEARS. A `.w`
//                  element with real words is handed to the chalk writer
//                  (chalk-writer.ts), which draws it letter by letter under a
//                  chalk tip; a `.w` element that is only KaTeX chalk-DUSTS in
//                  — the pen never traces maths (the probe showed that reads
//                  uncanny). Everything else in this file is unchanged.
//   · highlight    a pulse on the token(s) named.
//   · mark         a hand-drawn underline / circle / box (a wobbled SVG path,
//                  stroke-dashoffset drawn with the pen on it), measured from
//                  the tokens' resting rects and re-measured on resize.
//   · note         a handwritten aside. A SLOT per note is laid out from mount
//                  (lib/lesson-beats.sceneNotes): inside its token's line, under
//                  the token row (the views render those), or in the margin under
//                  the working (this layer renders those) — hidden until its
//                  action fires, then drawn on like any written element. Never
//                  absolutely positioned over other glyphs, never a layout shift.
//   · focus        the view eases onto the target (scale + translate on the
//                  zoom wrapper), the rest of the board dims, and it releases
//                  after `hold` seconds ÷ rate. Reduced motion keeps the dim,
//                  drops the transform.
//
// Nothing here changes the board's LAYOUT: marks, notes and the pen sit in an
// overlay, and every written element is laid out from mount (hidden by
// opacity / clip) — the no-layout-shift rule the player already keeps.

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { MathMarkdown } from '@/lib/math-markdown';
import type { BoardState, BoardMark, NoteSlot } from '@/lib/lesson-beats';
import { scaleBeat } from '@/lib/lesson-speech';
import { ChalkWriter, plainTextOf } from './chalk-writer';

// useLayoutEffect measures; on the server it must quietly be useEffect.
export const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * An element's LAYOUT box relative to `container`, via the offsetParent chain.
 * Deliberately not getBoundingClientRect: a freshly revealed element may be
 * mid transition (translateY, scale) when a layout effect measures, and offsets
 * are transform-immune — flights, marks and notes land on the RESTING glyph.
 */
export function offsetRect(el: HTMLElement, container: HTMLElement) {
  let x = 0, y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
}

// Inline prose with $…$ math — plain strings never enter markdown, so nothing
// gets accidentally italicised (the practice-flow MathText guard).
const INLINE_P = { p: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
export function MathText({ text }: { text: string }) {
  if (!text.includes('$')) return <>{text}</>;
  return <MathMarkdown content={text} components={INLINE_P} />;
}

// ── Pen ──────────────────────────────────────────────────────────────────────

interface PenSegment { start: number; end: number; at: (p: number) => { x: number; y: number } }

/** One pen tip per board: a queue of timed segments, one rAF while any is live. */
function usePen(penRef: React.RefObject<HTMLDivElement | null>) {
  const segsRef = useRef<PenSegment[]>([]);
  const rafRef = useRef(0);
  const hideRef = useRef(0);

  const loop = useCallback(() => {
    const pen = penRef.current;
    if (!pen) return;
    const tick = () => {
      const now = performance.now();
      const segs = segsRef.current;
      let live: PenSegment | null = null;
      for (const s of segs) if (now >= s.start && now <= s.end) { live = s; break; }
      if (!live) {
        // Between segments: hold at the next one's start point if it is imminent.
        const next = segs.filter(s => s.start > now).sort((a, b) => a.start - b.start)[0];
        if (next && next.start - now < 400) live = { ...next, at: () => next.at(0) };
      }
      segsRef.current = segs.filter(s => s.end >= now - 50);
      if (live) {
        const p = live.end > live.start ? Math.min(1, Math.max(0, (now - live.start) / (live.end - live.start))) : 1;
        const { x, y } = live.at(p);
        pen.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        pen.classList.add('on');
        if (hideRef.current) { window.clearTimeout(hideRef.current); hideRef.current = 0; }
      } else if (!hideRef.current) {
        hideRef.current = window.setTimeout(() => { hideRef.current = 0; pen.classList.remove('on'); }, 380);
      }
      if (segsRef.current.length > 0) rafRef.current = requestAnimationFrame(tick);
      else rafRef.current = 0;
    };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
  }, [penRef]);

  const add = useCallback((seg: PenSegment) => { segsRef.current.push(seg); loop(); }, [loop]);
  const clear = useCallback(() => {
    segsRef.current = [];
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    penRef.current?.classList.remove('on');
  }, [penRef]);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); if (hideRef.current) window.clearTimeout(hideRef.current); }, []);
  return { add, clear };
}

// ── Hand-drawn marks ─────────────────────────────────────────────────────────

type Box = { x0: number; y0: number; x1: number; y1: number };

/** A deterministic wobble so a mark looks drawn, and identical on every render. */
const wob = (k: number, amp = 1.4) => Math.sin(k * 1.7) * amp + Math.cos(k * 0.9) * amp * 0.6;

/** The path for a mark around a box, in board coordinates. */
export function markPath(kind: BoardMark['kind'], b: Box): string {
  const pts: [number, number][] = [];
  if (kind === 'underline') {
    for (let k = 0; k <= 24; k++) { const t = k / 24; pts.push([b.x0 - 2 + t * (b.x1 - b.x0 + 4), b.y1 + 3 + wob(k, 1.2)]); }
  } else if (kind === 'circle') {
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const rx = (b.x1 - b.x0) / 2 + 10, ry = (b.y1 - b.y0) / 2 + 7;
    for (let k = 0; k <= 52; k++) { const t = -0.9 + (k / 48) * Math.PI * 2.15; pts.push([cx + Math.cos(t) * (rx + wob(k)), cy + Math.sin(t) * (ry + wob(k + 3))]); }
  } else {
    const p = 6;
    const c: [number, number][] = [[b.x0 - p, b.y0 - p], [b.x1 + p, b.y0 - p], [b.x1 + p, b.y1 + p], [b.x0 - p, b.y1 + p], [b.x0 - p, b.y0 - p + 5]];
    for (let s = 0; s < 4; s++) for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push([c[s][0] + (c[s + 1][0] - c[s][0]) * t + wob(s * 9 + k, 1.1), c[s][1] + (c[s + 1][1] - c[s][1]) * t + wob(s * 9 + k + 2, 1.1)]);
    }
  }
  return 'M' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
}

// ── The layer ────────────────────────────────────────────────────────────────

/** Sweep duration for a written element (ms at 1×): pen speed over its width. */
function sweepMs(width: number): number {
  return Math.min(900, Math.max(200, width * 7));
}
/** Line-by-line wipe for a prose block (ms at 1×). */
function wipeMs(lines: number): number {
  return Math.min(1400, Math.max(300, lines * 300));
}

const CLIP_SHUT = 'inset(-0.35em -0.25em -0.4em 100%)';
const CLIP_OPEN = 'inset(-0.35em -0.25em -0.4em -0.2em)';
const WIPE_SHUT = 'inset(-0.1em -0.1em 100% -0.1em)';
const WIPE_OPEN = 'inset(-0.1em -0.1em -0.2em -0.1em)';
/** How long typeset maths takes to chalk-dust in (ms at 1×) — the CSS keyframe's length. */
const DUST_MS = 560;

export interface BoardLayerProps {
  board: BoardState | null;
  /** The scene's margin notes (no `near`): slots this layer lays out under the working. */
  notes: NoteSlot[];
  reduced: boolean;
  rate: number;
  /**
   * The chalk hand is on: words are written by a tip on a canvas over the
   * board, maths dusts in. False (slide theme, reduced motion, no engine, fonts
   * not in yet) keeps the original clip-path sweeps exactly as they were.
   */
  writing?: boolean;
  /** A frozen clip freezes the hand: the tip stops mid-word rather than running on. */
  paused?: boolean;
  children: React.ReactNode;
}

/** One chalk writer per board, alive for as long as the scene is. */
function useWriter(
  zoomRef: React.RefObject<HTMLDivElement | null>,
  inkRef: React.RefObject<HTMLCanvasElement | null>,
  tipRef: React.RefObject<HTMLCanvasElement | null>,
  writing: boolean,
  paused: boolean,
) {
  const ref = useRef<ChalkWriter | null>(null);
  const rafRef = useRef(0);

  useIsoLayoutEffect(() => {
    const host = zoomRef.current, ink = inkRef.current, tip = tipRef.current;
    if (!writing || !host || !ink || !tip) return;
    const w = new ChalkWriter({ host, ink, tip });
    w.resize();
    ref.current = w;
    const tick = () => { w.frame(); if (!w.broken) rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    // The board is laid out by the browser, so any reflow (rotation, a font
    // landing, the phone's URL bar) invalidates every measured pen path.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => w.resize()) : null;
    ro?.observe(host);
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      ro?.disconnect();
      w.release();
      ref.current = null;
    };
  }, [writing, zoomRef, inkRef, tipRef]);

  useEffect(() => { if (ref.current) ref.current.paused = paused; }, [paused]);
  return ref;
}

/** One note slot: laid out from mount, drawn on when its action fires. */
export function NoteSlotView({ note, board }: { note: NoteSlot; board: BoardState }) {
  return (
    <span data-key={note.id} data-prose="1" className={`lsn-el lsn-note w ${board.shown.has(note.id) ? 'on' : ''}`}>
      <MathText text={note.text} />
    </span>
  );
}

/**
 * Wraps a scene view in beat scenes. `board === null` (no beats) renders the
 * children untouched — the original card, byte for byte.
 */
export default function BoardLayer({ board, notes, reduced, rate, writing = false, paused = false, children }: BoardLayerProps) {
  const zoomRef = useRef<HTMLDivElement>(null);
  const marksRef = useRef<SVGSVGElement>(null);
  const penRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLCanvasElement>(null);
  const pen = usePen(penRef);
  const writerRef = useWriter(zoomRef, inkRef, tipRef, writing && board !== null, paused);
  const onRef = useRef<Set<string>>(new Set());        // keys animated as shown
  const pulseRef = useRef(0);                            // pulses handled
  const marksDrawn = useRef<Map<number, SVGPathElement>>(new Map());
  const focusTimer = useRef(0);
  const focusSeq = useRef(-1);
  const rateRef = useRef(rate);
  useEffect(() => { rateRef.current = rate; });

  // Measure a set of token ids → their union box in zoom coordinates.
  const boxOf = useCallback((tokens: string[]): Box | null => {
    const zoom = zoomRef.current;
    if (!zoom) return null;
    let box: Box | null = null;
    for (const id of tokens) {
      const el = zoom.querySelector<HTMLElement>(`[data-token-id="${CSS.escape(id)}"]`);
      if (!el) continue;
      const r = offsetRect(el, zoom);
      if (r.width === 0) continue;
      const b: Box = { x0: r.left, y0: r.top, x1: r.left + r.width, y1: r.top + r.height };
      box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
    }
    return box;
  }, []);

  // Redraw every mark's path from fresh measurements (no animation).
  const redrawMarks = useCallback((marks: BoardMark[]) => {
    for (const m of marks) {
      const path = marksDrawn.current.get(m.seq);
      const box = boxOf(m.tokens);
      if (path && box) path.setAttribute('d', markPath(m.kind, box));
    }
  }, [boxOf]);

  // ── The diff: what changed since the last commit, animated now ──
  useIsoLayoutEffect(() => {
    const zoom = zoomRef.current;
    if (!zoom || !board) return;
    const r = rateRef.current;

    // 1. Newly shown elements: written ones draw on (in DOM order, one pen).
    const now = performance.now();
    const onNow = Array.from(zoom.querySelectorAll<HTMLElement>('[data-key].lsn-el.on'));
    const nextOn = new Set(onNow.map(el => el.dataset.key as string));
    let cursor = now;
    for (const el of onNow) {
      const key = el.dataset.key as string;
      if (onRef.current.has(key)) continue;
      if (!el.classList.contains('w')) continue;
      for (const a of el.getAnimations()) a.cancel();
      if (reduced) continue;
      const rect = offsetRect(el, zoom);
      if (rect.width === 0) continue;
      const isProse = el.dataset.prose === '1';
      // The teacher's cursor is walking this prose: it writes the words itself.
      if (isProse && el.querySelector('[data-sent][data-state="waiting"], [data-sent][data-state="speaking"]')) continue;
      const delay = Math.max(0, cursor - now);
      const writer = writerRef.current;
      if (writer) {
        // The board themes: words go to the hand, maths dusts in.
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
        const lines = Math.max(1, Math.round(rect.height / lh));
        if (plainTextOf(el).trim()) {
          const dur = scaleBeat(isProse ? wipeMs(lines) : sweepMs(rect.width), r);
          writer.animate(el, dur, delay);          // claims it NOW, so no frame of bare text
          cursor = now + delay + dur + 60;
        } else {
          el.classList.remove('lsn-dust');
          void el.offsetWidth;                      // restart the keyframe
          el.classList.add('lsn-dust');
          cursor = now + delay + scaleBeat(DUST_MS, r) * 0.5;
        }
        continue;
      }
      if (isProse) {
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
        const lines = Math.max(1, Math.round(rect.height / lh));
        const dur = scaleBeat(wipeMs(lines), r);
        el.animate([{ clipPath: WIPE_SHUT }, { clipPath: WIPE_OPEN }], { duration: dur, delay, easing: 'linear', fill: 'both' });
        pen.add({
          start: now + delay, end: now + delay + dur,
          at: (p) => {
            const row = Math.min(lines - 1, Math.floor(p * lines));
            const q = p * lines - row;
            return { x: rect.left + q * Math.min(rect.width, el.scrollWidth), y: rect.top + (row + 0.62) * (rect.height / lines) };
          },
        });
        cursor += delay + dur + 60;
      } else {
        const dur = scaleBeat(sweepMs(rect.width), r);
        el.animate([{ clipPath: CLIP_SHUT }, { clipPath: CLIP_OPEN }], { duration: dur, delay, easing: 'linear', fill: 'both' });
        pen.add({ start: now + delay, end: now + delay + dur, at: (p) => ({ x: rect.left + p * rect.width, y: rect.top + rect.height * 0.62 }) });
        cursor = now + delay + dur + 50;
      }
    }
    onRef.current = nextOn;

    // 2. Pulses.
    const pulses = board.pulses;
    if (pulses.length > pulseRef.current) {
      for (const p of pulses.slice(pulseRef.current)) {
        for (const id of p.tokens) {
          const el = zoom.querySelector<HTMLElement>(`[data-token-id="${CSS.escape(id)}"]`);
          if (!el) continue;
          el.classList.remove('lsn-pulse');
          void el.offsetWidth; // restart the animation
          el.classList.add('lsn-pulse');
          window.setTimeout(() => el.classList.remove('lsn-pulse'), 1000);
        }
      }
      pulseRef.current = pulses.length;
    } else if (pulses.length < pulseRef.current) pulseRef.current = pulses.length;

    // 3. Marks: draw new ones, drop cleared ones.
    const svg = marksRef.current;
    if (svg) {
      const live = new Set(board.marks.map(m => m.seq));
      for (const [seq, path] of marksDrawn.current) {
        if (!live.has(seq)) { path.remove(); marksDrawn.current.delete(seq); }
      }
      let markCursor = Math.max(now, cursor);
      for (const m of board.marks) {
        if (marksDrawn.current.has(m.seq)) continue;
        const box = boxOf(m.tokens);
        if (!box) continue;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', markPath(m.kind, box));
        path.setAttribute('data-mark', m.kind);
        svg.appendChild(path);
        marksDrawn.current.set(m.seq, path);
        if (reduced) continue;
        const L = path.getTotalLength();
        const dur = scaleBeat(Math.min(1100, Math.max(350, L * 1.6)), r);
        const delay = Math.max(0, markCursor - now);
        path.style.strokeDasharray = `${L}`;
        path.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: dur, delay, easing: 'ease-in-out', fill: 'both' });
        pen.add({ start: now + delay, end: now + delay + dur, at: (p) => { const pt = path.getPointAtLength(p * L); return { x: pt.x, y: pt.y }; } });
        markCursor = now + delay + dur + 80;
      }
    }

    // 4. Focus: ease onto the target, dim the rest, release after the hold.
    const f = board.focus;
    const card = zoom.closest<HTMLElement>('.lsn-scene');
    const release = () => {
      zoom.style.transform = '';
      zoom.removeAttribute('data-focus');
      card?.removeAttribute('data-focus');
      zoom.querySelectorAll('[data-focused]').forEach(el => el.removeAttribute('data-focused'));
    };
    if (!f) {
      if (focusSeq.current !== -1) { focusSeq.current = -1; if (focusTimer.current) window.clearTimeout(focusTimer.current); release(); }
    } else if (f.seq !== focusSeq.current) {
      focusSeq.current = f.seq;
      if (focusTimer.current) window.clearTimeout(focusTimer.current);
      const target = zoom.querySelector<HTMLElement>(`[data-key="${CSS.escape(f.key)}"]`);
      if (target) {
        zoom.querySelectorAll('[data-focused]').forEach(el => el.removeAttribute('data-focused'));
        target.setAttribute('data-focused', '');
        zoom.setAttribute('data-focus', '');
        card?.setAttribute('data-focus', '');
        if (!reduced) {
          // A lean-in, not a zoom: ≤ 1.14× (less for a whole line), centred on
          // the target vertically; horizontally the board stays anchored at its
          // left edge and slides only as far as keeps the target on screen — the
          // dim does the pointing, the scale just brings the eye closer.
          const rect = offsetRect(target, zoom);
          const W = zoom.offsetWidth, H = zoom.offsetHeight;
          const s = Math.min(1.14, Math.max(1.05, (0.7 * W) / Math.max(1, rect.width)));
          const cy = rect.top + rect.height / 2;
          const tx = Math.min(0, W - (rect.left + rect.width) * s - 12);
          const ty = Math.min(0, Math.max(H - H * s, H / 2 - cy * s));
          zoom.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s.toFixed(3)})`;
        }
        focusTimer.current = window.setTimeout(() => { focusTimer.current = 0; release(); }, scaleBeat(f.hold * 1000, r));
      }
    }
  }, [board, reduced, pen, boxOf, writerRef]);

  // Re-measure on resize / font load (the marks), like the annotate connectors.
  useIsoLayoutEffect(() => {
    const zoom = zoomRef.current;
    if (!zoom || !board || typeof ResizeObserver === 'undefined') return;
    const remeasure = () => { redrawMarks(board.marks); };
    const ro = new ResizeObserver(remeasure);
    ro.observe(zoom);
    let cancelled = false;
    document.fonts?.ready?.then(() => { if (!cancelled) remeasure(); });
    return () => { cancelled = true; ro.disconnect(); };
  }, [board, redrawMarks]);

  // Scene change (new key on the card → this layer remounts): release everything.
  useEffect(() => () => { pen.clear(); if (focusTimer.current) window.clearTimeout(focusTimer.current); }, [pen]);

  if (!board) return <>{children}</>;

  return (
    <div className="lsn-board">
      <div ref={zoomRef} className="lsn-zoom">
        {children}
        {notes.length > 0 && (
          <div className="lsn-notes-flow">
            {notes.map(n => <NoteSlotView key={n.id} note={n} board={board} />)}
          </div>
        )}
        {/* The hand's two surfaces, inside the zoom wrapper so a `focus` lean-in
            carries the ink with the words it belongs to. Always mounted when
            the theme writes, so the engine never waits on a React commit. */}
        {writing && board && (
          <>
            <canvas ref={inkRef} className="lsn-ink-canvas" aria-hidden />
            <canvas ref={tipRef} className="lsn-tip-canvas" aria-hidden />
          </>
        )}
        <svg ref={marksRef} className="lsn-marks" aria-hidden />
        <div ref={penRef} className="lsn-pen" aria-hidden />
      </div>
    </div>
  );
}
