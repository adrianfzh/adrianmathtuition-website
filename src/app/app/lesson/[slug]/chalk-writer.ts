'use client';

// The chalk hand — the browser half of the writing engine (pure half:
// lib/chalk-strokes.ts).
//
// Adrian's note on the 4-Sep chalk theme was that its handwriting reveal read
// as "a curtain, not a hand". This replaces it: a chalk tip travels along pen
// paths derived from the very glyphs the browser has laid out, and the ink
// appears only where the tip has been — with letter and word pauses, lifts
// between words, and a little tilt and drift per letter.
//
// How it stays honest about layout. The text is NEVER re-laid-out by this
// engine. It stays in the DOM (selectable, screen-readable, wrapped by the
// browser); the writer measures each character's box with a Range, makes the
// element's own glyphs transparent, and draws the same characters onto a canvas
// that sits over them. So a resize, a font swap or a different phone width is
// still the browser's layout — the hand simply re-measures.
//
//   NO PEN, by default (Adrian, 2026-09-06: "the pen looks distracting"). The
//   ink appearing along the path IS the "someone is writing" cue — JensenMath
//   shows no hand and no chalk either. `--lsn-tip-style` chooses: 'none' (the
//   default), 'glow' (a faint soft spot, no shadow) or 'stick' (the drawn chalk
//   with its shadow and contact glow, the 5-Sep look). The MOTION is identical
//   in all three — only what rides the writing point changes.
//
//   WORDS ARE WRITTEN, MATHS APPEARS. A KaTeX island inside prose is an ATOM:
//   the pen never traces it (the probe showed written maths reads uncanny). It
//   is skipped, the tip lifts over it, and it chalk-dusts in at the moment the
//   pen reaches it.
//
// Timing is not this module's: it READS progress off the DOM every frame —
// `--lsn-p` on the sentence the teacher's cursor is speaking (so the voice
// clip, the sidecar, the playback rate and the pause all drive the hand for
// free), or an explicit clock for prose the board writes as a whole (Manual
// pacing, notes, an equation intro). Nothing here knows what a clip is.
//
// No dependency: the glyph outlines come from rasterising the SAME webfont the
// CSS laid the text out with (canvas fillText → Zhang–Suen), so there is no
// font parser in the bundle and no second copy of the face to keep in step.

import {
  buildWritePlan, hash2, mulberry32, orderStrokes, pathLength, penAt, rdp, seedFrom,
  smoothPath, thinBitmap, traceSkeleton, valueNoise,
  type Pt, type PlanStroke, type WritePlan,
} from '@/lib/chalk-strokes';
import type { TipStyle } from '@/lib/lesson-theme';

/** Em box the skeleton is derived at — big enough to thin cleanly, small enough to be quick. */
const SK_EM = 160;
/** Skeleton resampling step for the nearest-sample lookup (device px). */
const SPACING = 1.5;
/** Per-letter jitter: a hand is never twice the same. */
const TILT = 0.022, DRIFT_X = 0.4, DRIFT_Y = 0.9, SCALE_J = 0.025;
/**
 * How far the glyph is sampled through noise — the chalk-rough edge. Was ±1 CSS
 * px, which at 20 px Kalam blurred the letterforms ("the chalk lettering looks
 * out of focus", 2026-09-06); ±0.42 px is a roughness you notice up close and
 * not at reading distance.
 */
const EDGE_NOISE_PX = 0.42;
/** Alpha modulation: the grain in the ink. `k` runs [LOW, 1] — the higher the floor, the denser the chalk. */
const GRAIN_FINE = 0.2, GRAIN_PATCH = 0.09;
/** The board's tooth: this share of grains never take. */
const SKIP_RATE = 0.02;
/** The tip fades out this long after the last stroke lands (ms). */
const TIP_LINGER_MS = 420, TIP_FADE_MS = 380;

type Rgb = [number, number, number];

interface GlyphSkeleton {
  /** Strokes in EM units, origin = the pen on the baseline, in writing order. */
  strokes: { pts: Pt[] }[];
}

interface Atom { el: HTMLElement; index: number; t: number }

interface UnitPlan {
  plan: WritePlan;
  /** Ink pixels, sorted by the time the tip reaches them. */
  idx: Uint32Array;
  ts: Float32Array;
  alpha: Uint8Array;
  order: Uint32Array;
  colour: Rgb;
  atoms: Atom[];
  /** Device-px bounds of everything this unit paints (the dirty rect on a rewind). */
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  ptr: number;
  lastT: number;
}

interface Unit {
  el: HTMLElement;
  kind: 'sentence' | 'timed';
  /** kind 'timed': its own clock (elapsed starts negative while a delay runs out). */
  durMs: number;
  elapsedMs: number;
  plan: UnitPlan | null;
  /** The plan could not be built (no drawable glyphs) — the text shows itself. */
  failed: boolean;
  done: boolean;
}

/**
 * The words of an element — everything OUTSIDE its KaTeX islands. Empty means
 * "this is maths": it dusts in, the hand never touches it.
 */
export function plainTextOf(el: HTMLElement): string {
  let out = '';
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) { out += node.nodeValue ?? ''; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const e = node as HTMLElement;
    if (e.classList?.contains('katex')) return;
    for (const child of Array.from(e.childNodes)) walk(child);
  };
  walk(el);
  return out;
}

// One skeleton per (font, character) for the whole visit — the expensive step,
// paid once. Keyed by the exact font shorthand so bold and italic differ.
const skeletons = new Map<string, GlyphSkeleton>();

function scratch(w: number, h: number): CanvasRenderingContext2D | null {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c.getContext('2d', { willReadFrequently: true });
}

/** Rasterise one character big, thin it, and keep the strokes in em units. */
function glyphSkeleton(fontKey: string, family: string, weight: string, style: string, ch: string): GlyphSkeleton {
  const key = `${fontKey}|${ch}`;
  const hit = skeletons.get(key);
  if (hit) return hit;
  const empty: GlyphSkeleton = { strokes: [] };
  const probe = scratch(4, 4);
  if (!probe) { skeletons.set(key, empty); return empty; }
  const font = `${style} ${weight} ${SK_EM}px ${family}`;
  probe.font = font;
  const m = probe.measureText(ch);
  const left = m.actualBoundingBoxLeft, right = m.actualBoundingBoxRight;
  const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
  if (![left, right, asc, desc].every(Number.isFinite) || right + left <= 0 || asc + desc <= 0) {
    skeletons.set(key, empty); return empty;
  }
  const pad = 4;
  const w = Math.ceil(left + right) + pad * 2;
  const h = Math.ceil(asc + desc) + pad * 2;
  const ctx = scratch(w, h);
  if (!ctx) { skeletons.set(key, empty); return empty; }
  const ox = pad + left, oy = pad + asc;
  ctx.font = font;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, ox, oy);
  const data = ctx.getImageData(0, 0, w, h).data;
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 127) bin[i] = 1;
  thinBitmap(bin, w, h);
  const chains = traceSkeleton(bin, w, h).map(c => ({
    pts: rdp(smoothPath(smoothPath(c.pts)), 0.7),
    cycle: c.cycle,
  }));
  const em = chains.map(c => ({
    pts: c.pts.map(([x, y]) => [(x - ox) / SK_EM, (y - oy) / SK_EM] as Pt),
    cycle: c.cycle,
  }));
  const out: GlyphSkeleton = { strokes: orderStrokes(em).map(s => ({ pts: s.pts })) };
  skeletons.set(key, out);
  return out;
}

/** A computed CSS colour → rgb. Computed styles are always rgb()/rgba(); a theme
 *  token read straight off a custom property may still be a hex literal. */
function parseColour(colour: string): Rgb {
  const m = /rgba?\(([^)]+)\)/i.exec(colour);
  if (m) {
    const [r, g, b] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if ([r, g, b].every(Number.isFinite)) return [r, g, b];
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(c => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return [243, 241, 230];
}

/** One character in place, ready to be written. */
interface Placed {
  ch: string; x: number; baseline: number; size: number;
  fontKey: string; family: string; weight: string; style: string;
  word: number; index: number;
  rot: number; dx: number; dy: number; sc: number;
}

export interface WriterHost {
  /** The element the canvases are stretched over (the board's zoom wrapper). */
  host: HTMLElement;
  ink: HTMLCanvasElement;
  tip: HTMLCanvasElement;
}

export class ChalkWriter {
  private host: HTMLElement;
  private inkCanvas: HTMLCanvasElement;
  private tipCanvas: HTMLCanvasElement;
  private ictx: CanvasRenderingContext2D | null = null;
  private tctx: CanvasRenderingContext2D | null = null;
  private img: ImageData | null = null;
  private W = 0; private H = 0; private dpr = 1;
  private units = new Map<HTMLElement, Unit>();
  private lastFrame = 0;
  private activeUnit: Unit | null = null;
  private activeT = 0;
  private lastActiveAt = 0;
  private tipRgb: Rgb | null = null;
  paused = false;

  constructor({ host, ink, tip }: WriterHost) {
    this.host = host;
    this.inkCanvas = ink;
    this.tipCanvas = tip;
  }

  /**
   * A DOM event on the board for anything watching the hand — a browser driver
   * verifying that the tip really moved, a future debug overlay. Nothing in the
   * app listens, exactly like the board's own `lsn:beat` / `lsn:action`.
   */
  private emit(detail: Record<string, unknown>): void {
    this.host.dispatchEvent(new CustomEvent('lsn:write', { detail: { t: performance.now(), ...detail }, bubbles: true }));
  }

  /** Can this browser run the engine at all? (Otherwise the words simply appear.) */
  static available(): boolean {
    if (typeof document === 'undefined') return false;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.font = '16px sans-serif';
    const m = ctx.measureText('x');
    return typeof m.actualBoundingBoxAscent === 'number' && typeof ctx.getImageData === 'function';
  }

  /** Warm the skeleton cache for the characters a scene is about to write. */
  prewarm(text: string, family: string, weight = '400', style = 'normal'): void {
    const fontKey = `${style}|${weight}|${family}`;
    const seen = new Set<string>();
    for (const ch of text) {
      if (/\s/.test(ch) || seen.has(ch)) continue;
      seen.add(ch);
      glyphSkeleton(fontKey, family, weight, style, ch);
    }
  }

  /** Size the canvases to the host; every plan is invalidated (layout may have moved). */
  resize(): boolean {
    const w = this.host.offsetWidth, h = this.host.offsetHeight;
    if (w <= 0 || h <= 0) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (W === this.W && H === this.H && this.img) return true;
    this.W = W; this.H = H; this.dpr = dpr;
    for (const c of [this.inkCanvas, this.tipCanvas]) { c.width = W; c.height = H; }
    this.ictx = this.inkCanvas.getContext('2d');
    this.tctx = this.tipCanvas.getContext('2d');
    if (!this.ictx || !this.tctx) return false;
    this.img = this.ictx.createImageData(W, H);
    this.ictx.clearRect(0, 0, W, H);
    for (const u of this.units.values()) { u.plan = null; u.failed = false; }
    return true;
  }

  /**
   * Prose the board writes as a whole — no sentence cursor is walking it
   * (Manual pacing, a note, an equation's intro). Claims the element NOW, so
   * its own glyphs go transparent before the next paint and there is never a
   * frame of bare text; the hand then starts after `delayMs`.
   */
  animate(el: HTMLElement, durMs: number, delayMs = 0): void {
    const u = this.claim(el, 'timed');
    if (!u) return;
    u.durMs = Math.max(120, durMs);
    u.elapsedMs = -Math.max(0, delayMs);
    u.done = false;
  }

  private claim(el: HTMLElement, kind: Unit['kind']): Unit | null {
    const hit = this.units.get(el);
    if (hit) return hit;
    if (el.closest('[data-ink]')) return null;      // an ancestor is already writing it
    const unit: Unit = { el, kind, durMs: 600, elapsedMs: 0, plan: null, failed: false, done: false };
    this.units.set(el, unit);
    // Read the ink colour BEFORE claiming: `data-ink` makes the element's own
    // text transparent, and a computed `transparent` is rgba(0,0,0,0) — which
    // would hand the hand a stick of BLACK chalk.
    el.style.setProperty('--lsn-own-color', getComputedStyle(el).color);
    el.setAttribute('data-ink', '');
    return unit;
  }

  /**
   * One rAF tick: read every unit's progress off the DOM, reveal ink, move the
   * tip. Never throws — the caller's loop must not be able to die with the
   * board's words held transparent (`release` hands every one of them back).
   */
  frame(): void {
    try { this.tick(); } catch (err) {
      console.warn('[chalk-writer] stopped; the words show themselves', err);
      this.release();
      this.broken = true;
    }
  }

  /** True once the engine has given up — the loop should stop calling it. */
  broken = false;

  private tick(): void {
    if (!this.img && !this.resize()) return;
    const now = performance.now();
    const dt = this.lastFrame ? Math.min(120, now - this.lastFrame) : 0;
    this.lastFrame = now;

    // Sentences the teacher's cursor is walking become units the moment they wake.
    for (const el of Array.from(this.host.querySelectorAll<HTMLElement>('[data-sent]'))) {
      const g = Number(el.dataset.sentGroup);
      const state = el.dataset.state;
      if (!(g >= 0) || !state || state === 'idle') continue;
      this.claim(el, 'sentence');   // claimed while still `waiting`: never a frame of bare text
    }

    let active: Unit | null = null;
    let activeT = 0;
    for (const u of this.units.values()) {
      if (!u.el.isConnected) { this.units.delete(u.el); continue; }
      let p: number;
      if (u.kind === 'sentence') {
        const state = u.el.dataset.state;
        p = state === 'waiting' ? 0
          : state === 'speaking' ? Math.min(1, Math.max(0, Number(u.el.style.getPropertyValue('--lsn-p')) || 0))
          : 1;
      } else {
        if (!u.done && !this.paused) u.elapsedMs += dt;
        p = Math.min(1, u.elapsedMs / u.durMs);
      }
      if (p <= 0 && !u.plan) continue;
      if (!u.plan && !u.failed) {
        // A claimed element paints nothing of its own, so a build that throws
        // would leave INVISIBLE words on the board. Give it back instead.
        try { this.build(u); } catch (err) { console.warn('[chalk-writer] build failed, showing the text', err); u.failed = true; }
        if (u.failed) { u.el.removeAttribute('data-ink'); this.units.delete(u.el); continue; }
      }
      if (!u.plan) continue;
      this.reveal(u, Math.max(0, p));
      if (p > 0 && p < 1) { active = u; activeT = p; }
    }

    if (active) { this.activeUnit = active; this.activeT = activeT; this.lastActiveAt = now; }
    this.drawTip(now);
  }

  /** Everything this writer owns, released (scene change). */
  release(): void {
    for (const u of this.units.values()) {
      u.el.removeAttribute('data-ink');
      u.el.style.removeProperty('--lsn-own-color');
      for (const a of u.plan?.atoms ?? []) a.el.removeAttribute('data-dust');
    }
    this.units.clear();
    this.activeUnit = null;
    if (this.tctx) this.tctx.clearRect(0, 0, this.W, this.H);
  }

  // ── Building one unit's plan ───────────────────────────────────────────────

  private build(u: Unit): void {
    const hostRect = this.host.getBoundingClientRect();
    // The board leans in on `focus` (a scale on this very wrapper): client
    // rects come back scaled, the canvas does not. Undo it.
    const scale = this.host.offsetWidth > 0 ? hostRect.width / this.host.offsetWidth : 1;
    const s = scale > 0.01 ? scale : 1;
    const toLocal = (r: DOMRect) => ({
      left: (r.left - hostRect.left) / s,
      top: (r.top - hostRect.top) / s,
      width: r.width / s,
      height: r.height / s,
    });

    const placed: Placed[] = [];
    const atoms: Atom[] = [];
    const range = document.createRange();
    const metrics = scratch(4, 4);
    let word = 0;
    let index = 0;
    const rng = mulberry32(seedFrom(u.el.textContent ?? '') ^ 0x9e3779b9);

    const emitText = (node: Text): void => {
      const parent = node.parentElement;
      if (!parent || !metrics) return;
      const cs = getComputedStyle(parent);
      const size = parseFloat(cs.fontSize) || 15;
      const family = cs.fontFamily;
      const weight = cs.fontWeight;
      const style = cs.fontStyle;
      const fontKey = `${style}|${weight}|${family}`;
      metrics.font = `${style} ${weight} ${size}px ${family}`;
      const fm = metrics.measureText('Hxy');
      const asc = Number.isFinite(fm.fontBoundingBoxAscent) ? fm.fontBoundingBoxAscent : size * 0.8;
      const desc = Number.isFinite(fm.fontBoundingBoxDescent) ? fm.fontBoundingBoxDescent : size * 0.2;
      const text = node.data;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (/\s/.test(ch)) { word++; continue; }
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = toLocal(range.getBoundingClientRect());
        if (r.width <= 0 && r.height <= 0) continue;
        // Half-leading: a Range rect is the line box, the glyph sits centred in it.
        const baseline = r.top + (r.height - (asc + desc)) / 2 + asc;
        placed.push({
          ch, x: r.left, baseline, size, fontKey, family, weight, style, word, index: index++,
          rot: (rng() - 0.5) * 2 * TILT,
          dx: (rng() - 0.5) * 2 * DRIFT_X,
          dy: (rng() - 0.5) * 2 * DRIFT_Y,
          sc: 1 + (rng() - 0.5) * 2 * SCALE_J,
        });
      }
    };

    const walk = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) { emitText(node as Text); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      // Maths is never written: it is an atom the pen lifts over and that
      // chalk-dusts in as the pen arrives.
      if (el.classList?.contains('katex')) { atoms.push({ el, index: index++, t: 0 }); return; }
      for (const child of Array.from(el.childNodes)) walk(child);
    };
    walk(u.el);

    if (placed.length === 0) { u.failed = true; u.el.removeAttribute('data-ink'); return; }

    // Strokes in device px, in writing order.
    const dpr = this.dpr;
    const strokes: PlanStroke[] = [];
    const perGlyph: { from: number; to: number }[] = [];
    for (const g of placed) {
      const sk = glyphSkeleton(g.fontKey, g.family, g.weight, g.style, g.ch);
      const cos = Math.cos(g.rot), sin = Math.sin(g.rot);
      const size = g.size * g.sc;
      const from = strokes.length;
      for (const st of sk.strokes) {
        const pts = st.pts.map(([ex, ey]) => {
          const lx = ex * size, ly = ey * size;
          return [(g.x + g.dx + lx * cos - ly * sin) * dpr, (g.baseline + g.dy + lx * sin + ly * cos) * dpr] as Pt;
        });
        if (pathLength(pts) < 0.5) continue;
        strokes.push({ pts, glyph: g.index, word: g.word, size: g.size * dpr });
      }
      perGlyph.push({ from, to: strokes.length });
    }
    if (strokes.length === 0) { u.failed = true; u.el.removeAttribute('data-ink'); return; }

    const plan = buildWritePlan(strokes, mulberry32(seedFrom(u.el.textContent ?? '')));

    // Maths atoms take the time of the last stroke written before them.
    for (const a of atoms) {
      let t = 0;
      for (let gi = 0; gi < placed.length; gi++) {
        if (placed[gi].index > a.index) break;
        const span = perGlyph[gi];
        for (let s = span.from; s < span.to; s++) t = Math.max(t, plan.strokes[s].times[plan.strokes[s].times.length - 1]);
      }
      a.t = t;
      a.el.setAttribute('data-dust', 'wait');
    }

    const colour = parseColour(u.el.style.getPropertyValue('--lsn-own-color') || getComputedStyle(u.el).color);
    const t0 = performance.now();
    const built = this.rasterise(placed, perGlyph, plan, colour, atoms);
    u.plan = built;
    u.failed = built === null;
    if (!built) u.el.removeAttribute('data-ink');
    this.emit({
      phase: 'build', chars: placed.length, strokes: strokes.length, atoms: atoms.length,
      pixels: built ? built.idx.length : 0, ms: Math.round(performance.now() - t0),
    });
  }

  /**
   * Every ink pixel of the unit, stamped with the moment the tip reaches it —
   * the nearest sample on that letter's own pen path — and roughened so it
   * reads as chalk rather than as a font.
   */
  private rasterise(
    placed: Placed[], perGlyph: { from: number; to: number }[], plan: WritePlan, colour: Rgb, atoms: Atom[],
  ): UnitPlan | null {
    const dpr = this.dpr, W = this.W, H = this.H;
    const IDX: number[] = [], TT: number[] = [], AA: number[] = [];
    let x0b = Infinity, y0b = Infinity, x1b = -Infinity, y1b = -Infinity;
    const cell = scratch(8, 8);
    if (!cell) return null;

    placed.forEach((g, gi) => {
      const span = perGlyph[gi];
      const seed = seedFrom(g.ch) & 0xffff;
      const size = g.size * g.sc * dpr;
      cell.font = `${g.style} ${g.weight} ${size}px ${g.family}`;
      const m = cell.measureText(g.ch);
      const left = m.actualBoundingBoxLeft, right = m.actualBoundingBoxRight;
      const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
      if (![left, right, asc, desc].every(Number.isFinite)) return;
      const cos = Math.cos(g.rot), sin = Math.sin(g.rot);
      const corners: Pt[] = [[-left, -asc], [right, -asc], [-left, desc], [right, desc]]
        .map(([x, y]) => [x * cos - y * sin, x * sin + y * cos] as Pt);
      const pad = Math.ceil(3 * dpr);
      const ox = (g.x + g.dx) * dpr, oy = (g.baseline + g.dy) * dpr;
      const bx = Math.min(...corners.map(c => c[0])), by = Math.min(...corners.map(c => c[1]));
      const ex = Math.max(...corners.map(c => c[0])), ey = Math.max(...corners.map(c => c[1]));
      const gx0 = Math.floor(ox + bx) - pad, gy0 = Math.floor(oy + by) - pad;
      const gw = Math.ceil(ex - bx) + pad * 2 + 1, gh = Math.ceil(ey - by) + pad * 2 + 1;
      if (gw <= 0 || gh <= 0 || gw > 4000 || gh > 4000) return;
      const cv = document.createElement('canvas');
      cv.width = gw; cv.height = gh;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      if (!cx) return;
      cx.translate(ox - gx0, oy - gy0);
      cx.rotate(g.rot);
      cx.font = `${g.style} ${g.weight} ${size}px ${g.family}`;
      cx.textBaseline = 'alphabetic';
      cx.fillStyle = '#fff';
      cx.fillText(g.ch, 0, 0);
      // A hair of stroke: chalk lays down a touch wider than the outline.
      cx.lineWidth = 0.8 * dpr; cx.lineJoin = 'round'; cx.strokeStyle = '#fff';
      cx.strokeText(g.ch, 0, 0);
      const src = cx.getImageData(0, 0, gw, gh).data;

      // This letter's pen path, resampled — the nearest sample gives a pixel its moment.
      const SX: number[] = [], SY: number[] = [], ST: number[] = [];
      let lastT = 0;
      for (let s = span.from; s < span.to; s++) {
        const { pts, times } = plan.strokes[s];
        SX.push(pts[0][0]); SY.push(pts[0][1]); ST.push(times[0]);
        let carry = 0;
        for (let i = 1; i < pts.length; i++) {
          const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          if (d < 1e-6) continue;
          let step = SPACING - carry;
          while (step <= d) {
            const u = step / d;
            SX.push(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u);
            SY.push(pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u);
            ST.push(times[i - 1] + (times[i] - times[i - 1]) * u);
            step += SPACING;
          }
          carry = d - (step - SPACING);
        }
        SX.push(pts[pts.length - 1][0]); SY.push(pts[pts.length - 1][1]); ST.push(times[times.length - 1]);
        lastT = times[times.length - 1];
      }
      const np = SX.length;
      if (np === 0) return;

      for (let yy = 0; yy < gh; yy++) {
        for (let xx = 0; xx < gw; xx++) {
          const wx = gx0 + xx, wy = gy0 + yy;
          if (wx < 0 || wy < 0 || wx >= W || wy >= H) continue;
          const cxp = wx / dpr, cyp = wy / dpr;
          // Nibble the edge: sample the glyph through a little noise so the
          // outline is chalk-rough rather than font-crisp.
          const nx = (valueNoise(cxp * 0.7, cyp * 0.7, seed + 1) - 0.5) * 2 * EDGE_NOISE_PX * dpr;
          const ny = (valueNoise(cxp * 0.7, cyp * 0.7, seed + 2) - 0.5) * 2 * EDGE_NOISE_PX * dpr;
          const sx = Math.round(xx + nx), sy = Math.round(yy + ny);
          if (sx < 0 || sy < 0 || sx >= gw || sy >= gh) continue;
          const a = src[(sy * gw + sx) * 4 + 3];
          if (!a) continue;
          const fine = valueNoise(cxp * 1.7, cyp * 1.7, seed + 3);
          const patch = valueNoise(cxp * 0.16, cyp * 0.16, seed + 4);
          let k = (1 - GRAIN_FINE + GRAIN_FINE * fine) * (1 - GRAIN_PATCH + GRAIN_PATCH * patch);
          if (hash2(wx, wy, seed + 5) < SKIP_RATE) k *= 0.55;   // the board's tooth: skipped grains
          const alpha = Math.min(255, Math.round(a * k * 1.2));
          if (alpha < 6) continue;
          let bd = Infinity, bt = lastT;
          for (let i = 0; i < np; i++) {
            const ddx = SX[i] - wx, ddy = SY[i] - wy;
            const d = ddx * ddx + ddy * ddy;
            if (d < bd) { bd = d; bt = ST[i]; }
          }
          IDX.push(wy * W + wx); TT.push(bt); AA.push(alpha);
          if (wx < x0b) x0b = wx; if (wx > x1b) x1b = wx;
          if (wy < y0b) y0b = wy; if (wy > y1b) y1b = wy;
        }
      }
    });

    if (IDX.length === 0) return null;
    const n = IDX.length;
    const ts = Float32Array.from(TT);
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => ts[a] - ts[b]);
    return {
      plan, idx: Uint32Array.from(IDX), ts, alpha: Uint8Array.from(AA), order, colour, atoms,
      box: { x0: x0b, y0: y0b, x1: x1b, y1: y1b }, ptr: 0, lastT: 0,
    };
  }

  // ── Painting ──────────────────────────────────────────────────────────────

  private reveal(u: Unit, p: number): void {
    const up = u.plan;
    const img = this.img;
    const ictx = this.ictx;
    if (!up || !img || !ictx) return;
    if (p < up.lastT - 1e-6) {
      // Rewound (‹ back to an earlier beat): wipe this unit and re-lay it.
      const d = img.data;
      for (let i = 0; i < up.idx.length; i++) { const o = up.idx[i] * 4; d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 0; }
      if (up.box) ictx.putImageData(img, 0, 0, up.box.x0, up.box.y0, up.box.x1 - up.box.x0 + 1, up.box.y1 - up.box.y0 + 1);
      up.ptr = 0;
    }
    if (up.lastT <= 0 && p > 0) this.emit({ phase: 'start', text: (u.el.textContent ?? '').slice(0, 60), kind: u.kind });
    const wasDone = up.lastT >= 1;
    up.lastT = p;
    const { idx, ts, alpha, order, colour } = up;
    const [cr, cg, cb] = colour;
    const d = img.data;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    let ptr = up.ptr;
    const n = idx.length;
    while (ptr < n && ts[order[ptr]] <= p) {
      const k = order[ptr++];
      const i = idx[k], o = i * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = alpha[k];
      const x = i % this.W, y = (i - x) / this.W;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    up.ptr = ptr;
    if (maxx >= 0 && Number.isFinite(minx)) ictx.putImageData(img, 0, 0, minx, miny, maxx - minx + 1, maxy - miny + 1);
    for (const a of up.atoms) {
      const want = p >= a.t ? 'on' : 'wait';
      if (a.el.getAttribute('data-dust') !== want) a.el.setAttribute('data-dust', want);
    }
    if (p >= 1) {
      if (!wasDone) this.emit({ phase: 'done', text: (u.el.textContent ?? '').slice(0, 60), kind: u.kind });
      u.done = true;
    }
  }

  /** The stick in the hand — a chalk on the slate, a pencil on paper (`--lsn-tip-color`). */
  private tipColour(): Rgb {
    if (!this.tipRgb) {
      const v = getComputedStyle(this.host).getPropertyValue('--lsn-tip-color').trim();
      this.tipRgb = v ? parseColour(v) : [251, 251, 245];
    }
    return this.tipRgb;
  }

  /**
   * What rides the writing point (`--lsn-tip-style`). Read once and cached with
   * the colour; a theme never changes under a live board.
   */
  private tipStyle(): TipStyle {
    if (!this.tipKind) {
      const v = getComputedStyle(this.host).getPropertyValue('--lsn-tip-style').trim();
      this.tipKind = v === 'stick' || v === 'glow' ? v : 'none';
    }
    return this.tipKind;
  }
  private tipKind: TipStyle | null = null;

  /**
   * The tip. `none` — nothing at all: the ink appearing is the cue, and the
   * canvas is only cleared. `glow` — a single soft spot (8 px, low alpha, no
   * shadow, no stick). `stick` — the drawn chalk with its shadow and contact
   * glow. The pen PATH is unchanged in every case; this only draws.
   */
  private drawTip(now: number): void {
    const c = this.tctx;
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.W, this.H);
    const style = this.tipStyle();
    if (style === 'none') { if (now - this.lastActiveAt > TIP_LINGER_MS + TIP_FADE_MS) this.activeUnit = null; return; }
    const u = this.activeUnit;
    if (!u || !u.plan) return;
    const since = now - this.lastActiveAt;
    const alpha = since < TIP_LINGER_MS ? 1 : Math.max(0, 1 - (since - TIP_LINGER_MS) / TIP_FADE_MS);
    if (alpha <= 0) { this.activeUnit = null; return; }
    const p = penAt(u.plan.plan, Math.min(1, this.activeT));
    if (!p) return;
    const dpr = this.dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const jx = (valueNoise(now * 0.035, 0.5, 77) - 0.5) * 3;
    const jy = (valueNoise(now * 0.035, 9.5, 78) - 0.5) * 3;
    const x = p.x / dpr + jx, y = p.y / dpr + jy;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    if (style === 'glow') {
      // A very faint soft spot at the writing point — no shadow, no body.
      if (!p.lifted) {
        const [gr, gg, gb] = this.tipColour();
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 8);
        g.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, 0.30)`);
        g.addColorStop(0.55, `rgba(${gr}, ${gg}, ${gb}, 0.12)`);
        g.addColorStop(1, `rgba(${gr}, ${gg}, ${gb}, 0)`);
        c.fillStyle = g;
        c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill();
      }
      c.restore();
      return;
    }
    if (!p.lifted) {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 9);
      g.addColorStop(0, 'rgba(255,255,250,.35)');
      g.addColorStop(1, 'rgba(255,255,250,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath();
    c.ellipse(p.lifted ? 5 : 2.5, p.lifted ? 7 : 3.5, 5, 2.4, 0.3, 0, Math.PI * 2);
    c.fill();
    if (p.lifted) c.translate(-1.5, -4);
    c.rotate(0.62);
    const w = 6, h = 26;
    const [tr, tg, tb] = this.tipColour();
    const shade = (k: number) => `rgb(${Math.round(tr * k)}, ${Math.round(tg * k)}, ${Math.round(tb * k)})`;
    const body = c.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, shade(0.8)); body.addColorStop(0.45, shade(1)); body.addColorStop(1, shade(0.72));
    c.fillStyle = body;
    c.beginPath(); c.roundRect(-w / 2, -h, w, h, [2.5, 2.5, 1.5, 1.5]); c.fill();
    c.fillStyle = 'rgba(0,0,0,.12)';
    c.beginPath(); c.roundRect(-w / 2, -h, w, 4, 2); c.fill();
    c.fillStyle = shade(1.02);
    c.beginPath(); c.ellipse(0, -0.5, w / 2, 2.2, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}
